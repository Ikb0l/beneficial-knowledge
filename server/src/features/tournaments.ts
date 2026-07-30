import {
  advanceDoubleElimination,
  autoReportTournamentResult,
  checkRoundCompletionAndAdvance,
  runTournamentMaintenanceCycle,
} from '../main/tournament-advance';
import {
  getCategoriesFromDb,
  getCategoryTypeByKey,
  getQuestionCountCaps,
  getQuestionsPerMatchForCategory,
  getRankTierForMmr,
  isValidCategoryFromDb,
} from '../main/config';
import { normalizeCategory } from '../main/constants';
import {
  fillTournamentWithBots,
  getTournamentBotDisplayName,
  getTournamentBotPolicy,
  replaceParticipantInPendingOrReadyMatchWithBot,
  sanitizeTournamentBotPolicyOverride,
} from '../main/tournament-bots';
import { parseRpcPayload } from './notifications';
import { enqueueTournamentCreatedCampaign } from './notification-campaigns';
import { buildBestOfByRound, getBestOfForMatch, getAdminInfoForFeatures, logAdminActionFeatures, parseJsonb, requireAdminForFeatures, requireSuperAdminForFeatures, syncTournamentStatuses } from './helpers';

// TOURNAMENTS RPCs
// ============================================================================

function toPgUuidArrayLiteral(values: string[]): string {
  // UUIDs are safe to embed as literals when quoted; still passed as a parameter.
  // Example: {"uuid1","uuid2"}
  var quoted: string[] = [];
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i] || '').trim();
    if (!v) continue;
    quoted.push('"' + v.replace(/"/g, '') + '"');
  }
  return '{' + quoted.join(',') + '}';
}

function parseQuestionPoolIds(value: any): string[] | null {
  if (value === null || value === undefined) return null;

  var out: string[] = [];
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] === 'string' && value[i].trim().length > 0) {
        out.push(value[i].trim());
      }
    }
  } else if (typeof value === 'string') {
    // Accept comma/newline separated or JSON array string.
    var trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed[0] === '[') {
      try {
        var parsed = JSON.parse(trimmed);
        return parseQuestionPoolIds(parsed);
      } catch {
        // fall through to split
      }
    }
    var parts = trimmed.split(/[\n,]+/);
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p].trim();
      if (part) out.push(part);
    }
  } else {
    return null;
  }

  // De-dupe, cap size
  var seen: {[key: string]: boolean} = {};
  var unique: string[] = [];
  for (var u = 0; u < out.length; u++) {
    var id = out[u];
    if (seen[id]) continue;
    seen[id] = true;
    unique.push(id);
  }

  var MAX_POOL_IDS = 500;
  if (unique.length > MAX_POOL_IDS) {
    unique = unique.slice(0, MAX_POOL_IDS);
  }

  return unique.length > 0 ? unique : null;
}

function parsePgBoolean(value: any): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

function getTournamentBrowseOrderSql(): string {
  return `CASE
      WHEN t.status = 'registration' THEN 0
      WHEN t.status = 'in_progress' THEN 1
      WHEN t.status = 'upcoming' THEN 2
      WHEN t.status = 'paused' THEN 3
      WHEN t.status = 'completed' THEN 4
      WHEN t.status = 'cancelled' THEN 5
      ELSE 6
    END ASC,
    CASE
      WHEN t.status IN ('registration', 'in_progress', 'upcoming', 'paused') THEN t.tournament_start
      ELSE NULL
    END ASC NULLS LAST,
    t.tournament_start DESC NULLS LAST`;
}

function formatRankTierName(nk: nkruntime.Nakama, logger: nkruntime.Logger, mmr: number): string {
  try {
    var tier = getRankTierForMmr(nk, logger, mmr);
    if (tier && tier.name) return tier.name;
    if (tier && tier.tierKey) {
      var key = String(tier.tierKey);
      return key.charAt(0).toUpperCase() + key.slice(1);
    }
  } catch (error) {
    logger.warn('Failed to resolve rank tier for MMR ' + mmr + ': ' + error);
  }
  return 'MMR';
}

function formatTournamentMmrRangeError(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userMmr: number,
  minMmr: number,
  maxMmr: number
): string {
  var userTier = formatRankTierName(nk, logger, userMmr);
  if (userMmr < minMmr) {
    var requiredTier = formatRankTierName(nk, logger, minMmr);
    return userTier + ' (' + userMmr + ') is too low for this tournament - need ' + requiredTier + ' (' + minMmr + '+).';
  }
  var maxTier = formatRankTierName(nk, logger, maxMmr);
  return userTier + ' (' + userMmr + ') is above this tournament range - max ' + maxTier + ' (' + maxMmr + ').';
}

function getQuestionCountCapForCategory(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  categoryKey: string | null | undefined
): number {
  var caps = getQuestionCountCaps(nk, logger);
  var maxAcrossTypes = Math.max(caps.normalMax, caps.vocabularyMax);
  if (!categoryKey) {
    return maxAcrossTypes;
  }
  var normalizedCategory = normalizeCategory(String(categoryKey));
  if (!normalizedCategory) {
    return maxAcrossTypes;
  }
  var categories = getCategoriesFromDb(nk, logger);
  var selectedCategory = categories[normalizedCategory];
  if (!selectedCategory) {
    return maxAcrossTypes;
  }

  var hasChildren = false;
  var childCap = 0;
  for (var key in categories) {
    if (!Object.prototype.hasOwnProperty.call(categories, key)) continue;
    var child = categories[key];
    if (!child || child.parentId !== selectedCategory.id) continue;
    hasChildren = true;
    var childType = getCategoryTypeByKey(nk, logger, child.categoryKey || key);
    var cap = childType === 'vocabulary' ? caps.vocabularyMax : caps.normalMax;
    if (cap > childCap) childCap = cap;
  }

  if (hasChildren) {
    return childCap > 0 ? childCap : maxAcrossTypes;
  }
  var selectedType = getCategoryTypeByKey(nk, logger, normalizedCategory);
  return selectedType === 'vocabulary' ? caps.vocabularyMax : caps.normalMax;
}

function getQuestionCountDefaultForCategory(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  categoryKey: string | null | undefined
): number {
  var fallbackDefault = getQuestionsPerMatchForCategory(nk, logger, '');
  if (!categoryKey) {
    return fallbackDefault;
  }
  var normalizedCategory = normalizeCategory(String(categoryKey));
  if (!normalizedCategory) {
    return fallbackDefault;
  }

  var categories = getCategoriesFromDb(nk, logger);
  var selectedCategory = categories[normalizedCategory];
  if (!selectedCategory) {
    return fallbackDefault;
  }

  var hasChildren = false;
  var childDefault = 0;
  for (var key in categories) {
    if (!Object.prototype.hasOwnProperty.call(categories, key)) continue;
    var child = categories[key];
    if (!child || child.parentId !== selectedCategory.id) continue;
    hasChildren = true;
    var childResolvedDefault = getQuestionsPerMatchForCategory(nk, logger, child.categoryKey || key);
    if (childResolvedDefault > childDefault) childDefault = childResolvedDefault;
  }

  if (hasChildren && childDefault > 0) {
    return childDefault;
  }
  return getQuestionsPerMatchForCategory(nk, logger, normalizedCategory);
}

function sanitizeTournamentRewards(rewards: any): {[key: string]: any} {
  if (!rewards || typeof rewards !== 'object') {
    return {};
  }

  var sanitized: {[key: string]: any} = {};
  for (var rewardKey in rewards) {
    if (!Object.prototype.hasOwnProperty.call(rewards, rewardKey)) continue;
    var rewardEntry = rewards[rewardKey];
    if (!rewardEntry || typeof rewardEntry !== 'object') {
      sanitized[rewardKey] = {};
      continue;
    }
    var mmrBonus = Number((rewardEntry as {[key: string]: any}).mmr_bonus);
    if (Number.isFinite(mmrBonus) && mmrBonus > 0) {
      sanitized[rewardKey] = { mmr_bonus: Math.floor(mmrBonus) };
    } else {
      sanitized[rewardKey] = {};
    }
  }

  return sanitized;
}

function getExpectedBestOfForPersistedMatch(
  bestOfConfig: any,
  seedingMode: string,
  bracketTypeValue: any,
  roundNumberValue: any
): number {
  var bracketType = String(bracketTypeValue || 'winners');
  var roundNumber = parseInt(roundNumberValue) || 1;
  var isOpeningRound = seedingMode === 'random_opening_round' && bracketType === 'winners' && roundNumber === 1;
  return getBestOfForMatch(bestOfConfig, bracketType, roundNumber, isOpeningRound);
}

function resyncTournamentMatchBestOf(
  nk: nkruntime.Nakama,
  tournamentId: string,
  seedingMode: string,
  bestOfConfig: any,
  dryRun?: boolean
): { scanned: number; updated: number; skipped: number; wouldUpdate: number } {
  var rowsResult = nk.sqlQuery(
    `SELECT id, bracket_type, round_number, status, best_of
     FROM tournament_matches
     WHERE tournament_id = $1
     ORDER BY round_number ASC, match_number ASC`,
    [tournamentId]
  );
  var rows = Array.isArray(rowsResult) ? rowsResult : [];
  var scanned = rows.length;
  var updated = 0;
  var skipped = 0;
  var wouldUpdate = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var status = String(row.status || 'pending');
    if (status !== 'pending' && status !== 'ready') {
      skipped++;
      continue;
    }

    var targetBestOf = getExpectedBestOfForPersistedMatch(
      bestOfConfig,
      seedingMode,
      row.bracket_type,
      row.round_number
    );
    var currentBestOf = parseInt(row.best_of) || 1;
    if (currentBestOf === targetBestOf) {
      skipped++;
      continue;
    }

    wouldUpdate++;
    if (dryRun) {
      skipped++;
      continue;
    }

    var updateResult = nk.sqlQuery(
      `UPDATE tournament_matches
       SET best_of = $1
       WHERE id = $2
         AND status IN ('pending', 'ready')
       RETURNING id`,
      [targetBestOf, row.id]
    );
    var updateRows = Array.isArray(updateResult) ? updateResult : [];
    if (updateRows.length > 0) {
      updated++;
    } else {
      skipped++;
    }
  }

  return {
    scanned: scanned,
    updated: updated,
    skipped: skipped,
    wouldUpdate: wouldUpdate,
  };
}

