// Scoring system constants

export const SCORING = {
  // Base points for correct answer
  BASE_CORRECT: 100,
  BASE_WRONG: 0,

  // Speed bonuses based on time remaining (out of 15 seconds)
  // Aligned with server: server uses elapsed time, we convert to remaining time
  SPEED_BONUS: {
    TIER_1: { minTime: 12, bonus: 50 },  // 12-15s remaining (answered in 0-3s)
    TIER_2: { minTime: 10, bonus: 35 },  // 10-12s remaining (answered in 3-5s)
    TIER_3: { minTime: 7, bonus: 20 },   // 7-10s remaining (answered in 5-8s)
    TIER_4: { minTime: 5, bonus: 10 },   // 5-7s remaining (answered in 8-10s)
    TIER_5: { minTime: 0, bonus: 0 },    // 0-5s remaining (answered in 10+s)
  },

  // Streak bonuses
  STREAK_BONUS: {
    2: 10,   // 2 in a row
    3: 25,   // 3 in a row
    4: 40,   // 4 in a row
    5: 60,   // 5+ in a row
  },

  // Time limits
  TIME_PER_QUESTION: 15, // seconds
  TIME_BETWEEN_QUESTIONS: 3, // seconds
  MIN_ANSWER_TIME: 0.5, // seconds (anti-cheat)
};

export const MATCH_CONFIG = {
  QUESTIONS_PER_MATCH: 7,
  DIFFICULTY_DISTRIBUTION: {
    easy: 2,    // Questions 1-2
    medium: 3,  // Questions 3-5
    hard: 2,    // Questions 6-7
  },
};

export const MMR_CONFIG = {
  STARTING_MMR: 1000,
  STARTING_RD: 350,
  STARTING_VOLATILITY: 0.06,
  MIN_MMR: 0,
  MAX_MMR: 10000,
  K_FACTOR_BASE: 32,
  K_FACTOR_PROVISIONAL: 64,  // First 10 games
  K_FACTOR_CALIBRATING: 48,  // Games 11-30
  K_FACTOR_ESTABLISHED: 24,  // After 100 games
};

export const calculateSpeedBonus = (timeRemainingSeconds: number): number => {
  const { SPEED_BONUS } = SCORING;

  if (timeRemainingSeconds >= SPEED_BONUS.TIER_1.minTime) return SPEED_BONUS.TIER_1.bonus;
  if (timeRemainingSeconds >= SPEED_BONUS.TIER_2.minTime) return SPEED_BONUS.TIER_2.bonus;
  if (timeRemainingSeconds >= SPEED_BONUS.TIER_3.minTime) return SPEED_BONUS.TIER_3.bonus;
  if (timeRemainingSeconds >= SPEED_BONUS.TIER_4.minTime) return SPEED_BONUS.TIER_4.bonus;
  return SPEED_BONUS.TIER_5.bonus;
};

export const calculateStreakBonus = (streak: number): number => {
  const { STREAK_BONUS } = SCORING;

  if (streak >= 5) return STREAK_BONUS[5];
  if (streak >= 4) return STREAK_BONUS[4];
  if (streak >= 3) return STREAK_BONUS[3];
  if (streak >= 2) return STREAK_BONUS[2];
  return 0;
};

export const calculateTotalScore = (
  isCorrect: boolean,
  timeRemainingSeconds: number,
  currentStreak: number
): { base: number; speedBonus: number; streakBonus: number; total: number } => {
  if (!isCorrect) {
    return { base: 0, speedBonus: 0, streakBonus: 0, total: 0 };
  }

  const base = SCORING.BASE_CORRECT;
  const speedBonus = calculateSpeedBonus(timeRemainingSeconds);
  const streakBonus = calculateStreakBonus(currentStreak + 1); // +1 because this answer adds to streak

  return {
    base,
    speedBonus,
    streakBonus,
    total: base + speedBonus + streakBonus,
  };
};

// Maximum theoretical score per question: 100 + 50 + 60 = 210
export const MAX_SCORE_PER_QUESTION = 210;

// Maximum theoretical match score: 7 * 210 = 1470
export const MAX_MATCH_SCORE = MATCH_CONFIG.QUESTIONS_PER_MATCH * MAX_SCORE_PER_QUESTION;

// ============================================================================
// MATCHMAKING CONFIGURATION
// ============================================================================

export const MATCHMAKING_CONFIG = {
  // Base MMR range for initial matchmaking
  BASE_RANGE: 100,

  // Progressive expansion of MMR range over time
  EXPANSION_STEPS: [
    { afterMs: 10000, range: 200, useRegion: true },
    { afterMs: 20000, range: 400, useRegion: true },
    { afterMs: 30000, range: 800, useRegion: false },
    { afterMs: 45000, range: 1200, useRegion: false },
  ] as const,

  // Timeout before falling back to bot match
  BOT_MATCH_TIMEOUT_MS: 60000,
};

// ============================================================================
// TIMING CONFIGURATION
// ============================================================================

export const TIMING_CONFIG = {
  // Safety buffer for time calculations to account for latency
  SAFETY_BUFFER_MS: 50,

  // Delay before auto-refreshing profile after match
  PROFILE_REFRESH_DELAY_MS: 500,

  // Delay before auto-refreshing leaderboard after match
  LEADERBOARD_REFRESH_DELAY_MS: 1000,

  // Maximum allowed time drift between client and server
  MAX_TIME_DRIFT_MS: 5 * 60 * 1000, // 5 minutes

  // Maximum server time offset
  MAX_OFFSET_MS: 60000, // 60 seconds

  // Maximum jump in offset between time syncs
  MAX_OFFSET_JUMP_MS: 5000, // 5 seconds
};

// ============================================================================
// PAGINATION CONFIGURATION
// ============================================================================

export const PAGINATION_CONFIG = {
  // Default page size for list views
  DEFAULT_PAGE_SIZE: 20,
};
