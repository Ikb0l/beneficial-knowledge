import type { HTMLAttributes, ReactNode } from 'react';
import Card from './Card';
import { cn } from './cn';

type SectionProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function Section({ title, subtitle, actions, className, children, ...props }: SectionProps) {
  return (
    <Card className={cn('space-y-4', className)} {...props}>
      {(title || subtitle || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-semibold text-primary-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-secondary-ink">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}

export default Section;