export function rpcGetTournaments(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    // Status sync is handled by the cron job every 20s — read-only RPCs
    // skip the expensive progression pass to stay fast at scale.
    var request = JSON.parse(payload || '{}');
    var status = request.status;
    var category = request.category;
    var search = typeof request.search === 'string' ? request.search.trim() : '';
    var limit = Math.min(request.limit || 20, 100);
    var offset = request.offset || 0;

    var query = `SELECT t.id, t.name, t.description, t.format, t.bracket_size,
                        t.category, t.min_mmr, t.max_mmr, t.question_count,
                        t.registration_start, t.registration_end, t.tournament_start,
                        t.status, t.current_round, t.rewards, t.allow_spectators,
                        t.seeding_mode, t.best_of_by_round, t.grand_final_reset,
                        t.bot_policy,
                        t.registered_count,
                        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id AND tp.status IN ('registered', 'checked_in', 'active', 'eliminated', 'winner', 'forfeited', 'disqualified')) as participant_count`;
    var params: any[] = [];

    if (ctx.userId) {
      query += `, tpu.id as user_participant_id`;
    }

    query += ` FROM tournaments t`;

    if (ctx.userId) {
      params.push(ctx.userId);
      query += ` LEFT JOIN tournament_participants tpu
                 ON tpu.tournament_id = t.id AND tpu.user_id = $` + params.length;
    }

    query += ` WHERE 1=1`;

    if (status) {
      params.push(status);
      query += ` AND t.status = $` + params.length;
    }
    if (category) {
      params.push(category);
      query += ` AND t.category = $` + params.length;
    }
    if (search) {
      params.push('%' + search.toLowerCase() + '%');
      query += ` AND (LOWER(t.name) LIKE $` + params.length + ` OR LOWER(COALESCE(t.description, '')) LIKE $` + params.length + `)`;
    }

    query += ` ORDER BY ` + getTournamentBrowseOrderSql() + ` LIMIT $` + (params.length + 1) + ` OFFSET $` + (params.length + 2);
    params.push(limit, offset);

    var result = nk.sqlQuery(query, params);
    var rows = Array.isArray(result) ? result : [];

    var userGlobalMmr = 1000;
    var userCategoryMmr: any = null;
    if (ctx.userId) {
      try {
        var reads: nkruntime.StorageReadRequest[] = [
          { collection: 'player_data', key: 'global_mmr', userId: ctx.userId },
          { collection: 'player_data', key: 'category_mmr', userId: ctx.userId },
        ];
        var storageResults = nk.storageRead(reads);
        for (var r = 0; r < storageResults.length; r++) {
          var row = storageResults[r];
          if (row.key === 'global_mmr' && row.value && row.value.mmr) {
            userGlobalMmr = row.value.mmr || userGlobalMmr;
          } else if (row.key === 'category_mmr') {
            userCategoryMmr = row.value || null;
          }
        }
      } catch (mmrError) {
        logger.warn('Failed to load MMR for tournament eligibility: ' + mmrError);
      }
    }

    function resolveEligibilityMmr(tournamentCategory: any): { mmr: number; basis: string } {
      if (tournamentCategory && typeof tournamentCategory === 'string') {
        var key = normalizeCategory(tournamentCategory);
        var catMmr = userCategoryMmr && userCategoryMmr[key] && typeof userCategoryMmr[key].mmr === 'number'
          ? userCategoryMmr[key].mmr
          : null;
        if (typeof catMmr === 'number' && Number.isFinite(catMmr)) {
          return { mmr: catMmr, basis: 'category' };
        }
      }
      return { mmr: userGlobalMmr, basis: 'global' };
    }

    var tournaments = rows.map(function(row: any) {
      var eligibility = ctx.userId ? resolveEligibilityMmr(row.category) : { mmr: 1000, basis: 'global' };
      var minMmr = parseInt(row.min_mmr);
      var maxMmr = parseInt(row.max_mmr);
      var isEligible = ctx.userId ? (eligibility.mmr >= minMmr && eligibility.mmr <= maxMmr) : null;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        format: row.format,
        bracketSize: parseInt(row.bracket_size),
        category: row.category,
        minMmr: minMmr,
        maxMmr: maxMmr,
        questionCount: parseInt(row.question_count),
        registrationStart: row.registration_start,
        registrationEnd: row.registration_end,
        tournamentStart: row.tournament_start,
        status: row.status,
        currentRound: parseInt(row.current_round) || 0,
        rewards: sanitizeTournamentRewards(parseJsonb(row.rewards, {})),
        allowSpectators: row.allow_spectators,
        seedingMode: row.seeding_mode || 'mmr',
        bestOfByRound: parseJsonb(row.best_of_by_round, {}),
        grandFinalReset: row.grand_final_reset === true,
        botPolicy: getTournamentBotPolicy(nk, logger, row.id, row.bot_policy),
        registeredCount: parseInt(row.registered_count) || 0,
        participantCount: parseInt(row.participant_count),
        isRegistered: !!row.user_participant_id,
        eligibilityMmr: ctx.userId ? eligibility.mmr : undefined,
        eligibilityMmrBasis: ctx.userId ? eligibility.basis : undefined,
        isEligible: ctx.userId ? isEligible : undefined,
      };
    });

    return JSON.stringify({
      tournaments: tournaments,
      limit: limit,
      offset: offset,
    });
  } catch (error) {
    logger.error('Error getting tournaments: ' + error);
    throw error;
  }
}

export function rpcGetTournamentDetails(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    // Status sync is handled by the cron job every 20s — read-only RPCs
    // skip the expensive progression pass to stay fast at scale.
    var request = JSON.parse(payload || '{}');
    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    var includePoolIds = false;
    if (ctx.userId) {
      try {
        requireAdminForFeatures(ctx, nk, logger);
        includePoolIds = true;
      } catch {
        includePoolIds = false;
      }
    }

    // Get tournament
    var tourResult = nk.sqlQuery(
      `SELECT * FROM tournaments WHERE id = $1`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];

    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    var tour = tourRows[0];

    // Get participants
    var partResult = nk.sqlQuery(
      `SELECT tp.id, tp.user_id, tp.seed_number, tp.mmr_at_registration, tp.status,
              tp.final_placement, tp.matches_played, tp.matches_won, tp.total_score,
              tp.is_bot, tp.bot_profile_id, tp.bot_influenced, bp.bot_key as bot_key,
              COALESCE(
                bp.display_name,
                NULLIF(TRIM(CONCAT(s.value->>'firstName', ' ', s.value->>'lastName')), ''),
                s.value->>'username',
                u.display_name,
                u.username,
                'Player'
              ) as display_name
       FROM tournament_participants tp
       LEFT JOIN tournament_bot_profiles bp ON bp.id = tp.bot_profile_id
       LEFT JOIN users u ON u.id = tp.user_id
       LEFT JOIN storage s ON s.user_id = tp.user_id AND s.collection = 'player_data' AND s.key = 'telegram'
       WHERE tp.tournament_id = $1
       ORDER BY tp.seed_number`,
      [request.tournamentId]
    );
    var partRows = Array.isArray(partResult) ? partResult : [];

    var participants = partRows.map(function(row: any) {
      var isBot = parsePgBoolean(row.is_bot);
      var displayName = isBot
        ? getTournamentBotDisplayName(row.bot_key, row.id, row.display_name)
        : (row.display_name || 'Player');
      return {
        id: row.id,
        userId: row.user_id || null,
        displayName: displayName,
        seedNumber: parseInt(row.seed_number) || 0,
        mmrAtRegistration: parseInt(row.mmr_at_registration),
        status: row.status,
        isBot: isBot,
        botProfileId: row.bot_profile_id || null,
        botInfluenced: parsePgBoolean(row.bot_influenced),
        finalPlacement: row.final_placement ? parseInt(row.final_placement) : null,
        matchesPlayed: parseInt(row.matches_played),
        matchesWon: parseInt(row.matches_won),
        totalScore: parseInt(row.total_score),
      };
    });

    // Get matches (bracket)
    var matchResult = nk.sqlQuery(
      `SELECT tm.id, tm.round_number, tm.match_number, tm.bracket_type,
              tm.player1_participant_id, tm.player2_participant_id, tm.winner_participant_id,
              p1.user_id as player1_user_id, p2.user_id as player2_user_id, pw.user_id as winner_user_id,
              p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot, pw.is_bot as winner_is_bot,
              tm.player1_score, tm.player2_score, tm.status, tm.scheduled_time,
              tm.started_at, tm.completed_at, tm.spectator_count, tm.nakama_match_id,
              tm.best_of, tm.series_wins_player1, tm.series_wins_player2, tm.series_game_count
       FROM tournament_matches tm
       LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       LEFT JOIN tournament_participants pw ON pw.id = tm.winner_participant_id
       WHERE tm.tournament_id = $1
       ORDER BY tm.round_number, tm.match_number`,
      [request.tournamentId]
    );
    var matchRows = Array.isArray(matchResult) ? matchResult : [];

    var matches = matchRows.map(function(row: any) {
      var rawNakamaMatchId = row.nakama_match_id ? String(row.nakama_match_id) : null;
      var isStartingPlaceholder = !!rawNakamaMatchId && rawNakamaMatchId.indexOf('__starting__:') === 0;
      var isLiveMatch = row.status === 'in_progress' && !isStartingPlaceholder && !!rawNakamaMatchId;
      return {
        id: row.id,
        roundNumber: parseInt(row.round_number),
        matchNumber: parseInt(row.match_number),
        bracketType: row.bracket_type,
        player1Id: row.player1_participant_id,
        player2Id: row.player2_participant_id,
        winnerId: row.winner_participant_id,
        player1UserId: row.player1_user_id || null,
        player2UserId: row.player2_user_id || null,
        winnerUserId: row.winner_user_id || null,
        player1IsBot: parsePgBoolean(row.player1_is_bot),
        player2IsBot: parsePgBoolean(row.player2_is_bot),
        winnerIsBot: parsePgBoolean(row.winner_is_bot),
        player1Score: row.player1_score !== null && row.player1_score !== undefined
          ? parseInt(row.player1_score)
          : null,
        player2Score: row.player2_score !== null && row.player2_score !== undefined
          ? parseInt(row.player2_score)
          : null,
        status: row.status,
        scheduledTime: row.scheduled_time,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        spectatorCount: isLiveMatch ? (parseInt(row.spectator_count) || 0) : 0,
        nakamaMatchId: isLiveMatch ? rawNakamaMatchId : null,
        bestOf: row.best_of ? parseInt(row.best_of) : 1,
        seriesWinsPlayer1: row.series_wins_player1 ? parseInt(row.series_wins_player1) : 0,
        seriesWinsPlayer2: row.series_wins_player2 ? parseInt(row.series_wins_player2) : 0,
        seriesGameCount: row.series_game_count ? parseInt(row.series_game_count) : 0,
      };
    });

    // Check if current user is registered
    var isRegistered = false;
    var userParticipant = null;
    var waitlistPosition: number | null = null;
    if (ctx.userId) {
      var regCheck = nk.sqlQuery(
        `SELECT id, status FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2`,
        [request.tournamentId, ctx.userId]
      );
      var regRows = Array.isArray(regCheck) ? regCheck : [];
      if (regRows.length > 0) {
        isRegistered = true;
        userParticipant = { id: regRows[0].id, status: regRows[0].status };
      } else {
        // Check waitlist position
        var wlCheck = nk.sqlQuery(
          `SELECT position FROM tournament_waitlist
           WHERE tournament_id = $1 AND user_id = $2 AND status = 'waiting'`,
          [request.tournamentId, ctx.userId]
        );
        var wlRows = Array.isArray(wlCheck) ? wlCheck : [];
        if (wlRows.length > 0) {
          waitlistPosition = parseInt(wlRows[0].position);
        }
      }
    }

    var eligibilityMmr: number | null = null;
    var eligibilityMmrBasis: string | null = null;
    var isEligible: boolean | null = null;
    if (ctx.userId) {
      try {
        var reads: nkruntime.StorageReadRequest[] = [
          { collection: 'player_data', key: 'global_mmr', userId: ctx.userId },
          { collection: 'player_data', key: 'category_mmr', userId: ctx.userId },
        ];
        var storageResults = nk.storageRead(reads);
        var globalMmr = 1000;
        var categoryMmr: any = null;
        for (var sr = 0; sr < storageResults.length; sr++) {
          var sRow = storageResults[sr];
          if (sRow.key === 'global_mmr' && sRow.value && typeof sRow.value.mmr === 'number') {
            globalMmr = sRow.value.mmr || globalMmr;
          } else if (sRow.key === 'category_mmr') {
            categoryMmr = sRow.value || null;
          }
        }
        if (tour.category && typeof tour.category === 'string') {
          var catKey = normalizeCategory(tour.category);
          var catValue = categoryMmr && categoryMmr[catKey] && typeof categoryMmr[catKey].mmr === 'number'
            ? categoryMmr[catKey].mmr
            : null;
          if (typeof catValue === 'number' && Number.isFinite(catValue)) {
            eligibilityMmr = catValue;
            eligibilityMmrBasis = 'category';
          } else {
            eligibilityMmr = globalMmr;
            eligibilityMmrBasis = 'global';
          }
        } else {
          eligibilityMmr = globalMmr;
          eligibilityMmrBasis = 'global';
        }
        var minMmr = parseInt(tour.min_mmr) || 0;
        var maxMmr = parseInt(tour.max_mmr) || 10000;
        isEligible = eligibilityMmr >= minMmr && eligibilityMmr <= maxMmr;
      } catch (mmrErr) {
        logger.warn('Failed to compute tournament eligibility: ' + mmrErr);
      }
    }

    return JSON.stringify({
      tournament: {
        id: tour.id,
        name: tour.name,
        description: tour.description,
        format: tour.format,
        bracketSize: parseInt(tour.bracket_size),
        category: tour.category,
        minMmr: parseInt(tour.min_mmr),
        maxMmr: parseInt(tour.max_mmr),
        questionCount: parseInt(tour.question_count),
        timePerQuestionMs: tour.time_per_question_ms ? parseInt(tour.time_per_question_ms) : null,
        registrationStart: tour.registration_start,
        registrationEnd: tour.registration_end,
        tournamentStart: tour.tournament_start,
        status: tour.status,
        currentRound: parseInt(tour.current_round) || 0,
        totalRounds: tour.total_rounds ? parseInt(tour.total_rounds) : null,
        winnerId: tour.winner_id || null,
        completedAt: tour.completed_at || null,
        rewards: sanitizeTournamentRewards(parseJsonb(tour.rewards, {})),
        allowSpectators: tour.allow_spectators,
        seedingMode: tour.seeding_mode || 'mmr',
        bestOfByRound: parseJsonb(tour.best_of_by_round, {}),
        grandFinalReset: tour.grand_final_reset === true,
        botPolicy: getTournamentBotPolicy(nk, logger, tour.id, tour.bot_policy),
        registeredCount: parseInt(tour.registered_count) || participants.length,
        participantCount: participants.length,
        eligibilityMmr: eligibilityMmr !== null ? eligibilityMmr : undefined,
        eligibilityMmrBasis: eligibilityMmrBasis !== null ? eligibilityMmrBasis : undefined,
        isEligible: isEligible !== null ? isEligible : undefined,
        questionPoolIds: includePoolIds ? (parseQuestionPoolIds(tour.question_pool_ids) || []) : undefined,
      },
      participants: participants,
      matches: matches,
      isRegistered: isRegistered,
      userParticipant: userParticipant,
      waitlistPosition: waitlistPosition,
    });
  } catch (error) {
    logger.error('Error getting tournament details: ' + error);
    throw error;
  }
}

