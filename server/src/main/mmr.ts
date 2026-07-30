import { clampMmr, getRankTierForMmr, getRankTiersFromDb } from './config';
import { GAME_CONFIG, getLeaderboardDisplayName } from './constants';
import { Glicko2Rating } from './glicko';
import { updateCategoryTimeLeaderboards, updateTimeBasedLeaderboards } from './tournament-advance';
import { getStorageValueByKey } from './utils';

const MAX_MATCH_HISTORY = 500;

export function calculateFixedMmrRating(
  player: Glicko2Rating,
  score: number,
  logger: nkruntime.Logger,
  mmrDelta: number = GAME_CONFIG.RANKED_FIXED_MMR_DELTA,
  mmrFloor?: number,
  mmrCeiling?: number
): { newRating: Glicko2Rating; ratingChange: number } {
  var safeDelta = Number.isFinite(mmrDelta) ? Math.max(0, Math.floor(Math.abs(mmrDelta))) : 0;
  var minRating = typeof mmrFloor === 'number' ? mmrFloor : 100;
  var maxRating = typeof mmrCeiling === 'number' ? mmrCeiling : 10000;
  if (maxRating < minRating) {
    maxRating = minRating;
  }

  var targetRating = player.rating;
  if (score === 1) {
    targetRating = player.rating + safeDelta;
  } else if (score === 0) {
    targetRating = player.rating - safeDelta;
  }

  var newRatingValue = Math.min(maxRating, Math.max(minRating, targetRating));
  var ratingChange = newRatingValue - player.rating;
  logger.info(
    'Fixed ranked MMR calculation: '
    + player.rating
    + ' -> '
    + newRatingValue
    + ' (change: '
    + ratingChange
    + ', score: '
    + score
    + ', delta: '
    + safeDelta
    + ')'
  );

  return {
    newRating: {
      rating: newRatingValue,
      rd: player.rd,
      volatility: player.volatility,
    },
    ratingChange: ratingChange,
  };
}

