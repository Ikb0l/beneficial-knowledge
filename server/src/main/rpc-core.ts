import { requireAdmin } from './admin';
import { getCategoriesFromDb, getPlayableCategoryKeys, getQuestionsPerMatch, getTimePerQuestionMs, isValidCategoryFromDb } from './config';
import {
  GAME_CONFIG,
  RANK_TIERS,
  buildLeaderboardId,
  extractCategoryKeyFromLeaderboardId,
  isValidCategory,
  normalizeCategory,
  normalizeLeaderboardId,
  normalizeLeaderboardTimeframe,
} from './constants';
import { isMutualFriend, listFriendsPaged } from './friends';
import { randomizeOptionsForQuestions, selectQuestions } from './match-helpers';
import { getRankTierKeyForMmr } from './mmr';
import { getOwnerRecordFromList, resolveAvatarUrl, resolveDisplayName } from './utils';

function normalizeMatchHistoryRecord(item: any): any | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  if (typeof item.matchId !== 'string' || item.matchId.length === 0) {
    return null;
  }

  var normalizeNumber = function(value: any): number {
    if (typeof value === 'number' && isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.length > 0) {
      var trimmed = value.trim();
      var parsed = Number(trimmed);
      if (isFinite(parsed)) {
        return parsed;
      }
      var parsedDate = Date.parse(trimmed);
      if (isFinite(parsedDate)) {
        return parsedDate;
      }
    }
    return 0;
  };

  var normalizeTimestamp = function(value: any): number {
    var parsed = Math.floor(normalizeNumber(value));
    if (parsed <= 0) {
      return 0;
    }
    // Legacy records may store UNIX seconds; normalize to milliseconds.
    if (parsed < 100000000000) {
      return parsed * 1000;
    }
    return parsed;
  };

  var normalizeResult = function(value: any): 'win' | 'loss' | 'draw' {
    if (typeof value === 'string') {
      var normalized = value.toLowerCase();
      if (normalized === 'win' || normalized === 'loss' || normalized === 'draw') {
        return normalized as 'win' | 'loss' | 'draw';
      }
    }
    return 'draw';
  };

  var opponentId = typeof item.opponentId === 'string' ? item.opponentId : '';
  var timestamp = normalizeTimestamp(item.timestamp);
  var isBotMatch = item.isBotMatch === true
    || opponentId === 'bot'
    || opponentId.indexOf('bot_') === 0;

  return {
    matchId: item.matchId,
    category: typeof item.category === 'string' ? item.category : 'Unknown',
    opponentId: opponentId,
    opponentName: typeof item.opponentName === 'string' ? item.opponentName : 'Opponent',
    playerScore: normalizeNumber(item.playerScore),
    opponentScore: normalizeNumber(item.opponentScore),
    result: normalizeResult(item.result),
    mmrChange: normalizeNumber(item.mmrChange),
    newMmr: normalizeNumber(item.newMmr),
    correctAnswers: normalizeNumber(item.correctAnswers),
    totalQuestions: normalizeNumber(item.totalQuestions),
    timestamp: timestamp,
    isFriendChallenge: item.isFriendChallenge === true,
    isBotMatch: isBotMatch,
  };
}

function normalizeMatchHistoryRecords(matches: any): any[] {
  if (!Array.isArray(matches)) {
    return [];
  }

  var normalized: any[] = [];
  var seenMatchIds: { [key: string]: boolean } = {};
  for (var i = 0; i < matches.length; i++) {
    var record = normalizeMatchHistoryRecord(matches[i]);
    if (!record) {
      continue;
    }
    if (seenMatchIds[record.matchId]) {
      continue;
    }
    seenMatchIds[record.matchId] = true;
    normalized.push(record);
  }

  normalized.sort(function(a: any, b: any) {
    return b.timestamp - a.timestamp;
  });

  return normalized;
}