export function rpcRegisterForTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    // Keep status transitions current before validating registration windows.
    syncTournamentStatuses(nk, logger);
    var request = JSON.parse(payload || '{}');
    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    // Get tournament and check eligibility
    var tourResult = nk.sqlQuery(
      `SELECT id, status, min_mmr, max_mmr, bracket_size,
              category,
              registration_start, registration_end,
              (SELECT COUNT(*) FROM tournament_participants WHERE tournament_id = t.id) as current_count
       FROM tournaments t
       WHERE id = $1`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];

    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    var tour = tourRows[0];

    if (tour.status !== 'registration') {
      throw new Error('Tournament is not accepting registrations');
    }

    var now = new Date();
    if (now < new Date(tour.registration_start) || now > new Date(tour.registration_end)) {
      throw new Error('Registration is not open');
    }

    if (parseInt(tour.current_count) >= parseInt(tour.bracket_size)) {
      throw new Error('Tournament is full');
    }

    // Get user's MMR (category MMR if tournament has category, otherwise global)
    var userGlobalMmr = 1000;
    var userCategoryMmr: any = null;
    try {
      var storageRead: nkruntime.StorageReadRequest[] = [
        { collection: 'player_data', key: 'global_mmr', userId: ctx.userId },
        { collection: 'player_data', key: 'category_mmr', userId: ctx.userId },
      ];
      var storageResults = nk.storageRead(storageRead);
      for (var sr = 0; sr < storageResults.length; sr++) {
        var row = storageResults[sr];
        if (row.key === 'global_mmr' && row.value && typeof row.value.mmr === 'number') {
          userGlobalMmr = row.value.mmr || userGlobalMmr;
        } else if (row.key === 'category_mmr') {
          userCategoryMmr = row.value || null;
        }
      }
    } catch (mmrReadError) {
      logger.warn('Failed to read player MMR for tournament registration: ' + mmrReadError);
    }

    var userMmr = userGlobalMmr;
    if (tour.category && typeof tour.category === 'string' && tour.category.trim().length > 0) {
      var catKey = normalizeCategory(tour.category);
      var catValue = userCategoryMmr && userCategoryMmr[catKey] && typeof userCategoryMmr[catKey].mmr === 'number'
        ? userCategoryMmr[catKey].mmr
        : null;
      if (typeof catValue === 'number' && Number.isFinite(catValue)) {
        userMmr = catValue;
      } else {
        // Fallback to global if category MMR not present yet
        userMmr = userGlobalMmr;
      }
    }

    if (userMmr < parseInt(tour.min_mmr) || userMmr > parseInt(tour.max_mmr)) {
      throw new Error(
        formatTournamentMmrRangeError(
          nk,
          logger,
          userMmr,
          parseInt(tour.min_mmr),
          parseInt(tour.max_mmr)
        )
      );
    }

    // Register with capacity guard (single-statement lock + insert)
    var regResult = nk.sqlQuery(
      `WITH locked AS MATERIALIZED (
         SELECT id, status, min_mmr, max_mmr, bracket_size, registration_start, registration_end, registered_count
         FROM tournaments
         WHERE id = $1::uuid
         FOR UPDATE
       ),
       inserted AS (
         INSERT INTO tournament_participants (tournament_id, user_id, mmr_at_registration)
         SELECT $1::uuid, $2, $3
         FROM locked
         WHERE locked.status = 'registration'
           AND NOW() BETWEEN locked.registration_start AND locked.registration_end
           AND locked.registered_count < locked.bracket_size
           AND $3 BETWEEN locked.min_mmr AND locked.max_mmr
           AND NOT EXISTS (
             SELECT 1 FROM tournament_participants WHERE tournament_id = $1::uuid AND user_id = $2
           )
         ON CONFLICT (tournament_id, user_id) DO NOTHING
         RETURNING id
       ),
       updated AS (
         UPDATE tournaments
         SET registered_count = registered_count + 1
         WHERE id = $1::uuid AND EXISTS (SELECT 1 FROM inserted)
         RETURNING registered_count
       )
       SELECT
         (SELECT id FROM inserted) as inserted_id,
         (SELECT status FROM locked) as status,
         (SELECT registration_start FROM locked) as registration_start,
         (SELECT registration_end FROM locked) as registration_end,
         (SELECT registered_count FROM locked) as registered_count,
         (SELECT bracket_size FROM locked) as bracket_size,
         (SELECT min_mmr FROM locked) as min_mmr,
         (SELECT max_mmr FROM locked) as max_mmr`,
      [request.tournamentId, ctx.userId, userMmr]
    );
    var regRows = Array.isArray(regResult) ? regResult : [];
    if (regRows.length === 0) {
      throw new Error('Tournament not found');
    }

    var regRow = regRows[0] as any;
    if (!regRow.inserted_id) {
      var alreadyResult = nk.sqlQuery(
        `SELECT 1 FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2`,
        [request.tournamentId, ctx.userId]
      );
      var alreadyRows = Array.isArray(alreadyResult) ? alreadyResult : [];
      if (alreadyRows.length > 0) {
        throw new Error('Already registered for this tournament');
      }

      // Check if user is already on the waitlist
      var waitlistCheck = nk.sqlQuery(
        `SELECT position FROM tournament_waitlist
         WHERE tournament_id = $1 AND user_id = $2 AND status = 'waiting'`,
        [request.tournamentId, ctx.userId]
      );
      var wlCheckRows = Array.isArray(waitlistCheck) ? waitlistCheck : [];
      if (wlCheckRows.length > 0) {
        return JSON.stringify({
          success: true,
          waitlisted: true,
          position: parseInt(wlCheckRows[0].position),
          tournamentId: request.tournamentId,
        });
      }

      var nowCheck = new Date();
      if (regRow.status && regRow.status !== 'registration') {
        throw new Error('Tournament is not accepting registrations');
      }
      if (regRow.registration_start && regRow.registration_end) {
        if (nowCheck < new Date(regRow.registration_start) || nowCheck > new Date(regRow.registration_end)) {
          throw new Error('Registration is not open');
        }
      }
      if (regRow.registered_count !== undefined && regRow.bracket_size !== undefined) {
        var registeredCount = parseInt(regRow.registered_count);
        var bracketSize = parseInt(regRow.bracket_size);
        if (!Number.isNaN(registeredCount) && !Number.isNaN(bracketSize) && registeredCount >= bracketSize) {
          // Tournament is full — automatically join waitlist if eligible
          var waitlistResult = nk.sqlQuery(
            `INSERT INTO tournament_waitlist (tournament_id, user_id, mmr_at_join, position)
             SELECT $1::uuid, $2, $3,
                    COALESCE((SELECT MAX(position) FROM tournament_waitlist
                              WHERE tournament_id = $1::uuid AND status = 'waiting'), 0) + 1
             WHERE NOT EXISTS (
               SELECT 1 FROM tournament_waitlist
               WHERE tournament_id = $1::uuid AND user_id = $2 AND status = 'waiting'
             )
             RETURNING position`,
            [request.tournamentId, ctx.userId, userMmr]
          );
          var waitlistRows = Array.isArray(waitlistResult) ? waitlistResult : [];
          if (waitlistRows.length > 0) {
            return JSON.stringify({
              success: true,
              waitlisted: true,
              position: parseInt(waitlistRows[0].position),
              tournamentId: request.tournamentId,
            });
          }
          throw new Error('Tournament is full and waitlist is at capacity');
        }
      }
      if (regRow.min_mmr !== undefined && regRow.max_mmr !== undefined) {
        var minMmrRow = parseInt(regRow.min_mmr);
        var maxMmrRow = parseInt(regRow.max_mmr);
        if (userMmr < minMmrRow || userMmr > maxMmrRow) {
          throw new Error(formatTournamentMmrRangeError(nk, logger, userMmr, minMmrRow, maxMmrRow));
        }
      }
      throw new Error('Failed to register for this tournament');
    }

    return JSON.stringify({
      success: true,
      participantId: regRow.inserted_id,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error registering for tournament: ' + error);
    throw error;
  }
}

