import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import { pulsingDotVariants } from '../../lib/animations/variants';

type DotSize = 'xs' | 'sm' | 'md' | 'lg';
type DotColor = 'online' | 'offline' | 'warning' | 'error' | 'teal' | 'orange';

interface PulsingDotProps {
  size?: DotSize;
  color?: DotColor;
  pulse?: boolean;
  className?: string;
}

const sizeStyles: Record<DotSize, string> = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

const colorStyles: Record<DotColor, { bg: string; glow: string }> = {
  online: {
    bg: 'bg-[#4ADE80]',
    glow: 'shadow-[0_0_8px_rgba(74,222,128,0.6)]',
  },
  offline: {
    bg: 'bg-gray-500',
    glow: '',
  },
  warning: {
    bg: 'bg-warning',
    glow: 'shadow-[0_0_8px_rgba(245,158,11,0.6)]',
  },
  error: {
    bg: 'bg-error',
    glow: 'shadow-[0_0_8px_rgba(239,68,68,0.6)]',
  },
  teal: {
    bg: 'bg-accent-teal',
    glow: 'shadow-[0_0_8px_rgba(0,212,170,0.6)]',
  },
  orange: {
    bg: 'bg-accent-orange',
    glow: 'shadow-[0_0_8px_rgba(255,107,53,0.6)]',
  },
};

export const PulsingDot = forwardRef<HTMLDivElement, PulsingDotProps>(
  ({ size = 'sm', color = 'online', pulse = true, className }, ref) => {
    const sizeClass = sizeStyles[size];
    const colorClass = colorStyles[color];

    if (!pulse) {
      return (
        <div
          ref={ref}
          className={cn(
            'rounded-full',
            sizeClass,
            colorClass.bg,
            className
          )}
        />
      );
    }

    return (
      <div ref={ref} className={cn('relative', className)}>
        {/* Pulse ring */}
        <motion.div
          className={cn(
            'absolute inset-0 rounded-full',
            colorClass.bg,
            'opacity-40'
          )}
          animate={{
            scale: [1, 2, 1],
            opacity: [0.4, 0, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        {/* Main dot */}
        <motion.div
          variants={pulsingDotVariants}
          initial="initial"
          animate="animate"
          className={cn(
            'rounded-full relative z-10',
            sizeClass,
            colorClass.bg,
            colorClass.glow
          )}
        />
      </div>
    );
  }
);

PulsingDot.displayName = 'PulsingDot';

export default PulsingDot;