// Update player MMR in storage and leaderboards
// Returns true if storage update succeeded, false otherwise
export function updatePlayerMmr(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  category: string,
  categoryRating: Glicko2Rating,
  globalRating: Glicko2Rating,
  isWin: boolean,
  isDraw: boolean
): boolean {
  try {
    // Read current data
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'global_mmr', userId: userId },
      { collection: 'player_data', key: 'category_mmr', userId: userId },
    ];
    var results = nk.storageRead(reads);

    // Update global MMR
    var globalMmr = getStorageValueByKey(results, 'global_mmr') || {
      mmr: GAME_CONFIG.STARTING_MMR,
      rd: GAME_CONFIG.STARTING_RD,
      volatility: GAME_CONFIG.STARTING_VOLATILITY,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      rankTier: 'bronze',
      peakMmr: GAME_CONFIG.STARTING_MMR,
    };

    var appliedGlobal = globalRating || categoryRating;
    var oldRankTier = globalMmr.rankTier || 'bronze';
    globalMmr.mmr = clampMmr(nk, logger, appliedGlobal.rating);
    globalMmr.rd = appliedGlobal.rd;
    globalMmr.volatility = appliedGlobal.volatility;
    globalMmr.gamesPlayed = (globalMmr.gamesPlayed || 0) + 1;
    if (isWin) globalMmr.wins = (globalMmr.wins || 0) + 1;
    else if (isDraw) globalMmr.draws = (globalMmr.draws || 0) + 1;
    else globalMmr.losses = (globalMmr.losses || 0) + 1;
    var newRankTier = getRankTierKeyForMmr(nk, logger, globalMmr.mmr);
    globalMmr.rankTier = newRankTier;
    if (globalMmr.mmr > (globalMmr.peakMmr || 0)) {
      globalMmr.peakMmr = globalMmr.mmr;
    }

    // Record rank-up activity if rank changed to higher tier
    var tiers = getRankTiersFromDb(nk, logger);
    var rankTierOrder: { [key: string]: number } = {};
    for (var t = 0; t < tiers.length; t++) {
      rankTierOrder[tiers[t].tierKey] = tiers[t].displayOrder || t;
    }
    if (oldRankTier !== newRankTier && (rankTierOrder[newRankTier] || 0) > (rankTierOrder[oldRankTier] || 0)) {
      recordActivity(nk, logger, userId, {
        type: 'rank_up',
        timestamp: Date.now(),
        data: {
          oldRank: oldRankTier,
          newRank: newRankTier,
          mmr: globalMmr.mmr,
        },
      });
    }

    // Update category MMR
    var categoryMmr = getStorageValueByKey(results, 'category_mmr') || {};
    if (!categoryMmr[category]) {
      categoryMmr[category] = {
        mmr: GAME_CONFIG.STARTING_MMR,
        rd: GAME_CONFIG.STARTING_RD,
        volatility: GAME_CONFIG.STARTING_VOLATILITY,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
      };
    }
    categoryMmr[category].mmr = clampMmr(nk, logger, categoryRating.rating);
    categoryMmr[category].rd = categoryRating.rd;
    categoryMmr[category].volatility = categoryRating.volatility;
    categoryMmr[category].gamesPlayed = (categoryMmr[category].gamesPlayed || 0) + 1;
    if (isWin) categoryMmr[category].wins = (categoryMmr[category].wins || 0) + 1;
    else if (isDraw) categoryMmr[category].draws = (categoryMmr[category].draws || 0) + 1;
    else categoryMmr[category].losses = (categoryMmr[category].losses || 0) + 1;

    // Write updated data
    var writes: nkruntime.StorageWriteRequest[] = [
      {
        collection: 'player_data',
        key: 'global_mmr',
        userId: userId,
        value: globalMmr,
        permissionRead: 2,
        permissionWrite: 0,
      },
      {
        collection: 'player_data',
        key: 'category_mmr',
        userId: userId,
        value: categoryMmr,
        permissionRead: 2,
        permissionWrite: 0,
      },
    ];

    // Write to storage with error handling
    try {
      nk.storageWrite(writes);
      logger.debug('Successfully wrote MMR to storage for user ' + userId);
    } catch (storageError) {
      logger.error('Failed to write MMR to storage for user ' + userId + ': ' + storageError);
      // Don't proceed with leaderboard writes if storage failed
      throw storageError;
    }

    // Get user's display name for leaderboard
    var displayName = getLeaderboardDisplayName(nk, logger, userId, '');

    // Update global leaderboard with error handling
    // Use Math.round to ensure integer values for leaderboard scores
    var globalMmrInt = Math.round(globalMmr.mmr);
    var categoryMmrInt = Math.round(categoryMmr[category].mmr);

    try {
      nk.leaderboardRecordWrite('global_mmr', userId, displayName, globalMmrInt, undefined, undefined);
    } catch (leaderboardError) {
      logger.error('Failed to write global leaderboard for user ' + userId + ': ' + leaderboardError);
    }

    // Update category leaderboards with error handling
    try {
      updateCategoryTimeLeaderboards(nk, logger, userId, displayName, category, categoryMmrInt);
    } catch (leaderboardError) {
      logger.error('Failed to write category leaderboards (' + category + ') for user ' + userId + ': ' + leaderboardError);
    }

    // Update time-based global leaderboards to reflect current MMR
    updateTimeBasedLeaderboards(nk, logger, userId, displayName, appliedGlobal.rating);

    logger.info('Updated MMR for user ' + userId + ': ' + appliedGlobal.rating + ' (rank: ' + globalMmr.rankTier + ')');
    return true;
  } catch (error) {
    logger.error('Error updating player MMR: ' + error);
    return false;
  }
}

export function getRankTierKeyForMmr(nk: nkruntime.Nakama, logger: nkruntime.Logger, mmr: number): string {
  var tier = getRankTierForMmr(nk, logger, mmr);
  return tier?.tierKey || 'bronze';
}

export function buildActivityDescription(activityType: string, data?: any): string {
  switch (activityType) {
    case 'match_win':
      return data?.category
        ? 'Won a match in ' + data.category
        : 'Won a match';
    case 'rank_up':
      return data?.newRank
        ? 'Ranked up to ' + data.newRank
        : 'Ranked up';
    case 'perfect_game':
      return data?.category
        ? 'Perfect game in ' + data.category
        : 'Perfect game';
    case 'win_streak':
      return data?.streak
        ? 'Reached a win streak of ' + data.streak
        : 'Reached a win streak';
    default:
      return 'New activity';
  }
}

