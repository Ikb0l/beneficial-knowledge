// Game Config - Hardcoded values (no server fetch needed)

export const GAME_CONFIG = {
  // Scoring
  baseCorrectPoints: 100,
  speedBonusTier1: 50,
  speedBonusTier2: 35,
  speedBonusTier3: 20,
  speedBonusTier4: 10,
  streakBonus2: 10,
  streakBonus3: 25,
  streakBonus4: 40,
  streakBonus5Plus: 60,

  // Match settings
  questionsPerMatch: 7,
  timePerQuestionMs: 15000,
  revealDelayMs: 3000,
  matchmakingTimeoutMs: 60000,
  botEnabled: true,

  // Rewards
  dailyCoinReward: 100,
  streakBonusMultiplier: 1.5,
  matchWinCoins: 50,
  matchParticipationCoins: 10,

  // Question counts by mode
  questionCounts: {
    default: 10,
    quick: 5,
    standard: 10,
    marathon: 20,
    tournament: 15,
  },
} as const;

export const MATCHMAKING_CONFIG = {
  initialRange: 100,
  expansionRate: 10,
  maxRange: 500,
  expansionInterval: 5,
} as const;

// Helper functions for components
export function getTimePerQuestion(): number {
  return GAME_CONFIG.timePerQuestionMs;
}

export function getQuestionsPerMatch(mode?: string): number {
  const counts = GAME_CONFIG.questionCounts;
  if (mode && mode in counts) {
    return counts[mode as keyof typeof counts];
  }
  return counts.default;
}

export function getMatchmakingConfig() {
  return MATCHMAKING_CONFIG;
}
