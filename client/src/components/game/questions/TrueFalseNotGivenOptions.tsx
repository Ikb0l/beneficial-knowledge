import type React from 'react';
import { cn } from '../../../lib/utils/cn';

export function TrueFalseNotGivenOptions({
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
        'flex flex-col',
        veryCompact ? 'mt-1.5 gap-1.5' : compact ? 'mt-2.5 gap-2' : 'mt-3.5 gap-2.5',
        className
      )}
    >
      {children}
    </div>
  );
}