export function rpcWithdrawFromTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    // Ensure status reflects current schedule before enforcing withdraw rules.
    syncTournamentStatuses(nk, logger);
    var request = JSON.parse(payload || '{}');
    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    // Check tournament status
    var tourResult = nk.sqlQuery(
      `SELECT status FROM tournaments WHERE id = $1`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];

    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    if (tourRows[0].status !== 'registration' && tourRows[0].status !== 'upcoming') {
      throw new Error('Cannot withdraw after tournament has started');
    }

    // Atomic CTE: delete participant + recalculate count in one statement.
    // Recalculation (not decrement) ensures the waitlist auto-promote trigger
    // is correctly reflected in registered_count when it fires mid-DELETE.
    var deleteResult = nk.sqlQuery(
      `WITH deleted AS (
         DELETE FROM tournament_participants
         WHERE tournament_id = $1::uuid AND user_id = $2
         RETURNING id
       )
       UPDATE tournaments
       SET registered_count = (
         SELECT COUNT(*)::int FROM tournament_participants
         WHERE tournament_id = $1::uuid
       )
       WHERE id = $1::uuid
         AND EXISTS (SELECT 1 FROM deleted)
       RETURNING (SELECT COUNT(*) FROM deleted) as deleted_count`,
      [request.tournamentId, ctx.userId]
    );
    var deleteRows = Array.isArray(deleteResult) ? deleteResult : [];
    var didDelete = deleteRows.length > 0 && parseInt(deleteRows[0].deleted_count) > 0;

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error withdrawing from tournament: ' + error);
    throw error;
  }
}

export function rpcWithdrawFromWaitlist(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    var request = JSON.parse(payload || '{}');
    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    var deleteResult = nk.sqlQuery(
      `UPDATE tournament_waitlist
       SET status = 'withdrawn'
       WHERE tournament_id = $1::uuid AND user_id = $2 AND status = 'waiting'
       RETURNING id`,
      [request.tournamentId, ctx.userId]
    );
    var deleteRows = Array.isArray(deleteResult) ? deleteResult : [];

    // Re-number remaining positions
    if (deleteRows.length > 0) {
      nk.sqlExec(
        `UPDATE tournament_waitlist tw
         SET position = sub.new_pos
         FROM (
           SELECT id, ROW_NUMBER() OVER (ORDER BY position) as new_pos
           FROM tournament_waitlist
           WHERE tournament_id = $1::uuid AND status = 'waiting'
         ) sub
         WHERE tw.id = sub.id AND tw.position <> sub.new_pos`,
        [request.tournamentId]
      );
    }

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error withdrawing from waitlist: ' + error);
    throw error;
  }
}

export function rpcGetMyTournaments(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    // Status sync is handled by the cron job every 20s — read-only RPCs
    // skip the expensive progression pass to stay fast at scale.
    var result = nk.sqlQuery(
      `SELECT t.id, t.name, t.description, t.format, t.bracket_size,
              t.category, t.min_mmr, t.max_mmr, t.question_count,
              t.registration_start, t.registration_end, t.tournament_start,
              t.status, t.current_round, t.rewards, t.allow_spectators,
              t.seeding_mode, t.best_of_by_round, t.grand_final_reset,
              t.bot_policy,
              t.registered_count,
              (SELECT COUNT(*) FROM tournament_participants tp2 WHERE tp2.tournament_id = t.id AND tp2.status IN ('registered', 'checked_in', 'active', 'eliminated', 'winner', 'forfeited', 'disqualified')) as participant_count,
              tp.status as participant_status, tp.final_placement
       FROM tournaments t
       JOIN tournament_participants tp ON tp.tournament_id = t.id
       WHERE tp.user_id = $1
       ORDER BY ${getTournamentBrowseOrderSql()}
       LIMIT 20`,
      [ctx.userId]
    );
    var rows = Array.isArray(result) ? result : [];

    var tournaments = rows.map(function(row: any) {
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        format: row.format,
        bracketSize: parseInt(row.bracket_size),
        category: row.category,
        minMmr: parseInt(row.min_mmr),
        maxMmr: parseInt(row.max_mmr),
        questionCount: parseInt(row.question_count),
        registrationStart: row.registration_start,
        registrationEnd: row.registration_end,
        tournamentStart: row.tournament_start,
        status: row.status,
        currentRound: parseInt(row.current_round) || 0,
        rewards: sanitizeTournamentRewards(parseJsonb(row.rewards, {})),
        allowSpectators: row.allow_spectators,
        seedingMode: row.seeding_mode || 'mmr',
        bestOfByRound: parseJsonb(row.best_of_by_round, {}),
        grandFinalReset: row.grand_final_reset === true,
        botPolicy: getTournamentBotPolicy(nk, logger, row.id, row.bot_policy),
        registeredCount: parseInt(row.registered_count) || 0,
        participantCount: parseInt(row.participant_count) || 0,
        participantStatus: row.participant_status,
        finalPlacement: row.final_placement ? parseInt(row.final_placement) : null,
        isRegistered: true,
      };
    });

    return JSON.stringify({
      tournaments: tournaments,
    });
  } catch (error) {
    logger.error('Error getting my tournaments: ' + error);
    throw error;
  }
}

export function rpcAdminCreateTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.name || !request.bracketSize || !request.registrationStart ||
        !request.registrationEnd || !request.tournamentStart) {
      throw new Error('name, bracketSize, registrationStart, registrationEnd, and tournamentStart are required');
    }

    var validSizes = [8, 16, 32, 64, 128];
    if (validSizes.indexOf(request.bracketSize) === -1) {
      throw new Error('bracketSize must be one of: ' + validSizes.join(', '));
    }

    var seedingMode = request.seedingMode || request.seeding_mode || 'mmr';
    var validSeedingModes = ['mmr', 'random_opening_round', 'manual'];
    if (validSeedingModes.indexOf(seedingMode) === -1) {
      throw new Error('seedingMode must be one of: ' + validSeedingModes.join(', '));
    }

    if (request.timePerQuestionMs !== undefined) {
      if (typeof request.timePerQuestionMs !== 'number' || request.timePerQuestionMs < 5000 || request.timePerQuestionMs > 200000) {
        throw new Error('timePerQuestionMs must be between 5000 and 200000');
      }
    }

    var totalRounds = Math.ceil(Math.log2(request.bracketSize));
    var bestOfByRound = buildBestOfByRound(
      request.bracketSize,
      request.format || 'single_elimination',
      seedingMode,
      request.bestOfByRound
    );
    var grandFinalReset = request.grandFinalReset === true;

    var rewards = sanitizeTournamentRewards(request.rewards || {
      '1st': { mmr_bonus: 100 },
      '2nd': { mmr_bonus: 50 },
      '3rd': { mmr_bonus: 25 },
      'top8': { mmr_bonus: 10 },
      'participant': {},
    });

    var resolvedCategory: string | null = null;
    if (request.category !== undefined && request.category !== null && String(request.category).trim().length > 0) {
      var normalizedCategory = normalizeCategory(String(request.category));
      if (!normalizedCategory || !isValidCategoryFromDb(nk, logger, normalizedCategory)) {
        throw new Error('Invalid category');
      }
      resolvedCategory = normalizedCategory;
    }
    var questionCountCap = getQuestionCountCapForCategory(nk, logger, resolvedCategory);
    var questionCountValue = getQuestionCountDefaultForCategory(nk, logger, resolvedCategory);
    if (request.questionCount !== undefined) {
      if (typeof request.questionCount !== 'number' || request.questionCount < 1 || request.questionCount > 1000) {
        throw new Error('questionCount must be between 1 and 1000');
      }
      questionCountValue = Math.floor(request.questionCount);
      if (questionCountValue > questionCountCap) {
        throw new Error('questionCount exceeds allowed max for selected category (' + questionCountCap + ')');
      }
    } else {
      questionCountValue = Math.max(1, Math.min(questionCountValue, questionCountCap));
    }

    var questionPoolIds = parseQuestionPoolIds(request.questionPoolIds || request.question_pool_ids);
    var questionPoolLiteral = questionPoolIds ? toPgUuidArrayLiteral(questionPoolIds) : null;
    var botPolicyOverride = sanitizeTournamentBotPolicyOverride(
      request.botPolicy !== undefined ? request.botPolicy : request.bot_policy
    );

    var result = nk.sqlQuery(
      `INSERT INTO tournaments (name, description, format, bracket_size, category,
                                min_mmr, max_mmr, question_count, time_per_question_ms,
                                registration_start, registration_end, tournament_start,
                                total_rounds, rewards, allow_spectators, question_pool_ids, created_by,
                                seeding_mode, best_of_by_round, grand_final_reset, bot_policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::uuid[], $17, $18, $19, $20, $21)
       RETURNING id, name, registration_start, registration_end, tournament_start`,
      [
        request.name,
        request.description || '',
        request.format || 'single_elimination',
        request.bracketSize,
        resolvedCategory,
        request.minMmr || 0,
        request.maxMmr || 10000,
        questionCountValue,
        request.timePerQuestionMs || 15000,
        request.registrationStart,
        request.registrationEnd,
        request.tournamentStart,
        totalRounds,
        JSON.stringify(rewards),
        request.allowSpectators !== false,
        questionPoolLiteral,
        ctx.userId,
        seedingMode,
        JSON.stringify(bestOfByRound),
        grandFinalReset,
        JSON.stringify(botPolicyOverride),
      ]
    );
    var rows = Array.isArray(result) ? result : [];

    if (rows.length > 0) {
      enqueueTournamentCreatedCampaign(nk, logger, {
        id: String(rows[0].id),
        name: String(rows[0].name || request.name || 'Tournament'),
        registrationStart: rows[0].registration_start ? String(rows[0].registration_start) : undefined,
        registrationEnd: rows[0].registration_end ? String(rows[0].registration_end) : undefined,
        tournamentStart: rows[0].tournament_start ? String(rows[0].tournament_start) : undefined,
      });
    }

    return JSON.stringify({
      success: true,
      tournamentId: rows.length > 0 ? rows[0].id : null,
    });
  } catch (error) {
    logger.error('Error creating tournament: ' + error);
    throw error;
  }
}

