// Leaderboard Store
import { create } from 'zustand';
import nakama from '../shared/lib/nakama';

export interface LeaderboardRecord {
  rank: number;
  ownerId: string;
  username: string;
  score: number;
  rankTier?: string | null;
  avatarUrl?: string | null;
  isCurrentUser?: boolean;
}

export type LeaderboardScope = 'global' | 'friends' | 'topic';
export type LeaderboardTimeframe = 'all' | 'daily' | 'weekly' | 'monthly';

export interface LeaderboardQuery {
  scope: LeaderboardScope;
  timeframe: LeaderboardTimeframe;
  categoryId?: string | null;
}

export interface LeaderboardData {
  leaderboardId: string;
  records: LeaderboardRecord[];
  userRank?: LeaderboardRecord;
  isWeeklyLeaderboard?: boolean;
  hasMore?: boolean;
  offset?: number;
  total?: number;
  nextCursor?: string | null;
  prevCursor?: string | null;
  scope?: LeaderboardScope;
  timeframe?: LeaderboardTimeframe;
}

interface LeaderboardResponse {
  leaderboardId: string;
  records: Array<{
    ownerId: string;
    username: string;
    score: number;
    rank: number;
    rankTier?: string | null;
    avatarUrl?: string | null;
  }>;
  userRank?: {
    ownerId: string;
    username: string;
    score: number;
    rank: number;
    rankTier?: string | null;
    avatarUrl?: string | null;
  } | null;
  isWeeklyLeaderboard?: boolean;
  hasMore?: boolean;
  offset?: number;
  limit?: number;
  total?: number;
  nextCursor?: string | null;
  prevCursor?: string | null;
  scope?: LeaderboardScope;
  timeframe?: LeaderboardTimeframe;
  error?: string; // Server-side error message
}

interface LeaderboardState {
  currentQuery: LeaderboardQuery;
  leaderboardsByKey: Record<string, LeaderboardData>;
  loadingByKey: Record<string, boolean>;
  errorByKey: Record<string, string | null>;
  requestSeqByKey: Record<string, number>;
  isLoading: boolean;
  error: string | null;

  setQuery: (query: Partial<LeaderboardQuery>) => void;
  fetchLeaderboard: (query: LeaderboardQuery, options?: FetchLeaderboardOptions) => Promise<void>;
  fetchNextPage: (query?: LeaderboardQuery) => Promise<void>;
  fetchCurrentLeaderboard: () => Promise<void>;
  clearError: (query?: LeaderboardQuery) => void;
}

interface FetchLeaderboardOptions {
  append?: boolean;
  cursor?: string | null;
  offset?: number;
  limit?: number;
}

export function getLeaderboardKey(query: LeaderboardQuery): string {
  return `${query.scope}:${query.timeframe}:${query.categoryId || ''}`;
}

function transformLeaderboardResponse(
  data: LeaderboardResponse,
  currentUserId: string | undefined
): LeaderboardData {
  const records: LeaderboardRecord[] = (data.records || []).map((r, index) => ({
    rank: r.rank || index + 1,
    ownerId: r.ownerId,
    username: r.username || 'Unknown',
    score: r.score,
    rankTier: r.rankTier,
    avatarUrl: r.avatarUrl || null,
    isCurrentUser: r.ownerId === currentUserId,
  }));

  const userInRecords = records.find((r) => r.isCurrentUser);

  let userRank: LeaderboardRecord | undefined;
  if (userInRecords) {
    userRank = userInRecords;
  } else if (data.userRank && data.userRank.ownerId === currentUserId) {
    userRank = {
      rank: data.userRank.rank,
      ownerId: data.userRank.ownerId,
      username: data.userRank.username || 'Unknown',
      score: data.userRank.score,
      rankTier: data.userRank.rankTier,
      avatarUrl: data.userRank.avatarUrl || null,
      isCurrentUser: true,
    };
  }

  return {
    leaderboardId: data.leaderboardId,
    records,
    userRank,
    isWeeklyLeaderboard: data.isWeeklyLeaderboard,
    hasMore: data.hasMore,
    offset: data.offset,
    total: data.total,
    nextCursor: data.nextCursor ?? null,
    prevCursor: data.prevCursor ?? null,
    scope: data.scope,
    timeframe: data.timeframe,
  };
}

function mergeLeaderboardPages(existing: LeaderboardData | undefined, incoming: LeaderboardData): LeaderboardData {
  if (!existing) {
    return incoming;
  }

  const mergedRecords: LeaderboardRecord[] = [...existing.records];
  const seenOwnerIds = new Set(existing.records.map((record) => record.ownerId));

  for (const record of incoming.records) {
    if (seenOwnerIds.has(record.ownerId)) {
      continue;
    }
    seenOwnerIds.add(record.ownerId);
    mergedRecords.push(record);
  }

  return {
    leaderboardId: incoming.leaderboardId || existing.leaderboardId,
    records: mergedRecords,
    userRank: incoming.userRank ?? existing.userRank,
    isWeeklyLeaderboard: incoming.isWeeklyLeaderboard ?? existing.isWeeklyLeaderboard,
    hasMore: incoming.hasMore,
    offset: typeof incoming.offset === 'number' ? incoming.offset : existing.offset,
    total: typeof incoming.total === 'number' ? incoming.total : existing.total,
    nextCursor: incoming.nextCursor ?? existing.nextCursor ?? null,
    prevCursor: incoming.prevCursor ?? existing.prevCursor ?? null,
    scope: incoming.scope ?? existing.scope,
    timeframe: incoming.timeframe ?? existing.timeframe,
  };
}

