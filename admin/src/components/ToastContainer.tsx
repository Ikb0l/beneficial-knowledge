import { useEffect } from 'react';
import { useToastStore, type Toast, type ToastKind } from '../stores/toastStore';

const kindStyles: Record<ToastKind, { border: string; bg: string; title: string; dot: string }> = {
  success: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    title: 'text-emerald-200',
    dot: 'bg-emerald-400',
  },
  error: {
    border: 'border-red-500/30',
    bg: 'bg-red-500/10',
    title: 'text-red-200',
    dot: 'bg-red-400',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    title: 'text-amber-200',
    dot: 'bg-amber-400',
  },
  info: {
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
    title: 'text-sky-200',
    dot: 'bg-sky-400',
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    if (toast.durationMs <= 0) return;
    const timer = setTimeout(() => removeToast(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, removeToast]);

  const styles = kindStyles[toast.kind];

  return (
    <div
      className={[
        'pointer-events-auto w-full max-w-sm rounded-xl border shadow-lg',
        'backdrop-blur bg-slate-950/80 text-slate-100',
        styles.border,
        styles.bg,
      ].join(' ')}
      role="status"
      aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
    >
      <div className="p-4 flex gap-3">
        <div className="pt-1">
          <div className={['w-2.5 h-2.5 rounded-full', styles.dot].join(' ')} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {toast.title && (
                <p className={['text-sm font-semibold', styles.title].join(' ')}>
                  {toast.title}
                </p>
              )}
              <p className="text-sm text-slate-100/90 break-words">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-200/90 hover:bg-white/10"
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

export default ToastContainer;

