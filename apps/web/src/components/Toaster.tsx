import { useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useAppStore, type Toast } from '../store';

// Errors linger longer because they carry information the user must read
const DISMISS_MS: Record<Toast['variant'], number> = {
  error: 8000,
  success: 4000,
  info: 5000
};

const ICONS = {
  error: <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />,
  success: <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />,
  info: <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismissToast } = useAppStore();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => dismissToast(toast.id), DISMISS_MS[toast.variant]);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      className="flex items-start gap-2 w-80 rounded-md border bg-background shadow-lg p-3 pointer-events-auto"
      role="status"
      data-testid={`toast-${toast.variant}`}
    >
      {ICONS[toast.variant]}
      <p className="text-xs leading-relaxed flex-1 break-words">{toast.message}</p>
      <button
        onClick={() => dismissToast(toast.id)}
        className="p-0.5 text-muted-foreground hover:text-foreground rounded"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * App-wide toast stack. Failures used to disappear into the console;
 * anything the user should know about goes through here instead.
 */
export function Toaster() {
  const { toasts } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
