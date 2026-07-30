import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLeaderboardStore, getLeaderboardKey, type LeaderboardRecord, type LeaderboardData, type LeaderboardQuery } from '../stores/leaderboardStore';
import { useCategoryStore } from '../stores/categoryStore';
import { useRankStore } from '../stores/rankStore';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils/cn';
import { useDialog } from '../hooks/useDialog';

type ScopeTabId = 'global' | 'friends' | 'topic';
type TimeTabId = 'all' | 'daily' | 'weekly' | 'monthly';

const scopeTabs: Array<{ id: ScopeTabId; label: string }> = [
  { id: 'global', label: 'Global' },
  { id: 'friends', label: 'Friends' },
  { id: 'topic', label: 'Topic' },
];

const timeTabs: Array<{ id: TimeTabId; label: string }> = [
  { id: 'all', label: 'All Time' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const tierColorFallbacks: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#20c5ff',
  diamond: '#8B5CF6',
  master: '#8B5CF6',
  grandmaster: '#FF6B6B',
};

const numberFormatter = new Intl.NumberFormat('en-US');

interface LeaderboardEntry {
  id: string;
  rank: number;
  username: string;
  avatarUrl?: string | null;
  initials: string;
  mmr: number;
  tier: {
    key: string;
    name: string;
    color: string;
  };
  rankChange: number;
  isCurrentUser?: boolean;
}

interface LeaderboardScreenProps {
  onBack: () => void;
}

const podiumLayouts = [
  {
    place: 2,
    size: 70,
    blockHeight: 50,
    gradient: 'from-[#E8E8E8] to-[#A8A8A8]',
    glow: 'rgba(192, 192, 192, 0.4)',
    medalColor: '#C0C0C0',
  },
  {
    place: 1,
    size: 90,
    blockHeight: 70,
    gradient: 'from-[#FFD700] to-[#CC8800]',
    glow: 'rgba(255, 215, 0, 0.5)',
    medalColor: '#FFD700',
  },
  {
    place: 3,
    size: 70,
    blockHeight: 40,
    gradient: 'from-[#CD7F32] to-[#8B5A2B]',
    glow: 'rgba(205, 127, 50, 0.4)',
    medalColor: '#CD7F32',
  },
];
function getInitials(name: string): string {
  const safe = name.trim();
  if (!safe) return 'NA';
  const parts = safe.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return safe.slice(0, 2).toUpperCase();
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function getTierDisplay(
  record: LeaderboardRecord,
  tiers: Array<{ tierKey?: string; id?: string; name: string; color?: string }>,
  getRankByMmr: (mmr: number) => { tierKey?: string; name: string; color?: string }
) {
  if (record.rankTier) {
    const tierMatch = tiers.find((tier) => tier.tierKey === record.rankTier || tier.id === record.rankTier);
    if (tierMatch) {
      return {
        key: tierMatch.tierKey || tierMatch.id || record.rankTier,
        name: tierMatch.name,
        color: tierMatch.color || tierColorFallbacks[tierMatch.tierKey || tierMatch.id || record.rankTier] || '#20c5ff',
      };
    }
  }

  const derived = getRankByMmr(record.score);
  const derivedKey = derived.tierKey || 'bronze';
  return {
    key: derivedKey,
    name: derived.name,
    color: derived.color || tierColorFallbacks[derivedKey] || '#20c5ff',
  };
}

function mapRecordToEntry(
  record: LeaderboardRecord,
  tiers: Array<{ tierKey?: string; id?: string; name: string; color?: string }>,
  getRankByMmr: (mmr: number) => { tierKey?: string; name: string; color?: string }
): LeaderboardEntry {
  const tier = getTierDisplay(record, tiers, getRankByMmr);
  return {
    id: record.ownerId,
    rank: record.rank,
    username: record.username,
    avatarUrl: record.avatarUrl,
    initials: getInitials(record.username),
    mmr: record.score,
    tier,
    rankChange: 0,
    isCurrentUser: record.isCurrentUser,
  };
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 6h3v2a4 4 0 0 0 4 4 4 4 0 0 0 4-4V6h3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconCrown() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
      <path d="M5 18h14l1-9-4 3-4-6-4 6-4-3 1 9z" />
      <path d="M6 20h12v2H6z" />
    </svg>
  );
}

function IconMedal() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <circle cx="12" cy="13" r="5" />
      <path d="M7 2l5 7 5-7h-3l-2 3-2-3H7z" />
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M12 5l7 7H5l7-7z" />
    </svg>
  );
}