function resolveAccountUserId(accountUser: any, fallbackUserId: string): string {
  if (!accountUser || typeof accountUser !== 'object') {
    return fallbackUserId;
  }
  var candidates = [
    accountUser.id,
    accountUser.userId,
    accountUser.user_id,
    accountUser.Id,
    accountUser.UserId,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return fallbackUserId;
}

function resolveAccountUsername(accountUser: any): string {
  if (!accountUser || typeof accountUser !== 'object') {
    return '';
  }
  var candidates = [
    accountUser.username,
    accountUser.userName,
    accountUser.user_name,
    accountUser.Username,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return '';
}

// ============================================================================
// RPC HANDLERS
// ============================================================================

// Health check endpoint - returns server status
export function rpcHealthCheck(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  return JSON.stringify({
    status: 'healthy',
    timestamp: Date.now(),
    version: '1.0.0',
  });
}

// Server status endpoint - returns detailed server metrics
export function rpcServerStatus(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    // Get active match count
    var matchList = nk.matchList(100, true, undefined, undefined, undefined, undefined);
    var activeMatches = matchList ? matchList.length : 0;

    // Get leaderboard record counts for player estimates
    var leaderboardSampleLimit = 1000;
    var globalLeaderboard = nk.leaderboardRecordsList('global_mmr', [], leaderboardSampleLimit, undefined, 0);
    var totalPlayers = globalLeaderboard && globalLeaderboard.records
      ? globalLeaderboard.records.length
      : 0;

    return JSON.stringify({
      status: 'healthy',
      timestamp: Date.now(),
      version: '1.0.0',
      metrics: {
        activeMatches: activeMatches,
        registeredPlayers: totalPlayers,
        registeredPlayersSampleLimit: leaderboardSampleLimit,
        categories: Object.keys(getCategoriesFromDb(nk, logger)).length,
      },
      config: {
        questionsPerMatch: getQuestionsPerMatch(nk, logger),
        timePerQuestion: getTimePerQuestionMs(nk, logger) / 1000,
        rankTiers: Object.keys(RANK_TIERS).length,
      },
    });
  } catch (error) {
    logger.error('Error getting server status: ' + error);
    return JSON.stringify({
      status: 'degraded',
      timestamp: Date.now(),
      error: 'Failed to retrieve full status',
    });
  }
}

// Get online players count (for display purposes)
export function rpcGetOnlineStats(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var matchList = nk.matchList(1000, true, undefined, undefined, undefined, undefined);
    var activeMatches = matchList ? matchList.length : 0;
    var playersInMatches = activeMatches * 2; // 2 players per match
    var onlineWindowSeconds = 120;
    var onlineResult = nk.sqlQuery(
      `SELECT COUNT(*) as count
       FROM storage
       WHERE collection = 'presence'
         AND key = 'online'
         AND update_time > NOW() - INTERVAL '` + onlineWindowSeconds + ` seconds'`
    );
    var onlineRows = Array.isArray(onlineResult) ? onlineResult : [];
    var onlineCount = onlineRows.length > 0
      ? parseInt(onlineRows[0].count, 10)
      : 0;

    return JSON.stringify({
      playersOnline: onlineCount,
      activeMatches: activeMatches,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error getting online stats: ' + error);
    return JSON.stringify({
      playersOnline: 0,
      activeMatches: 0,
      timestamp: Date.now(),
    });
  }
}

// RPC: Online presence ping (updates last seen)
export function rpcOnlinePing(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    if (!ctx.userId) {
      throw new Error('User ID required');
    }
    var now = Date.now();
    var write: nkruntime.StorageWriteRequest = {
      collection: 'presence',
      key: 'online',
      userId: ctx.userId,
      value: { lastSeen: now },
      permissionRead: 1,
      permissionWrite: 0,
    };
    nk.storageWrite([write]);
    return JSON.stringify({ ok: true, timestamp: now });
  } catch (error) {
    logger.error('Online ping error: ' + error);
    return JSON.stringify({ ok: false, error: 'Online ping failed' });
  }
}

export function rpcGetProfile(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var userId = ctx.userId;
  if (!userId) {
    throw new Error('User ID required');
  }

  try {
    var account = nk.accountGetId(userId);
    var accountUserId = resolveAccountUserId(account.user, userId);
    var accountUsername = resolveAccountUsername(account.user);
    var storageReadReqs: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'global_mmr', userId: userId },
      { collection: 'player_data', key: 'telegram', userId: userId },
      { collection: 'player_data', key: 'profile_overrides', userId: userId },
    ];
    var storageResults = nk.storageRead(storageReadReqs);

    // Find results by key (Nakama only returns existing keys, not in order)
    var findStorageByKey = function(key: string): any {
      for (var i = 0; i < storageResults.length; i++) {
        if (storageResults[i].key === key) {
          return storageResults[i].value;
        }
      }
      return null;
    };

    var globalMmr = findStorageByKey('global_mmr') || {
      mmr: GAME_CONFIG.STARTING_MMR,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      rankTier: 'bronze',
      peakMmr: GAME_CONFIG.STARTING_MMR,
    };
    var telegramData = findStorageByKey('telegram') || {};
    var overrides = findStorageByKey('profile_overrides') || {};

    var displayName = resolveDisplayName(account.user, telegramData, overrides);
    var avatarUrl = resolveAvatarUrl(account.user, telegramData, overrides);

    logger.info('get_profile for ' + userId + ': displayName=' + displayName + ', avatarUrl=' + (avatarUrl || 'none'));

    return JSON.stringify({
      userId: accountUserId,
      username: accountUsername,
      displayName: displayName,
      avatarUrl: avatarUrl,
      globalMmr: globalMmr,
    });
  } catch (error) {
    logger.error('Error getting profile: ' + error);
    throw error;
  }
}

