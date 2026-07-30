import type { ReactNode } from 'react';
import { cn } from './cn';

type DataTableShellProps = {
  children: ReactNode;
  className?: string;
};

export function DataTableShell({ children, className }: DataTableShellProps) {
  return <div className={cn('table-shell', className)}>{children}</div>;
}

export default DataTableShell;

