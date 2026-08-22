import type { ReactNode } from 'react';
import { cn } from './cn';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div>
        <h1 className="text-[clamp(1.55rem,2.4vw,2.1rem)] font-bold text-primary-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-secondary-ink">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export default PageHeader;

