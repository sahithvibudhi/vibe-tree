import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  getGitDiffStaged,
  addWorktree,
  removeWorktree
} from '@vibetree/core';
import { ShellManager } from '../services/ShellManager';
import { AuthService } from '../auth/AuthService';
import type { ServerConfig } from '../config';

export interface SessionHooks {
  onSessionStarted?: (info: { sessionId: string; worktreePath: string; isNew: boolean }) => void;
  onSessionExited?: (sessionId: string) => void;
}

interface Services {
  shellManager: ShellManager;
  authService: AuthService;
  config: ServerConfig;
  hooks?: SessionHooks;
}

interface WSMessage {
  type: string;
  payload: any;
  id?: string;
}

export function setupWebSocketHandlers(wss: WebSocketServer, services: Services) {
  const { shellManager, authService, config, hooks } = services;

  function broadcastSessionsChanged() {
    const message = JSON.stringify({
      type: 'shell:sessions-changed',
      payload: shellManager.getWorktreeSessionCounts()
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * One server-level exit listener per session (listener id is stable) so
   * exits are observed exactly once regardless of how many clients attach.
   */
  function watchSessionExit(sessionId: string) {
    shellManager.addExitListener(sessionId, 'server:lifecycle', () => {
      hooks?.onSessionExited?.(sessionId);
      broadcastSessionsChanged();
    });
  }

  wss.on('connection', (ws: WebSocket, req) => {
    const connectionId = `conn-${uuidv4()}`;
    console.log('New WebSocket connection from:', req.headers.origin || 'unknown');

    let authenticated = false;
    let deviceId: string | null = null;
    // Sessions this connection has attached listeners to. Closing the
    // connection detaches the listeners but leaves the sessions running.
    const attachedSessions = new Set<string>();

    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const jwt = url.searchParams.get('jwt');
    const sessionToken = url.searchParams.get('session_token');

    if (config.staticToken && token === config.staticToken) {
      // Embedded mode: the host process generated this token and handed it
      // to its own renderer, so the connection is trusted
      authenticated = true;
      deviceId = 'embedded';
      ws.send(JSON.stringify({ type: 'auth:success', payload: { deviceId } }));
    } else if (sessionToken) {
      if (authService.validateSessionToken(sessionToken)) {
        authenticated = true;
        deviceId = 'web-session';
        ws.send(JSON.stringify({ type: 'auth:success', payload: { deviceId } }));
      } else {
        ws.send(
          JSON.stringify({
            type: 'auth:error',
            payload: { error: 'Invalid or expired session token' }
          })
        );
        ws.close();
        return;
      }
    } else if (token) {
      if (authService.validateToken(token)) {
        authenticated = true;
        ws.send(
          JSON.stringify({
            type: 'auth:request',
            payload: { message: 'Please provide device information' }
          })
        );
      } else {
        ws.send(
          JSON.stringify({ type: 'auth:error', payload: { error: 'Invalid or expired token' } })
        );
        ws.close();
        return;
      }
    } else if (jwt) {
      const decoded = authService.verifyJWT(jwt);
      if (decoded) {
        authenticated = true;
        deviceId = decoded.deviceId;
        ws.send(JSON.stringify({ type: 'auth:success', payload: { deviceId } }));
      } else {
        ws.send(JSON.stringify({ type: 'auth:error', payload: { error: 'Invalid JWT' } }));
        ws.close();
        return;
      }
    } else {
      if (!config.authRequired) {
        authenticated = true;
        deviceId = 'no-auth';
        ws.send(JSON.stringify({ type: 'auth:success', payload: { deviceId } }));
      } else {
        const isLocalhost =
          req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');

        if (config.nodeEnv !== 'production' && (isLocalhost || config.allowInsecureLan)) {
          authenticated = true;
          deviceId = isLocalhost ? 'localhost-dev' : 'lan-dev';
          ws.send(JSON.stringify({ type: 'auth:success', payload: { deviceId } }));
          console.log(
            `Dev auth: allowing ${isLocalhost ? 'localhost' : 'LAN'} connection without token`
          );
        } else {
          ws.send(
            JSON.stringify({ type: 'auth:error', payload: { error: 'Authentication required' } })
          );
          ws.close();
          return;
        }
      }
    }

    function attachSessionForwarding(sessionId: string) {
      attachedSessions.add(sessionId);

      // skipReplay: scrollback restore is request/response via the buffer
      // in the shell:start response (or shell:get-buffer), which avoids
      // replay racing the client's event subscription
      shellManager.addOutputListener(
        sessionId,
        connectionId,
        (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'shell:output', payload: { sessionId, data } }));
          }
        },
        true
      );

      shellManager.addExitListener(sessionId, connectionId, (exitCode) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'shell:exit', payload: { sessionId, code: exitCode } }));
        }
        attachedSessions.delete(sessionId);
      });
    }

    ws.on('message', async (data) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        if (message.type === 'auth:pair' && token) {
          try {
            const jwtToken = await authService.pairDevice(token, message.payload);
            deviceId = message.payload.deviceId;
            authenticated = true;
            ws.send(
              JSON.stringify({ type: 'auth:success', payload: { jwt: jwtToken, deviceId } })
            );
          } catch (error) {
            ws.send(
              JSON.stringify({ type: 'auth:error', payload: { error: (error as Error).message } })
            );
            ws.close();
          }
          return;
        }

        if (!authenticated) {
          ws.send(
            JSON.stringify({
              type: 'error',
              payload: { error: 'Not authenticated' },
              id: message.id
            })
          );
          return;
        }

        const respond = (type: string, payload: unknown) => {
          ws.send(JSON.stringify({ type, payload, id: message.id }));
        };

        const respondError = (error: unknown) => {
          ws.send(
            JSON.stringify({
              type: 'error',
              payload: { error: error instanceof Error ? error.message : String(error) },
              id: message.id
            })
          );
        };

        switch (message.type) {
          case 'shell:start': {
            const result = await shellManager.startShell(
              message.payload.worktreePath,
              message.payload.cols,
              message.payload.rows,
              message.payload.forceNew,
              message.payload.terminalId
            );

            let buffer: string | undefined;
            if (result.success && result.processId) {
              attachSessionForwarding(result.processId);

              if (result.isNew) {
                watchSessionExit(result.processId);
              } else {
                buffer = shellManager.getBuffer(result.processId) ?? undefined;
              }

              hooks?.onSessionStarted?.({
                sessionId: result.processId,
                worktreePath: message.payload.worktreePath,
                isNew: result.isNew === true
              });
            }

            respond('shell:start:response', { ...result, buffer });
            if (result.success && result.isNew) {
              broadcastSessionsChanged();
            }
            break;
          }

          case 'shell:write': {
            const result = await shellManager.writeToShell(
              message.payload.sessionId,
              message.payload.data
            );
            respond('shell:write:response', result);
            break;
          }

          case 'shell:resize': {
            const result = await shellManager.resizeShell(
              message.payload.sessionId,
              message.payload.cols,
              message.payload.rows
            );
            respond('shell:resize:response', result);
            break;
          }

          case 'shell:status': {
            respond('shell:status:response', {
              running: shellManager.hasSession(message.payload.sessionId)
            });
            break;
          }

          case 'shell:get-buffer': {
            respond('shell:get-buffer:response', {
              success: true,
              buffer: shellManager.getBuffer(message.payload.sessionId)
            });
            break;
          }

          case 'shell:terminate': {
            const result = await shellManager.terminateSession(message.payload.sessionId);
            attachedSessions.delete(message.payload.sessionId);
            respond('shell:terminate:response', result);
            broadcastSessionsChanged();
            break;
          }

          case 'shell:terminate-for-worktree': {
            const count = await shellManager.terminateSessionsForWorktree(
              message.payload.worktreePath
            );
            respond('shell:terminate-for-worktree:response', { success: true, count });
            broadcastSessionsChanged();
            break;
          }

          case 'shell:get-worktree-sessions': {
            respond('shell:get-worktree-sessions:response', shellManager.getWorktreeSessionCounts());
            break;
          }

          case 'git:worktree:list': {
            try {
              respond('git:worktree:list:response', await listWorktrees(message.payload.projectPath));
            } catch (error) {
              respondError(error);
            }
            break;
          }

          case 'git:status': {
            try {
              respond('git:status:response', await getGitStatus(message.payload.worktreePath));
            } catch (error) {
              respondError(error);
            }
            break;
          }

          case 'git:diff': {
            try {
              const diff = await getGitDiff(message.payload.worktreePath, message.payload.filePath);
              respond('git:diff:response', { diff });
            } catch (error) {
              respondError(error);
            }
            break;
          }

          case 'git:diff:staged': {
            try {
              const diff = await getGitDiffStaged(
                message.payload.worktreePath,
                message.payload.filePath
              );
              respond('git:diff:staged:response', { diff });
            } catch (error) {
              respondError(error);
            }
            break;
          }

          case 'git:worktree:add': {
            try {
              respond(
                'git:worktree:add:response',
                await addWorktree(message.payload.projectPath, message.payload.branchName)
              );
            } catch (error) {
              respondError(error);
            }
            break;
          }

          case 'git:worktree:remove': {
            try {
              respond(
                'git:worktree:remove:response',
                await removeWorktree(
                  message.payload.projectPath,
                  message.payload.worktreePath,
                  message.payload.branchName
                )
              );
            } catch (error) {
              respondError(error);
            }
            break;
          }

          default:
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { error: `Unknown message type: ${message.type}` },
                id: message.id
              })
            );
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(
          JSON.stringify({ type: 'error', payload: { error: 'Failed to process message' } })
        );
      }
    });

    ws.on('close', (code, reason) => {
      console.log('WebSocket connection closed:', {
        code,
        reason: reason.toString(),
        authenticated,
        deviceId
      });
      // Detach this connection's listeners but keep sessions alive so a
      // page reload or network blip does not kill running terminals.
      // Idle sessions are reaped separately by the session manager.
      for (const sessionId of attachedSessions) {
        shellManager.removeOutputListener(sessionId, connectionId);
        shellManager.removeExitListener(sessionId, connectionId);
      }
      attachedSessions.clear();
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
}
