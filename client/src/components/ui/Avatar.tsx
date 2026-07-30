import { forwardRef, useEffect, useState, memo } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import type { DefaultRankTier } from '../../shared/types/game';
import { RANK_BORDER_COLORS, RANK_GRADIENTS } from '../../shared/constants/ranks';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'profile';
type PlayerType = 'you' | 'opponent' | 'neutral';
export type AvatarState = 'idle' | 'answered' | 'thinking' | 'winning' | 'losing';
type AvatarEffectMode = 'standard' | 'result';
type AvatarEffectStyle = 'standard' | 'fire';

interface AvatarProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  rank?: DefaultRankTier;
  playerType?: PlayerType;
  showRankBorder?: boolean;
  online?: boolean;
  showOnlineIndicator?: boolean;
  state?: AvatarState;
  showGlow?: boolean;
  rankGlow?: boolean;
  effectMode?: AvatarEffectMode;
  effectStyle?: AvatarEffectStyle;
}

const sizeStyles: Record<AvatarSize, { container: string; text: string; indicator: string; ring: string; crown: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-xs', indicator: 'w-2 h-2 border', ring: 'w-8 h-8', crown: 'w-3 h-3 -top-2' },
  sm: { container: 'w-8 h-8', text: 'text-sm', indicator: 'w-2.5 h-2.5 border', ring: 'w-10 h-10', crown: 'w-4 h-4 -top-2' },
  md: { container: 'w-10 h-10', text: 'text-base', indicator: 'w-3 h-3 border-2', ring: 'w-14 h-14', crown: 'w-5 h-5 -top-3' },
  lg: { container: 'w-12 h-12', text: 'text-lg', indicator: 'w-3.5 h-3.5 border-2', ring: 'w-16 h-16', crown: 'w-6 h-6 -top-3' },
  xl: { container: 'w-16 h-16', text: 'text-xl', indicator: 'w-4 h-4 border-2', ring: 'w-20 h-20', crown: 'w-7 h-7 -top-4' },
  '2xl': { container: 'w-24 h-24', text: 'text-3xl', indicator: 'w-5 h-5 border-2', ring: 'w-28 h-28', crown: 'w-8 h-8 -top-5' },
  '3xl': { container: 'w-28 h-28', text: 'text-4xl', indicator: 'w-6 h-6 border-2', ring: 'w-32 h-32', crown: 'w-10 h-10 -top-6' },
  profile: { container: 'w-20 h-20', text: 'text-2xl', indicator: 'w-4 h-4 border-2', ring: 'w-24 h-24', crown: 'w-7 h-7 -top-4' },
};

// Rank glow shadow colors
const rankGlowStyles: Record<string, string> = {
  bronze: 'shadow-glow-rank-bronze',
  silver: 'shadow-glow-rank-silver',
  gold: 'shadow-glow-rank-gold',
  platinum: 'shadow-glow-rank-platinum',
  diamond: 'shadow-glow-rank-diamond',
  master: 'shadow-glow-rank-master',
  grandmaster: 'shadow-glow-rank-grandmaster',
};

