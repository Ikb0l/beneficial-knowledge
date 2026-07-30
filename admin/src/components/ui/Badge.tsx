import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'badge-success',
  error: 'badge-error',
  warning: 'badge-warning',
  info: 'badge-info',
  neutral: 'bg-slate-100 text-slate-700 border border-slate-300/80',
};

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return <span className={cn('badge', variantClasses[variant], className)} {...props} />;
}

export default Badge;