function buildRpcPayload(query: LeaderboardQuery, options?: FetchLeaderboardOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (query.scope === 'friends') {
    payload.scope = 'friends';
  }
  if (query.timeframe && query.timeframe !== 'all') {
    payload.timeframe = query.timeframe;
  }
  if (query.scope === 'topic' && query.categoryId) {
    payload.category = query.categoryId;
  }

  if (options?.cursor) {
    payload.cursor = options.cursor;
  } else if (typeof options?.offset === 'number' && Number.isFinite(options.offset)) {
    payload.offset = Math.max(0, Math.floor(options.offset));
  }

  if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
    payload.limit = Math.max(1, Math.floor(options.limit));
  }

  return payload;
}

export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
  currentQuery: {
    scope: 'global',
    timeframe: 'weekly',
    categoryId: null,
  },
  leaderboardsByKey: {},
  loadingByKey: {},
  errorByKey: {},
  requestSeqByKey: {},
  isLoading: false,
  error: null,

  setQuery: (query: Partial<LeaderboardQuery>) => {
    const current = get().currentQuery;
    const next: LeaderboardQuery = {
      scope: query.scope ?? current.scope,
      timeframe: query.timeframe ?? current.timeframe,
      categoryId: query.categoryId !== undefined ? query.categoryId : current.categoryId,
    };
    const nextKey = getLeaderboardKey(next);
    set((state) => ({
      currentQuery: next,
      isLoading: !!state.loadingByKey[nextKey],
      error: state.errorByKey[nextKey] ?? null,
    }));
    void get().fetchCurrentLeaderboard();
  },

  fetchLeaderboard: async (query: LeaderboardQuery, options?: FetchLeaderboardOptions) => {
    const key = getLeaderboardKey(query);

    if (query.scope === 'topic' && !query.categoryId) {
      set((state) => {
        const currentKey = getLeaderboardKey(state.currentQuery);
        return {
          loadingByKey: {
            ...state.loadingByKey,
            [key]: false,
          },
          errorByKey: {
            ...state.errorByKey,
            [key]: null,
          },
          isLoading: currentKey === key ? false : state.isLoading,
          error: currentKey === key ? null : state.error,
        };
      });
      return;
    }

    const nextRequestSeq = (get().requestSeqByKey[key] || 0) + 1;
    set((state) => {
      const currentKey = getLeaderboardKey(state.currentQuery);
      return {
        requestSeqByKey: {
          ...state.requestSeqByKey,
          [key]: nextRequestSeq,
        },
        loadingByKey: {
          ...state.loadingByKey,
          [key]: true,
        },
        errorByKey: {
          ...state.errorByKey,
          [key]: null,
        },
        isLoading: currentKey === key ? true : state.isLoading,
        error: currentKey === key ? null : state.error,
      };
    });

    try {
      const payload = buildRpcPayload(query, options);
      const data = await nakama.rpc<LeaderboardResponse>('get_leaderboard', payload);
      if (data.error) {
        throw new Error(data.error);
      }
      const session = nakama.getSession();
      const leaderboard = transformLeaderboardResponse(data, session?.user_id);

      set((state) => {
        if (state.requestSeqByKey[key] !== nextRequestSeq) {
          return {};
        }

        const currentKey = getLeaderboardKey(state.currentQuery);
        const existing = state.leaderboardsByKey[key];
        const nextLeaderboard = options?.append
          ? mergeLeaderboardPages(existing, leaderboard)
          : leaderboard;
        return {
          leaderboardsByKey: {
            ...state.leaderboardsByKey,
            [key]: nextLeaderboard,
          },
          loadingByKey: {
            ...state.loadingByKey,
            [key]: false,
          },
          errorByKey: {
            ...state.errorByKey,
            [key]: null,
          },
          isLoading: currentKey === key ? false : state.isLoading,
          error: currentKey === key ? null : state.error,
        };
      });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch leaderboard';
      set((state) => {
        if (state.requestSeqByKey[key] !== nextRequestSeq) {
          return {};
        }

        const currentKey = getLeaderboardKey(state.currentQuery);
        return {
          loadingByKey: {
            ...state.loadingByKey,
            [key]: false,
          },
          errorByKey: {
            ...state.errorByKey,
            [key]: errorMessage,
          },
          isLoading: currentKey === key ? false : state.isLoading,
          error: currentKey === key ? errorMessage : state.error,
        };
      });
    }
  },

  fetchNextPage: async (query?: LeaderboardQuery) => {
    const targetQuery = query ?? get().currentQuery;
    const key = getLeaderboardKey(targetQuery);
    const state = get();
    if (state.loadingByKey[key]) {
      return;
    }

    const currentLeaderboard = state.leaderboardsByKey[key];
    if (!currentLeaderboard || !currentLeaderboard.hasMore) {
      return;
    }

    if (currentLeaderboard.nextCursor) {
      await get().fetchLeaderboard(targetQuery, {
        append: true,
        cursor: currentLeaderboard.nextCursor,
      });
      return;
    }

    const baseOffset = typeof currentLeaderboard.offset === 'number'
      ? currentLeaderboard.offset
      : 0;
    const nextOffset = baseOffset + currentLeaderboard.records.length;
    await get().fetchLeaderboard(targetQuery, {
      append: true,
      offset: nextOffset,
    });
  },

  fetchCurrentLeaderboard: async () => {
    const { currentQuery } = get();
    await get().fetchLeaderboard(currentQuery);
  },

  clearError: (query?: LeaderboardQuery) => {
    const targetQuery = query ?? get().currentQuery;
    const key = getLeaderboardKey(targetQuery);
    set((state) => {
      const currentKey = getLeaderboardKey(state.currentQuery);
      return {
        errorByKey: {
          ...state.errorByKey,
          [key]: null,
        },
        error: currentKey === key ? null : state.error,
      };
    });
  },
}));

export default useLeaderboardStore;
