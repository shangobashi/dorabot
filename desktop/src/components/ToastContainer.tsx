import { useToasts, dismissToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, Info, X } from 'lucide-react';

const icons = { error: AlertCircle, success: Check, info: Info } as const;
const borders = { error: 'border-l-red-500', success: 'border-l-green-500', info: 'border-l-blue-500' } as const;

export function ToastContainer() {
  const toasts = useToasts();
  const visible = toasts.slice(-5);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {visible.map(t => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-md border-l-4 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg animate-in slide-in-from-right-5 fade-in',
              borders[t.type],
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 break-words max-w-[260px]">{t.message}</span>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 opacity-50 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
