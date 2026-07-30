import { clsx, type ClassValue } from 'clsx';

/**
 * Utility function for combining class names
 * Uses clsx for conditional classes
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
