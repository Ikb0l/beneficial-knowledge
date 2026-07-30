
import { useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform, useSpring, type Variants } from 'framer-motion';
import {
  useProfileStore,
  type MatchHistoryItem,
} from '../stores/profileStore';
import { useAuthStore } from '../stores/authStore';
import { useRankStore } from '../stores/rankStore';
import { Avatar } from './ui';
import { cn } from '../lib/utils/cn';
import {
  ArrowLeftIcon,
  SettingsIcon,
  TrophyIcon,
  StarIcon,
  GamepadIcon,
  ChartIcon,
  CrownIcon,
  BookIcon,
  ScrollIcon,
  ChevronRightIcon,
} from './ui/Icons';
import type { RankTierInfo } from '../shared/types/game';

interface ProfileScreenProps {
  onBack: () => void;
  onOpenSettings?: () => void;
  onOpenPlay?: () => void;
}

type InlineIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const InlineIcon = ({ size = 20, children, ...props }: InlineIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

const PencilIcon = (props: InlineIconProps) => (
  <InlineIcon {...props}>
    <path d="M3 21l4.5-1 11-11a2 2 0 0 0-2.8-2.8l-11 11L3 21z" />
    <path d="M14 6l4 4" />
  </InlineIcon>
);

const TargetIcon = (props: InlineIconProps) => (
  <InlineIcon {...props}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 4V2M12 22v-2M4 12H2M22 12h-2" />
  </InlineIcon>
);

const FlameIcon = (props: InlineIconProps) => (
  <InlineIcon {...props}>
    <path d="M12 3c2 3 1 5-1 7 3-1 5 1 5 4a4 4 0 0 1-8 0c0-2 1-3 2-4-1 0-3-2-2-5 1 1 3 2 4-2z" />
  </InlineIcon>
);

const MountainIcon = (props: InlineIconProps) => (
  <InlineIcon {...props}>
    <path d="M3 19l7-10 4 5 3-4 4 9H3z" />
  </InlineIcon>
);

const formatNumber = (value: number, decimals = 0): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return safeValue.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
};

const normalizePercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
};

