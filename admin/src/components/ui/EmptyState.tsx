import type { ReactNode } from 'react';
import { cn } from './cn';

type EmptyStateProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, subtitle, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-slate-300/90 bg-white/60 px-6 py-10 text-center backdrop-blur-sm',
        className,
      )}
    >
      {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-slate-400">{icon}</div>}
      <p className="text-base font-semibold text-slate-700">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;

