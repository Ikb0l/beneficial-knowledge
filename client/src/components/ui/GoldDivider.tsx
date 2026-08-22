import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';

type DividerVariant = 'default' | 'thick' | 'ornate';

interface GoldDividerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: DividerVariant;
  width?: 'full' | 'half' | 'third';
}

const variantStyles: Record<DividerVariant, string> = {
  default: 'h-px bg-gradient-to-r from-transparent via-gold-primary to-transparent opacity-50',
  thick: 'h-0.5 bg-gradient-to-r from-transparent via-gold-primary to-transparent opacity-60',
  ornate: 'h-px bg-gradient-to-r from-transparent via-gold-primary to-transparent opacity-50 relative',
};

const widthStyles = {
  full: 'w-full',
  half: 'w-1/2 mx-auto',
  third: 'w-1/3 mx-auto',
};

export const GoldDivider = forwardRef<HTMLDivElement, GoldDividerProps>(
  ({ variant = 'default', width = 'full', className, ...props }, ref) => {
    if (variant === 'ornate') {
      return (
        <div
          ref={ref}
          className={cn('relative flex items-center justify-center py-2', widthStyles[width], className)}
          {...props}
        >
          {/* Left ornament */}
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-primary opacity-40" />

          {/* Center diamond */}
          <div className="mx-3 w-2 h-2 rotate-45 bg-gold-primary opacity-60" />

          {/* Right ornament */}
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-primary opacity-40" />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(variantStyles[variant], widthStyles[width], className)}
        {...props}
      />
    );
  }
);

GoldDivider.displayName = 'GoldDivider';

export default GoldDivider;
