import type React from 'react';
import { OptionsGrid } from '../../ui';
import { cn } from '../../../lib/utils/cn';

export function McqQuestionOptions({
  children,
  className,
  compact = false,
  veryCompact = false,
  twoColumnsOnMobile = false,
}: {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  veryCompact?: boolean;
  twoColumnsOnMobile?: boolean;
}) {
  return (
    <OptionsGrid
      variant="default"
      className={cn(
        'mt-3.5 sm:mt-4.5 gap-2 sm:gap-2.5',
        compact && 'mt-2.5 sm:mt-3 gap-1.5 sm:gap-2',
        veryCompact && 'mt-1.5 gap-1.5 sm:gap-1.5',
        twoColumnsOnMobile && 'grid-cols-2',
        className
      )}
    >
      {children}
    </OptionsGrid>
  );
}