// RPC: Get detailed profile with all stats
export function rpcGetDetailedProfile(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var request = JSON.parse(payload || '{}');
  var userId = request.userId || ctx.userId;

  if (!userId) {
    throw new Error('User ID required');
  }
  if (ctx.userId && userId !== ctx.userId) {
    if (!isMutualFriend(nk, ctx.userId, userId)) {
      throw new Error('Forbidden');
    }
  }

  try {
    var account = nk.accountGetId(userId);
    var accountUserId = resolveAccountUserId(account.user, userId);
    var accountUsername = resolveAccountUsername(account.user);

    // Read all player data
    var storageReadRequests: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'global_mmr', userId: userId },
      { collection: 'player_data', key: 'category_mmr', userId: userId },
      { collection: 'player_data', key: 'stats', userId: userId },
      { collection: 'player_data', key: 'telegram', userId: userId },
      { collection: 'player_data', key: 'match_history', userId: userId },
      { collection: 'player_data', key: 'profile_overrides', userId: userId },
    ];
    var storageResults = nk.storageRead(storageReadRequests);

    // Find results by key (Nakama only returns existing keys, not in order)
    var findByKey = function(key: string): any {
      for (var i = 0; i < storageResults.length; i++) {
        if (storageResults[i].key === key) {
          return storageResults[i].value;
        }
      }
      return null;
    };

    var globalMmr = findByKey('global_mmr') || {
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

    var categoryMmr = findByKey('category_mmr') || {};
    var stats = findByKey('stats') || {
      totalQuestions: 0,
      correctAnswers: 0,
      averageResponseTime: 0,
      longestStreak: 0,
      currentStreak: 0,
      perfectGames: 0,
      challengeWins: 0,
    };
    var telegramData = findByKey('telegram') || {};
    var matchHistoryData = findByKey('match_history');
    var overrides = findByKey('profile_overrides') || {};
    var matchHistory = normalizeMatchHistoryRecords(matchHistoryData?.matches);

    // Calculate win rate
    var winRate = globalMmr.gamesPlayed > 0
      ? Math.round((globalMmr.wins / globalMmr.gamesPlayed) * 100)
      : 0;

    // Calculate accuracy
    var accuracy = stats.totalQuestions > 0
      ? Math.round((stats.correctAnswers / stats.totalQuestions) * 100)
      : 0;

    // Build category stats array from database categories
    var categoryStats = [];
    var dbCategories = getCategoriesFromDb(nk, logger);
    for (var catId in dbCategories) {
      var catMmr = categoryMmr[catId] || {
        mmr: GAME_CONFIG.STARTING_MMR,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
      };
      categoryStats.push({
        categoryId: catId,
        categoryName: dbCategories[catId].name,
        categoryIcon: dbCategories[catId].icon,
        mmr: catMmr.mmr,
        gamesPlayed: catMmr.gamesPlayed,
        wins: catMmr.wins,
        losses: catMmr.losses,
        winRate: catMmr.gamesPlayed > 0
          ? Math.round((catMmr.wins / catMmr.gamesPlayed) * 100)
          : 0,
      });
    }

    // Sort categories by games played (most played first)
    categoryStats.sort(function(a: any, b: any) {
      return b.gamesPlayed - a.gamesPlayed;
    });

    var responseDisplayName = resolveDisplayName(account.user, telegramData, overrides);
    var responseAvatarUrl = resolveAvatarUrl(account.user, telegramData, overrides);
    var parseTimestamp = function(value: any): number {
      if (typeof value === 'number' && isFinite(value)) {
        return Math.floor(value);
      }
      if (typeof value === 'string' && value) {
        var asNumber = Number(value);
        if (isFinite(asNumber)) {
          return Math.floor(asNumber);
        }
        var parsedDate = new Date(value).getTime();
        if (isFinite(parsedDate)) {
          return parsedDate;
        }
      }
      return 0;
    };
    var createdAt = parseTimestamp(telegramData.createdAt);
    var accountCreateTime = account.user?.createTime || (account.user as any)?.create_time || (account.user as any)?.CreateTime;
    if (!createdAt && accountCreateTime) {
      createdAt = parseTimestamp(accountCreateTime);
    }
    var lastActiveAt = parseTimestamp(telegramData.lastLoginAt);
    var accountUpdateTime = account.user?.updateTime || (account.user as any)?.update_time || (account.user as any)?.UpdateTime;
    if (!lastActiveAt && accountUpdateTime) {
      lastActiveAt = parseTimestamp(accountUpdateTime);
    }
    logger.info('Profile response for ' + userId + ': mmr=' + globalMmr.mmr + ', games=' + globalMmr.gamesPlayed + ', displayName=' + responseDisplayName + ', avatarUrl=' + responseAvatarUrl);

    return JSON.stringify({
      userId: accountUserId,
      username: accountUsername,
      displayName: responseDisplayName,
      avatarUrl: responseAvatarUrl,
      createdAt: createdAt,
      lastActiveAt: lastActiveAt,

      // Global stats
      globalStats: {
        mmr: globalMmr.mmr,
        rankTier: globalMmr.rankTier,
        peakMmr: globalMmr.peakMmr,
        gamesPlayed: globalMmr.gamesPlayed,
        wins: globalMmr.wins,
        losses: globalMmr.losses,
        draws: globalMmr.draws,
        winRate: winRate,
      },

      // Performance stats
      performance: {
        totalQuestions: stats.totalQuestions,
        correctAnswers: stats.correctAnswers,
        accuracy: accuracy,
        averageResponseTime: Math.round(stats.averageResponseTime),
        longestStreak: stats.longestStreak,
        perfectGames: stats.perfectGames,
      },

      // Per-category stats
      categoryStats: categoryStats,

      // Recent match history (last 20)
      matchHistory: matchHistory.slice(0, 20),
      matchHistoryTotal: matchHistory.length,
    });
  } catch (error) {
    logger.error('Error getting detailed profile: ' + error);
    throw error;
  }
}

