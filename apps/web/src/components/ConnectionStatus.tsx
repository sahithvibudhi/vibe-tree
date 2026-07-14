import { useAppStore } from '../store';

export function ConnectionStatus() {
  const { connected, connecting, error } = useAppStore();

  if (connecting) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
        <span className="text-xs text-muted-foreground">Connecting...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-red-500 rounded-full" />
        <span className="text-xs text-red-500">Disconnected</span>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full" />
        <span className="text-xs text-green-500">Connected</span>
      </div>
    );
  }

  return null;
}
