// Season Store
import { create } from 'zustand';
import nakama from '../shared/lib/nakama';

export interface Season {
  id: string;
  seasonNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  rewardConfig: Record<string, unknown>;
}

export interface SeasonRanking {
  rank?: number;
  mmr: number;
  peakMmr: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  mmr: number;
  peakMmr: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface SeasonState {
  currentSeason: Season | null;
  userRanking: SeasonRanking | null;
  leaderboard: LeaderboardEntry[];
  topPlayers: LeaderboardEntry[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchCurrentSeason: () => Promise<void>;
  fetchLeaderboard: (limit?: number, offset?: number) => Promise<void>;
  reset: () => void;
}

export const useSeasonStore = create<SeasonState>((set) => ({
  currentSeason: null,
  userRanking: null,
  leaderboard: [],
  topPlayers: [],
  isLoading: false,
  error: null,

  fetchCurrentSeason: async () => {
    try {
      set({ isLoading: true, error: null });
      const data = await nakama.rpc<{
        season: Season | null;
        userRanking: SeasonRanking | null;
        topPlayers: LeaderboardEntry[];
      }>('get_current_season', {});

      set({
        currentSeason: data.season || null,
        userRanking: data.userRanking || null,
        topPlayers: data.topPlayers || [],
        isLoading: false,
      });
    } catch (error) {
      console.error('Error fetching current season:', error);
      set({ error: 'Failed to load season', isLoading: false });
    }
  },

  fetchLeaderboard: async (limit = 50, offset = 0) => {
    try {
      set({ isLoading: true, error: null });
      const data = await nakama.rpc<{ leaderboard: LeaderboardEntry[] }>('get_season_leaderboard', { limit, offset });
      set({ leaderboard: data.leaderboard || [], isLoading: false });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      set({ error: 'Failed to load leaderboard', isLoading: false });
    }
  },

  reset: () => {
    set({
      currentSeason: null,
      userRanking: null,
      leaderboard: [],
      topPlayers: [],
      isLoading: false,
      error: null,
    });
  },
}));
