import { forwardRef, memo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils/cn';
import { statCardVariants } from '../../lib/animations/variants';
import { useCountUp } from '../../hooks/useCountUp';
import { PulsingDot } from '../ui/PulsingDot';
import { ChartIcon, GamepadIcon, TrophyIcon, WifiIcon } from '../ui/Icons';

type StatVariant = 'default' | 'success' | 'warning' | 'teal' | 'orange' | 'online';

interface StatCardProps {
  icon: ReactNode;
  value: number;
  label: string;
  variant?: StatVariant;
  index?: number;
  showOnlineDot?: boolean;
  suffix?: string;
  className?: string;
}

const variantStyles: Record<StatVariant, { text: string; bg: string; iconBg: string; ring: string }> = {
  default: {
    text: 'text-white',
    bg: 'bg-[#162646]',
    iconBg: 'bg-[#0f1d3d]',
    ring: 'shadow-[0_10px_20px_rgba(7,12,24,0.34)]',
  },
  success: {
    text: 'text-[#86efac]',
    bg: 'bg-[#162646]',
    iconBg: 'bg-[#0f1d3d]',
    ring: 'shadow-[0_10px_20px_rgba(7,12,24,0.34)]',
  },
  warning: {
    text: 'text-[#facc15]',
    bg: 'bg-[#162646]',
    iconBg: 'bg-[#0f1d3d]',
    ring: 'shadow-[0_10px_20px_rgba(7,12,24,0.34)]',
  },
  teal: {
    text: 'text-[#7dd9ff]',
    bg: 'bg-[#162646]',
    iconBg: 'bg-[#0f1d3d]',
    ring: 'shadow-[0_10px_20px_rgba(7,12,24,0.34)]',
  },
  orange: {
    text: 'text-[#fda47a]',
    bg: 'bg-[#162646]',
    iconBg: 'bg-[#0f1d3d]',
    ring: 'shadow-[0_10px_20px_rgba(7,12,24,0.34)]',
  },
  online: {
    text: 'text-[#86efac]',
    bg: 'bg-[#162646]',
    iconBg: 'bg-[#0f1d3d]',
    ring: 'shadow-[0_10px_20px_rgba(7,12,24,0.34)]',
  },
};

export const StatCard = memo(forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      icon,
      value,
      label,
      variant = 'default',
      index = 0,
      showOnlineDot = false,
      suffix = '',
      className,
    },
    ref
  ) => {
    const styles = variantStyles[variant];
    const { displayValue } = useCountUp({
      end: value,
      duration: 800,
      delay: index * 80,
    });
    const showValue = !(showOnlineDot && value === 0);

    return (
      <motion.div
        ref={ref}
        variants={statCardVariants}
        initial="initial"
        animate="animate"
        whileHover="hover"
        custom={index}
        className={cn(
          'relative flex flex-col items-center justify-center text-center',
          'px-[clamp(8px,2.4vw,14px)] py-[clamp(8px,2.2vw,12px)] rounded-[clamp(14px,2.8vw,20px)]',
          styles.bg,
          styles.ring,
          'border border-[#8fb4e53d]',
          'backdrop-blur-sm',
          'w-full flex-1 min-w-0 min-h-[clamp(64px,14vw,104px)]',
          className
        )}
      >
        {/* Icon */}
        <div className={cn(
          'w-[clamp(28px,7vw,36px)] h-[clamp(28px,7vw,36px)] rounded-full flex items-center justify-center mb-[clamp(4px,1.6vw,8px)]',
          styles.iconBg,
          styles.text
        )}>
          {icon}
        </div>

        {/* Value */}
        <div className="relative flex items-center justify-center min-h-[28px]">
          {showValue ? (
            <span className={cn(
              'text-[clamp(20px,6vw,28px)] font-score font-bold tabular-nums',
              styles.text
            )}>
              {displayValue}{suffix}
            </span>
          ) : (
            <PulsingDot size="md" color="online" />
          )}
          {showOnlineDot && value > 0 && (
            <div className="absolute -right-3 top-0">
              <PulsingDot size="sm" color="online" />
            </div>
          )}
        </div>

        {/* Label */}
        <span className="text-[clamp(10px,2.4vw,12px)] text-[#9db0cd] font-medium tracking-wide mt-[clamp(2px,1vw,6px)]">
          {label}
        </span>
      </motion.div>
    );
  }
));

StatCard.displayName = 'StatCard';

// Pre-configured stat cards
export const GamesStatCard = memo(({ value, index = 0 }: { value: number; index?: number }) => {
  const { t } = useTranslation();

  return (
    <StatCard
      icon={<GamepadIcon size={24} />}
      value={value}
      label={t('home.games')}
      variant="default"
      index={index}
    />
  );
});

export const WinsStatCard = memo(({ value, index = 1 }: { value: number; index?: number }) => {
  const { t } = useTranslation();

  return (
    <StatCard
      icon={<TrophyIcon size={24} />}
      value={value}
      label={t('home.wins')}
      variant="success"
      index={index}
    />
  );
});

export const WinRateStatCard = memo(({ value, index = 2 }: { value: number; index?: number }) => {
  const { t } = useTranslation();

  return (
    <StatCard
      icon={<ChartIcon size={24} />}
      value={value}
      label={t('home.winRate')}
      variant="teal"
      suffix="%"
      index={index}
    />
  );
});

export const OnlineStatCard = memo(({ value, index = 3 }: { value: number; index?: number }) => {
  const { t } = useTranslation();

  return (
    <StatCard
      icon={<WifiIcon size={24} />}
      value={value}
      label={t('friends.online')}
      variant="online"
      index={index}
      showOnlineDot
    />
  );
});

GamesStatCard.displayName = 'GamesStatCard';
WinsStatCard.displayName = 'WinsStatCard';
WinRateStatCard.displayName = 'WinRateStatCard';
OnlineStatCard.displayName = 'OnlineStatCard';

export default StatCard;
