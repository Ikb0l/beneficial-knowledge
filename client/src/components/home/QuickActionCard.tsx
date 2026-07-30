import { forwardRef, memo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils/cn';
import { quickActionVariants } from '../../lib/animations/variants';
import { ChevronRightIcon, LifebuoyIcon, SparklesIcon, TrophyIcon } from '../ui/Icons';

type ActionVariant = 'tournaments' | 'season' | 'support';

interface QuickActionCardProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  variant?: ActionVariant;
  index?: number;
  onClick?: () => void;
  className?: string;
  badge?: string | number;
}

const variantStyles: Record<ActionVariant, { gradient: string; iconBg: string }> = {
  tournaments: {
    gradient: 'from-[#7c78ff] to-[#615de8]',
    iconBg: 'bg-white/18',
  },
  season: {
    gradient: 'from-[#f59e0b] to-[#d97706]',
    iconBg: 'bg-white/18',
  },
  support: {
    gradient: 'from-[#20c5ff] to-[#0ea5e9]',
    iconBg: 'bg-white/18',
  },
};

export const QuickActionCard = memo(forwardRef<HTMLButtonElement, QuickActionCardProps>(
  (
    {
      icon,
      title,
      subtitle,
      variant = 'tournaments',
      index = 0,
      onClick,
      badge,
      className,
    },
    ref
  ) => {
    const styles = variantStyles[variant];
    const isFeatured = variant === 'tournaments';

    return (
      <motion.button
        ref={ref}
        variants={quickActionVariants}
        initial="initial"
        animate="animate"
        whileHover="hover"
        whileTap={{ scale: 0.97 }}
        custom={index}
        onClick={onClick}
        className={cn(
          'w-full flex items-center justify-between gap-3',
          isFeatured
            ? 'min-h-[clamp(84px,14vw,110px)] px-[clamp(16px,4vw,24px)] py-[clamp(12px,3vw,18px)] rounded-[clamp(18px,4.2vw,28px)]'
            : 'min-h-[clamp(68px,12vw,90px)] px-[clamp(14px,3.6vw,20px)] py-[clamp(10px,2.6vw,14px)] rounded-[clamp(14px,3.4vw,22px)]',
          isFeatured ? 'bg-gradient-to-br' : 'bg-gradient-to-r',
          styles.gradient,
          isFeatured
            ? 'shadow-[0_16px_32px_rgba(64,74,201,0.42)]'
            : 'shadow-[0_10px_24px_rgba(7,12,24,0.35)]',
          'transition-transform duration-150',
          'touch-feedback no-select text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fd6ff]/70',
          className
        )}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <div className={cn(
          isFeatured
            ? 'w-[clamp(40px,9vw,52px)] h-[clamp(40px,9vw,52px)] rounded-[clamp(16px,3vw,22px)]'
            : 'w-[clamp(36px,8vw,44px)] h-[clamp(36px,8vw,44px)] rounded-[clamp(14px,2.8vw,20px)]',
          'flex items-center justify-center flex-shrink-0',
          styles.iconBg,
          'text-white'
        )}>
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={cn(
              'font-heading font-semibold text-white truncate',
              isFeatured ? 'text-[clamp(16px,3.6vw,20px)]' : 'text-[clamp(13px,3vw,16px)]'
            )}>
              {title}
            </h3>
            {badge !== undefined && (
              <span className="px-1.5 py-0.5 text-2xs font-bold bg-[#ff8a4d] rounded-full text-white">
                {typeof badge === 'number' && badge > 99 ? '99+' : badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className={cn(
              'text-white/80 truncate mt-0.5',
              isFeatured ? 'text-[clamp(13px,3.2vw,16px)]' : 'text-[clamp(11px,2.6vw,13px)]'
            )}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 text-white/80">
          <ChevronRightIcon size={20} />
        </div>
      </motion.button>
    );
  }
));

QuickActionCard.displayName = 'QuickActionCard';

export const TournamentsAction = memo(({
  onClick,
  badge,
  title,
  subtitle,
}: {
  onClick?: () => void;
  badge?: number;
  title?: string;
  subtitle?: string;
}) => {
  const { t } = useTranslation();

  return (
    <QuickActionCard
      icon={<TrophyIcon size={32} />}
      title={title || t('home.tournaments')}
      subtitle={subtitle || t('home.tournamentsActionSubtitle')}
      variant="tournaments"
      index={0}
      onClick={onClick}
      badge={badge}
    />
  );
});

export const SeasonAction = memo(({ onClick }: { onClick?: () => void }) => {
  const { t } = useTranslation();

  return (
    <QuickActionCard
      icon={<SparklesIcon size={28} />}
      title={t('home.season')}
      subtitle={t('home.seasonActionSubtitle')}
      variant="season"
      index={1}
      onClick={onClick}
    />
  );
});

export const SupportAction = memo(({ onClick }: { onClick?: () => void }) => {
  const { t } = useTranslation();

  return (
    <QuickActionCard
      icon={<LifebuoyIcon size={28} />}
      title={t('home.support')}
      subtitle={t('home.supportActionSubtitle')}
      variant="support"
      index={3}
      onClick={onClick}
    />
  );
});

TournamentsAction.displayName = 'TournamentsAction';
SeasonAction.displayName = 'SeasonAction';
SupportAction.displayName = 'SupportAction';

export default QuickActionCard;