export function rpcAdminUpdateTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var txStarted = false;
  try {
    requireAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    nk.sqlExec('BEGIN', []);
    txStarted = true;

    // Check tournament can be updated under lock so status cannot race with start/resume.
    var checkResult = nk.sqlQuery(
      `SELECT status, bracket_size, format, seeding_mode, category
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [request.tournamentId]
    );
    var checkRows = Array.isArray(checkResult) ? checkResult : [];

    if (checkRows.length === 0) {
      throw new Error('Tournament not found');
    }

    if (checkRows[0].status === 'in_progress' || checkRows[0].status === 'completed') {
      throw new Error('Cannot update tournament that is in progress or completed');
    }

    if (request.timePerQuestionMs !== undefined) {
      if (typeof request.timePerQuestionMs !== 'number' || request.timePerQuestionMs < 5000 || request.timePerQuestionMs > 200000) {
        throw new Error('timePerQuestionMs must be between 5000 and 200000');
      }
    }

    var updates: string[] = [];
    var params: any[] = [];
    var paramIndex = 1;
    var bestOfByRound: any = undefined;
    var bestOfResyncStats = {
      scanned: 0,
      updated: 0,
      skipped: 0,
      wouldUpdate: 0,
    };

    var fieldMap: {[key: string]: string} = {
      name: 'name',
      description: 'description',
      format: 'format',
      minMmr: 'min_mmr',
      maxMmr: 'max_mmr',
      questionCount: 'question_count',
      timePerQuestionMs: 'time_per_question_ms',
      registrationStart: 'registration_start',
      registrationEnd: 'registration_end',
      tournamentStart: 'tournament_start',
      allowSpectators: 'allow_spectators',
      status: 'status',
    };

    // Category update (validate + allow NULL for mixed)
    var existingCategoryValue = checkRows[0].category ? normalizeCategory(String(checkRows[0].category)) : null;
    var newCategoryValue: string | null = existingCategoryValue;
    if (request.category !== undefined) {
      newCategoryValue = null;
      if (request.category !== null && String(request.category).trim().length > 0) {
        var normalizedCategory = normalizeCategory(String(request.category));
        if (!normalizedCategory || !isValidCategoryFromDb(nk, logger, normalizedCategory)) {
          throw new Error('Invalid category');
        }
        newCategoryValue = normalizedCategory;
      }
      updates.push('category = $' + paramIndex);
      params.push(newCategoryValue);
      paramIndex++;
    }

    if (request.questionCount !== undefined) {
      if (typeof request.questionCount !== 'number' || request.questionCount < 1 || request.questionCount > 1000) {
        throw new Error('questionCount must be between 1 and 1000');
      }
      var questionCountCap = getQuestionCountCapForCategory(nk, logger, newCategoryValue);
      var requestedQuestionCount = Math.floor(request.questionCount);
      if (requestedQuestionCount > questionCountCap) {
        throw new Error('questionCount exceeds allowed max for selected category (' + questionCountCap + ')');
      }
      request.questionCount = requestedQuestionCount;
    }

    // Question pool update (optional UUID[])
    if (request.questionPoolIds !== undefined || request.question_pool_ids !== undefined) {
      var poolIds = parseQuestionPoolIds(request.questionPoolIds || request.question_pool_ids);
      var poolLiteral = poolIds ? toPgUuidArrayLiteral(poolIds) : null;
      updates.push('question_pool_ids = $' + paramIndex + '::uuid[]');
      params.push(poolLiteral);
      paramIndex++;
    }

    if (request.botPolicy !== undefined || request.bot_policy !== undefined) {
      var botPolicyRaw = request.botPolicy !== undefined ? request.botPolicy : request.bot_policy;
      var botPolicyOverride = sanitizeTournamentBotPolicyOverride(botPolicyRaw);
      updates.push('bot_policy = $' + paramIndex);
      params.push(JSON.stringify(botPolicyOverride));
      paramIndex++;
    }

    // Seeding mode update (pre-start only)
    if (request.seedingMode || request.seeding_mode) {
      var newSeedingMode = request.seedingMode || request.seeding_mode;
      var validSeedingModes = ['mmr', 'random_opening_round', 'manual'];
      if (validSeedingModes.indexOf(newSeedingMode) === -1) {
        throw new Error('seedingMode must be one of: ' + validSeedingModes.join(', '));
      }
      updates.push('seeding_mode = $' + paramIndex);
      params.push(newSeedingMode);
      paramIndex++;
    }

    // Grand final reset toggle
    if (typeof request.grandFinalReset === 'boolean') {
      updates.push('grand_final_reset = $' + paramIndex);
      params.push(request.grandFinalReset);
      paramIndex++;
    }

    // Best-of by round config (per-round)
    if (request.bestOfByRound !== undefined) {
      var currentFormat = request.format || checkRows[0].format || 'single_elimination';
      var currentSeeding = request.seedingMode || request.seeding_mode || checkRows[0].seeding_mode || 'mmr';
      var bracketSize = parseInt(checkRows[0].bracket_size) || 8;
      bestOfByRound = buildBestOfByRound(bracketSize, currentFormat, currentSeeding, request.bestOfByRound);
      updates.push('best_of_by_round = $' + paramIndex);
      params.push(JSON.stringify(bestOfByRound));
      paramIndex++;
    }

    for (var key in fieldMap) {
      if (request[key] !== undefined) {
        updates.push(fieldMap[key] + ' = $' + paramIndex);
        params.push(request[key]);
        paramIndex++;
      }
    }

    if (request.rewards) {
      updates.push('rewards = $' + paramIndex);
      params.push(JSON.stringify(sanitizeTournamentRewards(request.rewards)));
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push('updated_at = NOW()');
    params.push(request.tournamentId);

    var updateResult = nk.sqlQuery(
      `UPDATE tournaments
       SET ` + updates.join(', ') + `
       WHERE id = $` + paramIndex + `
         AND status NOT IN ('in_progress', 'completed')
       RETURNING id`,
      params
    );
    var updatedRows = Array.isArray(updateResult) ? updateResult : [];
    if (updatedRows.length === 0) {
      throw new Error('Tournament status changed concurrently. Please retry.');
    }

    if (bestOfByRound !== undefined) {
      var updatedSeedingMode = request.seedingMode || request.seeding_mode || checkRows[0].seeding_mode || 'mmr';
      bestOfResyncStats = resyncTournamentMatchBestOf(
        nk,
        request.tournamentId,
        updatedSeedingMode,
        bestOfByRound,
        false
      );
    }

    nk.sqlExec('COMMIT', []);
    txStarted = false;

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
      bestOfResync: bestOfResyncStats,
    });
  } catch (error) {
    if (txStarted) {
      try {
        nk.sqlExec('ROLLBACK', []);
      } catch (rollbackError) {
        logger.warn('Update tournament rollback failed: ' + rollbackError);
      }
    }
    logger.error('Error updating tournament: ' + error);
    throw error;
  }
}

export function generateTournamentBracket(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  bracketSize: number,
  format: string,
  seedingMode?: string,
  bestOfByRound?: any
): void {
  var resolvedSeedingMode = seedingMode || 'mmr';
  var resolvedBestOfByRound = bestOfByRound;

  if (!resolvedSeedingMode || !resolvedBestOfByRound) {
    var configResult = nk.sqlQuery(
      `SELECT seeding_mode, best_of_by_round
       FROM tournaments
       WHERE id = $1`,
      [tournamentId]
    );
    var configRows = Array.isArray(configResult) ? configResult : [];
    if (configRows.length > 0) {
      resolvedSeedingMode = resolvedSeedingMode || configRows[0].seeding_mode || 'mmr';
      resolvedBestOfByRound = resolvedBestOfByRound || parseJsonb(configRows[0].best_of_by_round, null);
    }
  }

  if (resolvedSeedingMode !== 'mmr' && resolvedSeedingMode !== 'random_opening_round' && resolvedSeedingMode !== 'manual') {
    resolvedSeedingMode = 'mmr';
  }

  var bestOfConfig = buildBestOfByRound(bracketSize, format, resolvedSeedingMode, resolvedBestOfByRound);

  // Get participants
  var partResult = nk.sqlQuery(
    `SELECT id, user_id, mmr_at_registration, seed_number
     FROM tournament_participants
     WHERE tournament_id = $1 AND status = 'registered'`,
    [tournamentId]
  );
  var participants = Array.isArray(partResult) ? partResult : [];

  if (participants.length < 2) {
    throw new Error('Need at least 2 participants to start tournament');
  }

  // Assign seeds based on seeding mode (MMR, random opening, or manual override)
  var seededParticipants: any[] = [];
  var unseededParticipants: any[] = [];
  var usedSeeds: {[key: number]: boolean} = {};

  for (var i = 0; i < participants.length; i++) {
    var seedNum = participants[i].seed_number ? parseInt(participants[i].seed_number) : 0;
    if (seedNum && seedNum > 0) {
      usedSeeds[seedNum] = true;
      seededParticipants.push({ ...participants[i], seed_number: seedNum });
    } else {
      unseededParticipants.push(participants[i]);
    }
  }

  // Helper to shuffle array
  function shuffle(arr: any[]): any[] {
    var copy = arr.slice();
    for (var s = copy.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1));
      var tmp = copy[s];
      copy[s] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  // Determine ordering for unseeded participants
  var orderedUnseeded = unseededParticipants;
  if (resolvedSeedingMode === 'random_opening_round') {
    orderedUnseeded = shuffle(unseededParticipants);
  } else if (resolvedSeedingMode === 'mmr') {
    orderedUnseeded = unseededParticipants.sort(function(a: any, b: any) {
      return (parseInt(b.mmr_at_registration) || 0) - (parseInt(a.mmr_at_registration) || 0);
    });
  } else {
    // manual mode: keep MMR order for any missing seeds to stay deterministic
    orderedUnseeded = unseededParticipants.sort(function(a: any, b: any) {
      return (parseInt(b.mmr_at_registration) || 0) - (parseInt(a.mmr_at_registration) || 0);
    });
  }

  // Assign remaining seeds in order
  var nextSeed = 1;
  for (var u = 0; u < orderedUnseeded.length; u++) {
    while (usedSeeds[nextSeed]) {
      nextSeed++;
    }
    orderedUnseeded[u].seed_number = nextSeed;
    usedSeeds[nextSeed] = true;
  }

  // Merge and sort by seed number
  var allSeeded = seededParticipants.concat(orderedUnseeded);
  allSeeded.sort(function(a: any, b: any) {
    return (parseInt(a.seed_number) || 0) - (parseInt(b.seed_number) || 0);
  });

  // Persist seeds and set active
  for (var s = 0; s < allSeeded.length; s++) {
    nk.sqlExec(
      `UPDATE tournament_participants SET seed_number = $1, status = 'active' WHERE id = $2`,
      [allSeeded[s].seed_number, allSeeded[s].id]
    );
  }

  // Create first round matches with proper tournament seeding
  // Standard bracket seeding: (1 vs bracketSize), (bracketSize/2+1 vs bracketSize/2), etc.
  // This ensures top seeds meet later in tournament
  var totalRounds = Math.ceil(Math.log2(bracketSize));
  var round1Matches = bracketSize / 2;

  // Generate seeding order for proper bracket placement.
  // Uses the recursive "perfect bracket" algorithm so that seed 1
  // and seed 2 always land in opposite halves and can only meet in
  // the final.  Examples:
  //   size  4  → [1,4, 2,3]
  //   size  8  → [1,8, 4,5, 2,7, 3,6]
  //   size 16  → [1,16, 8,9, 4,13, 5,12, 2,15, 7,10, 3,14, 6,11]
  function getSeededPairings(size: number): number[][] {
    // Recursively build the seed placement order
    function seedOrder(n: number): number[] {
      if (n <= 2) return [1, 2];
      var prev = seedOrder(n / 2);
      var result: number[] = [];
      for (var i = 0; i < prev.length; i++) {
        result.push(prev[i]);
        result.push(n + 1 - prev[i]);
      }
      return result;
    }

    var order = seedOrder(size);
    var pairs: number[][] = [];
    for (var i = 0; i < order.length; i += 2) {
      pairs.push([order[i], order[i + 1]]);
    }
    return pairs;
  }

  var seededPairs = getSeededPairings(bracketSize);

  for (var matchNum = 1; matchNum <= round1Matches; matchNum++) {
    var pair = seededPairs[matchNum - 1] || [matchNum * 2 - 1, matchNum * 2];
    var seed1 = pair[0] - 1; // Convert to 0-indexed
    var seed2 = pair[1] - 1;

    var player1 = seed1 < allSeeded.length ? allSeeded[seed1] : null;
    var player2 = seed2 < allSeeded.length ? allSeeded[seed2] : null;

    var status = 'pending';
    var winnerParticipantId = null;
    if (!player1 && !player2) {
      status = 'bye';
    } else if (!player1 || !player2) {
      status = 'bye';
      // Auto-advance the player who has a bye
      var advancingPlayer = player1 || player2;
      winnerParticipantId = advancingPlayer ? advancingPlayer.id : null;
      if (advancingPlayer) {
        logger.info('Player ' + advancingPlayer.id + ' gets a bye in round 1 match ' + matchNum);
      }
    } else {
      status = 'ready';
    }

    // Calculate completed_at in JS to avoid PostgreSQL parameter type inference issues
    var completedAt = status === 'bye' ? new Date().toISOString() : null;
    var isOpeningRound = resolvedSeedingMode === 'random_opening_round';
    var bestOf = getBestOfForMatch(bestOfConfig, 'winners', 1, isOpeningRound);
    nk.sqlExec(
      `INSERT INTO tournament_matches (tournament_id, round_number, match_number, bracket_type,
                                       player1_participant_id, player2_participant_id, status,
                                       winner_participant_id, completed_at, best_of, ready_player1, ready_player2, ready_at)
       VALUES ($1, 1, $2, 'winners', $3, $4, $5, $6, $7, $8, false, false, CASE WHEN $5::varchar = 'ready' THEN NOW() ELSE NULL END)`,
      [tournamentId, matchNum, player1?.id || null, player2?.id || null, status, winnerParticipantId, completedAt, bestOf]
    );
  }

  // Create placeholder matches for subsequent rounds (winners bracket)
  var matchesInPreviousRound = round1Matches;
  for (var round = 2; round <= totalRounds; round++) {
    // Derive each round from the previous round's actual match count so
    // non-power-of-two brackets do not create unreachable placeholder matches.
    var matchesInRound = Math.max(1, Math.ceil(matchesInPreviousRound / 2));
    for (var m = 1; m <= matchesInRound; m++) {
      var roundBestOf = getBestOfForMatch(bestOfConfig, 'winners', round, false);
      nk.sqlExec(
        `INSERT INTO tournament_matches (tournament_id, round_number, match_number, bracket_type, status, best_of)
         VALUES ($1, $2, $3, 'winners', 'pending', $4)`,
        [tournamentId, round, m, roundBestOf]
      );
    }
    matchesInPreviousRound = matchesInRound;
  }

  if (format === 'double_elimination') {
    var totalLosersRounds = Math.max(0, (totalRounds - 1) * 2);
    var getLosersRoundMatchCount = function(size: number, roundNumber: number): number {
      if (roundNumber <= 0) return 0;
      if (roundNumber % 2 === 1) {
        return Math.floor(size / Math.pow(2, (roundNumber + 3) / 2));
      }
      return Math.floor(size / Math.pow(2, (roundNumber / 2) + 1));
    };

    for (var lRound = 1; lRound <= totalLosersRounds; lRound++) {
      var losersMatches = getLosersRoundMatchCount(bracketSize, lRound);
      for (var lm = 1; lm <= losersMatches; lm++) {
        var losersBestOf = getBestOfForMatch(bestOfConfig, 'losers', lRound, false);
        nk.sqlExec(
          `INSERT INTO tournament_matches (tournament_id, round_number, match_number, bracket_type, status, best_of)
           VALUES ($1, $2, $3, 'losers', 'pending', $4)`,
          [tournamentId, lRound, lm, losersBestOf]
        );
      }
    }

    // Grand final placeholder
    var grandFinalBestOf = getBestOfForMatch(bestOfConfig, 'grand_final', 1, false);
    nk.sqlExec(
      `INSERT INTO tournament_matches (tournament_id, round_number, match_number, bracket_type, status, best_of)
       VALUES ($1, $2, 1, 'grand_final', 'pending', $3)`,
      [tournamentId, totalRounds + totalLosersRounds + 1, grandFinalBestOf]
    );
  }

  logger.info('Generated bracket for tournament ' + tournamentId + ' with ' + participants.length + ' participants');
}

export function rpcAdminStartTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var txStarted = false;
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    // Prevent stale status from blocking valid admin starts.
    syncTournamentStatuses(nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    nk.sqlExec(`BEGIN`, []);
    txStarted = true;

    var tourResult = nk.sqlQuery(
      `SELECT status, bracket_size, format, seeding_mode, best_of_by_round, bot_policy
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];

    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    // After syncTournamentStatuses, the tournament may have been auto-started
    // (tournament_start <= NOW()).  Treat this as success — the tournament is
    // already in_progress with a bracket generated.  Avoid rejecting the admin
    // action when the outcome they wanted has already been achieved.
    if (tourRows[0].status === 'in_progress') {
      nk.sqlExec(`COMMIT`, []);
      txStarted = false;
      return JSON.stringify({
        success: true,
        alreadyStarted: true,
        tournamentId: request.tournamentId,
      });
    }

    if (tourRows[0].status !== 'registration') {
      throw new Error('Tournament must be in registration status to start (current status: ' + tourRows[0].status + ')');
    }

    var bracketSize = parseInt(tourRows[0].bracket_size) || 0;
    var tournamentBotPolicy = getTournamentBotPolicy(nk, logger, request.tournamentId, tourRows[0].bot_policy);
    fillTournamentWithBots(
      nk,
      logger,
      request.tournamentId,
      bracketSize,
      tournamentBotPolicy
    );

    // Pre-check participant count with detailed breakdown.
    // Keep this aligned with bracket generation which seeds `registered` participants.
    var participantCountResult = nk.sqlQuery(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'registered') as registered_count,
         COUNT(*) as total_count
       FROM tournament_participants
       WHERE tournament_id = $1`,
      [request.tournamentId]
    );
    var countRows = Array.isArray(participantCountResult) ? participantCountResult : [];
    var registeredCount = countRows.length > 0 ? parseInt(countRows[0].registered_count) || 0 : 0;
    var totalCount = countRows.length > 0 ? parseInt(countRows[0].total_count) || 0 : 0;

    if (tournamentBotPolicy.enabled && tournamentBotPolicy.fillOnStart && registeredCount < bracketSize) {
      throw new Error(
        'Tournament bot fill is enabled but bracket is underfilled. ' +
        'Expected ' + bracketSize + ' registered participants, found ' + registeredCount + '.'
      );
    }

    if (registeredCount < 2) {
      var errorMsg = 'Need at least 2 registered participants to start tournament. ';
      errorMsg += 'Found: ' + registeredCount + ' registered';
      if (totalCount !== registeredCount) {
        errorMsg += ' (' + totalCount + ' total participants with various statuses)';
      }
      throw new Error(errorMsg);
    }

    var matchesResult = nk.sqlQuery(
      `SELECT 1 FROM tournament_matches WHERE tournament_id = $1 LIMIT 1`,
      [request.tournamentId]
    );
    var matchesRows = Array.isArray(matchesResult) ? matchesResult : [];

    // Generate bracket if not already created
    if (matchesRows.length === 0) {
      try {
        generateTournamentBracket(
          nk, logger,
          request.tournamentId,
          bracketSize,
          tourRows[0].format,
          tourRows[0].seeding_mode || 'mmr',
          parseJsonb(tourRows[0].best_of_by_round, null)
        );
      } catch (bracketError) {
        logger.error('Failed to generate bracket: ' + bracketError);
        throw new Error('Failed to generate tournament bracket: ' + (bracketError instanceof Error ? bracketError.message : String(bracketError)));
      }

      // Verify bracket was actually created
      var verifyBracket = nk.sqlQuery(
        `SELECT COUNT(*) as match_count FROM tournament_matches WHERE tournament_id = $1`,
        [request.tournamentId]
      );
      var verifyRows = Array.isArray(verifyBracket) ? verifyBracket : [];
      var matchCount = verifyRows.length > 0 ? parseInt(verifyRows[0].match_count) : 0;
      if (matchCount === 0) {
        throw new Error('Bracket generation produced no matches - tournament cannot start');
      }
    }

    // Update status under the same lock/transaction.
    var updateRows = nk.sqlQuery(
      `UPDATE tournaments
       SET status = 'in_progress', current_round = 1,
       last_progression_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'registration'
       RETURNING id`,
      [request.tournamentId]
    );
    var updated = Array.isArray(updateRows) ? updateRows : [];
    if (updated.length === 0) {
      throw new Error('Tournament status changed concurrently. Please retry.');
    }

    nk.sqlExec(`COMMIT`, []);
    txStarted = false;

    runTournamentMaintenanceCycle(nk, logger, request.tournamentId);
    nk.sqlExec(
      `UPDATE tournaments SET last_progression_at = NOW() WHERE id = $1`,
      [request.tournamentId]
    );

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
      participantCount: registeredCount,
    });
  } catch (error) {
    if (txStarted) {
      try {
        nk.sqlExec(`ROLLBACK`, []);
      } catch (rollbackError) {
        logger.error('Failed to rollback tournament start transaction: ' + rollbackError);
      }
    }
    logger.error('Error starting tournament: ' + error);
    throw error;
  }
}

export function rpcAdminCancelTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    nk.sqlExec(
      `UPDATE tournaments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [request.tournamentId]
    );

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error cancelling tournament: ' + error);
    throw error;
  }
}

