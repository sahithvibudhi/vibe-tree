import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationSettingsTab } from './NotificationSettingsTab';

// Mock the toast hook
const mockToast = vi.fn();
vi.mock('./ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('NotificationSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mocks
    (window.electronAPI.notification.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
    });
    (window.electronAPI.notification.getPermissionStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      supported: true,
      authorized: true,
      authorizationStatus: 'authorized',
    });
  });

  describe('Rendering', () => {
    it('should render nothing when settings are not loaded', () => {
      (window.electronAPI.notification.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const { container } = render(<NotificationSettingsTab isVisible={true} />);

      // Initially renders null before settings load
      expect(container.firstChild).toBeNull();
    });

    it('should render settings when visible and settings are loaded', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notification Settings')).toBeInTheDocument();
      });

      expect(screen.getByText('Configure when to receive notifications for Claude Code CLI activity.')).toBeInTheDocument();
      expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
    });

    it('should not load settings when not visible', () => {
      render(<NotificationSettingsTab isVisible={false} />);

      expect(window.electronAPI.notification.getSettings).not.toHaveBeenCalled();
      expect(window.electronAPI.notification.getPermissionStatus).not.toHaveBeenCalled();
    });

    it('should load settings when becoming visible', async () => {
      const { rerender } = render(<NotificationSettingsTab isVisible={false} />);

      expect(window.electronAPI.notification.getSettings).not.toHaveBeenCalled();

      rerender(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(window.electronAPI.notification.getSettings).toHaveBeenCalled();
        expect(window.electronAPI.notification.getPermissionStatus).toHaveBeenCalled();
      });
    });
  });

  describe('Permission Status - Authorized', () => {
    it('should show "Notifications Enabled" when authorized', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notifications Enabled')).toBeInTheDocument();
      });

      expect(screen.getByText('System notifications are allowed for this app.')).toBeInTheDocument();
    });

    it('should show Test button when authorized', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      });
    });

    it('should show Refresh button when authorized', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notifications Enabled')).toBeInTheDocument();
      });

      // Find refresh button (it's a ghost button with RefreshCw icon)
      const buttons = screen.getAllByRole('button');
      const refreshButton = buttons.find(btn => btn.querySelector('svg.lucide-refresh-cw'));
      expect(refreshButton).toBeInTheDocument();
    });
  });

  describe('Permission Status - Blocked', () => {
    beforeEach(() => {
      (window.electronAPI.notification.getPermissionStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        supported: true,
        authorized: false,
        authorizationStatus: 'denied',
      });
    });

    it('should show "Notifications Blocked" when not authorized', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notifications Blocked')).toBeInTheDocument();
      });

      expect(screen.getByText('Notifications are disabled in system settings.')).toBeInTheDocument();
    });

    it('should show "Open Settings" button when blocked', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument();
      });
    });

    it('should call openSystemSettings when clicking "Open Settings"', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /open settings/i }));

      expect(window.electronAPI.notification.openSystemSettings).toHaveBeenCalled();
    });
  });

  describe('Permission Status - Not Supported', () => {
    beforeEach(() => {
      (window.electronAPI.notification.getPermissionStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        supported: false,
        authorized: false,
        authorizationStatus: 'unknown',
      });
    });

    it('should show "Notifications Not Supported" message', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notifications Not Supported')).toBeInTheDocument();
      });

      expect(screen.getByText('Your system does not support notifications.')).toBeInTheDocument();
    });
  });

  describe('Permission Status - Unknown', () => {
    beforeEach(() => {
      (window.electronAPI.notification.getPermissionStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        supported: true,
        authorized: true,
        authorizationStatus: 'unknown',
      });
    });

    it('should show "Permission Status Unknown" message', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Permission Status Unknown')).toBeInTheDocument();
      });

      expect(screen.getByText('Click Test to verify notifications work.')).toBeInTheDocument();
    });

    it('should show Test, Settings, and Refresh buttons', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Permission Status Unknown')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });
  });

  describe('Enable/Disable Toggle', () => {
    it('should show checkbox checked when notifications are enabled', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('should show checkbox unchecked when notifications are disabled', async () => {
      (window.electronAPI.notification.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        enabled: false,
      });

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('should call updateSettings when toggling checkbox', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(window.electronAPI.notification.updateSettings).toHaveBeenCalledWith({
        enabled: false,
      });
    });

    it('should reload settings after update', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      await waitFor(() => {
        // getSettings is called on initial load and after update
        expect(window.electronAPI.notification.getSettings).toHaveBeenCalledTimes(2);
      });
    });

    it('should show toast on update error', async () => {
      (window.electronAPI.notification.updateSettings as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Update failed')
      );

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to update settings.',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Test Notification', () => {
    it('should call showTest when clicking Test button', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      expect(window.electronAPI.notification.showTest).toHaveBeenCalledWith(
        'completed',
        '/test/project',
        'test-branch'
      );
    });

    it('should show success toast when test notification is shown', async () => {
      (window.electronAPI.notification.showTest as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Test Sent',
          description: 'A test notification was sent. Check if it appeared.',
        });
      });
    });

    it('should show warning toast when notification was skipped', async () => {
      (window.electronAPI.notification.showTest as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Notification Skipped',
          description: 'Notification was not shown (notifications may be disabled).',
          variant: 'destructive',
        });
      });
    });

    it('should show error toast when test fails', async () => {
      (window.electronAPI.notification.showTest as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Test failed')
      );

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Test Failed',
          description: 'Failed to send test notification.',
          variant: 'destructive',
        });
      });
    });

  });

  describe('Refresh Permission Status', () => {
    it('should call getPermissionStatus when clicking refresh', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notifications Enabled')).toBeInTheDocument();
      });

      // Find and click refresh button
      const buttons = screen.getAllByRole('button');
      const refreshButton = buttons.find(btn => btn.querySelector('svg.lucide-refresh-cw'));
      expect(refreshButton).toBeInTheDocument();

      fireEvent.click(refreshButton!);

      await waitFor(() => {
        expect(window.electronAPI.notification.getPermissionStatus).toHaveBeenCalledTimes(2);
      });
    });

    it('should show success toast after refresh when authorized', async () => {
      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notifications Enabled')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const refreshButton = buttons.find(btn => btn.querySelector('svg.lucide-refresh-cw'));

      fireEvent.click(refreshButton!);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Status Refreshed',
          description: 'Notifications are enabled.',
        });
      });
    });

    it('should show blocked message after refresh when not authorized', async () => {
      // First call returns authorized, second call returns blocked
      (window.electronAPI.notification.getPermissionStatus as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          supported: true,
          authorized: true,
          authorizationStatus: 'authorized',
        })
        .mockResolvedValueOnce({
          supported: true,
          authorized: false,
          authorizationStatus: 'denied',
        });

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notifications Enabled')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const refreshButton = buttons.find(btn => btn.querySelector('svg.lucide-refresh-cw'));

      fireEvent.click(refreshButton!);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Status Refreshed',
          description: 'Notifications are blocked.',
        });
      });
    });

    it('should show error toast when refresh fails', async () => {
      // First call succeeds, second call fails
      (window.electronAPI.notification.getPermissionStatus as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          supported: true,
          authorized: true,
          authorizationStatus: 'authorized',
        })
        .mockRejectedValueOnce(new Error('Refresh failed'));

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText('Notifications Enabled')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const refreshButton = buttons.find(btn => btn.querySelector('svg.lucide-refresh-cw'));

      fireEvent.click(refreshButton!);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Refresh Failed',
          description: 'Could not check permission status.',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle getSettings error gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      (window.electronAPI.notification.getSettings as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Load failed')
      );

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Failed to load notification settings:',
          expect.any(Error)
        );
      });

      consoleError.mockRestore();
    });

    it('should handle getPermissionStatus error gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      (window.electronAPI.notification.getPermissionStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission check failed')
      );

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Failed to load permission status:',
          expect.any(Error)
        );
      });

      consoleError.mockRestore();
    });

    it('should handle openSystemSettings error gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      (window.electronAPI.notification.getPermissionStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        supported: true,
        authorized: false,
        authorizationStatus: 'denied',
      });
      (window.electronAPI.notification.openSystemSettings as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Failed to open')
      );

      render(<NotificationSettingsTab isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /open settings/i }));

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Failed to open system settings:',
          expect.any(Error)
        );
      });

      consoleError.mockRestore();
    });
  });
});