// Helper function to record activity for friend activity feed
export function recordActivity(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  activity: {
    type: 'match_win' | 'match_loss' | 'win_streak' | 'rank_up' | 'perfect_game';
    timestamp: number;
    data?: any;
    description?: string;
  }
): void {
  try {
    // Get user info for the activity
    var userInfoReads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'telegram', userId: userId },
      { collection: 'player_data', key: 'global_mmr', userId: userId },
    ];
    var userInfoResults = nk.storageRead(userInfoReads);
    var telegramData = getStorageValueByKey(userInfoResults, 'telegram');
    var mmrData = getStorageValueByKey(userInfoResults, 'global_mmr') || { mmr: GAME_CONFIG.STARTING_MMR, rankTier: 'bronze' };

    var displayName = 'Player';
    var avatarUrl = '';
    if (telegramData) {
      displayName = telegramData.firstName || telegramData.username || displayName;
      avatarUrl = telegramData.photoUrl || '';
    }

    // Read existing activities
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'recent_activity', userId: userId },
    ];
    var results = nk.storageRead(reads);
    var activityData = results[0]?.value || { activities: [] };

    var description = activity.description || buildActivityDescription(activity.type, activity.data);

    // Add new activity with user info
    var newActivity = {
      userId: userId,
      displayName: displayName,
      avatarUrl: avatarUrl,
      type: activity.type,
      timestamp: activity.timestamp,
      description: description,
      data: activity.data || {},
    };

    activityData.activities.unshift(newActivity);

    // Keep only last 20 activities per user
    if (activityData.activities.length > 20) {
      activityData.activities = activityData.activities.slice(0, 20);
    }

    // Write back
    var writes: nkruntime.StorageWriteRequest[] = [
      {
        collection: 'player_data',
        key: 'recent_activity',
        userId: userId,
        value: activityData,
        permissionRead: 2,  // Public read so friends can see
        permissionWrite: 0,
      },
    ];
    nk.storageWrite(writes);
  } catch (error) {
    logger.warn('Error recording activity: ' + error);
    // Non-critical, don't throw
  }
}

// Save match to player's history
export function saveMatchHistory(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  playerId: string,
  matchData: {
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
): void {
  // Retry loop for optimistic concurrency control
  var maxRetries = 3;
  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Read existing history with version
      var reads: nkruntime.StorageReadRequest[] = [
        { collection: 'player_data', key: 'match_history', userId: playerId },
      ];
      var results = nk.storageRead(reads);
      var existingRecord = results[0];
      var history = existingRecord?.value || { matches: [] };
      var version = existingRecord?.version || '';

      // Add new match at the beginning
      history.matches.unshift(matchData);

      // Keep only most recent matches
      if (history.matches.length > MAX_MATCH_HISTORY) {
        history.matches = history.matches.slice(0, MAX_MATCH_HISTORY);
      }

      // Write back with version for optimistic locking
      var writes: nkruntime.StorageWriteRequest[] = [
        {
          collection: 'player_data',
          key: 'match_history',
          userId: playerId,
          value: history,
          permissionRead: 2,
          permissionWrite: 0,
          version: version || undefined, // Only set version if we had an existing record
        },
      ];
      nk.storageWrite(writes);
      logger.debug('Saved match history for player ' + playerId);
      break; // Success, exit retry loop
    } catch (e: any) {
      if (e.message && e.message.indexOf('version') !== -1 && attempt < maxRetries - 1) {
        logger.warn('Match history version conflict for ' + playerId + ', retrying (attempt ' + (attempt + 2) + '/' + maxRetries + ')');
        continue; // Retry
      }
      throw e; // Non-version error or max retries reached
    }
  }

  // Record activity for friend feed (only for wins to reduce noise)
  try {
    if (matchData.result === 'win') {
      recordActivity(nk, logger, playerId, {
        type: 'match_win',
        timestamp: matchData.timestamp,
        data: {
          category: matchData.category,
          score: matchData.playerScore,
          opponentScore: matchData.opponentScore,
          mmrChange: matchData.mmrChange,
        },
      });

      // Check for perfect game
      if (matchData.correctAnswers === matchData.totalQuestions && matchData.totalQuestions > 0) {
        recordActivity(nk, logger, playerId, {
          type: 'perfect_game',
          timestamp: matchData.timestamp,
          data: {
            category: matchData.category,
            questions: matchData.totalQuestions,
          },
        });
      }
    }
  } catch (error) {
    logger.error('Error recording activity: ' + error);
  }
}

