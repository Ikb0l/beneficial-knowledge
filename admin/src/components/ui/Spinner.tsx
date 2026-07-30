import { cn } from './cn';

type SpinnerProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-7 w-7 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <div
      className={cn(
        'inline-block animate-spin rounded-full border-primary-600/30 border-t-primary-600',
        sizeClasses[size],
        className,
      )}
      aria-hidden="true"
    />
  );
}

export default Spinner;

