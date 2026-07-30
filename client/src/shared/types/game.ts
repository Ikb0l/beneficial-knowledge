// Game-related type definitions

// CategoryId is now dynamic - any category created by admin
export type CategoryId = string;

// Default category keys for fallback UI styling
export type DefaultCategoryKey =
  | 'prophets'
  | 'muhammad'
  | 'abu_bakr'
  | 'umar'
  | 'uthman'
  | 'ali'
  | 'umar_ii_saladin';

export interface Category {
  id: CategoryId;
  name: string;
  icon: string;
  description?: string;
  iconUrl?: string;
  parentId?: CategoryId | null;
  categoryType?: 'normal' | 'vocabulary';
  questionsPerMatch?: number;
  questionsPerMatchOverride?: number | null;
  useGlobalQuestionCount?: boolean;
  timePerQuestion?: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export type QuestionType =
  | 'mcq'
  | 'true_false'
  | 'true_false_not_given'
  | 'heading_match'
  | 'yes_no_not_given';

export interface Question {
  id: string;
  category: CategoryId;
  difficulty: Difficulty;
  questionText: string;
  options: string[];
  questionType?: QuestionType;
  correctIndex: number;
  explanation: string;
  passage?: string;
}

export interface Answer {
  questionIndex: number;
  answerIndex: number;
  timeMs: number;
  correct: boolean;
}

// RankTier can be any string from the server (dynamic)
export type RankTier = string;

// Default rank tier keys for type safety when needed
export type DefaultRankTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'grandmaster';

export interface RankTierInfo {
  id: string;
  tierKey: string;
  name: string;
  minMmr: number;
  maxMmr: number;
  color: string;
  iconUrl?: string;
  displayOrder?: number;
}

export interface PlayerMmr {
  mmr: number;
  rd: number;
  volatility: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  rankTier: RankTier;
  peakMmr: number;
}

export interface CategoryMmr {
  mmr: number;
  rd: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
}

export type MatchPhase =
  | 'idle'
  | 'searching'
  | 'found'
  | 'countdown'
  | 'question'
  | 'reveal'
  | 'ended';

export interface MatchPlayer {
  userId: string;
  username: string;
  avatarUrl?: string;
  mmr: number;
  score: number;
  streak: number;
  connected: boolean;
}

export interface MatchResult {
  winnerId: string | null;
  finalScores: Record<string, number>;
  mmrChanges: Record<string, MmrChange>;
  playerStats: Record<string, PlayerMatchStats>;
  reason?: string;
}

export interface MmrChange {
  // Category MMR (for the specific category played)
  oldMmr: number;
  newMmr: number;
  change: number;
  // Global MMR (shown on global leaderboard)
  globalOldMmr?: number;
  globalNewMmr?: number;
  globalChange?: number;
  // Rank tier based on global MMR
  newRankTier: RankTier | string;
  // Optional: server may include this on partial failures
  updateFailed?: boolean;
}

export interface PlayerMatchStats {
  correctAnswers: number;
  totalAnswers: number;
  averageTime: number;
}

export interface LeaderboardEntry {
  rank: number;
  ownerId: string;
  username: string;
  score: number;
  mmr?: number;
  wins?: number;
  rankTier?: RankTier | string | null;
}

export interface MatchHistoryEntry {
  matchId: string;
  category: CategoryId;
  opponentId: string;
  opponentName: string;
  myScore: number;
  opponentScore: number;
  mmrChange: number;
  won: boolean;
  completedAt: string;
}
