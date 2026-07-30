import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn('input', className)} {...props} />;
});

export default Select;

