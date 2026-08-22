// Profile Store - Detailed user stats and match history
import { create } from 'zustand';
import nakama from '../shared/lib/nakama';

export interface CategoryStat {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  mmr: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface MatchHistoryItem {
  matchId: string;
  category: string;
  opponentId: string;
  opponentName: string;
  playerScore: number;
  opponentScore: number;
  result: 'win' | 'loss' | 'draw';
  mmrChange: number;
  newMmr: number;
  correctAnswers: number;
  totalQuestions: number;
  timestamp: number;
  isFriendChallenge?: boolean;
  isBotMatch?: boolean;
}

export interface DetailedProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  createdAt: number;
  lastActiveAt: number;

  globalStats: {
    mmr: number;
    rankTier: string;
    peakMmr: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
  };

  performance: {
    totalQuestions: number;
    correctAnswers: number;
    accuracy: number;
    averageResponseTime: number;
    longestStreak: number;
    perfectGames: number;
  };

  categoryStats: CategoryStat[];
  matchHistory: MatchHistoryItem[];
  matchHistoryTotal?: number;
}

const normalizeMatchHistory = (value: unknown): MatchHistoryItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizeNumber = (input: unknown): number => {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return input;
    }
    if (typeof input === 'string') {
      const parsed = Number(input.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  };

  const normalizeTimestamp = (input: unknown): number => {
    let parsed = 0;
    if (typeof input === 'number' && Number.isFinite(input)) {
      parsed = input;
    } else if (typeof input === 'string') {
      const trimmed = input.trim();
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        parsed = numeric;
      } else {
        const asDate = Date.parse(trimmed);
        if (Number.isFinite(asDate)) {
          parsed = asDate;
        }
      }
    }
    const rounded = Math.floor(parsed);
    if (rounded <= 0) {
      return 0;
    }
    // Legacy payloads may send UNIX seconds; normalize to milliseconds.
    return rounded < 100000000000 ? rounded * 1000 : rounded;
  };

  const normalizeResult = (input: unknown): 'win' | 'loss' | 'draw' => {
    if (typeof input === 'string') {
      const normalized = input.toLowerCase();
      if (normalized === 'win' || normalized === 'loss' || normalized === 'draw') {
        return normalized;
      }
    }
    return 'draw';
  };

  const matches: MatchHistoryItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const match = item as Partial<MatchHistoryItem>;
    if (typeof match.matchId !== 'string' || match.matchId.length === 0) {
      continue;
    }

    const opponentId = typeof match.opponentId === 'string' ? match.opponentId : '';
    const timestamp = normalizeTimestamp(match.timestamp);
    const isBotMatch = match.isBotMatch === true || opponentId === 'bot' || opponentId.startsWith('bot_');

    matches.push({
      matchId: match.matchId,
      category: typeof match.category === 'string' ? match.category : 'Unknown',
      opponentId,
      opponentName: typeof match.opponentName === 'string' ? match.opponentName : 'Opponent',
      playerScore: normalizeNumber(match.playerScore),
      opponentScore: normalizeNumber(match.opponentScore),
      result: normalizeResult(match.result),
      mmrChange: normalizeNumber(match.mmrChange),
      newMmr: normalizeNumber(match.newMmr),
      correctAnswers: normalizeNumber(match.correctAnswers),
      totalQuestions: normalizeNumber(match.totalQuestions),
      timestamp,
      isFriendChallenge: match.isFriendChallenge === true,
      isBotMatch,
    });
  }

  matches.sort((a, b) => b.timestamp - a.timestamp);
  return matches;
};

const DEFAULT_GLOBAL_STATS: DetailedProfile['globalStats'] = {
  mmr: 0,
  rankTier: 'bronze',
  peakMmr: 0,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: 0,
};

const DEFAULT_PERFORMANCE: DetailedProfile['performance'] = {
  totalQuestions: 0,
  correctAnswers: 0,
  accuracy: 0,
  averageResponseTime: 0,
  longestStreak: 0,
  perfectGames: 0,
};

interface ProfileState {
  // State
  profile: DetailedProfile | null;
  isLoading: boolean;
  error: string | null;
  profileRequestId: number; // For race condition prevention

  // Match history pagination
  matchHistoryTotal: number;
  matchHistoryOffset: number;
  isLoadingMore: boolean;
  matchHistoryRequestId: number; // For race condition prevention

  // Actions
  fetchProfile: (userId?: string) => Promise<void>;
  fetchMatchHistory: (userId?: string, offset?: number, limit?: number) => Promise<void>;
  loadMoreMatchHistory: () => Promise<void>;
  clearProfile: () => void;
  clearError: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  // Initial state
  profile: null,
  isLoading: false,
  error: null,
  profileRequestId: 0,
  matchHistoryTotal: 0,
  matchHistoryOffset: 0,
  isLoadingMore: false,
  matchHistoryRequestId: 0,

