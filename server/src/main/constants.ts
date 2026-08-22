// Beneficial Knowledge - Nakama Server Entry Point

// ============================================================================
// CONSTANTS
// ============================================================================

export var TELEGRAM_BOT_TOKEN = ''; // Set via environment variable

export function setTelegramBotToken(token: string): void {
  TELEGRAM_BOT_TOKEN = String(token || '').trim();
}

export var GAME_CONFIG = {
  QUESTIONS_PER_MATCH: 7,
  TIME_PER_QUESTION_MS: 15000,
  TIME_BETWEEN_QUESTIONS_MS: 5000, // Increased from 3000 for better Beneficial Knowledge-style reveal experience
  DISCONNECT_GRACE_MS: 60000,
  MATCH_END_GRACE_MS: 20000,
  MIN_ANSWER_TIME_MS: 500,
  STARTING_MMR: 1000,
  STARTING_RD: 350,
  STARTING_VOLATILITY: 0.06,
  RANKED_FIXED_MMR_DELTA: 30,
  RANKED_FORFEIT_LOSS_MULTIPLIER: 2,
};

export var QUESTION_HISTORY_MAX = 50;

export var BOT_CONFIG = {
  ANSWER_DELAY_MIN_MS: 1500,
  ANSWER_DELAY_MAX_MS: 9000,
  ACCURACY_EASY: 0.75,
  ACCURACY_MEDIUM: 0.6,
  ACCURACY_HARD: 0.45,
};

// CATEGORIES are now fully database-driven - no hardcoded fallback
// Create categories via the admin dashboard

export var RANK_TIERS: {[key: string]: {min: number, max: number, name: string}} = {
  bronze: { min: 0, max: 1099, name: 'Bronze' },
  silver: { min: 1100, max: 1299, name: 'Silver' },
  gold: { min: 1300, max: 1499, name: 'Gold' },
  platinum: { min: 1500, max: 1699, name: 'Platinum' },
  diamond: { min: 1700, max: 1899, name: 'Diamond' },
  master: { min: 1900, max: 2099, name: 'Master' },
  grandmaster: { min: 2100, max: 10000, name: 'Grandmaster' },
};

// Category validation is now done via database - these are permissive helpers
// Real validation happens in getCategoriesFromDb() and isValidCategoryFromDb()
export function isValidCategory(category: string): boolean {
  // Accept any non-empty string - actual validation against DB happens in match/RPC handlers
  return typeof category === 'string' && category.length > 0;
}

export function normalizeCategory(category: string): string {
  // Return the category as-is if valid, otherwise return empty string
  // The caller should check if the category exists in the database
  return isValidCategory(category) ? category : '';
}

export function normalizeLeaderboardId(value: string | undefined | null): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  if (value === 'global' || value === 'global_mmr') {
    return 'global_mmr';
  }

  if (value === 'weekly' || value === 'weekly_mmr') {
    return 'weekly_mmr';
  }

  if (value === 'daily' || value === 'daily_mmr') {
    return 'daily_mmr';
  }

  if (value === 'monthly' || value === 'monthly_mmr') {
    return 'monthly_mmr';
  }

  if (value.indexOf('category_') === 0) {
    var suffix = value.substring('category_'.length);
    var timeSuffix = '';
    var categoryId = suffix;
    if (suffix.endsWith('_daily')) {
      categoryId = suffix.substring(0, suffix.length - 6);
      timeSuffix = '_daily';
    } else if (suffix.endsWith('_weekly')) {
      categoryId = suffix.substring(0, suffix.length - 7);
      timeSuffix = '_weekly';
    } else if (suffix.endsWith('_monthly')) {
      categoryId = suffix.substring(0, suffix.length - 8);
      timeSuffix = '_monthly';
    }
    return isValidCategory(categoryId) ? 'category_' + categoryId + timeSuffix : null;
  }

  return isValidCategory(value) ? 'category_' + value : null;
}

export function normalizeLeaderboardTimeframe(value: any): string {
  if (typeof value !== 'string') {
    return 'all';
  }
  var normalized = value.toLowerCase().trim();
  if (normalized === 'daily' || normalized === 'day') {
    return 'daily';
  }
  if (normalized === 'weekly' || normalized === 'week') {
    return 'weekly';
  }
  if (normalized === 'monthly' || normalized === 'month') {
    return 'monthly';
  }
  return 'all';
}

export function buildLeaderboardId(categoryId: string | null, timeframe: string): string {
  if (!categoryId) {
    if (timeframe === 'daily') return 'daily_mmr';
    if (timeframe === 'weekly') return 'weekly_mmr';
    if (timeframe === 'monthly') return 'monthly_mmr';
    return 'global_mmr';
  }

  if (timeframe === 'daily') return 'category_' + categoryId + '_daily';
  if (timeframe === 'weekly') return 'category_' + categoryId + '_weekly';
  if (timeframe === 'monthly') return 'category_' + categoryId + '_monthly';
  return 'category_' + categoryId;
}

export function extractCategoryKeyFromLeaderboardId(leaderboardId: string): string | null {
  if (leaderboardId.indexOf('category_') !== 0) {
    return null;
  }
  var suffix = leaderboardId.substring('category_'.length);
  if (suffix.endsWith('_daily')) {
    return suffix.substring(0, suffix.length - 6);
  }
  if (suffix.endsWith('_weekly')) {
    return suffix.substring(0, suffix.length - 7);
  }
  if (suffix.endsWith('_monthly')) {
    return suffix.substring(0, suffix.length - 8);
  }
  return suffix;
}

export function getLeaderboardDisplayName(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  fallback?: string
): string {
  if (fallback && fallback.trim()) {
    return fallback;
  }

  try {
    var telegramData = nk.storageRead([{
      collection: 'player_data', key: 'telegram', userId: userId
    }]);
    if (telegramData[0]?.value?.firstName) {
      var name = telegramData[0].value.firstName;
      if (telegramData[0].value.lastName) {
        name += ' ' + telegramData[0].value.lastName;
      }
      if (name.trim()) return name;
    }
  } catch (e) {
    logger.warn('Could not get telegram display name: ' + e);
  }

  try {
    var account = nk.accountGetId(userId);
    return account.user?.displayName || account.user?.username || fallback || '';
  } catch (e) {
    logger.warn('Could not get account display name: ' + e);
  }

  return fallback || '';
}