export function updatePracticeStats(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  category: string,
  sessionScore: number,
  sessionCorrectAnswers: number,
  sessionTotalQuestions: number
): {
  overallSessionsPlayed: number;
  overallAverageAccuracy: number;
  categorySessionsPlayed: number;
  categoryAverageAccuracy: number;
  categoryBestScore: number;
} {
  var safeCategory = String(category || '').trim() || 'unknown';
  var safeScore = Math.max(0, Math.floor(Number(sessionScore) || 0));
  var safeCorrectAnswers = Math.max(0, Math.floor(Number(sessionCorrectAnswers) || 0));
  var safeTotalQuestions = Math.max(0, Math.floor(Number(sessionTotalQuestions) || 0));
  var now = Date.now();

  var maxRetries = 3;
  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      var reads: nkruntime.StorageReadRequest[] = [
        { collection: 'player_data', key: 'practice_stats', userId: userId },
      ];
      var results = nk.storageRead(reads);
      var existingRecord = results[0];
      var version = existingRecord?.version || '';
      var current = existingRecord?.value || {};

      var categories = current.categories && typeof current.categories === 'object'
        ? current.categories
        : {};
      var currentCategory = categories[safeCategory] && typeof categories[safeCategory] === 'object'
        ? categories[safeCategory]
        : {};

      var nextStats: any = {
        sessionsPlayed: Math.max(0, Math.floor(Number(current.sessionsPlayed) || 0)) + 1,
        totalQuestions: Math.max(0, Math.floor(Number(current.totalQuestions) || 0)) + safeTotalQuestions,
        totalCorrect: Math.max(0, Math.floor(Number(current.totalCorrect) || 0)) + safeCorrectAnswers,
        categories: categories,
        updatedAt: now,
      };

      categories[safeCategory] = {
        sessionsPlayed: Math.max(0, Math.floor(Number(currentCategory.sessionsPlayed) || 0)) + 1,
        totalQuestions: Math.max(0, Math.floor(Number(currentCategory.totalQuestions) || 0)) + safeTotalQuestions,
        totalCorrect: Math.max(0, Math.floor(Number(currentCategory.totalCorrect) || 0)) + safeCorrectAnswers,
        bestScore: Math.max(
          Math.max(0, Math.floor(Number(currentCategory.bestScore) || 0)),
          safeScore
        ),
        lastPlayedAt: now,
      };

      var writes: nkruntime.StorageWriteRequest[] = [
        {
          collection: 'player_data',
          key: 'practice_stats',
          userId: userId,
          value: nextStats,
          permissionRead: 0,
          permissionWrite: 0,
          version: version || undefined,
        },
      ];
      nk.storageWrite(writes);

      var overallAverageAccuracy = nextStats.totalQuestions > 0
        ? Math.round((nextStats.totalCorrect / nextStats.totalQuestions) * 100)
        : 0;
      var categoryAverageAccuracy = categories[safeCategory].totalQuestions > 0
        ? Math.round((categories[safeCategory].totalCorrect / categories[safeCategory].totalQuestions) * 100)
        : 0;

      return {
        overallSessionsPlayed: nextStats.sessionsPlayed,
        overallAverageAccuracy: overallAverageAccuracy,
        categorySessionsPlayed: categories[safeCategory].sessionsPlayed,
        categoryAverageAccuracy: categoryAverageAccuracy,
        categoryBestScore: categories[safeCategory].bestScore,
      };
    } catch (error: any) {
      if (error && error.message && error.message.indexOf('version') !== -1 && attempt < maxRetries - 1) {
        logger.warn(
          'Practice stats version conflict for user ' + userId
          + ', retrying (attempt ' + (attempt + 2) + '/' + maxRetries + ')'
        );
        continue;
      }
      logger.error('Failed to update practice stats for user ' + userId + ': ' + error);
      break;
    }
  }

  var fallbackAccuracy = safeTotalQuestions > 0
    ? Math.round((safeCorrectAnswers / safeTotalQuestions) * 100)
    : 0;
  return {
    overallSessionsPlayed: 1,
    overallAverageAccuracy: fallbackAccuracy,
    categorySessionsPlayed: 1,
    categoryAverageAccuracy: fallbackAccuracy,
    categoryBestScore: safeScore,
  };
}