const AnimatedNumber = ({
  value,
  decimals = 0,
  prefix,
  suffix,
  className,
  reducedMotion,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  reducedMotion?: boolean;
}) => {
  const prefersReducedMotion = !!reducedMotion;
  const motionValue = useMotionValue(prefersReducedMotion ? value : 0);
  const spring = useSpring(motionValue, { stiffness: 120, damping: 20 });
  const [display, setDisplay] = useState(prefersReducedMotion ? value : 0);

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  useMotionValueEvent(spring, 'change', (latest) => {
    if (!prefersReducedMotion) {
      setDisplay(latest);
    }
  });

  return (
    <span className={className}>
      {prefix}
      {formatNumber(prefersReducedMotion ? value : display, decimals)}
      {suffix}
    </span>
  );
};
const ProgressRing = ({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  reducedMotion,
  className,
  children,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  trackColor: string;
  reducedMotion?: boolean;
  className?: string;
  children?: ReactNode;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          initial={reducedMotion ? false : { strokeDashoffset: circumference }}
          animate={reducedMotion ? undefined : { strokeDashoffset: dashOffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
};

const SkeletonBlock = ({ className, reducedMotion }: { className: string; reducedMotion?: boolean }) => (
  <div className={cn('relative overflow-hidden rounded-[clamp(16px,3vw,24px)] bg-[#1b2f58]/70', className)}>
    {!reducedMotion && (
      <motion.span
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
      />
    )}
  </div>
);

const SectionHeader = ({
  icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[#20c5ff]">
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
    </div>
    {actionLabel && (
      <button
        onClick={onAction}
        className="inline-flex items-center gap-1 text-xs font-semibold text-[#20c5ff] transition-colors hover:text-white"
      >
        {actionLabel}
        <ChevronRightIcon size={16} />
      </button>
    )}
  </div>
);

const EmptyState = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  reducedMotion,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  reducedMotion?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center rounded-[clamp(20px,4vw,32px)] border border-white/10 bg-[#16223f]/70 px-[clamp(20px,5vw,32px)] py-[clamp(28px,6vw,44px)] text-center shadow-[0_12px_24px_rgba(0,0,0,0.25)]"
  >
    <motion.div
      animate={reducedMotion ? undefined : { y: [0, -8, 0] }}
      transition={reducedMotion ? undefined : { repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
      className="mb-4 text-white/60"
    >
      {icon}
    </motion.div>
    <h4 className="text-lg font-semibold text-white">{title}</h4>
    <p className="mt-2 text-sm text-[#7484a1]">{description}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="mt-5 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#20c5ff] to-[#15a7e0] px-5 py-2.5 text-xs font-semibold text-[#0b1020] shadow-[0_10px_25px_rgba(0,217,255,0.3)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
      >
        {actionLabel}
      </button>
    )}
  </motion.div>
);
type RankTheme = {
  start: string;
  mid: string;
  end: string;
  accent: string;
  glow: string;
  badgeText: string;
};

const rankThemes: Record<string, RankTheme> = {
  bronze: {
    start: '#3b220f',
    mid: '#CD7F32',
    end: '#f2b06f',
    accent: '#CD7F32',
    glow: 'rgba(205,127,50,0.4)',
    badgeText: '#1f1406',
  },
  silver: {
    start: '#4b5563',
    mid: '#9fb1cc',
    end: '#E5E7EB',
    accent: '#C0C0C0',
    glow: 'rgba(192,192,192,0.35)',
    badgeText: '#111827',
  },
  gold: {
    start: '#7a5200',
    mid: '#FFD700',
    end: '#ffb347',
    accent: '#FFD700',
    glow: 'rgba(255,215,0,0.4)',
    badgeText: '#1f1406',
  },
  platinum: {
    start: '#64748b',
    mid: '#cbd5e1',
    end: '#e2e8f0',
    accent: '#E5E4E2',
    glow: 'rgba(229,228,226,0.35)',
    badgeText: '#0f172a',
  },
  diamond: {
    start: '#0ea5e9',
    mid: '#38bdf8',
    end: '#a5f3fc',
    accent: '#8B5CF6',
    glow: 'rgba(139,92,246,0.35)',
    badgeText: '#0f172a',
  },
  master: {
    start: '#4c1d95',
    mid: '#7c3aed',
    end: '#a855f7',
    accent: '#8B5CF6',
    glow: 'rgba(139,92,246,0.4)',
    badgeText: '#ffffff',
  },
  grandmaster: {
    start: '#7f1d1d',
    mid: '#ef4444',
    end: '#f97316',
    accent: '#FF6B6B',
    glow: 'rgba(255,107,107,0.45)',
    badgeText: '#ffffff',
  },
};

const getRankTheme = (rank: RankTierInfo | null): RankTheme => {
  const key = rank?.tierKey?.toLowerCase() ?? '';
  if (rankThemes[key]) {
    return rankThemes[key];
  }
  const accent = rank?.color || '#20c5ff';
  return {
    start: '#16223f',
    mid: accent,
    end: '#2b2f50',
    accent,
    glow: 'rgba(0,217,255,0.3)',
    badgeText: '#0b1020',
  };
};

const resultStyles = {
  win: {
    color: '#4ADE80',
    label: 'WIN',
  },
  loss: {
    color: '#EF4444',
    label: 'LOSS',
  },
  draw: {
    color: '#F59E0B',
    label: 'DRAW',
  },
};

const formatCategoryLabel = (category: string): string => {
  const trimmed = typeof category === 'string' ? category.trim() : '';
  if (!trimmed) {
    return 'Unknown';
  }
  return trimmed
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatTimeAgo = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown time';
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 0) return 'Just now';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const StatsRow = ({
  games,
  wins,
  winRate,
  draws,
  reducedMotion,
  variants,
}: {
  games: number;
  wins: number;
  winRate: number;
  draws: number;
  reducedMotion?: boolean;
  variants?: Variants;
}) => {
  const items = [
    { icon: <GamepadIcon size={15} />, value: games, label: 'Games', color: '#22d3ee', glow: 'rgba(34,211,238,0.3)' },
    { icon: <TrophyIcon size={15} />, value: wins, label: 'Wins', color: '#fbbf24', glow: 'rgba(251,191,36,0.3)' },
    { icon: <ChartIcon size={15} />, value: winRate, label: 'Win rate', color: '#4ade80', glow: 'rgba(74,222,128,0.3)', suffix: '%' },
    { icon: <StarIcon size={15} />, value: draws, label: 'Draws', color: '#a78bfa', glow: 'rgba(167,139,250,0.3)' },
  ];
  return (
    <motion.div
      variants={variants}
      className="grid grid-cols-4 gap-2 py-2"
    >
      {items.map((item) => (
        <motion.div
          key={item.label}
          className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-white/8 bg-[#16223f]/60 backdrop-blur px-2 py-3 overflow-hidden"
          whileTap={{ scale: 0.95 }}
        >
          {/* Colored top accent line */}
          <div
            className="absolute top-0 left-2 right-2 h-0.5 rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${item.color}, transparent)`, boxShadow: `0 0 6px ${item.glow}` }}
          />
          {/* Subtle inner glow */}
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{ background: `radial-gradient(circle at 50% 0%, ${item.color}, transparent 70%)` }}
          />
          <span
            className="relative inline-flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: `${item.color}20`, color: item.color, boxShadow: `0 0 10px ${item.glow}` }}
          >
            {item.icon}
          </span>
          <span className="relative text-lg font-bold text-white leading-none">
            <AnimatedNumber
              value={item.value}
              suffix={item.suffix}
              className="text-white"
              reducedMotion={reducedMotion}
            />
          </span>
          <span className="relative text-[9px] uppercase tracking-widest text-white/35 font-medium">{item.label}</span>
        </motion.div>
      ))}
    </motion.div>
  );
};

const MatchCard = ({
  match,
  variants,
}: {
  match: MatchHistoryItem;
  reducedMotion?: boolean;
  variants?: Variants;
}) => {
  const result = resultStyles[match.result];
  const mmrChange = match.mmrChange;
  const mmrColor = mmrChange > 0 ? '#4ADE80' : (mmrChange < 0 ? '#EF4444' : '#9fb1cc');
  const scoreText = `${match.playerScore} - ${match.opponentScore}`;
  const categoryLabel = formatCategoryLabel(match.category);
  const contextTags: string[] = [];
  if (match.isFriendChallenge) {
    contextTags.push('Challenge');
  }
  if (match.isBotMatch) {
    contextTags.push('Bot');
  }

  return (
    <motion.div
      variants={variants}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#16223f]/80 p-4 shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur"
      whileTap={{ scale: 0.98 }}
    >
      {/* Result glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none"
        style={{ background: result.color, transform: 'translate(30%, -30%)' }}
      />

      {/* Top row: category pill + result badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60">
          {categoryLabel}
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
          style={{ background: `${result.color}20`, color: result.color }}
        >
          {result.label}
        </span>
      </div>

      {/* Middle row: opponent + score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white flex-shrink-0">
            <ScrollIcon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {match.opponentName || 'Opponent'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {contextTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/50"
                >
                  {tag}
                </span>
              ))}
              <span className="text-[11px] text-white/30">{formatTimeAgo(match.timestamp)}</span>
            </div>
          </div>
        </div>
        <div className="text-right ml-3">
          <p className="text-xl font-bold text-white tabular-nums">{scoreText}</p>
          <motion.p
            className="text-xs font-semibold mt-0.5"
            style={{ color: mmrColor }}
            key={`${match.matchId}-${mmrChange}`}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            {mmrChange > 0 ? '+' : ''}{formatNumber(mmrChange)} MMR
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
};

// Achievements preview removed per request.
export function ProfileScreen({ onBack, onOpenSettings, onOpenPlay }: ProfileScreenProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const {
    profile,
    isLoading,
    error,
    matchHistoryTotal,
    isLoadingMore,
    fetchProfile,
    fetchMatchHistory,
    loadMoreMatchHistory,
    clearProfile,
  } = useProfileStore();
  const { user } = useAuthStore();
  const { getRankByMmr, getRankProgress, getMmrToNextRank, getNextRank, fetchRankTiers } = useRankStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  const headerTitleOpacity = useTransform(scrollYProgress, [0, 0.06], [0, 1]);
  const userIdKey = user?.userId ?? '__anonymous__';
  const [showAllMatchesByUser, setShowAllMatchesByUser] = useState<Record<string, boolean>>({});
  const showAllMatches = !!showAllMatchesByUser[userIdKey];
  const setShowAllMatches = (next: boolean) => {
    setShowAllMatchesByUser((prev) => {
      if (prev[userIdKey] === next) return prev;
      return { ...prev, [userIdKey]: next };
    });
  };

  useEffect(() => {
    void fetchRankTiers();
  }, [fetchRankTiers]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.userId) {
      clearProfile();
      return () => {
        cancelled = true;
      };
    }

    clearProfile();
    const loadProfile = async () => {
      await fetchProfile(user.userId);
      if (cancelled) return;
      await fetchMatchHistory(user.userId, 0, 8);
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [clearProfile, fetchProfile, fetchMatchHistory, user?.userId]);

  const fallbackStats = useMemo(() => {
    if (!user) {
      return {
        mmr: 0,
        rankTier: 'bronze',
        peakMmr: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
      };
    }
    const gamesPlayed = user.profile.gamesPlayed || 0;
    const wins = user.profile.wins || 0;
    return {
      mmr: user.profile.mmr || 0,
      rankTier: user.profile.rankTier || 'bronze',
      peakMmr: user.profile.peakMmr || user.profile.mmr || 0,
      gamesPlayed,
      wins,
      losses: user.profile.losses || 0,
      draws: user.profile.draws || 0,
      winRate: gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0,
    };
  }, [user]);

  const globalStats = profile?.globalStats ?? fallbackStats;
  const performance = profile?.performance ?? {
    totalQuestions: 0,
    correctAnswers: 0,
    accuracy: 0,
    averageResponseTime: 0,
    longestStreak: 0,
    perfectGames: 0,
  };

  const displayName = profile?.displayName || profile?.username || user?.displayName || user?.username || 'Player';
  const avatarUrl = (profile && typeof profile.avatarUrl === 'string')
    ? profile.avatarUrl
    : (user?.photoUrl || null);

  const mmr = Number.isFinite(globalStats.mmr) ? globalStats.mmr : 0;
  const peakMmr = Number.isFinite(globalStats.peakMmr) ? globalStats.peakMmr : mmr;
  const winRate = normalizePercent(globalStats.winRate);
  const accuracy = normalizePercent(
    Number.isFinite(performance.accuracy)
      ? performance.accuracy
      : performance.totalQuestions > 0
        ? (performance.correctAnswers / performance.totalQuestions) * 100
        : 0
  );

  const rankInfo = useMemo(() => getRankByMmr(mmr), [getRankByMmr, mmr]);
  const rankTheme = useMemo(() => getRankTheme(rankInfo), [rankInfo]);
  const rankProgress = getRankProgress(mmr);
  const mmrToNext = getMmrToNextRank(mmr);
  const nextRank = getNextRank(mmr);
  const level = Math.max(1, Math.floor(mmr / 100) + 1);

  const categories = profile?.categoryStats ?? [];
  const matches = profile?.matchHistory ?? [];
  const collapsedMatchCount = 4;
  const matchesToShow = showAllMatches ? matches : matches.slice(0, collapsedMatchCount);
  const hasMoreMatches = matchHistoryTotal > matches.length;
  const hasCollapsedOverflow = matches.length > collapsedMatchCount;
  const showHistoryActions = hasCollapsedOverflow || hasMoreMatches;
  const canLoadMoreMatches = showAllMatches && hasMoreMatches;

  const staggerVariants = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const fadeUpVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
  };

  const slideInVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
  };

  const showSkeleton = isLoading && !profile;
  const hasError = !!error && !isLoading;
  const canOpenPlay = typeof onOpenPlay === 'function';

  return (
    <motion.div
      ref={containerRef}
      className="relative content-scrollable bg-gradient-main text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-[#20c5ff]/10 blur-3xl" />
        <div className="absolute top-64 -left-20 h-64 w-64 rounded-full bg-[#8B5CF6]/10 blur-3xl" />
      </div>

      {/* ═══════════════════════════════════════════════════
            HEADER — glass, solidifies on scroll
            ════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between px-4 backdrop-blur border-b border-white/5 bg-[#0b1020]/60">
        <button
          onClick={onBack}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/60"
          aria-label="Go back"
        >
          <ArrowLeftIcon size={20} />
        </button>

        {/* Center — title fades in on scroll */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <motion.div
            className="flex items-center gap-2"
            style={{ opacity: headerTitleOpacity }}
          >
            <div className="h-7 w-7 rounded-full overflow-hidden flex-shrink-0">
              <Avatar
                src={avatarUrl}
                name={displayName}
                size="sm"
                showRankBorder={false}
              />
            </div>
            <span className="text-sm font-semibold text-white truncate max-w-[140px]">{displayName}</span>
          </motion.div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSettings}
            disabled={!onOpenSettings}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/60"
            aria-label="Edit profile"
          >
            <PencilIcon size={16} />
          </button>
          <button
            onClick={onOpenSettings}
            disabled={!onOpenSettings}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/60"
            aria-label="Profile settings"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </div>

      <div className="relative space-y-8 px-4 pb-28 pt-6">
        {hasError && !profile && (
          <div className="rounded-[clamp(16px,3vw,24px)] border border-white/10 bg-[#16223f]/80 p-4 text-sm text-white/80 shadow-[0_12px_24px_rgba(0,0,0,0.24)]">
            <p className="font-semibold text-white">Failed to load profile</p>
            <p className="mt-1 text-xs text-[#7484a1]">{error}</p>
            <button
              onClick={() => {
                void fetchProfile(user?.userId);
                void fetchMatchHistory(user?.userId, 0, 8);
              }}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#20c5ff] to-[#15a7e0] px-4 py-2 text-xs font-semibold text-[#0b1020] shadow-[0_10px_25px_rgba(0,217,255,0.3)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
            >
              Retry
            </button>
          </div>
        )}
        {/* ═══════════════════════════════════════════════════
              HERO — Constellation + gradient orbs + avatar
              ════════════════════════════════════════════════ */}
        <motion.div
          variants={fadeUpVariants}
          initial="initial"
          animate="animate"
          className="relative mx-auto flex flex-col items-center pt-6 pb-8 overflow-hidden"
        >
          {/* Animated gradient orbs background */}
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              className="absolute rounded-full blur-3xl"
              style={{
                width: 160, height: 160,
                background: `radial-gradient(circle, ${rankTheme.accent}40, transparent 70%)`,
                left: '10%', top: '5%',
              }}
              animate={prefersReducedMotion ? undefined : {
                x: [0, 30, 0, -20, 0],
                y: [0, -20, 10, -10, 0],
                scale: [1, 1.2, 0.9, 1.1, 1],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full blur-3xl"
              style={{
                width: 120, height: 120,
                background: 'radial-gradient(circle, rgba(32,197,255,0.3), transparent 70%)',
                right: '5%', top: '30%',
              }}
              animate={prefersReducedMotion ? undefined : {
                x: [0, -25, 0, 15, 0],
                y: [0, 15, -15, 5, 0],
                scale: [0.9, 1.15, 1, 1.1, 0.9],
              }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full blur-3xl"
              style={{
                width: 100, height: 100,
                background: 'radial-gradient(circle, rgba(139,92,246,0.25), transparent 70%)',
                left: '50%', bottom: '10%',
              }}
              animate={prefersReducedMotion ? undefined : {
                x: [0, 20, -15, 0],
                y: [0, -10, 10, 0],
                scale: [1, 0.9, 1.1, 1],
              }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Constellation stars + connecting lines */}
          {!prefersReducedMotion && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice">
              {(() => {
                const stars = Array.from({ length: 12 }, (_, i) => ({
                  x: 15 + (i * 37 + 17) % 370,
                  y: 10 + (i * 29 + 13) % 260,
                  r: 1.5 + (i % 3),
                  delay: i * 0.4,
                }));
                return (
                  <>
                    {/* Lines between nearby stars */}
                    {stars.map((a, ia) =>
                      stars.slice(ia + 1).map((b, ib) => {
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 90) return null;
                        return (
                          <motion.line
                            key={`line-${ia}-${ib}`}
                            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                            stroke={`${rankTheme.accent}20`}
                            strokeWidth={0.5}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 0.6, 0] }}
                            transition={{ duration: 3, repeat: Infinity, delay: (ia + ib) * 0.3, ease: 'easeInOut' }}
                          />
                        );
                      })
                    )}
                    {/* Stars */}
                    {stars.map((s, i) => (
                      <motion.circle
                        key={`star-${i}`}
                        cx={s.x} cy={s.y} r={s.r}
                        fill={i % 3 === 0 ? rankTheme.accent : i % 3 === 1 ? '#20c5ff' : '#a78bfa'}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.9, 0.2, 0.9, 0], r: [s.r, s.r * 1.8, s.r] }}
                        transition={{ duration: 2.5 + i * 0.3, repeat: Infinity, delay: s.delay, ease: 'easeInOut' }}
                        style={{ filter: `drop-shadow(0 0 ${s.r * 2}px currentColor)` }}
                      />
                    ))}
                  </>
                );
              })()}
            </svg>
          )}

          {/* Avatar with orbiting rings */}
          <div className="relative flex items-center justify-center mb-6 z-10">
            {/* Outer glow aura */}
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 152, height: 152,
                background: `radial-gradient(circle, ${rankTheme.glow}, transparent 70%)`,
              }}
              animate={prefersReducedMotion ? undefined : {
                scale: [1, 1.15, 1],
                opacity: [0.4, 0.8, 0.4],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Orbit ring 1 — slow, large, with orbiting dot */}
            <motion.div
              className="absolute rounded-full border-2 pointer-events-none"
              style={{
                width: 150, height: 150,
                borderColor: `${rankTheme.accent}35`,
                boxShadow: `0 0 25px ${rankTheme.glow}, inset 0 0 25px ${rankTheme.glow}`,
              }}
              animate={prefersReducedMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            >
              {/* Orbiting bright dot */}
              <motion.div
                className="absolute rounded-full"
                style={{
                  width: 6, height: 6,
                  background: rankTheme.accent,
                  boxShadow: `0 0 12px ${rankTheme.accent}, 0 0 24px ${rankTheme.glow}`,
                  top: -3, left: '50%', marginLeft: -3,
                }}
              />
            </motion.div>
            {/* Orbit ring 2 — faster, dashed */}
            <motion.div
              className="absolute rounded-full border pointer-events-none"
              style={{
                width: 130, height: 130,
                borderColor: '#20c5ff40',
                borderStyle: 'dashed',
                boxShadow: '0 0 14px rgba(32,197,255,0.15)',
              }}
              animate={prefersReducedMotion ? undefined : { rotate: -360 }}
              transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
            />
            {/* Inner solid ring */}
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 118, height: 118,
                border: '1.5px solid transparent',
                borderTopColor: `${rankTheme.accent}60`,
                borderRightColor: '#20c5ff50',
              }}
              animate={prefersReducedMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
            />
            {/* Rank progress ring */}
            <ProgressRing
              size={108}
              strokeWidth={6}
              progress={rankProgress}
              color="#20c5ff"
              trackColor="rgba(255,255,255,0.12)"
              reducedMotion={prefersReducedMotion}
            >
              <Avatar
                src={avatarUrl}
                name={displayName}
                size="2xl"
                showRankBorder={false}
                className="relative z-10"
              />
            </ProgressRing>
            {/* Level hex badge */}
            <motion.div
              className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center text-xs font-bold text-white z-20"
              style={{
                backgroundImage: `linear-gradient(135deg, ${rankTheme.accent}, #20c5ff)`,
                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                boxShadow: `0 0 16px ${rankTheme.glow}, 0 4px 12px rgba(0,0,0,0.4)`,
              }}
              animate={prefersReducedMotion ? undefined : { scale: [1, 1.1, 1], rotate: [0, 0, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              {level}
            </motion.div>
          </div>

          {/* Name with decorative divider */}
          <h2 className="name-text text-xl font-bold text-white text-center max-w-[280px] relative">
            {displayName}
            <span
              className="block mx-auto mt-1.5 h-0.5 rounded-full w-12"
              style={{ background: `linear-gradient(90deg, transparent, ${rankTheme.accent}, transparent)` }}
            />
          </h2>

          {/* Rank badge — animated shimmer */}
          <motion.div
            className="relative mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide overflow-hidden"
            style={{
              backgroundImage: `linear-gradient(135deg, ${rankTheme.accent}, ${rankTheme.end})`,
              color: rankTheme.badgeText,
              boxShadow: `0 0 20px ${rankTheme.glow}, 0 4px 12px rgba(0,0,0,0.3)`,
            }}
            whileHover={{ scale: 1.05 }}
          >
            {!prefersReducedMotion && (
              <motion.div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)' }}
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 3 }}
              />
            )}
            <CrownIcon size={13} />
            {rankInfo.name}
          </motion.div>

          {/* MMR — glass card */}
          <motion.div
            className="mt-5 relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-6 py-3 inline-flex flex-col items-center"
            style={{ boxShadow: `0 0 30px ${rankTheme.glow}, 0 8px 24px rgba(0,0,0,0.3)` }}
            whileTap={{ scale: 0.98 }}
          >
            <AnimatedNumber
              value={mmr}
              className="text-5xl font-black text-[#20c5ff]"
              reducedMotion={prefersReducedMotion}
            />
            <span className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.2em]">MMR</span>
            {/* MMR inner glow */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none opacity-15"
              style={{ background: `radial-gradient(circle at center, ${rankTheme.accent}, transparent 70%)` }}
            />
          </motion.div>

          {/* Peak + Record row */}
          <div className="mt-3 flex items-center gap-4 text-xs text-white/45">
            <span className="inline-flex items-center gap-1">
              <MountainIcon size={11} />
              Peak {formatNumber(peakMmr)}
            </span>
            <span className="text-white/15">·</span>
            <span className="inline-flex items-center gap-1">
              <TrophyIcon size={11} />
              {globalStats.wins}W - {globalStats.losses}L
            </span>
          </div>

          {/* Rank progress bar */}
          <div className="relative mt-5 w-full max-w-xs">
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full relative"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${rankTheme.accent}, #20c5ff)`,
                  width: `${rankProgress}%`,
                }}
                initial={prefersReducedMotion ? false : { width: 0 }}
                animate={prefersReducedMotion ? undefined : { width: `${rankProgress}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              >
                {/* Shimmer */}
                {!prefersReducedMotion && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    }}
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
                  />
                )}
              </motion.div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/40">
              <span>{Math.round(rankProgress)}% to next tier</span>
              <span>
                {mmrToNext !== null && nextRank
                  ? `${formatNumber(mmrToNext)} to ${nextRank.name}`
                  : 'Top tier reached'}
              </span>
            </div>
          </div>
        </motion.div>

        {showSkeleton ? (
          <div className="space-y-4">
            <SkeletonBlock className="h-32" reducedMotion={prefersReducedMotion} />
            <SkeletonBlock className="h-32" reducedMotion={prefersReducedMotion} />
          </div>
        ) : (
          <motion.div variants={staggerVariants} initial="initial" animate="animate" className="space-y-1">
            <StatsRow
              games={globalStats.gamesPlayed || 0}
              wins={globalStats.wins || 0}
              winRate={winRate}
              draws={globalStats.draws || 0}
              reducedMotion={prefersReducedMotion}
              variants={fadeUpVariants}
            />
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════
              PERFORMANCE PILLS — glass cards with glow accents
              ════════════════════════════════════════════════ */}
        <motion.div
          variants={staggerVariants} initial="initial" animate="animate"
          className="grid grid-cols-3 gap-2.5 py-2"
        >
          {[
            { icon: <TargetIcon size={15} />, label: 'Accuracy', value: `${Math.round(accuracy)}%`, color: '#22d3ee', glow: 'rgba(34,211,238,0.25)' },
            { icon: <FlameIcon size={15} />, label: 'Streak', value: performance.longestStreak?.toString() || '0', color: '#f97316', glow: 'rgba(249,115,22,0.25)' },
            { icon: <StarIcon size={15} />, label: 'Perfect', value: (performance.perfectGames || 0).toString(), color: '#fbbf24', glow: 'rgba(251,191,36,0.25)' },
          ].map((pill) => (
            <motion.div
              key={pill.label}
              variants={fadeUpVariants}
              className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-white/8 bg-[#16223f]/70 backdrop-blur px-3 py-3 overflow-hidden"
              whileTap={{ scale: 0.95 }}
            >
              {/* Top glow line */}
              <div
                className="absolute top-0 left-2 right-2 h-px rounded-full"
                style={{ background: `linear-gradient(90deg, transparent, ${pill.color}, transparent)`, boxShadow: `0 0 4px ${pill.glow}` }}
              />
              <span
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: `${pill.color}20`, color: pill.color, boxShadow: `0 0 10px ${pill.glow}` }}
              >
                {pill.icon}
              </span>
              <span className="relative text-lg font-bold text-white leading-none">{pill.value}</span>
              <span className="relative text-[9px] uppercase tracking-wider text-white/35 font-medium">{pill.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* ═══════════════════════════════════════════════════
              TOP CATEGORY — featured premium card
              ════════════════════════════════════════════════ */}
        {categories.length > 0 && (
          <motion.div variants={staggerVariants} initial="initial" animate="animate" className="space-y-3">
            <SectionHeader icon={<BookIcon size={16} />} title="Top Category" />
            {(() => {
              const top = categories[0];
              const progress = normalizePercent(top.winRate);
              return (
                <motion.div
                  variants={fadeUpVariants}
                  className="relative rounded-2xl border border-white/10 bg-[#16223f]/80 p-4 backdrop-blur flex items-center gap-4 shadow-[0_12px_24px_rgba(0,0,0,0.24)] overflow-hidden"
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Background glow orb */}
                  <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#20c5ff]/8 blur-2xl pointer-events-none" />
                  {/* Shimmer sweep */}
                  {!prefersReducedMotion && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)' }}
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 4 }}
                    />
                  )}
                  <div
                    className="relative flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, rgba(32,197,255,0.2), rgba(139,92,246,0.2))', boxShadow: '0 0 16px rgba(32,197,255,0.2)' }}
                  >
                    <BookIcon size={22} />
                  </div>
                  <div className="flex-1 min-w-0 relative">
                    <p className="text-sm font-bold text-white truncate">{top.categoryName}</p>
                    <p className="text-xs text-white/45">{formatNumber(top.gamesPlayed)} games · {formatNumber(top.wins)} wins · {formatNumber(top.mmr)} MMR</p>
                  </div>
                  <div className="text-right relative">
                    <span className="text-xl font-bold text-[#20c5ff]">{Math.round(progress)}%</span>
                    <span className="block text-[9px] uppercase tracking-wider text-white/35">Win rate</span>
                  </div>
                </motion.div>
              );
            })()}
          </motion.div>
        )}

        {categories.length === 0 && (
          <motion.div variants={fadeUpVariants} initial="initial" animate="animate">
            <EmptyState
              icon={<BookIcon size={48} />}
              title="No categories explored yet"
              description="Play some games to see your category stats."
              actionLabel={canOpenPlay ? 'Start playing' : undefined}
              onAction={canOpenPlay ? onOpenPlay : undefined}
              reducedMotion={prefersReducedMotion}
            />
          </motion.div>
        )}

        <motion.div variants={staggerVariants} initial="initial" animate="animate" className="space-y-4">
          <SectionHeader
            icon={<ScrollIcon size={18} />}
            title="Recent Matches"
            actionLabel={showHistoryActions ? (showAllMatches ? 'Show less' : 'View all') : undefined}
            onAction={showHistoryActions ? () => {
              if (showAllMatches) {
                setShowAllMatches(false);
                return;
              }
              setShowAllMatches(true);
              if (hasMoreMatches) {
                void loadMoreMatchHistory();
              }
            } : undefined}
          />
          {matchesToShow.length === 0 ? (
            <EmptyState
              icon={<ScrollIcon size={54} />}
              title="No matches yet"
              description="Your match history will appear here."
              actionLabel={canOpenPlay ? 'Find a match' : undefined}
              onAction={canOpenPlay ? onOpenPlay : undefined}
              reducedMotion={prefersReducedMotion}
            />
          ) : (
            <motion.div variants={staggerVariants} className="space-y-3">
              {matchesToShow.map((match) => (
                <MatchCard key={match.matchId} match={match} reducedMotion={prefersReducedMotion} variants={slideInVariants} />
              ))}
              {canLoadMoreMatches && (
                <button
                  onClick={() => {
                    void loadMoreMatchHistory();
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10"
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Loading more...' : 'Load more'}
                </button>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Achievements and action buttons removed per request. */}
      </div>
    </motion.div>
  );
}
