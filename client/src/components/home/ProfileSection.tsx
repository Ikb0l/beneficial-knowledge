import { forwardRef, memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils/cn';
import { profileSectionVariants } from '../../lib/animations/variants';
import { Avatar } from '../ui/Avatar';
import { ShieldIcon } from '../ui/Icons';
import type { DefaultRankTier } from '../../shared/types/game';

interface ProfileSectionProps {
  photoUrl?: string | null;
  displayName: string;
  rank: DefaultRankTier;
  mmr: number;
  rankProgress: number;
  rankRemaining: number;
  nextRankName: string | null;
  isMaxRank?: boolean;
  className?: string;
}

export const ProfileSection = memo(forwardRef<HTMLDivElement, ProfileSectionProps>(
  (
    {
      photoUrl,
      displayName,
      rank,
      mmr,
      rankProgress,
      rankRemaining,
      nextRankName,
      isMaxRank = false,
      className,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const progressValue = Math.min(Math.max(rankProgress, 0), 100);
    const progressLabel = isMaxRank || !nextRankName
      ? t('profile.maxRankReached')
      : t('home.toNextRank', { points: rankRemaining, rank: nextRankName });

    const rankLabel = useMemo(() => {
      return t(`ranks.${rank}`, rank.replace(/_/g, ' '));
    }, [rank, t]);

    return (
      <motion.div
        ref={ref}
        variants={profileSectionVariants}
        initial="initial"
        animate="animate"
        className={cn('relative py-4', className)}
      >
        <div
          className={cn(
            'relative mx-auto w-full max-w-[42rem] rounded-[18px] px-4 py-4',
            'bg-[#162646]',
            'border border-[#95b6de3d]',
            'shadow-[0_16px_30px_rgba(7,12,24,0.46)]'
          )}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="rounded-full p-[3px] bg-gradient-to-br from-[#2acbff] via-[#47d8ff] to-[#7c78ff] shadow-[0_0_24px_rgba(42,203,255,0.4)]">
                <Avatar
                  src={photoUrl}
                  name={displayName}
                  size="profile"
                  showRankBorder={false}
                  rankGlow={false}
                />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="name-text font-heading font-bold text-xl tracking-tight text-white truncate">
                {displayName}
              </h2>
            </div>
          </div>

          <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-[#8fb4e54d] bg-[#102149]/90 px-3 py-2 text-sm shadow-[0_8px_20px_rgba(7,12,24,0.35)] sm:absolute sm:mt-0 sm:right-4 sm:top-4 sm:px-4 sm:py-2 sm:gap-3">
            <ShieldIcon className="w-5 h-5 text-[#FBBF24] sm:w-6 sm:h-6" />
            <span className="font-semibold text-white capitalize text-sm sm:text-base">
              {rankLabel}
            </span>
            <span className="text-[#7dd9ff] font-semibold tabular-nums text-sm sm:text-base">
              {mmr.toLocaleString()} MMR
            </span>
          </div>

          <div className="mt-4">
            <div className="h-3.5 w-full rounded-full bg-[#0d1a36] overflow-hidden border border-[#8fb4e53d]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressValue}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-[#2acbff] via-[#56d8ff] to-[#7c78ff] shadow-[0_0_16px_rgba(42,203,255,0.35)]"
              />
            </div>
            <p className="mt-3 text-center text-sm text-[#a9b9d3]">
              {progressLabel}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }
));

ProfileSection.displayName = 'ProfileSection';

export default ProfileSection;
