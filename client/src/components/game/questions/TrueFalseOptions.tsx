import type React from 'react';
import { cn } from '../../../lib/utils/cn';

export function TrueFalseOptions({
  children,
  className,
  compact = false,
  veryCompact = false,
}: {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  veryCompact?: boolean;
}) {
  return (
    <div
      className={cn(
        'mt-3.5 sm:mt-4.5 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5',
        compact && 'mt-2.5 sm:mt-3 grid-cols-2 gap-1.5 sm:gap-2',
        veryCompact && 'mt-1.5 gap-1.5 sm:gap-1.5',
        className
      )}
    >
      {children}
    </div>
  );
}
