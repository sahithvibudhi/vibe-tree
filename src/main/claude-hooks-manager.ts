import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const HOOKS_CONFIG = {
  hooks: {
    Notification: [
      {
        hooks: [
          {
            type: "command",
            command: `curl -X POST http://127.0.0.1:7878/notification -H "Content-Type: application/json" -d '{"type": "claude-needs-input", "worktree": "'$PWD'", "message": "'$CLAUDE_NOTIFICATION'"}' --silent --fail || true`
          }
        ]
      }
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: `[ "$CLAUDE_STOP_HOOK_ACTIVE" != "true" ] && curl -X POST http://127.0.0.1:7878/notification -H "Content-Type: application/json" -d '{"type": "claude-finished", "worktree": "'$PWD'", "message": "Task completed"}' --silent --fail || true`
          }
        ]
      }
    ]
  }
};

export class ClaudeHooksManager {
  private globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  async ensureGlobalHooks(): Promise<void> {
    try {
      // Ensure ~/.claude directory exists
      const claudeDir = path.dirname(this.globalSettingsPath);
      await fs.mkdir(claudeDir, { recursive: true });

      // Check if settings file exists
      let settings: Record<string, any> = {};
      try {
        const content = await fs.readFile(this.globalSettingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch (error) {
        // File doesn't exist or is invalid, start fresh
      }

      // Merge our hooks with existing settings
      settings = {
        ...settings,
        hooks: {
          ...settings.hooks,
          ...HOOKS_CONFIG.hooks
        }
      };

      // Write back the settings
      await fs.writeFile(
        this.globalSettingsPath,
        JSON.stringify(settings, null, 2),
        'utf-8'
      );

    } catch (error) {
      console.error('Failed to setup global Claude hooks:', error);
    }
  }

  async ensureProjectHooks(projectPath: string): Promise<void> {
    try {
      // Create .claude directory in project
      const claudeDir = path.join(projectPath, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });

      // Create settings.json
      const settingsPath = path.join(claudeDir, 'settings.json');
      
      // Check if it already exists
      let settings: Record<string, any> = {};
      try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch (error) {
        // File doesn't exist, that's fine
      }

      // Merge hooks
      settings = {
        ...settings,
        hooks: {
          ...settings.hooks,
          ...HOOKS_CONFIG.hooks
        }
      };

      await fs.writeFile(
        settingsPath,
        JSON.stringify(settings, null, 2),
        'utf-8'
      );

    } catch (error) {
      console.error('Failed to setup project Claude hooks:', error);
    }
  }
}

export const claudeHooksManager = new ClaudeHooksManager();