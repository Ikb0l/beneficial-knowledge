import { memo, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useGameStore } from '../../stores/gameStore';
import { useCategoryStore } from '../../stores/categoryStore';
import { useRankStore } from '../../stores/rankStore';
import { screenVariants } from '../../lib/animations/variants';
import { formatQuizDisplayName } from '../../lib/utils/quizDisplayName';

const DotPatternBackground = memo(function DotPatternBackground() {
  return <div className="absolute inset-0" style={{ backgroundColor: '#000000' }} />;
});

interface PlayerAvatarProps {
  src?: string | null;
  name?: string;
  isMystery?: boolean;
}

const PlayerAvatar = memo(function PlayerAvatar({ src, name, isMystery }: PlayerAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const showImage = !!src && !imageError;

  const getInitials = (label: string) => {
    const parts = label.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return label.slice(0, 2).toUpperCase();
  };

  if (isMystery) {
    return (
      <motion.div className="relative shrink-0" animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border-[4px] border-[#111111] bg-white shadow-[0_10px_18px_rgba(0,0,0,0.25)]">
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)' }}
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
          />
          <motion.span className="text-2xl font-bold text-white/80" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>
            ?
          </motion.span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="relative shrink-0" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
      <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border-[4px] border-[#111111] bg-white shadow-[0_10px_18px_rgba(0,0,0,0.25)]">
        {showImage ? (
          <img src={src} alt={name || 'Player'} className="h-full w-full object-cover" onError={() => setImageError(true)} />
        ) : (
          <span className="text-xl font-bold text-white">{getInitials(name || 'Player')}</span>
        )}
      </div>
    </motion.div>
  );
});

interface PlayerCardProps {
  username: string;
  rank: string;
  avatarSrc?: string | null;
  isMystery?: boolean;
  position: 'top' | 'bottom';
}

const PlayerCard = memo(function PlayerCard({
  username,
  rank,
  avatarSrc,
  isMystery,
  position,
}: PlayerCardProps) {
  const displayUsername = isMystery ? '???' : formatQuizDisplayName(username, 'Player');
  const isTop = position === 'top';
  const cardStyles = isTop
    ? 'border-emerald-500 bg-emerald-300 text-emerald-950'
    : 'border-rose-500 bg-rose-300 text-rose-950';
  const subtextStyles = isTop ? 'text-emerald-900/80' : 'text-rose-900/80';

  return (
    <motion.div
      initial={{ x: isTop ? -100 : 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20, delay: isTop ? 0.1 : 0.2 }}
      className={`relative overflow-hidden rounded-[clamp(20px,4.2vw,32px)] border ${cardStyles} shadow-[0_12px_35px_rgba(0,0,0,0.45)]`}
    >
      {isMystery && (
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-white/40" />
        </div>
      )}

      <div className="relative p-[clamp(16px,4vw,24px)]">
        <div className="flex items-center gap-4">
          <PlayerAvatar src={avatarSrc} name={displayUsername} isMystery={isMystery} />
          <div className="name-slot">
            <motion.div
              initial={{ y: isTop ? -20 : 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: isTop ? 0.3 : 0.4 }}
              className="name-text max-w-[220px] sm:max-w-[260px] text-2xl font-extrabold tracking-tight"
            >
              {displayUsername}
            </motion.div>
            <motion.div
              initial={{ y: isTop ? -10 : 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: isTop ? 0.35 : 0.45 }}
              className={`text-sm font-semibold ${subtextStyles}`}
            >
              {isMystery ? '' : rank}
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

const LightningDivider = memo(function LightningDivider() {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.5 }}
      className="flex w-full items-center justify-center"
    >
      <motion.div
        className="grid h-20 w-20 place-items-center rounded-full bg-white shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
        animate={{
          boxShadow: [
            '0 20px 40px rgba(0,0,0,0.35)',
            '0 20px 50px rgba(0,0,0,0.5)',
            '0 20px 40px rgba(0,0,0,0.35)',
          ],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="grid h-16 w-16 place-items-center rounded-full bg-black">
          <motion.svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="white"
            className="drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </motion.svg>
        </div>
      </motion.div>
    </motion.div>
  );
});

const RotatingStatusMessage = memo(function RotatingStatusMessage({ messages }: { messages: string[] }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [messages]);

  return (
    <div className="text-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={messageIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-2xl font-semibold text-white/90"
        >
          {messages[messageIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
});

interface TimerDisplayProps {
  seconds: number;
}

const TimerDisplay = memo(function TimerDisplay({ seconds }: TimerDisplayProps) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    <motion.div className="flex justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
      <AnimatePresence mode="wait">
        <motion.div key={seconds} initial={{ scale: 0.9, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 font-mono text-3xl text-white/80">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {minutes}:{remainingSeconds.toString().padStart(2, '0')}
          </span>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
});

interface CancelButtonProps {
  onClick: () => void;
  label: string;
}

const CancelButton = memo(function CancelButton({ onClick, label }: CancelButtonProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full rounded-2xl bg-white px-6 py-3.5 text-center font-semibold text-black shadow-[0_10px_25px_rgba(0,0,0,0.35)]"
    >
      {label}
    </motion.button>
  );
});

export function SearchingScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const categories = useCategoryStore((state) => state.categories);
  const { getRankByMmr } = useRankStore();
  const {
    queueParentCategory,
    queueSubcategories,
    queueMode,
    searchBroadenedToAllInCategory,
    cancelSearching,
    returnToHome,
    searchStartTime,
  } = useGameStore();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (searchStartTime) {
        setElapsed(Math.floor((Date.now() - searchStartTime) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [searchStartTime]);

  const isPracticeQueue = queueMode === 'practice';
  const statusMessages = useMemo(() => (
    isPracticeQueue
      ? [
          t('search.practiceStatusMessage1', 'Preparing your practice session...'),
          t('search.practiceStatusMessage2', 'Loading questions...'),
        ]
      : [
          t('search.statusMessage1'),
          t('search.statusMessage2'),
          t('search.statusMessage3'),
          t('search.statusMessage4'),
        ]
  ), [isPracticeQueue, t]);

  const primarySubcategory = queueSubcategories[0] || '';
  const queuedCategoryId = primarySubcategory || queueParentCategory || '';
  const queuedCategory = categories.find((c) => c.id === queuedCategoryId) || null;
  const queuedParent = queueParentCategory ? (categories.find((c) => c.id === queueParentCategory) || null) : null;
  const inferredParent =
    primarySubcategory && queuedCategory?.parentId
      ? (categories.find((c) => c.id === queuedCategory.parentId) || null)
      : null;
  const mainCategoryName =
    queuedParent?.name ||
    inferredParent?.name ||
    queuedCategory?.name ||
    queueParentCategory ||
    queuedCategoryId ||
    t('search.defaultCategory');
  const mainCategoryIcon =
    queuedParent?.icon ||
    inferredParent?.icon ||
    queuedCategory?.icon ||
    '📚';
  const parentCategoryName = queuedParent?.name || inferredParent?.name || queueParentCategory || t('search.defaultCategory');
  const displayLabel = `${mainCategoryIcon} ${mainCategoryName}`;

  const userMmr = user?.profile?.mmr || 1000;
  const userRankInfo = getRankByMmr(userMmr);
  const rankName = userRankInfo?.name || t('ranks.bronze');

  return (
    <motion.div variants={screenVariants} initial="initial" animate="animate" exit="exit" className="fixed inset-0 flex items-center justify-center">
      <DotPatternBackground />

      <div className="relative z-10 w-full max-w-[430px] px-4">
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-5 text-center">
          <span className="text-3xl font-semibold tracking-wide text-white">{displayLabel}</span>
        </motion.div>

        <div className="flex flex-col gap-5">
          <PlayerCard
            username={user?.displayName ? formatQuizDisplayName(user.displayName, t('countdown.you')) : t('countdown.you')}
            rank={rankName}
            avatarSrc={user?.photoUrl}
            position="top"
          />
          {isPracticeQueue ? (
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="rounded-[clamp(20px,4.2vw,32px)] border border-cyan-400 bg-cyan-200 p-[clamp(16px,4vw,24px)] text-center text-cyan-950 shadow-[0_12px_35px_rgba(0,0,0,0.45)]"
            >
              <p className="text-xl font-extrabold tracking-tight">
                {t('search.modePractice', 'Practice')}
              </p>
              <p className="mt-1 text-sm font-semibold text-cyan-900/80">
                {t('search.practiceNoMmr', 'Solo session with no MMR changes')}
              </p>
            </motion.div>
          ) : (
            <>
              <LightningDivider />
              <PlayerCard username={t('search.unknownOpponent')} rank="" isMystery position="bottom" />
            </>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <RotatingStatusMessage messages={statusMessages} />
            <TimerDisplay seconds={elapsed} />
            {!isPracticeQueue && searchBroadenedToAllInCategory && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-xs font-medium text-[#9fe7ff]"
              >
                {t('search.autoBroadenedNotice', { category: parentCategoryName })}
              </motion.p>
            )}
          </div>

          <div className="pt-2">
            <CancelButton
              onClick={isPracticeQueue ? returnToHome : cancelSearching}
              label={isPracticeQueue ? t('common.close') : t('common.cancel')}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default SearchingScreen;