  // Actions
  fetchProfile: async (userId?: string) => {
    const requestId = get().profileRequestId + 1;
    set({ isLoading: true, error: null, profileRequestId: requestId });

    try {
      const requestedUserId = typeof userId === 'string' && userId.length > 0 ? userId : undefined;
      const data = await nakama.rpc<DetailedProfile>('get_detailed_profile', {
        userId: requestedUserId,
      });

      if (get().profileRequestId !== requestId) {
        return;
      }

      // Validate response has required fields and normalize missing userId from request.
      const sessionUserId = nakama.getSession()?.user_id;
      const resolvedUserId = (typeof data?.userId === 'string' && data.userId.length > 0)
        ? data.userId
        : (requestedUserId || sessionUserId);
      if (!data || !resolvedUserId) {
        throw new Error('Invalid profile data received from server');
      }

      const normalizedData: DetailedProfile = {
        ...data,
        userId: resolvedUserId,
        globalStats: data.globalStats || DEFAULT_GLOBAL_STATS,
      };

      const state = get();
      const existingProfile = state.profile;
      const isSameProfileUser = existingProfile?.userId === normalizedData.userId;
      const serverMatchHistory = normalizeMatchHistory(normalizedData.matchHistory);
      const serverMatchHistoryTotal = typeof normalizedData.matchHistoryTotal === 'number'
        ? Math.max(Math.floor(normalizedData.matchHistoryTotal), serverMatchHistory.length)
        : serverMatchHistory.length;

      const existingMatchHistory = isSameProfileUser
        ? normalizeMatchHistory(existingProfile?.matchHistory || [])
        : [];
      const keepExistingHistory = isSameProfileUser
        && existingMatchHistory.length > serverMatchHistory.length
        && state.matchHistoryOffset > serverMatchHistory.length;
      const matchHistory = keepExistingHistory ? existingMatchHistory : serverMatchHistory;
      const matchHistoryTotal = keepExistingHistory
        ? Math.max(state.matchHistoryTotal, serverMatchHistoryTotal)
        : serverMatchHistoryTotal;

      set({
          profile: {
            ...normalizedData,
            matchHistory,
            categoryStats: normalizedData.categoryStats || [],
            performance: normalizedData.performance || DEFAULT_PERFORMANCE,
          },
        matchHistoryTotal,
        matchHistoryOffset: matchHistory.length,
        matchHistoryRequestId: isSameProfileUser ? state.matchHistoryRequestId : 0,
        isLoadingMore: false,
        isLoading: false,
      });
    } catch (error) {
      if (get().profileRequestId !== requestId) {
        return;
      }
      console.error('Error fetching profile:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch profile',
      });
    }
  },

  fetchMatchHistory: async (userId?: string, offset = 0, limit = 20) => {
    const targetUserId = (typeof userId === 'string' && userId.length > 0)
      ? userId
      : get().profile?.userId;
    if (!targetUserId) {
      return;
    }

    // Increment request ID to track this specific request
    const requestId = get().matchHistoryRequestId + 1;
    set({ isLoadingMore: true, matchHistoryRequestId: requestId, error: null });

    try {
      const data = await nakama.rpc<{
        matches: MatchHistoryItem[];
        total: number;
        offset: number;
        limit: number;
      }>('get_match_history', {
        userId: targetUserId,
        offset: offset,
        limit: limit,
      });

      // Check if this request is still the latest one (race condition prevention)
      if (get().matchHistoryRequestId !== requestId) {
        // A newer request was made, ignore this response
        return;
      }

      const currentProfile = get().profile;
      if (!currentProfile || currentProfile.userId !== targetUserId) {
        set({ isLoadingMore: false });
        return;
      }
      const normalizedMatches = normalizeMatchHistory(data.matches);
      const total = typeof data.total === 'number'
        ? Math.max(Math.floor(data.total), normalizedMatches.length)
        : normalizedMatches.length;

      if (offset === 0) {
        // Replace match history
        set({
          profile: {
            ...currentProfile,
            matchHistory: normalizedMatches,
          },
          matchHistoryTotal: total,
          matchHistoryOffset: normalizedMatches.length,
          isLoadingMore: false,
        });
      } else {
        // Append to existing history (verify offset matches expected position)
        const expectedOffset = currentProfile.matchHistory.length;
        if (offset === expectedOffset) {
          const seenMatchIds = new Set(currentProfile.matchHistory.map((match) => match.matchId));
          const appendedMatches = [...currentProfile.matchHistory];
          for (const match of normalizedMatches) {
            if (seenMatchIds.has(match.matchId)) {
              continue;
            }
            seenMatchIds.add(match.matchId);
            appendedMatches.push(match);
          }
          set({
            profile: {
              ...currentProfile,
              matchHistory: appendedMatches,
            },
            matchHistoryTotal: total,
            matchHistoryOffset: appendedMatches.length,
            isLoadingMore: false,
          });
        } else {
          // Offset mismatch - state may be corrupted, just update loading state
          console.warn('Match history offset mismatch, ignoring response');
          set({ isLoadingMore: false });
        }
      }
    } catch (error) {
      console.error('Error fetching match history:', error);
      // Only update loading state if this is still the active request
      if (get().matchHistoryRequestId === requestId) {
        set({
          isLoadingMore: false,
          error: error instanceof Error ? error.message : 'Failed to fetch match history',
        });
      }
    }
  },

  loadMoreMatchHistory: async () => {
    const { matchHistoryOffset, matchHistoryTotal, isLoadingMore, profile } = get();

    if (isLoadingMore || matchHistoryOffset >= matchHistoryTotal || !profile) {
      return;
    }

    await get().fetchMatchHistory(profile.userId, matchHistoryOffset, 20);
  },

  clearProfile: () => {
    set((state) => ({
      profile: null,
      isLoading: false,
      isLoadingMore: false,
      matchHistoryTotal: 0,
      matchHistoryOffset: 0,
      profileRequestId: state.profileRequestId + 1,
      matchHistoryRequestId: state.matchHistoryRequestId + 1,
      error: null,
    }));
  },

  clearError: () => {
    set({ error: null });
  },
}));

export default useProfileStore;
