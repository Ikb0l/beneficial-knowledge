import type { ReactNode } from 'react';
import Card from './Card';
import { cn } from './cn';

type Tone = 'primary' | 'success' | 'warning' | 'info';

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  tone?: Tone;
  className?: string;
};

const toneClasses: Record<Tone, string> = {
  primary: 'bg-primary-100/80 text-primary-700',
  success: 'bg-emerald-100/85 text-emerald-700',
  warning: 'bg-amber-100/85 text-amber-700',
  info: 'bg-sky-100/80 text-sky-700',
};

export function StatCard({ title, value, subtitle, icon, tone = 'primary', className }: StatCardProps) {
  return (
    <Card className={cn('card-hover p-5', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-primary-ink">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {icon && (
          <div className={cn('rounded-xl p-3', toneClasses[tone])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export default StatCard;

