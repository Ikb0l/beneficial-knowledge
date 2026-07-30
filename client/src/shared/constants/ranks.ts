// Rank tier definitions - FALLBACK VALUES ONLY
// Primary source is useRankStore which fetches from server
import type { RankTierInfo, DefaultRankTier } from '../types/game';

// These are fallback values used when server is unavailable
// For live data, use useRankStore.getRankByMmr() instead
export const RANK_TIERS: Record<DefaultRankTier, RankTierInfo> = {
  bronze: {
    id: 'bronze',
    tierKey: 'bronze',
    name: 'Bronze',
    minMmr: 0,
    maxMmr: 1099,
    color: '#CD7F32',
    displayOrder: 1,
  },
  silver: {
    id: 'silver',
    tierKey: 'silver',
    name: 'Silver',
    minMmr: 1100,
    maxMmr: 1299,
    color: '#C0C0C0',
    displayOrder: 2,
  },
  gold: {
    id: 'gold',
    tierKey: 'gold',
    name: 'Gold',
    minMmr: 1300,
    maxMmr: 1499,
    color: '#FFD700',
    displayOrder: 3,
  },
  platinum: {
    id: 'platinum',
    tierKey: 'platinum',
    name: 'Platinum',
    minMmr: 1500,
    maxMmr: 1699,
    color: '#E5E4E2',
    displayOrder: 4,
  },
  diamond: {
    id: 'diamond',
    tierKey: 'diamond',
    name: 'Diamond',
    minMmr: 1700,
    maxMmr: 1899,
    color: '#B9F2FF',
    displayOrder: 5,
  },
  master: {
    id: 'master',
    tierKey: 'master',
    name: 'Master',
    minMmr: 1900,
    maxMmr: 2099,
    color: '#9966CC',
    displayOrder: 6,
  },
  grandmaster: {
    id: 'grandmaster',
    tierKey: 'grandmaster',
    name: 'Grandmaster',
    minMmr: 2100,
    maxMmr: 10000,
    color: '#FF4500',
    displayOrder: 7,
  },
};

export const RANK_TIER_ORDER: DefaultRankTier[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'grandmaster',
];

// DEPRECATED: Use useRankStore.getRankByMmr() instead for live data
export const getRankTierByMmr = (mmr: number): RankTierInfo => {
  let bestLower: RankTierInfo | null = null;
  let lowest: RankTierInfo | null = null;
  for (const tier of RANK_TIER_ORDER) {
    const info = RANK_TIERS[tier];
    if (!lowest || info.minMmr < lowest.minMmr) {
      lowest = info;
    }
    if (mmr >= info.minMmr && mmr <= info.maxMmr) {
      return info;
    }
    if (mmr >= info.minMmr && (!bestLower || info.minMmr > bestLower.minMmr)) {
      bestLower = info;
    }
  }
  return bestLower || lowest || RANK_TIERS.bronze;
};

// DEPRECATED: Use useRankStore.getRankProgress() instead
export const getRankProgress = (mmr: number): number => {
  const tier = getRankTierByMmr(mmr);
  const currentIndex = RANK_TIER_ORDER.indexOf(tier.id as DefaultRankTier);
  const nextTierKey = currentIndex >= 0 ? RANK_TIER_ORDER[currentIndex + 1] : null;
  const nextTier = nextTierKey ? RANK_TIERS[nextTierKey] : null;
  const lowerBound = tier.minMmr;
  const upperBound = nextTier ? nextTier.minMmr : tier.maxMmr;
  const range = upperBound - lowerBound;
  if (range <= 0) return 100;
  const progress = mmr - lowerBound;
  return Math.min(100, Math.max(0, (progress / range) * 100));
};

// DEPRECATED: Use useRankStore.getMmrToNextRank() instead
export const getMmrToNextRank = (mmr: number): number | null => {
  const currentTier = getRankTierByMmr(mmr);
  const currentIndex = RANK_TIER_ORDER.indexOf(currentTier.id as DefaultRankTier);

  if (currentIndex >= RANK_TIER_ORDER.length - 1) {
    return null; // Already at highest rank
  }

  return Math.max(0, currentTier.maxMmr + 1 - mmr);
};

// ============================================================================
// RANK UI STYLES - Centralized styling for rank display across the app
// ============================================================================

// Tailwind CSS classes for rank border colors (used in Avatar)
export const RANK_BORDER_COLORS: Record<DefaultRankTier, string> = {
  bronze: 'ring-rank-bronze',
  silver: 'ring-rank-silver',
  gold: 'ring-rank-gold',
  platinum: 'ring-rank-platinum',
  diamond: 'ring-rank-diamond',
  master: 'ring-rank-master',
  grandmaster: 'ring-rank-grandmaster',
};

// Tailwind CSS classes for rank gradients (used in Avatar badges)
export const RANK_GRADIENTS: Record<DefaultRankTier, string> = {
  bronze: 'from-rank-bronze to-amber-800',
  silver: 'from-rank-silver to-gray-400',
  gold: 'from-rank-gold to-amber-500',
  platinum: 'from-rank-platinum to-gray-300',
  diamond: 'from-rank-diamond to-cyan-400',
  master: 'from-rank-master to-purple-600',
  grandmaster: 'from-rank-grandmaster to-red-600',
};

// Full rank styles for badges (background, text, icon)
export const RANK_STYLES: Record<DefaultRankTier, { bg: string; text: string; icon: string }> = {
  bronze: { bg: 'bg-gradient-to-r from-rank-bronze to-amber-700', text: 'text-white', icon: '🥉' },
  silver: { bg: 'bg-gradient-to-r from-rank-silver to-gray-400', text: 'text-gray-900', icon: '🥈' },
  gold: { bg: 'bg-gradient-to-r from-rank-gold to-amber-500', text: 'text-gray-900', icon: '🥇' },
  platinum: { bg: 'bg-gradient-to-r from-rank-platinum to-gray-300', text: 'text-gray-900', icon: '💎' },
  diamond: { bg: 'bg-gradient-to-r from-rank-diamond to-cyan-400', text: 'text-gray-900', icon: '💠' },
  master: { bg: 'bg-gradient-to-r from-rank-master to-purple-600', text: 'text-white', icon: '👑' },
  grandmaster: { bg: 'bg-gradient-to-r from-rank-grandmaster to-red-600', text: 'text-white', icon: '🏆' },
};

// Admin panel badge colors (simpler style)
export const RANK_BADGE_COLORS: Record<string, string> = {
  bronze: 'bg-amber-100 text-amber-800',
  silver: 'bg-slate-100 text-slate-800',
  gold: 'bg-yellow-100 text-yellow-800',
  platinum: 'bg-cyan-100 text-cyan-800',
  diamond: 'bg-blue-100 text-blue-800',
  master: 'bg-purple-100 text-purple-800',
  grandmaster: 'bg-red-100 text-red-800',
};

// Helper function to get rank badge color class
export const getRankBadgeColor = (rank: string): string => {
  return RANK_BADGE_COLORS[rank.toLowerCase()] || 'bg-slate-100 text-slate-800';
};
