import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type CardVariant = 'glass' | 'solid' | 'soft' | 'danger' | 'success';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  children: ReactNode;
};

const variantClasses: Record<CardVariant, string> = {
  glass: 'glass-card',
  solid: 'bg-white border border-slate-200 shadow-soft',
  soft: 'bg-slate-50/90 border border-slate-200/80 shadow-soft',
  danger: 'bg-rose-50/80 border border-rose-200 shadow-soft',
  success: 'bg-emerald-50/70 border border-emerald-200 shadow-soft',
};

export function Card({ className, variant = 'glass', children, ...props }: CardProps) {
  return (
    <div className={cn('rounded-2xl p-6', variantClasses[variant], className)} {...props}>
      {children}
    </div>
  );
}

export default Card;