// RPC: Get match history
export function rpcGetMatchHistory(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var request = JSON.parse(payload || '{}');
  var userId = request.userId || ctx.userId;
  var limit = typeof request.limit === 'number' ? request.limit : 20;
  var offset = typeof request.offset === 'number' ? request.offset : 0;

  if (!userId) {
    throw new Error('User ID required');
  }
  if (ctx.userId && userId !== ctx.userId) {
    if (!isMutualFriend(nk, ctx.userId, userId)) {
      throw new Error('Forbidden');
    }
  }
  limit = Math.max(1, Math.min(50, Math.floor(limit)));
  offset = Math.max(0, Math.floor(offset));

  try {
    var storageRead: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'match_history', userId: userId },
    ];
    var storageResults = nk.storageRead(storageRead);
    var matchHistory = normalizeMatchHistoryRecords(storageResults[0]?.value?.matches);

    // Apply pagination
    var paginatedHistory = matchHistory.slice(offset, offset + limit);

    return JSON.stringify({
      matches: paginatedHistory,
      total: matchHistory.length,
      offset: offset,
      limit: limit,
    });
  } catch (error) {
    logger.error('Error getting match history: ' + error);
    throw error;
  }
}

export function rpcGetCategories(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    // Use database categories - no hardcoded fallback
    var dbCategories = getCategoriesFromDb(nk, logger);
    var categoryList = [];
    var uuidToKey: {[key: string]: string} = {};

    for (var catKeyForMap in dbCategories) {
      var catForMap = dbCategories[catKeyForMap];
      if (catForMap && catForMap.id) {
        uuidToKey[String(catForMap.id)] = catForMap.categoryKey || catKeyForMap;
      }
    }

    var allCategoryKeys = Object.keys(dbCategories);
    var categoryIdsWithChildren: {[key: string]: boolean} = {};
    for (var childIndex = 0; childIndex < allCategoryKeys.length; childIndex++) {
      var possibleChild = dbCategories[allCategoryKeys[childIndex]];
      if (possibleChild && possibleChild.parentId) {
        categoryIdsWithChildren[String(possibleChild.parentId)] = true;
      }
    }
    var matchCategoryKeys: string[] = [];
    for (var categoryIndex = 0; categoryIndex < allCategoryKeys.length; categoryIndex++) {
      var possibleMatchKey = allCategoryKeys[categoryIndex];
      var possibleMatchCategory = dbCategories[possibleMatchKey];
      if (possibleMatchCategory.parentId || !categoryIdsWithChildren[String(possibleMatchCategory.id)]) {
        matchCategoryKeys.push(possibleMatchKey);
      }
    }
    var playableCategoryKeys = getPlayableCategoryKeys(nk, logger, matchCategoryKeys);
    var playableCategorySet: {[key: string]: boolean} = {};
    var parentIdsWithPlayableChildren: {[key: string]: boolean} = {};
    for (var playableIndex = 0; playableIndex < playableCategoryKeys.length; playableIndex++) {
      var playableKey = playableCategoryKeys[playableIndex];
      playableCategorySet[playableKey] = true;
      var playableCategory = dbCategories[playableKey];
      if (playableCategory && playableCategory.parentId) {
        parentIdsWithPlayableChildren[String(playableCategory.parentId)] = true;
      }
    }

    for (var catKey in dbCategories) {
      var cat = dbCategories[catKey];
      var isPlayable = !!playableCategorySet[catKey];
      var isPlayableParent = !cat.parentId && !!parentIdsWithPlayableChildren[String(cat.id)];
      if (!isPlayable && !isPlayableParent) continue;
      var parentKey = cat.parentId ? (uuidToKey[String(cat.parentId)] || null) : null;
      categoryList.push({
        id: cat.categoryKey || catKey,
        name: cat.name,
        icon: cat.icon || '',
        description: cat.description || '',
        iconUrl: cat.iconUrl || '',
        parentId: parentKey,
        categoryType: cat.categoryType || 'normal',
        questionsPerMatch: cat.questionsPerMatch,
        questionsPerMatchOverride: cat.questionsPerMatchOverride !== undefined
          ? cat.questionsPerMatchOverride
          : null,
        useGlobalQuestionCount: cat.useGlobalQuestionCount === true,
        timePerQuestion: cat.timePerQuestion || 15,
        displayOrder: cat.displayOrder || 0,
      });
    }

    // Sort by display order
    categoryList.sort(function(a: any, b: any) {
      return a.displayOrder - b.displayOrder;
    });

    return JSON.stringify({ categories: categoryList });
  } catch (error) {
    logger.error('Error fetching categories from database: ' + error);
    // Return empty list - create categories via admin dashboard
    return JSON.stringify({ categories: [] });
  }
}

