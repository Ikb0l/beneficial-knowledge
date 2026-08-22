// User-related type definitions
import type { CategoryId, PlayerMmr, CategoryMmr, RankTier } from './game';

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
  photoUrl?: string;
}

export interface UserProfile {
  oderId: string;
  odername: string;
  displayName?: string;
  avatarUrl?: string;
  telegramUser?: TelegramUser;
  globalMmr: PlayerMmr;
  categoryMmr: Record<CategoryId, CategoryMmr>;
  createdAt: string;
  lastActiveAt?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  error: string | null;
}

export interface UserStats {
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  currentRank: RankTier;
  peakMmr: number;
  favoriteCategory?: CategoryId;
  longestStreak: number;
}
