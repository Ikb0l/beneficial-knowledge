// Rank Tiers Store - Fetches rank tiers from server
import { create } from 'zustand';
import nakama from '../shared/lib/nakama';
import type { RankTierInfo } from '../shared/types/game';

// Default/fallback rank tiers (used if server is unavailable)
const DEFAULT_RANK_TIERS: RankTierInfo[] = [
  { id: 'bronze', tierKey: 'bronze', name: 'Bronze', minMmr: 0, maxMmr: 1099, color: '#CD7F32', displayOrder: 1 },
  { id: 'silver', tierKey: 'silver', name: 'Silver', minMmr: 1100, maxMmr: 1299, color: '#C0C0C0', displayOrder: 2 },
  { id: 'gold', tierKey: 'gold', name: 'Gold', minMmr: 1300, maxMmr: 1499, color: '#FFD700', displayOrder: 3 },
  { id: 'platinum', tierKey: 'platinum', name: 'Platinum', minMmr: 1500, maxMmr: 1699, color: '#E5E4E2', displayOrder: 4 },
  { id: 'diamond', tierKey: 'diamond', name: 'Diamond', minMmr: 1700, maxMmr: 1899, color: '#B9F2FF', displayOrder: 5 },
  { id: 'master', tierKey: 'master', name: 'Master', minMmr: 1900, maxMmr: 2099, color: '#9966CC', displayOrder: 6 },
  { id: 'grandmaster', tierKey: 'grandmaster', name: 'Grandmaster', minMmr: 2100, maxMmr: 10000, color: '#FF4500', displayOrder: 7 },
];

interface ServerRankTier {
  tierKey: string;
  name: string;
  minMmr: number;
  maxMmr: number;
  color?: string;
  iconUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
}

interface RankState {
  tiers: RankTierInfo[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
  fetchRankTiers: () => Promise<void>;
  getRankByMmr: (mmr: number) => RankTierInfo;
  getRankProgress: (mmr: number) => number;
  getMmrToNextRank: (mmr: number) => number | null;
  getNextRank: (mmr: number) => RankTierInfo | null;
}

export const useRankStore = create<RankState>((set, get) => ({
  tiers: DEFAULT_RANK_TIERS,
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchRankTiers: async () => {
    // Cache for 5 minutes
    const now = Date.now();
    const lastFetched = get().lastFetched;
    if (lastFetched && now - lastFetched < 5 * 60 * 1000) {
      return;
    }

    try {
      set({ isLoading: true, error: null });
      const data = await nakama.rpc<{ tiers: ServerRankTier[] }>('get_rank_tiers', {});

      if (data.tiers && data.tiers.length > 0) {
        const tiers: RankTierInfo[] = data.tiers
          .filter(t => t.isActive !== false)
          .map(t => ({
            id: t.tierKey,
            tierKey: t.tierKey,
            name: t.name,
            minMmr: t.minMmr,
            maxMmr: t.maxMmr,
            color: t.color || '#666666',
            iconUrl: t.iconUrl,
            displayOrder: t.displayOrder || 0,
          }))
          .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

        set({ tiers, isLoading: false, lastFetched: now });
      } else {
        set({ isLoading: false, lastFetched: now });
      }
    } catch (error) {
      console.error('Error fetching rank tiers:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load rank tiers',
      });
    }
  },

  getRankByMmr: (mmr: number): RankTierInfo => {
    const { tiers } = get();
    let bestLower: RankTierInfo | null = null;
    let lowest: RankTierInfo | null = null;
    for (const tier of tiers) {
      if (!lowest || tier.minMmr < lowest.minMmr) {
        lowest = tier;
      }
      if (mmr >= tier.minMmr && mmr <= tier.maxMmr) {
        return tier;
      }
      if (mmr >= tier.minMmr && (!bestLower || tier.minMmr > bestLower.minMmr)) {
        bestLower = tier;
      }
    }
    return bestLower || lowest || tiers[0] || DEFAULT_RANK_TIERS[0];
  },

  getRankProgress: (mmr: number): number => {
    const { tiers, getRankByMmr } = get();
    const currentTier = getRankByMmr(mmr);
    const sortedTiers = [...tiers].sort((a, b) => a.minMmr - b.minMmr);
    const currentIndex = sortedTiers.findIndex(t => t.tierKey === currentTier.tierKey);
    const nextTier = currentIndex >= 0 ? sortedTiers[currentIndex + 1] : null;
    const lowerBound = currentTier.minMmr;
    const upperBound = nextTier ? nextTier.minMmr : currentTier.maxMmr;
    const range = upperBound - lowerBound;
    if (range <= 0) return 100;
    const progress = mmr - lowerBound;
    return Math.min(100, Math.max(0, (progress / range) * 100));
  },

  getMmrToNextRank: (mmr: number): number | null => {
    const { tiers, getRankByMmr } = get();
    const currentTier = getRankByMmr(mmr);
    const sortedTiers = [...tiers].sort((a, b) => a.minMmr - b.minMmr);
    const currentIndex = sortedTiers.findIndex(t => t.tierKey === currentTier.tierKey);

    if (currentIndex < 0 || currentIndex >= sortedTiers.length - 1) {
      return null; // Already at highest rank
    }

    const nextTier = sortedTiers[currentIndex + 1];
    return nextTier.minMmr - mmr;
  },

  getNextRank: (mmr: number): RankTierInfo | null => {
    const { tiers, getRankByMmr } = get();
    const currentTier = getRankByMmr(mmr);
    const sortedTiers = [...tiers].sort((a, b) => a.minMmr - b.minMmr);
    const currentIndex = sortedTiers.findIndex(t => t.tierKey === currentTier.tierKey);

    if (currentIndex < 0 || currentIndex >= sortedTiers.length - 1) {
      return null;
    }

    return sortedTiers[currentIndex + 1];
  },
}));

export default useRankStore;