export function rpcGetLeaderboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var request = JSON.parse(payload || '{}');
    var requestValue = null;
    var leaderboardId = null;
    var rawScope = typeof request.scope === 'string' ? request.scope.toLowerCase().trim() : '';
    var scope = rawScope === 'friends' ? 'friends' : 'global';
    var timeframe = normalizeLeaderboardTimeframe(request.timeframe || request.time || request.period || request.range);

    var rawCategory = typeof request.category === 'string' && request.category ? request.category : null;
    var rawType = typeof request.type === 'string' && request.type ? request.type : null;

    if (typeof request.leaderboardId === 'string' && request.leaderboardId) {
      requestValue = request.leaderboardId;
      leaderboardId = normalizeLeaderboardId(request.leaderboardId);
    } else if (rawCategory) {
      requestValue = rawCategory;
      if (rawCategory.indexOf('category_') === 0 || rawCategory.indexOf('_daily') > 0 || rawCategory.indexOf('_weekly') > 0 || rawCategory.indexOf('_monthly') > 0) {
        leaderboardId = normalizeLeaderboardId(rawCategory);
      }
      if (!leaderboardId) {
        leaderboardId = buildLeaderboardId(rawCategory, timeframe);
      }
    } else if (rawType) {
      requestValue = rawType;
      leaderboardId = normalizeLeaderboardId(rawType);
    }

    if (!leaderboardId) {
      if (requestValue) {
        return JSON.stringify({ records: [], error: 'Invalid leaderboard' });
      }
      leaderboardId = buildLeaderboardId(null, timeframe);
    }

    var categoryKeyForValidation = extractCategoryKeyFromLeaderboardId(leaderboardId);
    if (categoryKeyForValidation && !isValidCategoryFromDb(nk, logger, categoryKeyForValidation)) {
      return JSON.stringify({ records: [], error: 'Invalid category' });
    }
    if (scope !== 'friends' && categoryKeyForValidation) {
      scope = 'topic';
    }

    if (timeframe === 'all') {
      if (leaderboardId === 'daily_mmr' || leaderboardId.endsWith('_daily')) {
        timeframe = 'daily';
      } else if (leaderboardId === 'weekly_mmr' || leaderboardId.endsWith('_weekly')) {
        timeframe = 'weekly';
      } else if (leaderboardId === 'monthly_mmr' || leaderboardId.endsWith('_monthly')) {
        timeframe = 'monthly';
      }
    }

    var limitValue = Number(request.limit);
    var limit = Number.isFinite(limitValue) ? Math.floor(limitValue) : 100;
    if (limit < 1) {
      limit = 1;
    } else if (limit > 100) {
      limit = 100;
    }

    var offsetValue = Number(request.offset);
    var offset = Number.isFinite(offsetValue) ? Math.max(0, Math.floor(offsetValue)) : 0;

    var callerUserId = ctx.userId || null;
    var targetUserId = callerUserId;
    if (request.userId && typeof request.userId === 'string') {
      if (request.userId === ctx.userId) {
        targetUserId = request.userId;
      } else {
        try {
          requireAdmin(ctx, nk, logger);
          targetUserId = request.userId;
        } catch (e) {
          targetUserId = callerUserId;
        }
      }
    }

    var records: nkruntime.LeaderboardRecordList | null = null;
    var recordsList: nkruntime.LeaderboardRecord[] = [];
    var friendsAllRecords: nkruntime.LeaderboardRecord[] | null = null;
    var hasMore = false;
    var nextCursor: string | null = null;
    var prevCursor: string | null = null;
    var total: number | null = null;
    var responseOffset: number | null = null;
    var friendsRankByOwner: { [key: string]: number } = {};

    if (scope === 'friends') {
      if (!ctx.userId) {
        return JSON.stringify({ records: [], error: 'Authentication required' });
      }

      var friendsBaseUserId = targetUserId || ctx.userId;
      var friendsResult = listFriendsPaged(nk, friendsBaseUserId, 0);
      var friendIds: string[] = [];
      if (friendsResult && friendsResult.length > 0) {
        for (var f = 0; f < friendsResult.length; f++) {
          var friend = friendsResult[f] as any;
          var friendUser = friend.user || friend.User;
          var friendUserId =
            friendUser?.userId ||
            friendUser?.id ||
            friendUser?.Id ||
            friend?.userId ||
            friend?.id ||
            friend?.Id ||
            '';
          if (friendUserId && friendIds.indexOf(friendUserId) === -1) {
            friendIds.push(friendUserId);
          }
        }
      }

      if (targetUserId && friendIds.indexOf(targetUserId) === -1) {
        friendIds.push(targetUserId);
      }

      var friendRecords: nkruntime.LeaderboardRecord[] = [];
      for (var b = 0; b < friendIds.length; b += 100) {
        var batch = friendIds.slice(b, b + 100);
        if (batch.length === 0) continue;
        var batchResult = nk.leaderboardRecordsList(leaderboardId, batch, batch.length, undefined, 0);
        if (batchResult && batchResult.records && batchResult.records.length > 0) {
          friendRecords = friendRecords.concat(batchResult.records);
        }
        var ownerRecords = (batchResult as any)?.ownerRecords || (batchResult as any)?.oderRecords || [];
        if (ownerRecords && ownerRecords.length > 0) {
          friendRecords = friendRecords.concat(ownerRecords);
        }
      }

      // De-duplicate records by ownerId
      var seenOwners: { [key: string]: boolean } = {};
      var uniqueRecords: nkruntime.LeaderboardRecord[] = [];
      for (var ur = 0; ur < friendRecords.length; ur++) {
        var ownerId = friendRecords[ur].ownerId;
        if (!ownerId || seenOwners[ownerId]) continue;
        seenOwners[ownerId] = true;
        uniqueRecords.push(friendRecords[ur]);
      }

      uniqueRecords.sort(function(a: any, b: any) {
        var scoreA = typeof a.score === 'number' ? a.score : 0;
        var scoreB = typeof b.score === 'number' ? b.score : 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        var ownerA = a.ownerId || '';
        var ownerB = b.ownerId || '';
        return ownerA < ownerB ? -1 : ownerA > ownerB ? 1 : 0;
      });

      for (var fr = 0; fr < uniqueRecords.length; fr++) {
        var frOwner = uniqueRecords[fr].ownerId;
        if (frOwner && !friendsRankByOwner[frOwner]) {
          friendsRankByOwner[frOwner] = fr + 1;
        }
      }

      friendsAllRecords = uniqueRecords;
      total = uniqueRecords.length;
      responseOffset = offset;
      hasMore = offset + limit < uniqueRecords.length;
      recordsList = uniqueRecords.slice(offset, offset + limit);
    } else {
      var hasExplicitCursor = typeof request.cursor === 'string' && request.cursor.length > 0;
      var cursor = hasExplicitCursor ? request.cursor : '';
      responseOffset = hasExplicitCursor ? null : offset;
      if (!cursor && offset > 0) {
        try {
          cursor = nk.leaderboardRecordsListCursorFromRank(leaderboardId, offset + 1, 0);
        } catch (e) {
          logger.debug('Could not build leaderboard cursor: ' + e);
          return JSON.stringify({ records: [], error: 'Invalid offset' });
        }
      }

      records = nk.leaderboardRecordsList(leaderboardId, [], limit, cursor || undefined, 0);
      recordsList = records.records || [];
      hasMore = !!records.nextCursor;
      nextCursor = records.nextCursor || null;
      prevCursor = records.prevCursor || null;
      var totalFromRuntime = Number((records as any)?.rankCount);
      if (Number.isFinite(totalFromRuntime) && totalFromRuntime >= 0) {
        total = Math.floor(totalFromRuntime);
      } else if (!hasMore && typeof responseOffset === 'number') {
        // Fallback when runtime does not expose rankCount.
        total = responseOffset + recordsList.length;
      }
    }

    var recordList: any[] = [];
    var ownerIds: string[] = [];
    if (recordsList && recordsList.length > 0) {
      for (var i = 0; i < recordsList.length; i++) {
        var r = recordsList[i];
        if (r && r.ownerId && ownerIds.indexOf(r.ownerId) === -1) {
          ownerIds.push(r.ownerId);
        }
      }
    }

    if (targetUserId && ownerIds.indexOf(targetUserId) === -1) {
      ownerIds.push(targetUserId);
    }

    var telegramByUserId: { [key: string]: any } = {};
    if (ownerIds.length > 0) {
      try {
        var telegramReads: nkruntime.StorageReadRequest[] = [];
        for (var t = 0; t < ownerIds.length; t++) {
          telegramReads.push({
            collection: 'player_data',
            key: 'telegram',
            userId: ownerIds[t],
          });
        }
        var telegramResults = nk.storageRead(telegramReads);
        for (var tr = 0; tr < telegramResults.length; tr++) {
          var telegram = telegramResults[tr];
          if (telegram && telegram.userId && telegram.value) {
            telegramByUserId[telegram.userId] = telegram.value;
          }
        }
      } catch (e) {
        logger.debug('Could not read telegram names: ' + e);
      }
    }

    var usersById: { [key: string]: nkruntime.User } = {};
    if (ownerIds.length > 0) {
      try {
        var users = nk.usersGetId(ownerIds);
        for (var u = 0; u < users.length; u++) {
          var userKey = users[u].userId || users[u].id || '';
          if (userKey) {
            usersById[userKey] = users[u];
          }
        }
      } catch (e) {
        logger.debug('Could not read user names: ' + e);
      }
    }

    var resolveUsername = function(ownerId: string, fallbackUsername: string | undefined): string {
      if (typeof fallbackUsername === 'string' && fallbackUsername.trim()) {
        return fallbackUsername;
      }

      var telegram = telegramByUserId[ownerId];
      if (telegram && telegram.firstName) {
        return telegram.firstName + (telegram.lastName ? ' ' + telegram.lastName : '');
      }

      var user = usersById[ownerId];
      if (user && (user.displayName || user.username)) {
        return user.displayName || user.username;
      }

      return 'Unknown';
    };

    var resolveAvatarUrl = function(ownerId: string): string {
      var telegram = telegramByUserId[ownerId];
      if (telegram) {
        if (telegram.photoUrl) return telegram.photoUrl;
        if (telegram.photo_url) return telegram.photo_url;
      }

      var user = usersById[ownerId];
      if (user) {
        return user.avatarUrl || (user as any).avatar_url || '';
      }

      return '';
    };

    if (recordsList && recordsList.length > 0) {
      for (var rIndex = 0; rIndex < recordsList.length; rIndex++) {
        var record = recordsList[rIndex];
        var score = typeof record.score === 'number' ? record.score : 0;
        var derivedRank = scope === 'friends'
          ? friendsRankByOwner[record.ownerId] || rIndex + 1
          : (typeof record.rank === 'number' && record.rank > 0 ? record.rank : rIndex + 1);
        recordList.push({
          ownerId: record.ownerId,
          username: resolveUsername(record.ownerId, record.username),
          avatarUrl: resolveAvatarUrl(record.ownerId),
          score: score,
          rank: derivedRank,
          rankTier: getRankTierKeyForMmr(nk, logger, score),
        });
      }
    }

    var userRank: any = null;
    if (targetUserId) {
      var userRecord = null;
      if (recordsList && recordsList.length > 0) {
        for (var urIndex = 0; urIndex < recordsList.length; urIndex++) {
          if (recordsList[urIndex].ownerId === targetUserId) {
            userRecord = recordsList[urIndex];
            break;
          }
        }
      }

      if (!userRecord && scope !== 'friends') {
        try {
          var userRecords = nk.leaderboardRecordsList(leaderboardId, [targetUserId], 1, undefined, 0);
          userRecord = getOwnerRecordFromList(userRecords, targetUserId);
        } catch (e) {
          logger.debug('Could not fetch user rank: ' + e);
        }
      }
      if (!userRecord && scope === 'friends' && friendsAllRecords) {
        for (var frIndex = 0; frIndex < friendsAllRecords.length; frIndex++) {
          if (friendsAllRecords[frIndex].ownerId === targetUserId) {
            userRecord = friendsAllRecords[frIndex];
            break;
          }
        }
      }

      if (userRecord) {
        var userScore = typeof userRecord.score === 'number' ? userRecord.score : 0;
        var userDerivedRank = scope === 'friends'
          ? friendsRankByOwner[userRecord.ownerId] || 0
          : userRecord.rank;
        userRank = {
          ownerId: userRecord.ownerId,
          username: resolveUsername(userRecord.ownerId, userRecord.username),
          avatarUrl: resolveAvatarUrl(userRecord.ownerId),
          score: userScore,
          rank: userDerivedRank,
          rankTier: getRankTierKeyForMmr(nk, logger, userScore),
        };
      }
    }

    return JSON.stringify({
      leaderboardId: leaderboardId,
      records: recordList,
      userRank: userRank,
      offset: responseOffset,
      limit: limit,
      total: total,
      hasMore: hasMore,
      nextCursor: nextCursor,
      prevCursor: prevCursor,
      scope: scope,
      timeframe: timeframe,
      isWeeklyLeaderboard: timeframe === 'weekly' || leaderboardId === 'weekly_mmr' || leaderboardId.endsWith('_weekly'),
    });
  } catch (error) {
    logger.error('Error getting leaderboard: ' + error);
    return JSON.stringify({ records: [], error: String(error) });
  }
}

