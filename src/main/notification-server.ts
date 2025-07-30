import { IncomingMessage, ServerResponse, createServer } from 'http';
import { Notification, BrowserWindow } from 'electron';
import path from 'path';

interface NotificationPayload {
  type: 'claude-needs-input' | 'claude-finished';
  worktree: string;
  message?: string;
}

class NotificationServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port = 7878;
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  start() {
    if (this.server) return;

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // CORS headers for local requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/notification') {
        let body = '';
        
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', () => {
          try {
            const payload: NotificationPayload = JSON.parse(body);
            this.handleNotification(payload);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (error) {
            console.error('Failed to parse notification:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid payload' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(this.port, '127.0.0.1');

    this.server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        this.port++;
        setTimeout(() => {
          this.server?.close();
          this.server?.listen(this.port, '127.0.0.1');
        }, 1000);
      }
    });
  }

  private async handleNotification(payload: NotificationPayload) {
    const { type, worktree, message } = payload;
    
    // Extract project name from worktree path
    const projectName = path.basename(worktree);
    
    // Check if notifications are enabled
    let notificationsEnabled = true;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        notificationsEnabled = await this.mainWindow.webContents.executeJavaScript(
          `localStorage.getItem('notificationsEnabled') !== 'false'`
        );
      } catch (error) {
        // Default to enabled if we can't check
      }
    }
    
    if (notificationsEnabled) {
      // Show system notification
      const notification = new Notification({
        title: type === 'claude-needs-input' ? 'Claude needs your input' : 'Claude finished',
        body: `${projectName}: ${message || (type === 'claude-needs-input' ? 'Waiting for your response' : 'Task completed')}`,
        icon: path.join(__dirname, '../../assets/icons/VibeTree.png'),
        silent: false // Ensure sound plays
      });

      notification.on('click', () => {
        // Focus the main window
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          if (this.mainWindow.isMinimized()) this.mainWindow.restore();
          this.mainWindow.focus();
          
          // Send event to renderer to focus the specific worktree
          this.mainWindow.webContents.send('focus-worktree', worktree);
        }
      });

      notification.show();
    }

    // Always send to renderer for in-app notifications and UI updates
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('notification', {
        type,
        worktree,
        projectName,
        message
      });
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

export const notificationServer = new NotificationServer();