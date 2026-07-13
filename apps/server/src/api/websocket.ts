import { WebSocketServer, WebSocket } from 'ws';
import { ShellManager } from '../services/ShellManager';
import { AuthService } from '../auth/AuthService';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  getGitDiffStaged,
  addWorktree,
  removeWorktree
} from '@vibetree/core';

interface Services {
  shellManager: ShellManager;
  authService: AuthService;
}

interface WSMessage {
  type: string;
  payload: any;
  id?: string;
}

export function setupWebSocketHandlers(wss: WebSocketServer, services: Services) {
  const { shellManager, authService } = services;

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('🔌 New WebSocket connection from:', req.headers.origin || 'unknown');

    let authenticated = false;
    let deviceId: string | null = null;
    let activeShellSessions: Set<string> = new Set();

    // Handle authentication
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const jwt = url.searchParams.get('jwt');
    const sessionToken = url.searchParams.get('session_token');

    if (sessionToken) {
      // Session token authentication (username/password auth)
      if (authService.validateSessionToken(sessionToken)) {
        authenticated = true;
        deviceId = 'web-session';
        ws.send(
          JSON.stringify({
            type: 'auth:success',
            payload: { deviceId }
          })
        );
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
      // QR code token authentication
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
          JSON.stringify({
            type: 'auth:error',
            payload: { error: 'Invalid or expired token' }
          })
        );
        ws.close();
        return;
      }
    } else if (jwt) {
      // JWT authentication
      const decoded = authService.verifyJWT(jwt);
      if (decoded) {
        authenticated = true;
        deviceId = decoded.deviceId;
        ws.send(
          JSON.stringify({
            type: 'auth:success',
            payload: { deviceId }
          })
        );
      } else {
        ws.send(
          JSON.stringify({
            type: 'auth:error',
            payload: { error: 'Invalid JWT' }
          })
        );
        ws.close();
        return;
      }
    } else {
      // No authentication provided - check if auth is required
      const authRequired = process.env.AUTH_REQUIRED === 'true';

      if (!authRequired) {
        // Authentication disabled - allow connection
        authenticated = true;
        deviceId = 'no-auth';
        ws.send(
          JSON.stringify({
            type: 'auth:success',
            payload: { deviceId }
          })
        );
        console.log('🔓 Auth disabled: allowing connection without authentication');
      } else {
        // Auth required but none provided - check for dev mode exceptions
        const isLocalhost =
          req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');
        const allowLanDev =
          process.env.ALLOW_INSECURE_NETWORK === '1' ||
          process.env.ALLOW_INSECURE_LAN === '1' ||
          process.env.ALLOW_NETWORK_DEV === '1';

        if (process.env.NODE_ENV !== 'production' && (isLocalhost || allowLanDev)) {
          authenticated = true;
          deviceId = isLocalhost ? 'localhost-dev' : 'lan-dev';
          ws.send(
            JSON.stringify({
              type: 'auth:success',
              payload: { deviceId }
            })
          );
          console.log(
            `🔓 Dev auth: allowing ${isLocalhost ? 'localhost' : 'LAN'} connection without token`
          );
        } else {
          ws.send(
            JSON.stringify({
              type: 'auth:error',
              payload: { error: 'Authentication required' }
            })
          );
          ws.close();
          return;
        }
      }
    }

    ws.on('message', async (data) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        // Handle device pairing
        if (message.type === 'auth:pair' && token) {
          try {
            const jwtToken = await authService.pairDevice(token, message.payload);
            deviceId = message.payload.deviceId;
            authenticated = true;
            ws.send(
              JSON.stringify({
                type: 'auth:success',
                payload: { jwt: jwtToken, deviceId }
              })
            );
          } catch (error) {
            ws.send(
              JSON.stringify({
                type: 'auth:error',
                payload: { error: (error as Error).message }
              })
            );
            ws.close();
          }
          return;
        }

        // Check authentication for other messages
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

        // Handle different message types
        switch (message.type) {
          case 'shell:start': {
            const result = await shellManager.startShell(
              message.payload.worktreePath,
              deviceId || undefined,
              message.payload.cols,
              message.payload.rows,
              message.payload.forceNew
            );

            if (result.success && result.processId) {
              activeShellSessions.add(result.processId);
              const connectionId = `ws-${Date.now()}`;

              // Set up output forwarding using the new listener methods
              // This works for both new and existing sessions
              shellManager.addOutputListener(result.processId, connectionId, (data) => {
                ws.send(
                  JSON.stringify({
                    type: 'shell:output',
                    payload: { sessionId: result.processId, data }
                  })
                );
              });

              shellManager.addExitListener(result.processId, connectionId, (exitCode) => {
                ws.send(
                  JSON.stringify({
                    type: 'shell:exit',
                    payload: { sessionId: result.processId, code: exitCode }
                  })
                );
                activeShellSessions.delete(result.processId!);
              });
            }

            ws.send(
              JSON.stringify({
                type: 'shell:start:response',
                payload: result,
                id: message.id
              })
            );
            break;
          }

          case 'shell:write': {
            const result = await shellManager.writeToShell(
              message.payload.sessionId,
              message.payload.data
            );
            ws.send(
              JSON.stringify({
                type: 'shell:write:response',
                payload: result,
                id: message.id
              })
            );
            break;
          }

          case 'shell:resize': {
            const result = await shellManager.resizeShell(
              message.payload.sessionId,
              message.payload.cols,
              message.payload.rows
            );
            ws.send(
              JSON.stringify({
                type: 'shell:resize:response',
                payload: result,
                id: message.id
              })
            );
            break;
          }

          case 'git:worktree:list': {
            try {
              const worktrees = await listWorktrees(message.payload.projectPath);
              ws.send(
                JSON.stringify({
                  type: 'git:worktree:list:response',
                  payload: worktrees,
                  id: message.id
                })
              );
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { error: (error as Error).message },
                  id: message.id
                })
              );
            }
            break;
          }

          case 'git:status': {
            try {
              const status = await getGitStatus(message.payload.worktreePath);
              ws.send(
                JSON.stringify({
                  type: 'git:status:response',
                  payload: status,
                  id: message.id
                })
              );
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { error: (error as Error).message },
                  id: message.id
                })
              );
            }
            break;
          }

          case 'git:diff': {
            try {
              const diff = await getGitDiff(message.payload.worktreePath, message.payload.filePath);
              ws.send(
                JSON.stringify({
                  type: 'git:diff:response',
                  payload: { diff },
                  id: message.id
                })
              );
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { error: (error as Error).message },
                  id: message.id
                })
              );
            }
            break;
          }

          case 'git:diff:staged': {
            try {
              const diff = await getGitDiffStaged(
                message.payload.worktreePath,
                message.payload.filePath
              );
              ws.send(
                JSON.stringify({
                  type: 'git:diff:staged:response',
                  payload: { diff },
                  id: message.id
                })
              );
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { error: (error as Error).message },
                  id: message.id
                })
              );
            }
            break;
          }

          case 'git:worktree:add': {
            try {
              const result = await addWorktree(
                message.payload.projectPath,
                message.payload.branchName
              );
              ws.send(
                JSON.stringify({
                  type: 'git:worktree:add:response',
                  payload: result,
                  id: message.id
                })
              );
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { error: (error as Error).message },
                  id: message.id
                })
              );
            }
            break;
          }

          case 'git:worktree:remove': {
            try {
              const result = await removeWorktree(
                message.payload.projectPath,
                message.payload.worktreePath,
                message.payload.branchName
              );
              ws.send(
                JSON.stringify({
                  type: 'git:worktree:remove:response',
                  payload: result,
                  id: message.id
                })
              );
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { error: (error as Error).message },
                  id: message.id
                })
              );
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
          JSON.stringify({
            type: 'error',
            payload: { error: 'Failed to process message' }
          })
        );
      }
    });

    ws.on('close', (code, reason) => {
      console.log('💔 WebSocket connection closed:', {
        code,
        reason: reason.toString(),
        authenticated,
        deviceId
      });
      // Clean up any active shell sessions
      for (const sessionId of activeShellSessions) {
        shellManager.terminateSession(sessionId);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
}