// RPC: Get category MMR for matchmaking
export function rpcGetCategoryMmr(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var request = JSON.parse(payload || '{}');
  var userId = request.userId || ctx.userId;
  var category = request.category;

  if (!userId || !category) {
    throw new Error('User ID and category required');
  }

  if (!isValidCategoryFromDb(nk, logger, category)) {
    throw new Error('Invalid category');
  }

  try {
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'category_mmr', userId: userId },
    ];
    var results = nk.storageRead(reads);
    var categoryMmr = results[0]?.value || {};
    var record = categoryMmr[category] || {
      mmr: GAME_CONFIG.STARTING_MMR,
      rd: GAME_CONFIG.STARTING_RD,
      volatility: GAME_CONFIG.STARTING_VOLATILITY,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
    };

    return JSON.stringify({
      category: category,
      mmr: record.mmr,
      rd: record.rd,
      volatility: record.volatility,
      gamesPlayed: record.gamesPlayed || 0,
      wins: record.wins || 0,
      losses: record.losses || 0,
    });
  } catch (error) {
    logger.error('Error getting category MMR: ' + error);
    throw error;
  }
}

// RPC: Get question statistics per category
export function rpcGetQuestionStats(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    // Use CASE WHEN for broader SQL compatibility
    var result = nk.sqlQuery(
      `SELECT category,
              COUNT(*) as total,
              SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
              SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
              SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard
       FROM questions
       WHERE is_active = true
       GROUP BY category
       ORDER BY category`
    );

    logger.info('Question stats query result: ' + JSON.stringify(result));

    var stats: {[key: string]: any} = {};

    // Nakama sqlQuery returns array directly, not {rows: [...]}
    var rows = Array.isArray(result) ? result : (result.rows || result);

    if (rows && rows.length > 0) {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        logger.info('Processing row: ' + JSON.stringify(row));
        stats[row.category] = {
          total: parseInt(row.total) || 0,
          easy: parseInt(row.easy) || 0,
          medium: parseInt(row.medium) || 0,
          hard: parseInt(row.hard) || 0,
        };
      }
    }

    logger.info('Final stats: ' + JSON.stringify(stats));
    return JSON.stringify({ categories: stats });
  } catch (error) {
    logger.error('Error getting question stats: ' + error);
    return JSON.stringify({ categories: {}, error: String(error) });
  }
}

