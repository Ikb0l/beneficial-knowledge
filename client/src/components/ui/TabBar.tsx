import { forwardRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils/cn';
import { tabItemVariants, floatingPlayButtonVariants } from '../../lib/animations/variants';
import { FlagIcon, PlayIcon, TrophyIcon, UserIcon, UsersIcon } from './Icons';

type TabId = 'play' | 'leaderboard' | 'tournaments' | 'friends' | 'profile';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  className?: string;
  badges?: Partial<Record<TabId, number>>;
  onPlayPress?: () => void;
  playButtonEnabled?: boolean;
  showFloatingPlay?: boolean;
}

interface TabItemConfig {
  id: TabId;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

export const TabBar = forwardRef<HTMLDivElement, TabBarProps>(
  (
    {
      activeTab,
      onTabChange,
      badges = {},
      onPlayPress,
      playButtonEnabled = false,
      showFloatingPlay = true,
      className
    },
    ref
  ) => {
    const { t } = useTranslation();
    const sideItems: TabItemConfig[] = useMemo(() => ([
      {
        id: 'leaderboard',
        label: t('nav.leaderboard'),
        icon: (active) => <TrophyIcon size={24} fill={active ? 'currentColor' : 'none'} />,
      },
      {
        id: 'tournaments',
        label: t('nav.tournaments'),
        icon: () => <FlagIcon size={24} />,
      },
      {
        id: 'friends',
        label: t('nav.friends'),
        icon: (active) => <UsersIcon size={24} fill={active ? 'currentColor' : 'none'} />,
      },
      {
        id: 'profile',
        label: t('nav.profile'),
        icon: (active) => <UserIcon size={24} fill={active ? 'currentColor' : 'none'} />,
      },
    ]), [t]);

    const handlePlayPress = () => {
      onTabChange('play');
      if (playButtonEnabled && onPlayPress) {
        onPlayPress();
      }
    };

    const renderSideItem = (item: TabItemConfig) => {
      const isActive = activeTab === item.id;
      const badgeCount = badges[item.id];

      return (
        <motion.button
          key={item.id}
          variants={tabItemVariants}
          initial="initial"
          animate={isActive ? "active" : "inactive"}
          whileTap="tap"
          onClick={() => onTabChange(item.id)}
          className={cn('relative flex h-full min-w-0 flex-col items-center justify-center rounded-xl px-1 touch-feedback')}
        >
          {isActive && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 rounded-xl bg-white/10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}

          <div className="relative z-10">
            {item.icon(isActive)}

            <AnimatePresence>
              {badgeCount !== undefined && badgeCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className={cn(
                    'absolute -top-1 -right-2',
                    'min-w-4 h-4 px-1',
                    'flex items-center justify-center',
                    'bg-[#FF6B6B] text-white text-2xs font-bold rounded-full'
                  )}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <span className={cn(
            'relative z-10 mt-1 text-[10px] font-bold font-heading leading-none sm:text-[11px]',
            isActive ? 'text-white' : 'text-[#a5b8d8]'
          )}>
            {item.label}
          </span>
        </motion.button>
      );
    };

    return (
      <div
        ref={ref}
        style={{ maxWidth: 'var(--app-shell-max-width)' }}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'md:left-1/2 md:right-auto md:bottom-2 md:w-[calc(100%-1.5rem)] md:-translate-x-1/2 md:rounded-2xl',
          'bg-gradient-to-b from-[#102149]/95 to-[#0b1734]/98 backdrop-blur-xl',
          'border-t border-[#8fb4e540] md:border md:border-[#8fb4e540]',
          'safe-area-bottom',
          className
        )}
      >
        <nav className="relative mx-auto grid h-[82px] w-full max-w-[760px] grid-cols-5 items-center px-1 pt-1 sm:h-[90px] sm:px-2">
          {renderSideItem(sideItems[0])}
          {renderSideItem(sideItems[1])}
          <div className="relative flex h-full items-center justify-center">
            <motion.button
              variants={floatingPlayButtonVariants}
              initial="initial"
              animate={playButtonEnabled ? "animate" : "disabled"}
              whileHover={playButtonEnabled ? { scale: 1.03 } : undefined}
              whileTap={playButtonEnabled ? "tap" : undefined}
              onClick={handlePlayPress}
              disabled={!playButtonEnabled}
              className={cn(
                'relative flex h-[66px] w-[66px] items-center justify-center rounded-full border-2 transition-all duration-200 sm:h-[74px] sm:w-[74px]',
                showFloatingPlay && '-mt-7 sm:-mt-8',
                activeTab === 'play'
                  ? 'border-white bg-gradient-to-br from-[#2cd5ff] to-[#1aa8f5] text-white shadow-[0_14px_30px_rgba(32,197,255,0.48)]'
                  : 'border-[#8fd6ff] bg-gradient-to-br from-[#1aa8f5] to-[#1485d9] text-white shadow-[0_10px_24px_rgba(32,197,255,0.34)]',
                !playButtonEnabled && 'opacity-60 grayscale'
              )}
              aria-label={t('home.findMatch')}
            >
              <PlayIcon size={27} />
              <AnimatePresence>
                {activeTab === 'play' && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute -bottom-6 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-[#d6eeff]"
                  >
                    {t('nav.play')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
          {renderSideItem(sideItems[2])}
          {renderSideItem(sideItems[3])}
        </nav>
      </div>
    );
  }
);

TabBar.displayName = 'TabBar';

export const TabBarLegacy = forwardRef<HTMLDivElement, Omit<TabBarProps, 'onPlayPress' | 'playButtonEnabled' | 'showFloatingPlay'>>(
  (props, ref) => {
    return <TabBar ref={ref} {...props} showFloatingPlay={false} />;
  }
);

TabBarLegacy.displayName = 'TabBarLegacy';

export default TabBar;