const playerColors: Record<PlayerType, { ring: string; glow: string; glowColor: string }> = {
  you: {
    ring: 'ring-accent-teal',
    glow: 'shadow-glow-teal',
    glowColor: 'rgba(0, 212, 170, 0.4)',
  },
  opponent: {
    ring: 'ring-accent-orange',
    glow: 'shadow-glow-orange',
    glowColor: 'rgba(255, 107, 53, 0.4)',
  },
  neutral: {
    ring: '',
    glow: '',
    glowColor: 'transparent',
  },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getColorFromName(name: string): string {
  const colors = [
    'bg-gradient-to-br from-purple-500 to-indigo-600',
    'bg-gradient-to-br from-cyan-500 to-blue-600',
    'bg-gradient-to-br from-pink-500 to-rose-600',
    'bg-gradient-to-br from-amber-500 to-orange-600',
    'bg-gradient-to-br from-emerald-500 to-teal-600',
    'bg-gradient-to-br from-violet-500 to-purple-600',
    'bg-gradient-to-br from-red-500 to-orange-600',
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

// Crown component for winning state
const Crown = memo(function Crown({ size, color, effectMode = 'standard' }: { size: string; color: string; effectMode?: AvatarEffectMode }) {
  const crownLift = effectMode === 'result' ? -3 : -2;
  const crownDuration = effectMode === 'result' ? 1.6 : 2;
  return (
    <motion.div
      className={cn('absolute left-1/2 -translate-x-1/2 z-20', size)}
      initial={{ y: 10, opacity: 0, scale: 0 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        fill={color}
        className="w-full h-full drop-shadow-lg"
        animate={{ y: [0, crownLift, 0], opacity: [0.9, 1, 0.9] }}
        transition={{ duration: crownDuration, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
        <path d="M5 19h14v2H5v-2z" />
      </motion.svg>
    </motion.div>
  );
});

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      name,
      size = 'md',
      rank,
      playerType,
      showRankBorder = true,
      online,
      showOnlineIndicator = false,
      state = 'idle',
      showGlow = true,
      rankGlow = false,
      effectMode = 'standard',
      effectStyle = 'standard',
      className,
      ...props
    },
    ref
  ) => {
    const [imageError, setImageError] = useState(false);
    const safeName = name?.trim() || 'Unknown';
    const showImage = !!src && !imageError;
    const styles = sizeStyles[size];
    const hasRankBorder = rank && showRankBorder && !playerType;
    const hasPlayerRing = playerType && playerType !== 'neutral';
    const playerColor = playerType ? playerColors[playerType] : playerColors.neutral;
    const isWinning = state === 'winning';
    const isLosing = state === 'losing';
    const isResultMode = effectMode === 'result';
    const isFireEffect = effectStyle === 'fire' && hasPlayerRing;
    const firePalette = playerType === 'opponent'
      ? {
          core: 'rgba(249, 115, 22, 0.66)',
          ember: 'rgba(239, 68, 68, 0.56)',
          halo: 'rgba(251, 191, 36, 0.44)',
          ring: 'rgba(251, 146, 60, 0.9)',
        }
      : {
          core: 'rgba(251, 146, 60, 0.66)',
          ember: 'rgba(239, 68, 68, 0.5)',
          halo: 'rgba(253, 224, 71, 0.44)',
          ring: 'rgba(251, 191, 36, 0.9)',
        };

    useEffect(() => {
      const resetTimer = setTimeout(() => {
        setImageError(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }, [src]);

    // Animation variants based on state
    const getAnimationProps = () => {
      switch (state) {
        case 'idle':
          return {
            animate: { scale: [1, 1.03, 1] },
            transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
          };
        case 'answered':
          return {
            animate: { scale: [1, 1.1, 1] },
            transition: { duration: 0.3 },
          };
        case 'thinking':
          return {
            animate: { scale: [1, 1.05, 1], opacity: [1, 0.8, 1] },
            transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
          };
        case 'winning':
          return {
            animate: { scale: isResultMode ? [1, 1.06, 1] : [1, 1.04, 1] },
            transition: { duration: isResultMode ? 1.2 : 1.7, repeat: Infinity, ease: 'easeInOut' },
          };
        case 'losing':
          return {
            animate: { scale: [1, 0.985, 1] },
            transition: { duration: 2.1, repeat: Infinity, ease: 'easeInOut' },
          };
        default:
          return {};
      }
    };

    const animationProps = getAnimationProps();
    const winnerAuraColor = isFireEffect
      ? firePalette.ring
      : playerType === 'opponent'
        ? 'rgba(245, 158, 11, 0.5)'
        : playerType === 'you'
          ? 'rgba(34, 211, 238, 0.5)'
          : 'rgba(251, 191, 36, 0.48)';
    const glowAnimation = state === 'thinking'
      ? { opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }
      : state === 'winning'
        ? {
            opacity: isResultMode ? [0.52, 1, 0.52] : [0.4, 0.82, 0.4],
            scale: isResultMode ? [1, 1.14, 1] : [1, 1.09, 1],
          }
        : state === 'losing'
          ? { opacity: [0.08, 0.16, 0.08], scale: [1, 1.03, 1] }
          : state === 'answered'
            ? { opacity: [0.24, 0.42, 0.24], scale: [1, 1.03, 1] }
            : { opacity: [0.3, 0.55, 0.3], scale: [1, 1.04, 1] };
    const glowDuration = state === 'thinking'
      ? 1
      : state === 'winning'
        ? isResultMode ? 0.95 : 1.35
        : state === 'losing'
          ? 1.7
          : 2;
    const fireGlowAnimation = state === 'thinking'
      ? { opacity: [0.56, 1, 0.62], scale: [1, 1.15, 1], rotate: [0, -2, 2, 0] }
      : state === 'winning'
        ? { opacity: [0.62, 1, 0.66], scale: [1, 1.2, 1], rotate: [0, 3, -3, 0] }
        : state === 'losing'
          ? { opacity: [0.12, 0.3, 0.14], scale: [1, 1.05, 1] }
          : state === 'answered'
            ? { opacity: [0.38, 0.78, 0.4], scale: [1, 1.12, 1], rotate: [0, 1, -1, 0] }
            : { opacity: [0.34, 0.84, 0.38], scale: [1, 1.12, 1], rotate: [0, 1.5, -1.5, 0] };
    const fireGlowDuration = state === 'winning'
      ? 0.72
      : state === 'thinking'
        ? 0.82
        : state === 'answered'
          ? 0.9
          : state === 'losing'
            ? 1.25
            : 1;
    const fireContainerShadow = isFireEffect
      ? state === 'winning'
        ? `0 0 18px ${firePalette.core}, 0 0 36px ${firePalette.ember}`
        : `0 0 14px ${firePalette.core}, 0 0 28px ${firePalette.halo}`
      : undefined;

    // Determine if we should show rank glow
    const showRankGlow = rankGlow && rank && !playerType;
    const rankGlowClass = showRankGlow && rank ? rankGlowStyles[rank] : '';

    return (
      <motion.div
        ref={ref}
        className={cn('relative inline-flex', className)}
        {...animationProps}
        {...props}
      >
        {/* Rank glow ring - animated */}
        {showRankGlow && (
          <motion.div
            className={cn(
              'absolute inset-0 rounded-full',
              rankGlowClass
            )}
            style={{ margin: '-6px' }}
            animate={{
              opacity: [0.4, 0.8, 0.4],
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Outer glow ring */}
        {showGlow && hasPlayerRing && (
          <motion.div
            className={cn(
              'absolute inset-0 rounded-full',
              styles.ring
            )}
            style={{
              margin: isFireEffect ? '-6px' : '-4px',
              background: isFireEffect
                ? `radial-gradient(circle, ${firePalette.core} 0%, ${firePalette.ember} 34%, ${firePalette.halo} 62%, transparent 80%)`
                : `radial-gradient(circle, ${playerColor.glowColor} 0%, transparent 70%)`,
              filter: isFireEffect ? 'blur(0.6px) saturate(1.12)' : undefined,
            }}
            animate={isFireEffect ? fireGlowAnimation : glowAnimation}
            transition={{
              duration: isFireEffect ? fireGlowDuration : glowDuration,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Ember swirl for fire mode */}
        {showGlow && isFireEffect && (
          <motion.div
            className={cn('absolute inset-0 rounded-full pointer-events-none', styles.ring)}
            style={{
              margin: '-8px',
              background: `conic-gradient(from 0deg, transparent 0deg, ${firePalette.halo} 70deg, transparent 140deg, ${firePalette.ember} 220deg, transparent 320deg)`,
              filter: 'blur(2px)',
            }}
            animate={{
              rotate: [0, 360],
              opacity: state === 'winning' ? [0.42, 0.82, 0.42] : [0.34, 0.72, 0.34],
              scale: state === 'winning' ? [1, 1.14, 1] : [1, 1.1, 1],
            }}
            transition={{
              duration: state === 'winning' ? 1.7 : 2.2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        )}

        {/* Winner accent ring */}
        {isWinning && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 pointer-events-none"
            style={{
              margin: '-3px',
              borderColor: winnerAuraColor,
            }}
            animate={{
              opacity: isResultMode ? [0.35, 0.82, 0.35] : [0.28, 0.62, 0.28],
              scale: isResultMode ? [1, 1.08, 1] : [1, 1.05, 1],
            }}
            transition={{
              duration: isResultMode ? 0.95 : 1.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Crown for winning state */}
        {state === 'winning' && (
          <Crown
            size={styles.crown}
            color={playerType === 'you' ? '#fbbf24' : '#f59e0b'}
            effectMode={effectMode}
          />
        )}

        {/* Main avatar container */}
        <div
          className={cn(
            'relative rounded-full overflow-hidden flex items-center justify-center',
            styles.container,
            (hasRankBorder || hasPlayerRing) && 'ring-2',
            hasRankBorder && rank && RANK_BORDER_COLORS[rank],
            hasPlayerRing && playerColor.ring,
            hasPlayerRing && showGlow && !isFireEffect && playerColor.glow,
            isLosing && (isResultMode ? 'opacity-70 grayscale-[45%] saturate-75' : 'opacity-78 grayscale-[35%] saturate-90')
          )}
          style={fireContainerShadow ? { boxShadow: fireContainerShadow } : undefined}
        >
          {showImage ? (
            <img
              src={src}
              alt={safeName}
              className="w-full h-full object-cover"
              onError={() => {
                setImageError(true);
              }}
            />
          ) : (
            <div
              className={cn(
                'w-full h-full flex items-center justify-center font-semibold text-white',
                getColorFromName(safeName)
              )}
            >
              <span className={styles.text}>{getInitials(safeName)}</span>
            </div>
          )}
        </div>

        {/* Answered checkmark overlay */}
        {state === 'answered' && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <motion.svg
              className={cn(
                'text-white',
                size === 'xs' || size === 'sm' ? 'w-3 h-3' : 'w-5 h-5'
              )}
              fill="currentColor"
              viewBox="0 0 20 20"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </motion.svg>
          </motion.div>
        )}

        {/* Losing overlay */}
        {isLosing && (
          <motion.div
            className="absolute inset-0 rounded-full bg-black/25 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: isResultMode ? [0.18, 0.3, 0.18] : [0.12, 0.22, 0.12] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Pulse ring for active/thinking state */}
        {(state === 'thinking' || state === 'idle') && hasPlayerRing && (
          <motion.div
            className={cn(
              'absolute inset-0 rounded-full border-2',
              isFireEffect
                ? (playerType === 'you' ? 'border-amber-300/80' : 'border-orange-300/80')
                : (playerType === 'you' ? 'border-accent-teal' : 'border-accent-orange')
            )}
            style={{ margin: '-2px' }}
            initial={{ opacity: 0.8, scale: 1 }}
            animate={{ opacity: 0, scale: isFireEffect ? 1.55 : 1.4 }}
            transition={{
              duration: isFireEffect ? 0.95 : 1.5,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        )}

        {/* Online indicator */}
        {showOnlineIndicator && online !== undefined && (
          <span
            className={cn(
              'absolute bottom-0 right-0 rounded-full border-bg-primary',
              styles.indicator,
              online ? 'bg-feedback-correct' : 'bg-gray-500'
            )}
          />
        )}
      </motion.div>
    );
  }
);

Avatar.displayName = 'Avatar';

// Avatar with Rank Badge below
interface AvatarWithBadgeProps extends AvatarProps {
  showRankBadge?: boolean;
  mmr?: number;
}

export const AvatarWithBadge = forwardRef<HTMLDivElement, AvatarWithBadgeProps>(
  ({ showRankBadge = true, mmr, rank, playerType, ...props }, ref) => {
    return (
      <div ref={ref} className="flex flex-col items-center gap-1">
        <Avatar rank={rank} playerType={playerType} {...props} />
        {showRankBadge && rank && (
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-2xs font-semibold capitalize',
              'bg-gradient-to-r text-white shadow-sm',
              RANK_GRADIENTS[rank]
            )}
          >
            {rank}
          </span>
        )}
        {mmr !== undefined && (
          <span className={cn(
            'text-xs font-mono',
            playerType === 'you' ? 'text-accent-teal' :
            playerType === 'opponent' ? 'text-accent-orange' :
            'text-text-secondary'
          )}>
            {mmr.toLocaleString()} MMR
          </span>
        )}
      </div>
    );
  }
);

AvatarWithBadge.displayName = 'AvatarWithBadge';

export default Avatar;
