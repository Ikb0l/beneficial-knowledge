import { forwardRef, type HTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

type ProgressVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'rank';
type ProgressSize = 'xs' | 'sm' | 'md' | 'lg';

interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value: number;
  max?: number;
  variant?: ProgressVariant;
  size?: ProgressSize;
  showLabel?: boolean;
  label?: string;
  showPercentage?: boolean;
  animated?: boolean;
  glowing?: boolean;
  shimmer?: boolean;
}

const variantStyles: Record<ProgressVariant, string> = {
  default: 'bg-gradient-to-r from-white/40 to-white/60',
  primary: 'bg-gradient-to-r from-accent-teal to-teal-400',
  success: 'bg-gradient-to-r from-feedback-correct to-emerald-400',
  warning: 'bg-gradient-to-r from-warning to-amber-400',
  error: 'bg-gradient-to-r from-feedback-wrong to-red-400',
  rank: 'bg-gradient-to-r from-accent-teal via-teal-400 to-cyan-400',
};

const glowStyles: Record<ProgressVariant, string> = {
  default: '',
  primary: 'shadow-[0_0_10px_rgba(0,212,170,0.5)]',
  success: 'shadow-[0_0_10px_rgba(34,197,94,0.5)]',
  warning: 'shadow-[0_0_10px_rgba(245,158,11,0.5)]',
  error: 'shadow-[0_0_10px_rgba(239,68,68,0.5)]',
  rank: 'shadow-[0_0_10px_rgba(0,212,170,0.5)]',
};

const sizeStyles: Record<ProgressSize, { bar: string; text: string }> = {
  xs: { bar: 'h-1', text: 'text-2xs' },
  sm: { bar: 'h-1.5', text: 'text-xs' },
  md: { bar: 'h-2', text: 'text-sm' },
  lg: { bar: 'h-3', text: 'text-base' },
};

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value,
      max = 100,
      variant = 'primary',
      size = 'md',
      showLabel = false,
      label,
      showPercentage = false,
      animated = true,
      glowing = false,
      shimmer = false,
      className,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    const styles = sizeStyles[size];

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {(showLabel || showPercentage) && (
          <div className="flex justify-between items-center mb-1">
            {showLabel && (
              <span className={cn('text-text-secondary font-medium', styles.text)}>
                {label}
              </span>
            )}
            {showPercentage && (
              <span className={cn('text-text-secondary font-mono', styles.text)}>
                {Math.round(percentage)}%
              </span>
            )}
          </div>
        )}

        <div
          className={cn(
            'w-full bg-white/10 rounded-full overflow-hidden',
            styles.bar
          )}
        >
          <motion.div
            initial={animated ? { width: 0 } : undefined}
            animate={{ width: `${percentage}%` }}
            transition={animated ? { duration: 0.5, ease: 'easeOut' } : undefined}
            className={cn(
              'h-full rounded-full relative overflow-hidden',
              variantStyles[variant],
              glowing && glowStyles[variant]
            )}
          >
            {/* Shimmer overlay */}
            {shimmer && (
              <motion.div
                className="absolute inset-0 bg-shimmer bg-[length:200%_100%]"
                animate={{
                  backgroundPosition: ['200% 0', '-200% 0'],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            )}
          </motion.div>
        </div>
      </div>
    );
  }
);

ProgressBar.displayName = 'ProgressBar';

// XP Progress Bar with Level Info
interface XPProgressBarProps extends Omit<ProgressBarProps, 'label' | 'showLabel' | 'value' | 'max'> {
  currentXP: number;
  requiredXP: number;
  level?: number;
}

export const XPProgressBar = forwardRef<HTMLDivElement, XPProgressBarProps>(
  ({ currentXP, requiredXP, level, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('w-full', className)}>
        <div className="flex justify-between items-center mb-1">
          {level !== undefined && (
            <span className="text-sm font-heading font-semibold text-white">
              Level {level}
            </span>
          )}
          <span className="text-xs text-text-secondary font-mono">
            {currentXP.toLocaleString()} / {requiredXP.toLocaleString()} XP
          </span>
        </div>
        <ProgressBar
          value={currentXP}
          max={requiredXP}
          variant="primary"
          glowing
          {...props}
        />
      </div>
    );
  }
);

XPProgressBar.displayName = 'XPProgressBar';

// Rank Progress Bar
interface RankProgressBarProps extends Omit<ProgressBarProps, 'label' | 'value' | 'max'> {
  currentMMR: number;
  nextRankMMR: number;
  currentRank: string;
  nextRank: string;
}

export const RankProgressBar = forwardRef<HTMLDivElement, RankProgressBarProps>(
  ({ currentMMR, nextRankMMR, currentRank, nextRank, className, ...props }, ref) => {
    // Calculate progress within current rank
    // Assuming previous rank threshold for simplicity
    const previousRankMMR = currentMMR - (nextRankMMR - currentMMR) * 0.5;
    const progress = ((currentMMR - previousRankMMR) / (nextRankMMR - previousRankMMR)) * 100;

    return (
      <div ref={ref} className={cn('w-full', className)}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-heading font-semibold text-white capitalize">
            {currentRank}
          </span>
          <span className="text-xs text-text-secondary">
            {nextRankMMR - currentMMR} MMR to {nextRank}
          </span>
        </div>
        <ProgressBar
          value={Math.min(progress, 100)}
          max={100}
          variant="rank"
          glowing
          {...props}
        />
      </div>
    );
  }
);

RankProgressBar.displayName = 'RankProgressBar';

// Circular Progress (for timers and status indicators)
interface CircularProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  children?: React.ReactNode;
}

const circleVariantColors: Record<string, string> = {
  default: '#ffffff',
  primary: '#20c5ff',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
};

export const CircularProgress = forwardRef<HTMLDivElement, CircularProgressProps>(
  (
    {
      value,
      max = 100,
      size = 64,
      strokeWidth = 4,
      variant = 'primary',
      children,
      className,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div
        ref={ref}
        className={cn('relative inline-flex items-center justify-center', className)}
        style={{ width: size, height: size }}
        {...props}
      >
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={circleVariantColors[variant]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              strokeDasharray: circumference,
            }}
          />
        </svg>
        {children && (
          <div className="absolute inset-0 flex items-center justify-center">
            {children}
          </div>
        )}
      </div>
    );
  }
);

CircularProgress.displayName = 'CircularProgress';

export default ProgressBar;