export function rpcAdminDeleteTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    // Check tournament status - only allow deletion of non-in_progress tournaments
    var tourResult = nk.sqlQuery(
      `SELECT status, name FROM tournaments WHERE id = $1`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];

    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    if (tourRows[0].status === 'in_progress') {
      throw new Error('Cannot delete a tournament that is in progress. Cancel or complete it first.');
    }

    var tournamentName = tourRows[0].name;
    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);

    // Delete related records first (cascade delete)
    nk.sqlExec(`DELETE FROM tournament_matches WHERE tournament_id = $1`, [request.tournamentId]);
    nk.sqlExec(`DELETE FROM tournament_participants WHERE tournament_id = $1`, [request.tournamentId]);
    nk.sqlExec(`DELETE FROM tournaments WHERE id = $1`, [request.tournamentId]);

    // Log the admin action
    logAdminActionFeatures(
      nk, logger, adminInfo.adminId, adminInfo.telegramId,
      'delete_tournament', 'tournament', request.tournamentId,
      { name: tournamentName, status: tourRows[0].status }, null, null
    );

    logger.info('Tournament deleted: ' + request.tournamentId + ' (' + tournamentName + ')');

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error deleting tournament: ' + error);
    throw error;
  }
}

export function rpcAdminPauseTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    // Check current status
    var tourResult = nk.sqlQuery(
      `SELECT status FROM tournaments WHERE id = $1`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];

    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    if (tourRows[0].status !== 'in_progress') {
      throw new Error('Only tournaments that are in progress can be paused');
    }

    // Atomic: only pause if no matches are in_progress right now.
    // This prevents the race where a match starts between the check and the UPDATE.
    var pauseResult = nk.sqlQuery(
      `UPDATE tournaments
       SET status = 'paused', updated_at = NOW()
       WHERE id = $1
         AND status = 'in_progress'
         AND NOT EXISTS (
           SELECT 1 FROM tournament_matches
           WHERE tournament_id = $1 AND status = 'in_progress'
         )
       RETURNING id`,
      [request.tournamentId]
    );
    var pauseRows = Array.isArray(pauseResult) ? pauseResult : [];
    if (pauseRows.length === 0) {
      // Check why it failed
      var hasActive = nk.sqlQuery(
        `SELECT 1 FROM tournament_matches
         WHERE tournament_id = $1 AND status = 'in_progress' LIMIT 1`,
        [request.tournamentId]
      );
      var hasActiveRows = Array.isArray(hasActive) ? hasActive : [];
      if (hasActiveRows.length > 0) {
        throw new Error('Cannot pause tournament while matches are in progress');
      }
      throw new Error('Only tournaments that are in progress can be paused');
    }

    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    logAdminActionFeatures(
      nk, logger, adminInfo.adminId, adminInfo.telegramId,
      'pause_tournament', 'tournament', request.tournamentId,
      { status: 'in_progress' }, { status: 'paused' }, null
    );

    logger.info('Tournament paused: ' + request.tournamentId);

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error pausing tournament: ' + error);
    throw error;
  }
}

