import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils/cn';
import { topicCardVariants, categoryGridVariants, categoryGridItemVariants } from '../../lib/animations/variants';
import type { CategoryId } from '../../shared/types/game';
import { PulsingDot } from './PulsingDot';
import { ChevronRightIcon } from './Icons';

interface CategoryCardProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  categoryId: CategoryId;
  name: string;
  icon: ReactNode;
  description?: string;
  orderIndex?: number;
  selected?: boolean;
  winRate?: number;
  gamesPlayed?: number;
  playersOnline?: number;
  showStats?: boolean;
  variant?: 'list' | 'grid';
}

// Beneficial Knowledge Topic Gradients - Modern vibrant colors
const topicGradients: Record<number, { bg: string; from: string; to: string; softFrom: string; softTo: string }> = {
  0: { bg: 'bg-topic-1', from: '#6366f1', to: '#8b5cf6', softFrom: '#6366f133', softTo: '#8b5cf61f' },
  1: { bg: 'bg-topic-2', from: '#06b6d4', to: '#3b82f6', softFrom: '#06b6d433', softTo: '#3b82f61f' },
  2: { bg: 'bg-topic-3', from: '#ec4899', to: '#f43f5e', softFrom: '#ec489933', softTo: '#f43f5e1f' },
  3: { bg: 'bg-topic-4', from: '#f59e0b', to: '#f97316', softFrom: '#f59e0b33', softTo: '#f973161f' },
  4: { bg: 'bg-topic-5', from: '#10b981', to: '#14b8a6', softFrom: '#10b98133', softTo: '#14b8a61f' },
  5: { bg: 'bg-topic-6', from: '#8b5cf6', to: '#a855f7', softFrom: '#8b5cf633', softTo: '#a855f71f' },
  6: { bg: 'bg-topic-7', from: '#ef4444', to: '#f97316', softFrom: '#ef444433', softTo: '#f973161f' },
};

const formatCompact = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return value.toString();
};

// ============================================
// Grid Card - New Rich Design for 2-column layout
// ============================================

