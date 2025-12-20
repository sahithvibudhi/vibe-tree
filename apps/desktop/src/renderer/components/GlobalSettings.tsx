import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from './ui/dialog';
import { Settings, Bell } from 'lucide-react';
import { NotificationSettingsTab } from './NotificationSettingsTab';

type SettingsTab = 'general' | 'notifications';

export function GlobalSettings() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  useEffect(() => {
    // Listen for menu command to open settings
    const unsubscribe = window.electronAPI.menu.onOpenSettings(() => {
      setOpen(true);
    });

    return unsubscribe;
  }, []);

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  ];

  const renderGeneralTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-1">General Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure general application settings.
        </p>
      </div>

      <div className="p-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground text-center">
          General settings will be available in future updates.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl h-[70vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-xl font-semibold">Settings</h2>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-48 border-r bg-muted/30 p-2">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'general' && renderGeneralTab()}
            {activeTab === 'notifications' && <NotificationSettingsTab isVisible={open && activeTab === 'notifications'} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
