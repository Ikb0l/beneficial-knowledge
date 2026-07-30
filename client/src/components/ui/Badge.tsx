import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import { badgeVariants } from '../../lib/animations/variants';
import type { DefaultRankTier, CategoryId } from '../../shared/types/game';
import { RANK_STYLES } from '../../shared/constants/ranks';
import { getCategoryById, getCategoryTopicColor } from '../../shared/constants/categories';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  animated?: boolean;
  children: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/10 text-white border-white/20',
  primary: 'bg-accent-teal/20 text-accent-teal border-accent-teal/30',
  secondary: 'bg-accent-orange/20 text-accent-orange border-accent-orange/30',
  success: 'bg-feedback-correct/20 text-feedback-correct border-feedback-correct/30',
  error: 'bg-feedback-wrong/20 text-feedback-wrong border-feedback-wrong/30',
  warning: 'bg-warning/20 text-warning border-warning/30',
  info: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-2xs',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      animated = false,
      children,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <motion.span
        ref={ref}
        variants={animated ? badgeVariants : undefined}
        initial={animated ? "initial" : undefined}
        animate={animated ? "animate" : undefined}
        whileHover={animated ? "hover" : undefined}
        className={cn(
          'inline-flex items-center justify-center font-semibold rounded-full border',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </motion.span>
    );
  }
);

Badge.displayName = 'Badge';

// Rank Badge Component
interface RankBadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  rank: DefaultRankTier;
  size?: BadgeSize;
  showIcon?: boolean;
}

// Using RANK_STYLES from shared/constants/ranks

export const RankBadge = forwardRef<HTMLSpanElement, RankBadgeProps>(
  ({ rank, size = 'md', showIcon = true, className, ...props }, ref) => {
    const styles = RANK_STYLES[rank];

    return (
      <motion.span
        ref={ref}
        variants={badgeVariants}
        initial="initial"
        animate="animate"
        className={cn(
          'inline-flex items-center justify-center font-bold rounded-full capitalize shadow-md',
          styles.bg,
          styles.text,
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {showIcon && <span className="mr-1">{styles.icon}</span>}
        {rank}
      </motion.span>
    );
  }
);

RankBadge.displayName = 'RankBadge';

// Difficulty Badge Component
type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultyBadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  difficulty: Difficulty;
  size?: BadgeSize;
}

const difficultyStyles: Record<Difficulty, string> = {
  easy: 'bg-success/20 text-success border-success/30',
  medium: 'bg-warning/20 text-warning border-warning/30',
  hard: 'bg-error/20 text-error border-error/30',
};

export const DifficultyBadge = forwardRef<HTMLSpanElement, DifficultyBadgeProps>(
  ({ difficulty, size = 'sm', className, ...props }, ref) => {
    return (
      <motion.span
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-semibold rounded-full border uppercase tracking-wide',
          difficultyStyles[difficulty],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {difficulty}
      </motion.span>
    );
  }
);

DifficultyBadge.displayName = 'DifficultyBadge';

// Category Badge Component
interface CategoryBadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  category: CategoryId;
  size?: BadgeSize;
  showIcon?: boolean;
}

// Using helpers from shared/constants/categories for dynamic category support

export const CategoryBadge = forwardRef<HTMLSpanElement, CategoryBadgeProps>(
  ({ category, size = 'md', showIcon = true, className, ...props }, ref) => {
    const categoryInfo = getCategoryById(category);
    const colors = getCategoryTopicColor(category);

    return (
      <motion.span
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-semibold rounded-full border',
          colors.bg,
          colors.text,
          colors.border,
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {showIcon && categoryInfo && <span className="mr-1">{categoryInfo.icon}</span>}
        {categoryInfo?.name || category}
      </motion.span>
    );
  }
);

CategoryBadge.displayName = 'CategoryBadge';

// Notification Count Badge
interface CountBadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  count: number;
  max?: number;
}

export const CountBadge = forwardRef<HTMLSpanElement, CountBadgeProps>(
  ({ count, max = 99, className, ...props }, ref) => {
    if (count <= 0) return null;

    const displayCount = count > max ? `${max}+` : count.toString();

    return (
      <motion.span
        ref={ref}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className={cn(
          'inline-flex items-center justify-center min-w-5 h-5 px-1.5',
          'bg-error text-white text-xs font-bold rounded-full',
          className
        )}
        {...props}
      >
        {displayCount}
      </motion.span>
    );
  }
);

CountBadge.displayName = 'CountBadge';

export default Badge;