function IconArrowDown() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M12 19l-7-7h14l-7 7z" />
    </svg>
  );
}
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-[#1b2f58]', className)}>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-center gap-5 h-[220px]">
        <div className="flex flex-col items-center gap-3">
          <SkeletonBlock className="h-[70px] w-[70px] rounded-full" />
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-4 w-12" />
          <SkeletonBlock className="h-[50px] w-[70px] rounded-t-xl" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <SkeletonBlock className="h-[90px] w-[90px] rounded-full" />
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-4 w-14" />
          <SkeletonBlock className="h-[70px] w-[80px] rounded-t-xl" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <SkeletonBlock className="h-[70px] w-[70px] rounded-full" />
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-4 w-12" />
          <SkeletonBlock className="h-[40px] w-[70px] rounded-t-xl" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-xl bg-[#16223f]/80 px-4 py-3">
            <SkeletonBlock className="h-9 w-9 rounded-full" />
            <SkeletonBlock className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
            <SkeletonBlock className="h-8 w-10 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  cta,
  onCta,
}: {
  title: string;
  subtitle: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-[#16223f]/90 border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)] p-6 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-white/10 flex items-center justify-center">
        <IconTrophy />
      </div>
      <p className="text-white font-semibold text-lg">{title}</p>
      <p className="mt-2 text-sm text-[#9fb1cc]">{subtitle}</p>
      {cta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#20c5ff] to-[#15a7e0] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(0,217,255,0.3)] transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
function PodiumPlayer({
  entry,
  layout,
  delay,
  prefersReducedMotion,
}: {
  entry?: LeaderboardEntry;
  layout: typeof podiumLayouts[number];
  delay: number;
  prefersReducedMotion: boolean;
}) {
  const glowColor = layout.glow;
  const size = layout.size;
  const rank = layout.place;
  const isFirst = rank === 1;
  const ordinal = rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd';

  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: prefersReducedMotion ? 0 : 0.3, type: 'spring', stiffness: 180 }}
    >
      <div className="relative flex flex-col items-center">
        <motion.div
          className="relative"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: delay + 0.2, duration: prefersReducedMotion ? 0 : 0.25 }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 25px ${glowColor}`,
            }}
          />
          <div
            className="relative rounded-full p-1"
            style={{
              background: `linear-gradient(135deg, ${layout.medalColor}, ${rank === 1 ? '#FFA500' : layout.medalColor})`,
            }}
          >
            <div
              className="flex items-center justify-center rounded-full overflow-hidden"
              style={{ width: size, height: size, background: '#16223f' }}
            >
              {entry?.avatarUrl ? (
                <img src={entry.avatarUrl} alt={entry.username} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white font-bold text-xl">
                  {entry?.initials || 'NA'}
                </div>
              )}
            </div>
          </div>
          {!isFirst && (
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#16223f] text-white">
              <IconMedal />
            </span>
          )}
        </motion.div>
        {isFirst && (
          <motion.div
            className="absolute -top-6 left-1/2 -translate-x-1/2 text-[#FFD700]"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, y: [0, -4, 0] }}
            transition={{ delay: delay + 0.4, duration: prefersReducedMotion ? 0 : 0.6, type: 'spring', stiffness: 160 }}
          >
            <IconCrown />
          </motion.div>
        )}
      </div>
      <motion.div
        className="mt-3 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.3, duration: prefersReducedMotion ? 0 : 0.2 }}
      >
        <p className="name-text text-sm font-semibold text-white truncate max-w-[100px]">{entry?.username || '---'}</p>
        <p className="text-lg font-bold" style={{ color: layout.medalColor }}>
          {entry ? formatNumber(entry.mmr) : '--'}
        </p>
        {entry?.tier && (
          <span
            className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            style={{
              color: entry.tier.color,
              borderColor: `${entry.tier.color}80`,
              backgroundColor: `${entry.tier.color}26`,
            }}
          >
            {entry.tier.name}
          </span>
        )}
      </motion.div>
      <motion.div
        className="mt-3 rounded-t-xl flex items-center justify-center shadow-[0_-4px_15px_rgba(0,0,0,0.3)]"
        style={{
          height: layout.blockHeight,
          width: rank === 1 ? 96 : 86,
          backgroundImage: `linear-gradient(180deg, ${layout.medalColor}, ${rank === 1 ? '#CC8800' : layout.medalColor})`,
        }}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: delay + 0.1, duration: prefersReducedMotion ? 0 : 0.3 }}
      >
        <span
          className="rounded-full px-3 py-1.5 text-2xl font-black tracking-wide"
          style={{
            color: layout.medalColor,
            backgroundColor: 'rgba(10, 14, 33, 0.55)',
            border: `1px solid ${layout.medalColor}80`,
            textShadow: '0 2px 10px rgba(0,0,0,0.6)',
          }}
        >
          {ordinal}
        </span>
      </motion.div>
    </motion.div>
  );
}

function LeaderboardRow({
  entry,
  index,
  rowRef,
  prefersReducedMotion,
}: {
  entry: LeaderboardEntry;
  index: number;
  rowRef?: (node: HTMLDivElement | null) => void;
  prefersReducedMotion: boolean;
}) {
  const isPositive = entry.rankChange > 0;
  const isNegative = entry.rankChange < 0;
  const rankChangeLabel = isPositive ? `Up ${entry.rankChange}` : isNegative ? `Down ${Math.abs(entry.rankChange)}` : 'No change';
  const rankBg = entry.rank <= 10 && entry.rank >= 4 ? 'bg-[#20c5ff]/15' : 'bg-[#1b2f58]';
  const rowBg = index % 2 === 0 ? 'bg-[#16223f]/90' : 'bg-[#1b2f58]/80';

  return (
    <motion.div
      ref={rowRef}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: prefersReducedMotion ? 0 : index * 0.05, duration: prefersReducedMotion ? 0 : 0.2 }}
      className={cn(
        'flex items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-white/5',
        rowBg,
        entry.isCurrentUser && 'border-[#20c5ff]/40 bg-[#20c5ff]/10'
      )}
    >
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-full text-white font-bold text-sm', rankBg)}>
        {entry.rank}
      </div>
      <div
        className="relative h-12 w-12 rounded-full overflow-hidden border-2"
        style={{ borderColor: entry.tier.color }}
      >
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt={entry.username} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white font-bold text-sm">
            {entry.initials}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="name-text text-[15px] font-semibold text-white truncate">{entry.username}</span>
          {entry.isCurrentUser && (
            <span className="rounded-md bg-[#20c5ff] px-2 py-0.5 text-[10px] font-bold text-[#0b1020]">
              YOU
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-[#20c5ff]">{formatNumber(entry.mmr)} MMR</span>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
            style={{ color: entry.tier.color, backgroundColor: `${entry.tier.color}33` }}
          >
            {entry.tier.name}
          </span>
        </div>
      </div>
      <div className="w-10 text-center text-xs font-semibold" aria-label={rankChangeLabel}>
        {isPositive && (
          <div className="flex flex-col items-center text-[#4ADE80]">
            <IconArrowUp />
            <span>{entry.rankChange}</span>
          </div>
        )}
        {isNegative && (
          <div className="flex flex-col items-center text-[#EF4444]">
            <IconArrowDown />
            <span>{Math.abs(entry.rankChange)}</span>
          </div>
        )}
        {!isPositive && !isNegative && <span className="text-[#7484a1]">—</span>}
      </div>
    </motion.div>
  );
}
export function LeaderboardScreen({ onBack }: LeaderboardScreenProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const {
    currentQuery,
    leaderboardsByKey,
    setQuery,
    fetchLeaderboard,
    fetchNextPage,
    loadingByKey,
    errorByKey,
    isLoading,
    error,
    clearError,
  } = useLeaderboardStore();
  const categories = useCategoryStore((state) => state.categories);
  const fetchCategories = useCategoryStore((state) => state.fetchCategories);
  const tiers = useRankStore((state) => state.tiers);
  const fetchRankTiers = useRankStore((state) => state.fetchRankTiers);
  const getRankByMmr = useRankStore((state) => state.getRankByMmr);
  const authUser = useAuthStore((state) => state.user);

  const initialScope: ScopeTabId = currentQuery.scope === 'friends' ? 'friends' : currentQuery.scope === 'topic' ? 'topic' : 'global';
  const initialTime: TimeTabId = (currentQuery.timeframe as TimeTabId) || 'weekly';
  const [scopeTab, setScopeTab] = useState<ScopeTabId>(initialScope);
  const [timeTab, setTimeTab] = useState<TimeTabId>(initialTime);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(currentQuery.categoryId || null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const searchDialogRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const topicDialogRef = useRef<HTMLDivElement | null>(null);
  const topicCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const [timeIndicator, setTimeIndicator] = useState({ left: 0, width: 0 });
  const timeContainerRef = useRef<HTMLDivElement | null>(null);
  const timeRefs = useRef<Record<TimeTabId, HTMLButtonElement | null>>({
    all: null,
    daily: null,
    weekly: null,
    monthly: null,
  });
  const scopeTabWidth = 100 / scopeTabs.length;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const userRowRef = useRef<HTMLDivElement | null>(null);
  const [isUserVisible, setIsUserVisible] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullState = useRef({ startY: 0, pulling: false });

  useDialog({
    open: searchOpen,
    onClose: () => setSearchOpen(false),
    dialogRef: searchDialogRef,
    initialFocusRef: searchInputRef,
  });

  useDialog({
    open: topicModalOpen,
    onClose: () => setTopicModalOpen(false),
    dialogRef: topicDialogRef,
    initialFocusRef: topicCloseButtonRef,
  });

  useEffect(() => {
    if (categories.length === 0) {
      fetchCategories();
    }
    fetchRankTiers();
  }, [categories.length, fetchCategories, fetchRankTiers]);

  const leaderboardQuery = useMemo<LeaderboardQuery>(() => {
    return {
      scope: scopeTab === 'friends' ? 'friends' : scopeTab === 'topic' ? 'topic' : 'global',
      timeframe: timeTab === 'all' ? 'all' : timeTab,
      categoryId: scopeTab === 'topic' ? selectedTopicId : null,
    };
  }, [scopeTab, timeTab, selectedTopicId]);

  useEffect(() => {
    setQuery(leaderboardQuery);
  }, [leaderboardQuery, setQuery]);

  const refreshLeaderboard = useCallback(async () => {
    await fetchLeaderboard(leaderboardQuery);
  }, [fetchLeaderboard, leaderboardQuery]);

  useLayoutEffect(() => {
    const container = timeContainerRef.current;
    const tab = timeRefs.current[timeTab];
    if (!container || !tab) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    setTimeIndicator({
      left: tabRect.left - containerRect.left,
      width: tabRect.width,
    });
  }, [timeTab]);

  const leaderboardKey = useMemo(() => getLeaderboardKey(leaderboardQuery), [leaderboardQuery]);
  const activeLeaderboard: LeaderboardData | null = useMemo(() => {
    return leaderboardsByKey[leaderboardKey] || null;
  }, [leaderboardsByKey, leaderboardKey]);
  const activeLoading = loadingByKey[leaderboardKey] ?? (getLeaderboardKey(currentQuery) === leaderboardKey ? isLoading : false);
  const activeError = errorByKey[leaderboardKey] ?? (getLeaderboardKey(currentQuery) === leaderboardKey ? error : null);

  const entries = useMemo(() => {
    if (!activeLeaderboard) return [];
    return activeLeaderboard.records.map((record) => mapRecordToEntry(record, tiers, getRankByMmr));
  }, [activeLeaderboard, tiers, getRankByMmr]);

  const displayEntries = entries;
  const topThree = displayEntries.slice(0, 3);
  const restEntries = displayEntries.slice(3);
  const userRowExists = restEntries.some((entry) => entry.isCurrentUser);

  const totalPlayers = typeof activeLeaderboard?.total === 'number' ? activeLeaderboard.total : displayEntries.length;

  const currentUserEntry = useMemo(() => {
    const fromList = displayEntries.find((entry) => entry.isCurrentUser);
    if (fromList) return fromList;
    if (activeLeaderboard?.userRank) {
      return mapRecordToEntry(activeLeaderboard.userRank, tiers, getRankByMmr);
    }
    if (authUser) {
      const record: LeaderboardRecord = {
        rank: 0,
        ownerId: authUser.userId,
        username: authUser.displayName || authUser.username,
        score: authUser.profile?.mmr || 0,
        rankTier: authUser.profile?.rankTier || null,
        avatarUrl: authUser.photoUrl,
        isCurrentUser: true,
      };
      return mapRecordToEntry(record, tiers, getRankByMmr);
    }
    return null;
  }, [activeLeaderboard, authUser, displayEntries, tiers, getRankByMmr]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const normalized = searchQuery.toLowerCase();
    return displayEntries.filter((entry) => entry.username.toLowerCase().includes(normalized));
  }, [displayEntries, searchQuery]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!userRowRef.current) {
          setIsUserVisible(true);
          return;
        }
        const containerRect = container.getBoundingClientRect();
        const rowRect = userRowRef.current.getBoundingClientRect();
        const visible = rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom;
        setIsUserVisible(visible);
      });
    };
    container.addEventListener('scroll', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      container.removeEventListener('scroll', onScroll);
    };
  }, [displayEntries]);

  const handleScopeChange = (tab: ScopeTabId) => {
    setScopeTab(tab);
    if (tab === 'topic') {
      setTopicModalOpen(true);
    }
  };

  const handleRefreshGesture = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await refreshLeaderboard();
    setIsRefreshing(false);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!scrollRef.current || scrollRef.current.scrollTop > 0) return;
    pullState.current.startY = event.touches[0].clientY;
    pullState.current.pulling = true;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!pullState.current.pulling) return;
    const currentY = event.touches[0].clientY;
    const distance = Math.max(0, currentY - pullState.current.startY);
    setPullDistance(Math.min(distance, 120));
  };

  const handleTouchEnd = async () => {
    if (!pullState.current.pulling) return;
    pullState.current.pulling = false;
    if (pullDistance > 70) {
      await handleRefreshGesture();
    }
    setPullDistance(0);
  };

  const scrollToUser = () => {
    if (!scrollRef.current || !userRowRef.current) return;
    const top = Math.max(0, userRowRef.current.offsetTop - 120);
    scrollRef.current.scrollTo({ top, behavior: 'smooth' });
  };

  const showFriendsEmpty = scopeTab === 'friends' && !activeLoading && !activeError && displayEntries.length === 0;
  const showTopicEmpty = scopeTab === 'topic' && !selectedTopicId;
  const showNoData = !activeLoading && !activeError && displayEntries.length === 0 && !showFriendsEmpty && !showTopicEmpty;
  const showLoading = activeLoading && displayEntries.length === 0;
  const isLoadingMore = activeLoading && displayEntries.length > 0;
  const showContent = !showLoading && !showTopicEmpty && !activeError && displayEntries.length > 0;
  const canLoadMore = !!activeLeaderboard?.hasMore && !!showContent;
  return (
    <div className="relative h-viewport overflow-hidden bg-gradient-main text-white no-x-overflow">
      <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.35)_1px,transparent_0)] [background-size:14px_14px]" />
      <div className="relative z-10 flex h-full flex-col">
        <header className="sticky top-0 z-30 h-[calc(56px+var(--safe-top))] safe-area-top border-b border-white/10 bg-gradient-to-b from-[#0b1020]/90 to-transparent backdrop-blur">
          <div className="flex h-full items-center justify-between px-4">
            <motion.button
              type="button"
              onClick={onBack}
              whileTap={{ scale: 0.96, opacity: 0.7 }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
              aria-label="Go back"
            >
              <IconBack />
            </motion.button>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <span className="text-[#FFD700]">
                <IconTrophy />
              </span>
              <span className="font-heading">Leaderboard</span>
            </div>
            <motion.button
              type="button"
              onClick={() => setSearchOpen(true)}
              whileTap={{ scale: 0.96, opacity: 0.7 }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
              aria-label="Search players"
            >
              <IconSearch />
            </motion.button>
          </div>
        </header>

        <div
          ref={scrollRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="flex-1 overflow-y-auto px-4 pb-40 pt-4 scrollbar-hide sm:px-6 lg:px-10"
        >
          <div className="w-full max-w-none space-y-4 pb-10">
            <div className="rounded-xl bg-[#16223f]/80 p-1 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <div className="relative grid grid-cols-3 gap-1" role="tablist" aria-label="Scope tabs">
                <motion.div
                  layoutId="scope-pill"
                  className="absolute inset-y-0 rounded-lg bg-gradient-to-br from-[#20c5ff] to-[#15a7e0] shadow-[0_2px_10px_rgba(0,217,255,0.3)]"
                  style={{
                    width: `${scopeTabWidth}%`,
                    left: `${scopeTabs.findIndex((tab) => tab.id === scopeTab) * scopeTabWidth}%`,
                  }}
                  transition={{ type: 'spring', stiffness: 260, damping: 25 }}
                />
                {scopeTabs.map((tab) => {
                  const isActive = scopeTab === tab.id;
                  return (
                    <motion.button
                      key={tab.id}
                      type="button"
                      onClick={() => handleScopeChange(tab.id)}
                      whileTap={{ scale: 1.02 }}
                      className={cn(
                        'relative z-10 flex h-9 items-center justify-center gap-1 rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/60',
                        isActive ? 'text-white font-semibold' : 'text-[#9fb1cc]'
                      )}
                      role="tab"
                      aria-selected={isActive}
                    >
                      <span>{tab.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 text-sm text-[#7484a1]">
              <IconCalendar />
              <div ref={timeContainerRef} className="relative flex items-center gap-2">
                <motion.div
                  className="absolute bottom-0 h-0.5 rounded-full bg-[#20c5ff]"
                  animate={{ x: timeIndicator.left, width: timeIndicator.width }}
                  transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                />
                {timeTabs.map((tab) => {
                  const isActive = timeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      ref={(node) => {
                        timeRefs.current[tab.id] = node;
                      }}
                      type="button"
                      onClick={() => setTimeTab(tab.id)}
                      className={cn(
                        'relative px-3 py-2 text-[13px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/60',
                        isActive ? 'text-[#20c5ff] font-semibold' : 'text-[#7484a1]'
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="flex flex-col items-center justify-center"
              style={{ height: Math.max(pullDistance, isRefreshing ? 60 : 0) }}
              aria-live="polite"
            >
              {(pullDistance > 0 || isRefreshing) && (
                <>
                  <motion.div
                    animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
                    transition={{ repeat: isRefreshing ? Infinity : 0, duration: 1, ease: 'linear' }}
                    className="h-6 w-6 rounded-full border-2 border-[#20c5ff] border-t-transparent"
                  />
                  <span className="mt-2 text-[12px] text-[#9fb1cc]">Updating rankings...</span>
                </>
              )}
            </div>

            {activeError && (
              <div className="rounded-2xl border border-[#FF6B6B]/40 bg-[#FF6B6B]/10 p-4 text-sm text-[#FF6B6B]">
                <div className="flex items-center justify-between gap-3">
                  <span>{activeError}</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearError(leaderboardQuery);
                      refreshLeaderboard();
                    }}
                    className="rounded-full bg-[#FF6B6B] px-3 py-1 text-xs font-semibold text-[#0b1020]"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {showLoading && <LoadingSkeleton />}

            {showFriendsEmpty && (
              <EmptyState
                title="No friend rankings yet"
                subtitle="Add friends from the Friends tab to see their ranks here."
              />
            )}

            {showTopicEmpty && (
              <EmptyState
                title="Choose a topic"
                subtitle="Select a topic to view the rankings."
                cta="Choose Topic"
                onCta={() => setTopicModalOpen(true)}
              />
            )}

            {showNoData && (
              <EmptyState
                title="No rankings yet"
                subtitle="Be the first to climb the ladder."
                cta="Refresh"
                onCta={refreshLeaderboard}
              />
            )}

            {showContent && (
              <>
                <section className="pt-2">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="text-sm font-semibold text-white">Top Players</span>
                    <span className="text-xs text-[#9fb1cc]">Players shown: {formatNumber(totalPlayers)}</span>
                  </div>
                  <div className="flex items-end justify-center gap-4 h-[220px]">
                    {podiumLayouts.map((layout, index) => (
                      <PodiumPlayer
                        key={layout.place}
                        entry={topThree[layout.place - 1]}
                        layout={layout}
                        delay={prefersReducedMotion ? 0 : index * 0.1}
                        prefersReducedMotion={!!prefersReducedMotion}
                      />
                    ))}
                  </div>
                </section>

                <section className="pt-2">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="text-sm font-semibold text-white">Rankings</span>
                    <span className="text-xs text-[#9fb1cc]">Players shown: {formatNumber(totalPlayers)}</span>
                  </div>
                  <div className="space-y-2">
                    {restEntries.map((entry, index) => (
                      <motion.div
                        key={entry.id}
                        whileTap={{ scale: 0.98 }}
                        className="origin-center"
                      >
                        <LeaderboardRow
                          entry={entry}
                          index={index}
                          prefersReducedMotion={!!prefersReducedMotion}
                          rowRef={entry.isCurrentUser ? (node) => { userRowRef.current = node; } : undefined}
                        />
                      </motion.div>
                    ))}
                  </div>
                  {canLoadMore && (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          fetchNextPage(leaderboardQuery);
                        }}
                        disabled={isLoadingMore || isRefreshing}
                        className={cn(
                          'rounded-full px-5 py-2 text-sm font-semibold transition-colors',
                          isLoadingMore || isRefreshing
                            ? 'bg-[#2e345d] text-[#9fb1cc] cursor-not-allowed'
                            : 'bg-[#20c5ff] text-[#0b1020] hover:bg-[#15a7e0]'
                        )}
                      >
                        {isLoadingMore ? 'Loading...' : 'Load more'}
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
        {currentUserEntry && userRowExists && (
          <motion.button
            type="button"
            onClick={scrollToUser}
            whileTap={{ scale: 0.98 }}
            className="fixed left-4 right-4 z-40 rounded-2xl border border-[#20c5ff]/40 bg-[#16223f] px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/60 sm:left-6 sm:right-6 lg:left-10 lg:right-10"
            style={{
              bottom: 'calc(var(--tabbar-offset) + var(--safe-bottom) + 16px)',
              boxShadow: '0 0 20px rgba(0,217,255,0.15)',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-[#20c5ff] px-2 py-0.5 text-[10px] font-bold text-[#0b1020]">YOU</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#20c5ff]/30 text-white font-bold text-sm">
                {currentUserEntry.rank || '--'}
              </div>
              <div className="relative h-12 w-12 rounded-full border-2 border-[#20c5ff] shadow-[0_0_12px_rgba(0,217,255,0.35)] overflow-hidden">
                {currentUserEntry.avatarUrl ? (
                  <img src={currentUserEntry.avatarUrl} alt={currentUserEntry.username} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#20c5ff] to-[#8B5CF6] text-white font-bold text-sm">
                    {currentUserEntry.initials}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="name-text text-sm font-semibold text-white truncate">{currentUserEntry.username}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-[#20c5ff]">{formatNumber(currentUserEntry.mmr)} MMR</span>
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={{ color: currentUserEntry.tier.color, backgroundColor: `${currentUserEntry.tier.color}33` }}
                  >
                    {currentUserEntry.tier.name}
                  </span>
                </div>
              </div>
              <div className="text-right text-[11px] text-[#7484a1]">
                {!isUserVisible && <span>Tap to scroll</span>}
              </div>
            </div>
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSearchOpen(false)}
            role="presentation"
          >
            <motion.div
              ref={searchDialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Find players"
              className="w-full max-w-[420px] rounded-2xl bg-[#16223f] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Find Players</h3>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="rounded-full px-2 py-1 text-sm text-[#9fb1cc] hover:text-white"
                >
                  Close
                </button>
              </div>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search shown players"
                className="mt-4 w-full rounded-xl border border-white/10 bg-[#1b2f58] px-4 py-2 text-sm text-white placeholder:text-[#7484a1] focus:outline-none focus:ring-2 focus:ring-[#20c5ff]/60"
              />
              <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-1 scrollbar-hide">
                {searchResults.length > 0 ? (
                  searchResults.map((entry) => (
                    <LeaderboardRow
                      key={`search-${entry.id}`}
                      entry={entry}
                      index={0}
                      prefersReducedMotion
                    />
                  ))
                ) : (
                  <p className="text-sm text-[#9fb1cc]">No players found.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {topicModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setTopicModalOpen(false)}
            role="presentation"
          >
            <motion.div
              ref={topicDialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Choose topic"
              className="w-full max-w-[420px] rounded-2xl bg-[#16223f] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Choose Topic</h3>
                <button
                  ref={topicCloseButtonRef}
                  type="button"
                  onClick={() => setTopicModalOpen(false)}
                  className="rounded-full px-2 py-1 text-sm text-[#9fb1cc] hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1 scrollbar-hide">
                {categories.length > 0 ? (
                  categories.map((category) => {
                    const isActive = category.id === selectedTopicId;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setSelectedTopicId(category.id);
                          setTopicModalOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                          isActive
                            ? 'border-[#20c5ff]/60 bg-[#20c5ff]/10 text-white'
                            : 'border-white/5 bg-[#1b2f58]/70 text-[#9fb1cc]'
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-8 w-8 rounded-full bg-[#111b33] flex items-center justify-center text-base overflow-hidden">
                            {category.iconUrl ? (
                              <img src={category.iconUrl} alt="" className="h-5 w-5 object-contain" />
                            ) : (
                              category.icon
                            )}
                          </span>
                          <span className="font-semibold text-white">{category.name}</span>
                        </span>
                        {isActive && <span className="text-[#20c5ff] text-xs font-semibold">Selected</span>}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-[#9fb1cc]">No topics available.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LeaderboardScreen;