export function rpcAdminResumeTournament(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    // Check current status
    var tourResult = nk.sqlQuery(
      `SELECT status FROM tournaments WHERE id = $1`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];

    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    if (tourRows[0].status !== 'paused') {
      throw new Error('Only paused tournaments can be resumed');
    }

    nk.sqlExec(
      `UPDATE tournaments SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
      [request.tournamentId]
    );

    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    logAdminActionFeatures(
      nk, logger, adminInfo.adminId, adminInfo.telegramId,
      'resume_tournament', 'tournament', request.tournamentId,
      { status: 'paused' }, { status: 'in_progress' }, null
    );

    logger.info('Tournament resumed: ' + request.tournamentId);

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error resuming tournament: ' + error);
    throw error;
  }
}

export function rpcAdminDisqualifyParticipant(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }
    if (!request.participantId) {
      throw new Error('participantId is required');
    }

    var reason = request.reason || 'Disqualified by admin';

    // Get participant and tournament info
    var participantResult = nk.sqlQuery(
      `SELECT tp.id, tp.user_id, tp.status, tp.is_bot, bp.bot_key,
              COALESCE(
                bp.display_name,
                NULLIF(TRIM(CONCAT(s.value->>'firstName', ' ', s.value->>'lastName')), ''),
                s.value->>'username',
                u.display_name,
                u.username,
                'Player'
              ) as display_name,
              t.status as tournament_status, t.format
       FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       LEFT JOIN tournament_bot_profiles bp ON bp.id = tp.bot_profile_id
       LEFT JOIN users u ON u.id = tp.user_id
       LEFT JOIN storage s ON s.user_id = tp.user_id AND s.collection = 'player_data' AND s.key = 'telegram'
       WHERE tp.id = $1 AND tp.tournament_id = $2`,
      [request.participantId, request.tournamentId]
    );
    var participantRows = Array.isArray(participantResult) ? participantResult : [];

    if (participantRows.length === 0) {
      throw new Error('Participant not found in this tournament');
    }

    var participant = participantRows[0];
    var participantDisplayName = parsePgBoolean(participant.is_bot)
      ? getTournamentBotDisplayName(participant.bot_key, participant.id, participant.display_name)
      : (participant.display_name || 'Player');

    if (participant.status === 'disqualified' || participant.status === 'eliminated') {
      throw new Error('Participant is already ' + participant.status);
    }

    if (participant.tournament_status !== 'in_progress' && participant.tournament_status !== 'paused') {
      throw new Error('Tournament must be in progress or paused to disqualify participants');
    }

    // Update participant status
    nk.sqlExec(
      `UPDATE tournament_participants SET
       status = 'disqualified',
       eliminated_at = NOW()
       WHERE id = $1`,
      [request.participantId]
    );

    var replacementResult = replaceParticipantInPendingOrReadyMatchWithBot(
      nk,
      logger,
      request.tournamentId,
      request.participantId
    );

    if (replacementResult.wasInProgress && replacementResult.matchId) {
      var inProgressMatchResult = nk.sqlQuery(
        `SELECT player1_participant_id, player2_participant_id
         FROM tournament_matches
         WHERE id = $1`,
        [replacementResult.matchId]
      );
      var inProgressRows = Array.isArray(inProgressMatchResult) ? inProgressMatchResult : [];
      if (inProgressRows.length > 0) {
        var inProgressMatch = inProgressRows[0];
        var opponentParticipantId = inProgressMatch.player1_participant_id === request.participantId
          ? inProgressMatch.player2_participant_id
          : inProgressMatch.player1_participant_id;
        if (opponentParticipantId) {
          var opponentResult = nk.sqlQuery(
            `SELECT user_id FROM tournament_participants WHERE id = $1`,
            [opponentParticipantId]
          );
          var opponentRows = Array.isArray(opponentResult) ? opponentResult : [];
          var opponentUserId = opponentRows.length > 0 ? opponentRows[0].user_id : null;
          if (opponentUserId) {
            autoReportTournamentResult(nk, logger, replacementResult.matchId, opponentUserId, 0, 0, false, true);
          }
        }
      }
    } else if (replacementResult.replaced) {
      runTournamentMaintenanceCycle(nk, logger, request.tournamentId);
    }

    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    logAdminActionFeatures(
      nk, logger, adminInfo.adminId, adminInfo.telegramId,
      'disqualify_participant', 'tournament_participant', request.participantId,
      { status: participant.status, displayName: participantDisplayName },
      { status: 'disqualified', reason: reason },
      { tournamentId: request.tournamentId }
    );

    logger.info('Participant disqualified: ' + request.participantId + ' from tournament ' + request.tournamentId);

    return JSON.stringify({
      success: true,
      participantId: request.participantId,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error disqualifying participant: ' + error);
    throw error;
  }
}

export function rpcAdminForfeitParticipant(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }
    if (!request.participantId) {
      throw new Error('participantId is required');
    }

    var reason = request.reason || 'Forfeited by admin';

    // Get participant and tournament info
    var participantResult = nk.sqlQuery(
      `SELECT tp.id, tp.user_id, tp.status, tp.is_bot, bp.bot_key,
              COALESCE(
                bp.display_name,
                NULLIF(TRIM(CONCAT(s.value->>'firstName', ' ', s.value->>'lastName')), ''),
                s.value->>'username',
                u.display_name,
                u.username,
                'Player'
              ) as display_name,
              t.status as tournament_status, t.format
       FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       LEFT JOIN tournament_bot_profiles bp ON bp.id = tp.bot_profile_id
       LEFT JOIN users u ON u.id = tp.user_id
       LEFT JOIN storage s ON s.user_id = tp.user_id AND s.collection = 'player_data' AND s.key = 'telegram'
       WHERE tp.id = $1 AND tp.tournament_id = $2`,
      [request.participantId, request.tournamentId]
    );
    var participantRows = Array.isArray(participantResult) ? participantResult : [];

    if (participantRows.length === 0) {
      throw new Error('Participant not found in this tournament');
    }

    var participant = participantRows[0];
    var participantDisplayName = parsePgBoolean(participant.is_bot)
      ? getTournamentBotDisplayName(participant.bot_key, participant.id, participant.display_name)
      : (participant.display_name || 'Player');

    if (participant.status === 'forfeited' || participant.status === 'eliminated' || participant.status === 'disqualified') {
      throw new Error('Participant is already ' + participant.status);
    }

    if (participant.tournament_status !== 'in_progress' && participant.tournament_status !== 'paused') {
      throw new Error('Tournament must be in progress or paused to forfeit participants');
    }

    // Update participant status
    nk.sqlExec(
      `UPDATE tournament_participants SET
       status = 'forfeited',
       eliminated_at = NOW()
       WHERE id = $1`,
      [request.participantId]
    );

    var replacementResult = replaceParticipantInPendingOrReadyMatchWithBot(
      nk,
      logger,
      request.tournamentId,
      request.participantId
    );

    if (replacementResult.wasInProgress && replacementResult.matchId) {
      var inProgressMatchResult = nk.sqlQuery(
        `SELECT player1_participant_id, player2_participant_id
         FROM tournament_matches
         WHERE id = $1`,
        [replacementResult.matchId]
      );
      var inProgressRows = Array.isArray(inProgressMatchResult) ? inProgressMatchResult : [];
      if (inProgressRows.length > 0) {
        var inProgressMatch = inProgressRows[0];
        var opponentParticipantId = inProgressMatch.player1_participant_id === request.participantId
          ? inProgressMatch.player2_participant_id
          : inProgressMatch.player1_participant_id;
        if (opponentParticipantId) {
          var opponentResult = nk.sqlQuery(
            `SELECT user_id FROM tournament_participants WHERE id = $1`,
            [opponentParticipantId]
          );
          var opponentRows = Array.isArray(opponentResult) ? opponentResult : [];
          var opponentUserId = opponentRows.length > 0 ? opponentRows[0].user_id : null;
          if (opponentUserId) {
            autoReportTournamentResult(nk, logger, replacementResult.matchId, opponentUserId, 0, 0, false, true);
          }
        }
      }
    } else if (replacementResult.replaced) {
      runTournamentMaintenanceCycle(nk, logger, request.tournamentId);
    }

    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    logAdminActionFeatures(
      nk, logger, adminInfo.adminId, adminInfo.telegramId,
      'forfeit_participant', 'tournament_participant', request.participantId,
      { status: participant.status, displayName: participantDisplayName },
      { status: 'forfeited', reason: reason },
      { tournamentId: request.tournamentId }
    );

    logger.info('Participant forfeited: ' + request.participantId + ' from tournament ' + request.tournamentId);

    return JSON.stringify({
      success: true,
      participantId: request.participantId,
      tournamentId: request.tournamentId,
    });
  } catch (error) {
    logger.error('Error forfeiting participant: ' + error);
    throw error;
  }
}

export function rpcAdminUpdateParticipantSeed(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }
    if (!request.participantId) {
      throw new Error('participantId is required');
    }
    if (typeof request.newSeed !== 'number' || request.newSeed < 1) {
      throw new Error('newSeed must be a positive number');
    }

    // Check tournament status
    var tourResult = nk.sqlQuery(
      `SELECT status, bracket_size FROM tournaments WHERE id = $1`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];

    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    if (tourRows[0].status !== 'upcoming' && tourRows[0].status !== 'registration') {
      throw new Error('Seeds can only be changed before the tournament starts');
    }

    var bracketSize = parseInt(tourRows[0].bracket_size);
    if (request.newSeed > bracketSize) {
      throw new Error('Seed number cannot exceed bracket size (' + bracketSize + ')');
    }

    // Get current participant info
    var participantResult = nk.sqlQuery(
      `SELECT tp.id, tp.seed_number, tp.is_bot, bp.bot_key,
              COALESCE(
                bp.display_name,
                NULLIF(TRIM(CONCAT(s.value->>'firstName', ' ', s.value->>'lastName')), ''),
                s.value->>'username',
                u.display_name,
                u.username,
                'Player'
              ) as display_name
       FROM tournament_participants tp
       LEFT JOIN tournament_bot_profiles bp ON bp.id = tp.bot_profile_id
       LEFT JOIN users u ON u.id = tp.user_id
       LEFT JOIN storage s ON s.user_id = tp.user_id AND s.collection = 'player_data' AND s.key = 'telegram'
       WHERE tp.id = $1 AND tp.tournament_id = $2`,
      [request.participantId, request.tournamentId]
    );
    var participantRows = Array.isArray(participantResult) ? participantResult : [];

    if (participantRows.length === 0) {
      throw new Error('Participant not found in this tournament');
    }

    var oldSeed = participantRows[0].seed_number;
    var displayName = parsePgBoolean(participantRows[0].is_bot)
      ? getTournamentBotDisplayName(participantRows[0].bot_key, participantRows[0].id, participantRows[0].display_name)
      : participantRows[0].display_name;

    // Atomic update with seed uniqueness check to prevent race conditions
    // Uses NOT EXISTS subquery to ensure atomicity
    var updateResult = nk.sqlExec(
      `UPDATE tournament_participants
       SET seed_number = $1
       WHERE id = $2
         AND tournament_id = $3
         AND NOT EXISTS (
           SELECT 1 FROM tournament_participants
           WHERE tournament_id = $3 AND seed_number = $1 AND id != $2
         )`,
      [request.newSeed, request.participantId, request.tournamentId]
    );

    // Check if update succeeded (row count > 0)
    // If no rows were updated, the seed was already taken
    if (updateResult && typeof updateResult === 'object' && 'rowsAffected' in updateResult) {
      if ((updateResult as { rowsAffected: number }).rowsAffected === 0) {
        throw new Error('Seed ' + request.newSeed + ' is already assigned to another participant');
      }
    } else {
      // If we can't check rows affected, verify with a query
      var verifyResult = nk.sqlQuery(
        `SELECT seed_number FROM tournament_participants WHERE id = $1`,
        [request.participantId]
      );
      var verifyRows = Array.isArray(verifyResult) ? verifyResult : [];
      if (verifyRows.length === 0 || verifyRows[0].seed_number !== request.newSeed) {
        throw new Error('Seed ' + request.newSeed + ' is already assigned to another participant');
      }
    }

    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    logAdminActionFeatures(
      nk, logger, adminInfo.adminId, adminInfo.telegramId,
      'update_participant_seed', 'tournament_participant', request.participantId,
      { seedNumber: oldSeed, displayName: displayName },
      { seedNumber: request.newSeed },
      { tournamentId: request.tournamentId }
    );

    logger.info('Participant seed updated: ' + request.participantId + ' from ' + oldSeed + ' to ' + request.newSeed);

    return JSON.stringify({
      success: true,
      participantId: request.participantId,
      oldSeed: oldSeed,
      newSeed: request.newSeed,
    });
  } catch (error) {
    logger.error('Error updating participant seed: ' + error);
    throw error;
  }
}

export function rpcAdminShuffleTournamentSeeds(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = parseRpcPayload(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    nk.sqlExec('BEGIN', []);

    var tourResult = nk.sqlQuery(
      `SELECT status, seeding_mode
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [request.tournamentId]
    );
    var tourRows = Array.isArray(tourResult) ? tourResult : [];
    if (tourRows.length === 0) {
      throw new Error('Tournament not found');
    }

    var tour = tourRows[0];
    if (tour.status !== 'upcoming' && tour.status !== 'registration') {
      throw new Error('Seeds can only be shuffled before the tournament starts');
    }

    var seedingMode = tour.seeding_mode || 'mmr';
    if (seedingMode !== 'random_opening_round') {
      throw new Error('Shuffle is only allowed for random opening round seeding');
    }

    var matchesResult = nk.sqlQuery(
      `SELECT COUNT(*) as match_count FROM tournament_matches WHERE tournament_id = $1`,
      [request.tournamentId]
    );
    var matchRows = Array.isArray(matchesResult) ? matchesResult : [];
    var matchCount = matchRows.length > 0 ? parseInt(matchRows[0].match_count) || 0 : 0;
    if (matchCount > 0) {
      throw new Error('Cannot shuffle seeds after bracket has been generated');
    }

    var partResult = nk.sqlQuery(
      `SELECT id FROM tournament_participants
       WHERE tournament_id = $1 AND status = 'registered'`,
      [request.tournamentId]
    );
    var participants = Array.isArray(partResult) ? partResult : [];
    if (participants.length < 2) {
      throw new Error('Need at least 2 registered participants to shuffle seeds');
    }

    // Shuffle participants
    for (var i = participants.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = participants[i];
      participants[i] = participants[j];
      participants[j] = tmp;
    }

    for (var s = 0; s < participants.length; s++) {
      nk.sqlExec(
        `UPDATE tournament_participants SET seed_number = $1 WHERE id = $2`,
        [s + 1, participants[s].id]
      );
    }

    nk.sqlExec('COMMIT', []);

    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    logAdminActionFeatures(
      nk, logger, adminInfo.adminId, adminInfo.telegramId,
      'shuffle_tournament_seeds', 'tournament', request.tournamentId,
      { seedingMode: seedingMode },
      { shuffledCount: participants.length },
      { tournamentId: request.tournamentId }
    );

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
      shuffledCount: participants.length,
    });
  } catch (error) {
    try {
      nk.sqlExec('ROLLBACK', []);
    } catch (rollbackError) {
      logger.warn('Shuffle seeds rollback failed: ' + rollbackError);
    }
    logger.error('Error shuffling tournament seeds: ' + error);
    throw error;
  }
}

