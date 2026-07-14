import { useAppStore } from '../store';

/**
 * Connection pill: state is encoded in the dot, the label stays neutral so
 * the header does not fight the accent color.
 */
export function ConnectionStatus() {
  const { connected, connecting, error } = useAppStore();

  const state = connecting
    ? { dot: 'bg-yellow-500 animate-pulse', label: 'Connecting' }
    : error
      ? { dot: 'bg-destructive', label: 'Disconnected' }
      : connected
        ? { dot: 'bg-primary', label: 'Connected' }
        : null;

  if (!state) return null;

  return (
    <div className="flex items-center gap-1.5 h-6 px-2 rounded-full border text-[11px] text-muted-foreground">
      <span className={`w-1.5 h-1.5 rounded-full ${state.dot}`} />
      {state.label}
    </div>
  );
}