export const CategoryCard = forwardRef<HTMLButtonElement, CategoryCardProps>(
  (
    {
      categoryId,
      name,
      icon,
      description,
      orderIndex,
      selected = false,
      winRate,
      gamesPlayed,
      playersOnline,
      showStats = true,
      variant = 'grid',
      className,
      ...props
    },
    ref
  ) => {
    const { t } = useTranslation();
    const index = typeof orderIndex === 'number'
      ? orderIndex
      : Math.abs(categoryId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
    const gradientInfo = topicGradients[index % 7];

    // Grid variant - refined selection card
    if (variant === 'grid') {
      return (
        <motion.button
          ref={ref}
          variants={topicCardVariants}
          initial="initial"
          animate={selected ? "selected" : "animate"}
          whileHover="hover"
          whileTap="tap"
          className={cn(
            'relative w-full flex flex-col rounded-[clamp(12px,2vw,18px)] overflow-hidden',
            'bg-[#141a33]/85 border transition-all duration-250',
            'min-h-[clamp(100px,16vw,140px)]',
            'touch-feedback no-select text-left',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal/60',
            selected
              ? 'border-accent-teal/70 shadow-[0_0_24px_rgba(0,212,170,0.35)]'
              : 'border-white/10 hover:border-white/20 hover:shadow-[0_10px_24px_rgba(0,0,0,0.35)]',
            className
          )}
          {...props}
        >
          {/* Accent bar */}
          <div
            className="absolute left-0 top-0 h-1 w-full"
            style={{ background: `linear-gradient(90deg, ${gradientInfo.from}, ${gradientInfo.to})` }}
          />

          {/* Icon + badge row */}
          <div className="flex items-start justify-between p-[clamp(8px,2vw,14px)] pb-[clamp(4px,1vw,8px)]">
            <div
              className="w-[clamp(32px,6vw,44px)] h-[clamp(32px,6vw,44px)] rounded-[clamp(10px,2vw,16px)] flex items-center justify-center text-white shadow-[0_8px_16px_rgba(0,0,0,0.3)]"
              style={{ background: `linear-gradient(145deg, ${gradientInfo.from} 0%, ${gradientInfo.to} 100%)` }}
            >
              <span className="text-[clamp(16px,4vw,22px)] drop-shadow-lg">{icon}</span>
            </div>

            {playersOnline !== undefined && playersOnline > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/35 border border-white/10 backdrop-blur-sm">
                <PulsingDot size="xs" color="online" />
                <span className="text-2xs font-semibold text-white">
                  {playersOnline.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 px-[clamp(8px,2vw,14px)] pb-[clamp(8px,2vw,14px)]">
            <h3 className="font-heading font-bold text-white text-[clamp(13px,2vw,16px)] leading-snug line-clamp-1">
              {name}
            </h3>
            {description && !showStats && (
              <p className="mt-1 text-[clamp(11px,2.6vw,13px)] text-white/60 line-clamp-2">
                {description}
              </p>
            )}

            {showStats && (gamesPlayed !== undefined || winRate !== undefined) && (
              <div className="mt-2 flex items-center gap-2 text-[clamp(11px,2.6vw,13px)] text-text-secondary">
                {gamesPlayed !== undefined && (
                  <span>{t('search.gamesPlayedLabel', { count: gamesPlayed })}</span>
                )}
                {gamesPlayed !== undefined && winRate !== undefined && (
                  <span className="text-white/20">•</span>
                )}
                {winRate !== undefined && (
                  <span className="text-accent-teal font-semibold">
                    {t('search.winRateLabel', { count: Math.round(winRate) })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Selection Indicator */}
          {selected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
              className="absolute top-3 right-3 w-7 h-7 bg-accent-teal rounded-full flex items-center justify-center shadow-glow-teal"
            >
              <svg className="w-4 h-4 text-bg-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </motion.div>
          )}
        </motion.button>
      );
    }

    // List variant - premium topic card
    return (
      <motion.button
        ref={ref}
        variants={topicCardVariants}
        initial="initial"
        animate={selected ? "selected" : "animate"}
        whileHover="hover"
        whileTap="tap"
        className={cn(
          'relative w-full flex items-center gap-3 px-[clamp(10px,2vw,14px)] py-[clamp(10px,2vw,14px)] rounded-[clamp(10px,2vw,16px)] overflow-hidden min-h-[clamp(64px,12vw,90px)]',
          'bg-[#14182d] border border-white/10 transition-all duration-250',
          'touch-feedback no-select text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/60',
          selected
            ? 'border-[#20c5ff] shadow-[0_0_24px_rgba(0,217,255,0.35)]'
            : 'hover:border-white/20 hover:shadow-[0_0_18px_rgba(0,217,255,0.2)]',
          'shadow-[0_10px_24px_rgba(0,0,0,0.4)]',
          className
        )}
        style={{
          backgroundImage: `linear-gradient(135deg, ${gradientInfo.softFrom} 0%, ${gradientInfo.softTo} 100%)`,
        }}
        {...props}
      >
        <div
          className="absolute left-0 top-0 h-full w-1.5"
          style={{ background: `linear-gradient(180deg, ${gradientInfo.from}, ${gradientInfo.to})` }}
        />
        <div
          className="absolute left-0 top-0 h-full w-10 blur-2xl opacity-30"
          style={{ background: `linear-gradient(180deg, ${gradientInfo.from}, ${gradientInfo.to})` }}
        />

        <div
          className="relative z-10 w-[clamp(36px,7vw,48px)] h-[clamp(36px,7vw,48px)] rounded-[clamp(10px,2vw,16px)] flex items-center justify-center flex-shrink-0 text-white text-[clamp(14px,3vw,20px)]"
          style={{ background: `linear-gradient(145deg, ${gradientInfo.from} 0%, ${gradientInfo.to} 100%)` }}
        >
          {icon}
        </div>

        <div className="relative z-10 flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-white text-[clamp(12px,1.8vw,15px)] truncate">
            {name}
          </h3>
          {playersOnline !== undefined && (
            <p className="text-[#20c5ff] text-[clamp(11px,2.6vw,13px)] mt-1">
              {t('search.playingNowLabel', { value: formatCompact(playersOnline) })}
            </p>
          )}
          {showStats && (gamesPlayed !== undefined || winRate !== undefined) && (
            <p className="text-text-secondary text-[clamp(11px,2.6vw,13px)] mt-1">
              {t('search.yourStatsLabel', { games: gamesPlayed ?? 0, winRate: Math.round(winRate ?? 0) })}
            </p>
          )}
          {description && !showStats && (
            <p className="text-text-secondary text-[clamp(11px,2.6vw,13px)] mt-1 truncate">
              {description}
            </p>
          )}
        </div>

        <div className={cn(
          'relative z-10 flex-shrink-0 transition-colors',
          selected ? 'text-[#20c5ff]' : 'text-text-muted'
        )}>
          <ChevronRightIcon size={20} />
        </div>
      </motion.button>
    );
  }
);

CategoryCard.displayName = 'CategoryCard';

// ============================================
// Grid Layout - 2-column layout
// ============================================

interface CategoryGridProps {
  children: React.ReactNode;
  className?: string;
}

export const CategoryGrid = forwardRef<HTMLDivElement, CategoryGridProps>(
  ({ children, className }, ref) => {
    return (
      <motion.div
        ref={ref}
        variants={categoryGridVariants}
        initial="initial"
        animate="animate"
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 gap-[clamp(10px,2.4vw,14px)]',
          className
        )}
      >
        {children}
      </motion.div>
    );
  }
);

CategoryGrid.displayName = 'CategoryGrid';

// ============================================
// List Layout - Original vertical list
// ============================================

interface CategoryListProps {
  children: React.ReactNode;
  className?: string;
}

export const CategoryList = forwardRef<HTMLDivElement, CategoryListProps>(
  ({ children, className }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial="initial"
        animate="animate"
        className={cn('flex flex-col gap-3', className)}
      >
        {children}
      </motion.div>
    );
  }
);

CategoryList.displayName = 'CategoryList';

// Wrapper for grid items with animation
export const CategoryGridItem = forwardRef<HTMLDivElement, { children: React.ReactNode; index?: number }>(
  ({ children, index = 0 }, ref) => {
    return (
      <motion.div
        ref={ref}
        variants={categoryGridItemVariants}
        custom={index}
      >
        {children}
      </motion.div>
    );
  }
);

CategoryGridItem.displayName = 'CategoryGridItem';

export default CategoryCard;