// RPC: Get questions for a category (for match preview/testing)
export function rpcGetQuestions(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.env || ctx.env['ALLOW_QUESTION_PREVIEW'] !== 'true') {
    logger.warn('get_questions is disabled');
    return JSON.stringify({ error: 'Not available' });
  }

  try {
    var request = JSON.parse(payload || '{}');
    var category = request.category || 'prophets';

    if (!isValidCategory(category)) {
      return JSON.stringify({ error: 'Invalid category' });
    }

    logger.info('Loading questions for category: ' + category);
    var questions = selectQuestions(category, nk, logger, []);
    var randomizedQuestions = randomizeOptionsForQuestions(questions);

    return JSON.stringify({
      category: category,
      count: randomizedQuestions.length,
      questions: randomizedQuestions.map(function(q: any) {
        return {
          id: q.id,
          difficulty: q.difficulty,
          questionText: q.questionText,
          options: q.options,
          questionType: q.questionType || q.question_type || 'mcq',
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        };
      }),
    });
  } catch (error) {
    logger.error('Error loading questions: ' + error);
    return JSON.stringify({ error: String(error) });
  }
}

function resolveMatchCategoryFromSelection(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  request: any
): { parentCategory: string; chosenCategory: string; normalizedSubcategories: string[]; allInCategory: boolean } {
  var parentCategory = request.parentCategory || request.category || 'prophets';
  var legacySubcategory = request.subcategory || null;
  var requestedSubcategories = Array.isArray(request.subcategories) ? request.subcategories : [];
  var allInCategory = request.allInCategory === true;

  parentCategory = normalizeCategory(parentCategory);
  if (!parentCategory || !isValidCategoryFromDb(nk, logger, parentCategory)) {
    throw new Error('Invalid parent category');
  }

  var normalizedSubcategories: string[] = [];
  for (var i = 0; i < requestedSubcategories.length; i++) {
    if (typeof requestedSubcategories[i] === 'string') {
      var normalizedFromArray = normalizeCategory(requestedSubcategories[i]);
      if (normalizedFromArray && normalizedSubcategories.indexOf(normalizedFromArray) === -1) {
        normalizedSubcategories.push(normalizedFromArray);
      }
    }
  }
  if (typeof legacySubcategory === 'string') {
    var normalizedLegacy = normalizeCategory(legacySubcategory);
    if (normalizedLegacy && normalizedSubcategories.indexOf(normalizedLegacy) === -1) {
      normalizedSubcategories.push(normalizedLegacy);
    }
  }
  if (!allInCategory && normalizedSubcategories.length === 0) {
    allInCategory = true;
  }

  var chosenCategory = parentCategory;
  var candidateCategories: string[] = [];
  if (!allInCategory && normalizedSubcategories.length > 0) {
    var allCats = getCategoriesFromDb(nk, logger);
    var parentCat = allCats[parentCategory];
    var validSubcategories: string[] = [];
    if (parentCat && parentCat.id) {
      for (var ns = 0; ns < normalizedSubcategories.length; ns++) {
        var sub = normalizedSubcategories[ns];
        var childCat = allCats[sub];
        if (childCat && childCat.parentId && String(childCat.parentId) === String(parentCat.id)) {
          validSubcategories.push(sub);
        }
      }
    }
    if (validSubcategories.length === 0) {
      throw new Error('No valid subcategories found for selected category');
    }
    candidateCategories = validSubcategories;
  } else {
    var categories = getCategoriesFromDb(nk, logger);
    var parent = categories[parentCategory];
    if (parent && parent.id) {
      for (var key in categories) {
        var candidate = categories[key];
        if (candidate && candidate.parentId && String(candidate.parentId) === String(parent.id)) {
          candidateCategories.push(candidate.categoryKey || key);
        }
      }
    }
    if (candidateCategories.length === 0) candidateCategories.push(parentCategory);
  }

  var playableCandidates = getPlayableCategoryKeys(nk, logger, candidateCategories);
  if (playableCandidates.length === 0) {
    throw new Error('No playable subcategories have enough active questions');
  }
  var selectedIdx = Math.floor(Math.random() * playableCandidates.length);
  chosenCategory = playableCandidates[selectedIdx];

  return {
    parentCategory: parentCategory,
    chosenCategory: chosenCategory,
    normalizedSubcategories: normalizedSubcategories,
    allInCategory: allInCategory,
  };
}

// RPC: Start a bot match (fallback when matchmaking is slow)
export function rpcStartBotMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  var request = JSON.parse(payload || '{}');
  var selection = resolveMatchCategoryFromSelection(nk, logger, request);
  var matchId = nk.matchCreate('quiz_match', {
    category: selection.chosenCategory,
    parentCategory: selection.parentCategory,
    bot: 'true',
  });
  logger.info(
    'Bot match created: ' + matchId
    + ' for parent=' + selection.parentCategory
    + ' category=' + selection.chosenCategory
  );
  return JSON.stringify({ matchId: matchId });
}

// RPC: Start a solo practice match
export function rpcStartPracticeMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  var request = JSON.parse(payload || '{}');
  var selection = resolveMatchCategoryFromSelection(nk, logger, request);
  var matchId = nk.matchCreate('quiz_match', {
    category: selection.chosenCategory,
    parentCategory: selection.parentCategory,
    practice: 'true',
    player1: ctx.userId,
    allowSpectators: 'false',
  });
  logger.info(
    'Practice match created: ' + matchId
    + ' for user=' + ctx.userId
    + ' parent=' + selection.parentCategory
    + ' category=' + selection.chosenCategory
  );
  return JSON.stringify({ matchId: matchId });
}

