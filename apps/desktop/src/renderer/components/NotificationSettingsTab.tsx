import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import {
  Bell,
  RefreshCw,
  Send,
  ExternalLink,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  HelpCircle
} from 'lucide-react';
import type { NotificationSettings, NotificationPermissionStatus } from '../types/notification-settings';

interface NotificationSettingsTabProps {
  isVisible: boolean;
}

export function NotificationSettingsTab({ isVisible }: NotificationSettingsTabProps) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isVisible) {
      loadSettings();
      loadPermissionStatus();
    }
  }, [isVisible]);

  const loadSettings = async () => {
    try {
      const notificationSettings = await window.electronAPI.notification.getSettings();
      setSettings(notificationSettings);
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    }
  };

  const loadPermissionStatus = async () => {
    try {
      const status = await window.electronAPI.notification.getPermissionStatus();
      setPermissionStatus(status);
    } catch (error) {
      console.error('Failed to load permission status:', error);
    }
  };

  const refreshPermissionStatus = async () => {
    setIsRefreshing(true);
    try {
      const status = await window.electronAPI.notification.getPermissionStatus();
      setPermissionStatus(status);
      toast({
        title: 'Status Refreshed',
        description: status.authorized ? 'Notifications are enabled.' : 'Notifications are blocked.',
      });
    } catch (error) {
      toast({
        title: 'Refresh Failed',
        description: 'Could not check permission status.',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateSettings = async (updates: Partial<NotificationSettings>) => {
    try {
      await window.electronAPI.notification.updateSettings(updates);
      const newSettings = await window.electronAPI.notification.getSettings();
      setSettings(newSettings);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update settings.',
        variant: 'destructive',
      });
    }
  };

  const openSystemSettings = async () => {
    try {
      await window.electronAPI.notification.openSystemSettings();
    } catch (error) {
      console.error('Failed to open system settings:', error);
    }
  };

  const testNotification = async () => {
    try {
      const shown = await window.electronAPI.notification.showTest(
        'completed',
        '/test/project',
        'test-branch'
      );
      if (shown) {
        toast({
          title: 'Test Sent',
          description: 'A test notification was sent. Check if it appeared.',
        });
      } else {
        toast({
          title: 'Notification Skipped',
          description: 'Notification was not shown (notifications may be disabled).',
          variant: 'destructive',
        });
      }
      loadPermissionStatus();
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: 'Failed to send test notification.',
        variant: 'destructive',
      });
    }
  };

  const renderPermissionStatus = () => {
    if (!permissionStatus) return null;

    if (!permissionStatus.supported) {
      return (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <ShieldX className="h-5 w-5 text-destructive flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Notifications Not Supported</p>
            <p className="text-xs text-muted-foreground">Your system does not support notifications.</p>
          </div>
        </div>
      );
    }

    if (!permissionStatus.authorized) {
      return (
        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-500">Notifications Blocked</p>
            <p className="text-xs text-muted-foreground">
              Notifications are disabled in system settings.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={refreshPermissionStatus} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" variant="outline" onClick={openSystemSettings}>
              <ExternalLink className="h-4 w-4 mr-1" />
              Open Settings
            </Button>
          </div>
        </div>
      );
    }

    if (permissionStatus.authorizationStatus === 'authorized') {
      return (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-500">Notifications Enabled</p>
            <p className="text-xs text-muted-foreground">System notifications are allowed for this app.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={refreshPermissionStatus} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" variant="outline" onClick={testNotification}>
              <Send className="h-4 w-4 mr-1" />
              Test
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 p-4 bg-muted/50 border border-border rounded-lg">
        <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Permission Status Unknown</p>
          <p className="text-xs text-muted-foreground">Click Test to verify notifications work.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={refreshPermissionStatus} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={openSystemSettings}>
            <ExternalLink className="h-4 w-4 mr-1" />
            Settings
          </Button>
          <Button size="sm" onClick={testNotification}>
            <Send className="h-4 w-4 mr-1" />
            Test
          </Button>
        </div>
      </div>
    );
  };

  if (!settings) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-1">Notification Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure when to receive notifications for Claude Code CLI activity.
        </p>
      </div>

      {/* System Permission Status */}
      {renderPermissionStatus()}

      {/* Enable Notifications */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <Bell className={`h-5 w-5 ${settings.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
          <div>
            <p className="text-sm font-medium">Enable Notifications</p>
            <p className="text-xs text-muted-foreground">Receive notifications when Claude completes tasks or asks questions</p>
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => updateSettings({ enabled: e.target.checked })}
          className="w-5 h-5 cursor-pointer accent-primary"
        />
      </div>
    </div>
  );
}