export function buildMatchQuestionsData(state: any, player1: any, player2: any): any[] {
  var questions: any[] = [];
  var askedCount = typeof state.questionsAsked === 'number'
    ? state.questionsAsked
    : (state.questions ? state.questions.length : 0);

  for (var i = 0; i < askedCount; i++) {
    var question = state.questions && state.questions[i] ? state.questions[i] : null;
    if (!question) continue;

    var p1Answer = null;
    for (var a1 = 0; a1 < player1.answers.length; a1++) {
      if (player1.answers[a1].questionIndex === i) {
        p1Answer = player1.answers[a1];
        break;
      }
    }

    var p2Answer = null;
    for (var a2 = 0; a2 < player2.answers.length; a2++) {
      if (player2.answers[a2].questionIndex === i) {
        p2Answer = player2.answers[a2];
        break;
      }
    }

    questions.push({
      questionId: question.id || '',
      questionText: question.questionText || question.text || '',
      correctIndex: typeof question.correctIndex === 'number' ? question.correctIndex : (question.correct_index || 0),
      player1Answer: p1Answer ? p1Answer.answerIndex : null,
      player1TimeMs: p1Answer ? p1Answer.timeMs : null,
      player2Answer: p2Answer ? p2Answer.answerIndex : null,
      player2TimeMs: p2Answer ? p2Answer.timeMs : null,
    });
  }

  return questions;
}

export function recordMatchHistorySql(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  data: {
    matchId: string;
    category: string;
    player1Id: string;
    player2Id: string;
    player1Score: number;
    player2Score: number;
    winnerId: string | null;
    player1MmrBefore: number;
    player2MmrBefore: number;
    player1MmrAfter: number;
    player2MmrAfter: number;
    questionsData: any[];
    durationSeconds: number;
  }
): void {
  try {
    nk.sqlExec(
      `INSERT INTO match_history
       (match_id, category, player1_id, player2_id, player1_score, player2_score, winner_id,
        player1_mmr_before, player2_mmr_before, player1_mmr_after, player2_mmr_after, questions_data, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
      [
        data.matchId,
        data.category,
        data.player1Id,
        data.player2Id,
        data.player1Score,
        data.player2Score,
        data.winnerId,
        data.player1MmrBefore,
        data.player2MmrBefore,
        data.player1MmrAfter,
        data.player2MmrAfter,
        JSON.stringify(data.questionsData || []),
        data.durationSeconds,
      ]
    );
  } catch (error) {
    logger.warn('Failed to write match_history: ' + error);
  }
}

// Update player performance stats
export function updatePlayerStats(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  playerId: string,
  correctAnswers: number,
  totalAnswers: number,
  averageTime: number,
  currentStreak: number,
  isPerfectGame: boolean,
  isChallengeWin: boolean
): void {
  try {
    // Read existing stats
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'stats', userId: playerId },
    ];
    var results = nk.storageRead(reads);
    var stats = results[0]?.value || {
      totalQuestions: 0,
      correctAnswers: 0,
      averageResponseTime: 0,
      longestStreak: 0,
      currentStreak: 0,
      perfectGames: 0,
      challengeWins: 0,
    };

    // Update stats
    var oldTotal = stats.totalQuestions || 0;
    var oldAvg = stats.averageResponseTime || 0;

    stats.totalQuestions = oldTotal + totalAnswers;
    stats.correctAnswers = (stats.correctAnswers || 0) + correctAnswers;

    // Calculate rolling average response time
    if (stats.totalQuestions > 0) {
      stats.averageResponseTime = ((oldAvg * oldTotal) + (averageTime * totalAnswers)) / stats.totalQuestions;
    }

    // Update streak
    if (currentStreak > (stats.longestStreak || 0)) {
      stats.longestStreak = currentStreak;
    }
    stats.currentStreak = currentStreak;

    // Update perfect games
    if (isPerfectGame) {
      stats.perfectGames = (stats.perfectGames || 0) + 1;
    }

    if (isChallengeWin) {
      stats.challengeWins = (stats.challengeWins || 0) + 1;
    }

    // Write back
    var writes: nkruntime.StorageWriteRequest[] = [
      {
        collection: 'player_data',
        key: 'stats',
        userId: playerId,
        value: stats,
        permissionRead: 2,
        permissionWrite: 0,
      },
    ];
    nk.storageWrite(writes);
    logger.debug('Updated stats for player ' + playerId);
  } catch (error) {
    logger.error('Error updating player stats: ' + error);
  }
}

// ============================================================================