export function rpcAdminRepairTournamentBestOf(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var txStarted = false;
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var request = parseRpcPayload(payload || '{}');

    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    var dryRun = request.dryRun === true;

    nk.sqlExec('BEGIN', []);
    txStarted = true;

    var tournamentResult = nk.sqlQuery(
      `SELECT id, status, bracket_size, format, seeding_mode, best_of_by_round
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [request.tournamentId]
    );
    var tournamentRows = Array.isArray(tournamentResult) ? tournamentResult : [];
    if (tournamentRows.length === 0) {
      throw new Error('Tournament not found');
    }

    var tournament = tournamentRows[0];
    var bracketSize = parseInt(tournament.bracket_size) || 8;
    var format = tournament.format || 'single_elimination';
    var seedingMode = tournament.seeding_mode || 'mmr';
    var bestOfByRound = buildBestOfByRound(
      bracketSize,
      format,
      seedingMode,
      parseJsonb(tournament.best_of_by_round, null)
    );

    var bestOfResync = resyncTournamentMatchBestOf(
      nk,
      request.tournamentId,
      seedingMode,
      bestOfByRound,
      dryRun
    );

    if (!dryRun) {
      nk.sqlExec(
        `UPDATE tournaments
         SET best_of_by_round = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(bestOfByRound), request.tournamentId]
      );
    }

    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    logAdminActionFeatures(
      nk, logger, adminInfo.adminId, adminInfo.telegramId,
      'repair_tournament_best_of', 'tournament', request.tournamentId,
      {
        dryRun: dryRun,
        status: tournament.status || null,
      },
      bestOfResync,
      null
    );

    nk.sqlExec('COMMIT', []);
    txStarted = false;

    return JSON.stringify({
      success: true,
      tournamentId: request.tournamentId,
      dryRun: dryRun,
      bestOfResync: bestOfResync,
    });
  } catch (error) {
    if (txStarted) {
      try {
        nk.sqlExec('ROLLBACK', []);
      } catch (rollbackError) {
        logger.warn('Repair tournament best-of rollback failed: ' + rollbackError);
      }
    }
    logger.error('Error repairing tournament best-of: ' + error);
    throw error;
  }
}

export function rpcAdminGetTournamentProgressSnapshot(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminForFeatures(ctx, nk, logger);
    var request = parseRpcPayload(payload || '{}');
    if (!request.tournamentId) {
      throw new Error('tournamentId is required');
    }

    var tournamentResult = nk.sqlQuery(
      `SELECT id, name, status, format, current_round, total_rounds, bracket_size
       FROM tournaments
       WHERE id = $1`,
      [request.tournamentId]
    );
    var tournamentRows = Array.isArray(tournamentResult) ? tournamentResult : [];
    if (tournamentRows.length === 0) {
      throw new Error('Tournament not found');
    }
    var tournament = tournamentRows[0];

    var byRoundResult = nk.sqlQuery(
      `SELECT bracket_type, round_number,
              COUNT(*)::int as total_count,
              COUNT(*) FILTER (WHERE status = 'pending')::int as pending_count,
              COUNT(*) FILTER (WHERE status = 'ready')::int as ready_count,
              COUNT(*) FILTER (WHERE status = 'in_progress')::int as in_progress_count,
              COUNT(*) FILTER (WHERE status IN ('completed', 'bye'))::int as resolved_count
       FROM tournament_matches
       WHERE tournament_id = $1
       GROUP BY bracket_type, round_number
       ORDER BY
         CASE bracket_type
           WHEN 'winners' THEN 1
           WHEN 'losers' THEN 2
           WHEN 'grand_final' THEN 3
           ELSE 9
         END,
         round_number ASC`,
      [request.tournamentId]
    );
    var byRoundRows = Array.isArray(byRoundResult) ? byRoundResult : [];

    var summaryResult = nk.sqlQuery(
      `SELECT status, COUNT(*)::int as count
       FROM tournament_matches
       WHERE tournament_id = $1
       GROUP BY status`,
      [request.tournamentId]
    );
    var summaryRows = Array.isArray(summaryResult) ? summaryResult : [];
    var summary: {[key: string]: number} = {};
    for (var i = 0; i < summaryRows.length; i++) {
      summary[String(summaryRows[i].status || 'unknown')] = Number(summaryRows[i].count) || 0;
    }

    var rounds = byRoundRows.map(function(row: any) {
      return {
        bracketType: row.bracket_type || 'winners',
        roundNumber: parseInt(row.round_number) || 0,
        totalCount: parseInt(row.total_count) || 0,
        pendingCount: parseInt(row.pending_count) || 0,
        readyCount: parseInt(row.ready_count) || 0,
        inProgressCount: parseInt(row.in_progress_count) || 0,
        resolvedCount: parseInt(row.resolved_count) || 0,
      };
    });

    return JSON.stringify({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        format: tournament.format,
        currentRound: parseInt(tournament.current_round) || 0,
        totalRounds: parseInt(tournament.total_rounds) || 0,
        bracketSize: parseInt(tournament.bracket_size) || 0,
      },
      summary: summary,
      rounds: rounds,
    });
  } catch (error) {
    logger.error('Error getting tournament progress snapshot: ' + error);
    throw error;
  }
}
