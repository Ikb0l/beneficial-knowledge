import { getCategoriesFromDb, getDefaultCategoryKey, isValidCategoryFromDb } from './config';
import { normalizeCategory } from './constants';
import { releaseRuntimeLock, tryAcquireRuntimeLockWithRetry, RuntimeLeaseLock } from './runtime-locks';
import {
  getTournamentBotDisplayName,
  getTournamentBotPolicy,
  reconcileTournamentMatchBots,
} from './tournament-bots';

export interface TournamentRuntimeStartResult {
  matchId: string;
  tournamentMatchId: string;
  startedAt: string | null;
  alreadyInProgress: boolean;
}

export interface TournamentRuntimeStartOptions {
  actorUserId?: string | null;
  requireParticipantUser?: boolean;
  allowPausedExisting?: boolean;
}

// Actual Nakama match creation takes < 1 s.  30 s covers transient
// network jitter without blocking legitimate retry attempts for long.
export var MATCH_START_INITIALIZATION_GRACE_MS = 30 * 1000;

function parsePgBoolean(value: any): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

function isInactiveTournamentParticipantStatus(status: any): boolean {
  var normalized = String(status || '').trim().toLowerCase();
  return normalized === 'forfeited' || normalized === 'eliminated' || normalized === 'disqualified';
}

function getParentCategoryKeyForChild(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  childCategoryKey: string
): string | null {
  var categories = getCategoriesFromDb(nk, logger);
  var child = categories[childCategoryKey];
  if (!child || !child.parentId) return null;

  var parentIdStr = String(child.parentId);
  for (var key in categories) {
    var candidate = categories[key];
    if (candidate && candidate.id && String(candidate.id) === parentIdStr) {
      return candidate.categoryKey || key;
    }
  }
  return null;
}

function getChildCategoryKeysForParent(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  parentCategoryKey: string
): string[] {
  var categories = getCategoriesFromDb(nk, logger);
  var parent = categories[parentCategoryKey];
  if (!parent || !parent.id) return [];

  var parentIdStr = String(parent.id);
  var children: string[] = [];
  for (var key in categories) {
    var candidate = categories[key];
    if (candidate && candidate.parentId && String(candidate.parentId) === parentIdStr) {
      var childKey = normalizeCategory(String(candidate.categoryKey || key || ''));
      if (childKey) children.push(childKey);
    }
  }
  return children;
}

function pickRandomEligibleCategoryForTournament(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  questionsNeeded: number,
  allowedCategories?: string[] | null
): string {
  var allowed: string[] | null = null;
  if (Array.isArray(allowedCategories) && allowedCategories.length > 0) {
    var seen: {[key: string]: boolean} = {};
    var filtered: string[] = [];
    for (var a = 0; a < allowedCategories.length; a++) {
      var normalized = normalizeCategory(String(allowedCategories[a] || ''));
      if (!normalized || seen[normalized]) continue;
      seen[normalized] = true;
      filtered.push(normalized);
    }
    if (filtered.length > 0) {
      allowed = filtered;
    }
  }

  function pickByMinCount(minCount: number, allowedList: string[] | null): string {
    try {
      if (allowedList && allowedList.length > 0) {
        var allowedResult = nk.sqlQuery(
          `SELECT category
           FROM questions
           WHERE is_active = true
             AND category = ANY($1::text[])
           GROUP BY category
           HAVING COUNT(*)::int >= $2
           ORDER BY RANDOM()
           LIMIT 1`,
          [allowedList, minCount]
        );
        var allowedRows = Array.isArray(allowedResult) ? allowedResult : [];
        if (allowedRows.length > 0 && allowedRows[0].category) {
          return String(allowedRows[0].category);
        }
        return '';
      }

      var result = nk.sqlQuery(
        `SELECT c.category_key
         FROM categories c
         JOIN (
           SELECT category, COUNT(*)::int as cnt
           FROM questions
           WHERE is_active = true
           GROUP BY category
         ) q ON q.category = c.category_key
         WHERE c.is_active = true
           AND q.cnt >= $1
         ORDER BY RANDOM()
         LIMIT 1`,
        [minCount]
      );
      var rows = Array.isArray(result) ? result : [];
      if (rows.length > 0 && rows[0].category_key) {
        return String(rows[0].category_key);
      }
    } catch (error) {
      logger.warn('Failed to pick random eligible category for tournament: ' + error);
    }
    return '';
  }

  var chosen = pickByMinCount(questionsNeeded, allowed);
  if (!chosen) {
    chosen = pickByMinCount(1, allowed);
  }
  if (chosen) {
    return chosen;
  }
  if (allowed && allowed.length > 0) {
    return allowed[Math.floor(Math.random() * allowed.length)];
  }

  var fallback = getDefaultCategoryKey(nk, logger);
  if (fallback) return fallback;
  throw new Error('No valid categories available for tournament match');
}

function getTournamentMatchForStart(
  nk: nkruntime.Nakama,
  tournamentMatchId: string
): any {
  var matchResult = nk.sqlQuery(
    `SELECT tm.id, tm.tournament_id, tm.round_number, tm.status, tm.nakama_match_id,
            tm.ready_player1, tm.ready_player2,
            tm.started_at, tm.last_activity_at,
            CASE
              WHEN tm.last_activity_at IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - tm.last_activity_at))::int
              ELSE NULL
            END as match_idle_seconds,
            tm.player1_participant_id, tm.player2_participant_id,
            tm.category as match_category,
            p1.user_id as player1_id, p2.user_id as player2_id,
            p1.status as player1_status, p2.status as player2_status,
            p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot,
            bp1.bot_key as player1_bot_key, bp2.bot_key as player2_bot_key,
            bp1.display_name as player1_bot_name, bp2.display_name as player2_bot_name,
            t.category as tournament_category,
            t.question_count,
            t.status as tournament_status, t.allow_spectators,
            t.bot_policy
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
     LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
     LEFT JOIN tournament_bot_profiles bp1 ON bp1.id = p1.bot_profile_id
     LEFT JOIN tournament_bot_profiles bp2 ON bp2.id = p2.bot_profile_id
     WHERE tm.id = $1`,
    [tournamentMatchId]
  );
  var matchRows = Array.isArray(matchResult) ? matchResult : [];
  if (matchRows.length === 0) {
    throw new Error('Tournament match not found');
  }
  return matchRows[0];
}

function returnExistingMatch(
  tournamentMatchId: string,
  nakamaMatchId: string,
  startedAt: string | null | undefined
): TournamentRuntimeStartResult {
  return {
    matchId: nakamaMatchId,
    tournamentMatchId: tournamentMatchId,
    startedAt: startedAt || null,
    alreadyInProgress: true,
  };
}

export function startTournamentRuntimeMatch(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentMatchId: string,
  options?: TournamentRuntimeStartOptions
): TournamentRuntimeStartResult {
  var opts = options || {};
  var tournamentMatch = getTournamentMatchForStart(nk, tournamentMatchId);
  var actorUserId = opts.actorUserId ? String(opts.actorUserId) : '';

  if (opts.requireParticipantUser) {
    if (!actorUserId || (actorUserId !== tournamentMatch.player1_id && actorUserId !== tournamentMatch.player2_id)) {
      throw new Error('You are not a participant in this match');
    }
  }

  if (tournamentMatch.tournament_status === 'paused') {
    if (tournamentMatch.status === 'in_progress' && tournamentMatch.nakama_match_id) {
      var pausedMatchId = String(tournamentMatch.nakama_match_id);
      if (pausedMatchId.indexOf('__starting__:') !== 0) {
        return returnExistingMatch(tournamentMatchId, pausedMatchId, tournamentMatch.started_at);
      }
    }
    if (!opts.allowPausedExisting) {
      throw new Error('Tournament is paused');
    }
  }

  if (tournamentMatch.tournament_status !== 'in_progress') {
    throw new Error('Tournament is not in progress');
  }

  if (tournamentMatch.status === 'completed') {
    throw new Error('Match has already been completed');
  }
  if (tournamentMatch.status === 'bye') {
    throw new Error('Match is a bye and has already been advanced');
  }

  if (tournamentMatch.status === 'pending' || tournamentMatch.status === 'ready') {
    var reconciliation = reconcileTournamentMatchBots(nk, logger, tournamentMatchId);
    if (reconciliation.replacedCount > 0) {
      tournamentMatch = getTournamentMatchForStart(nk, tournamentMatchId);
    }
  }

  if (opts.requireParticipantUser) {
    if (!actorUserId || (actorUserId !== tournamentMatch.player1_id && actorUserId !== tournamentMatch.player2_id)) {
      throw new Error('You are no longer a participant in this match');
    }
  }

  var player1IsBot = parsePgBoolean(tournamentMatch.player1_is_bot);
  var player2IsBot = parsePgBoolean(tournamentMatch.player2_is_bot);
  var isBotMatch = player1IsBot || player2IsBot;

  if (!tournamentMatch.player1_participant_id || !tournamentMatch.player2_participant_id) {
    throw new Error('Match is not ready yet');
  }

  if (
    isInactiveTournamentParticipantStatus(tournamentMatch.player1_status) ||
    isInactiveTournamentParticipantStatus(tournamentMatch.player2_status)
  ) {
    throw new Error('Match has an inactive tournament participant and will be resolved automatically');
  }

  if (tournamentMatch.status === 'in_progress' && tournamentMatch.nakama_match_id) {
    var topLevelMatchId = String(tournamentMatch.nakama_match_id);
    if (topLevelMatchId.indexOf('__starting__:') !== 0) {
      // If the Nakama match is likely dead (no DB activity for > 3 min),
      // reset and start fresh instead of returning a dead match ID.
      // Nakama's idle-empty-match killer may stop the Go handler without
      // calling the JS matchTerminate callback, leaving the DB row stuck.
      var idleSeconds = Number(tournamentMatch.match_idle_seconds);
      if (Number.isFinite(idleSeconds)) {
        if (idleSeconds > 90) {
          logger.info(
            'Existing tournament match appears dead (idle ' +
            Math.floor(idleSeconds) + 's), restarting: ' + tournamentMatchId
          );
          nk.sqlExec(
            `UPDATE tournament_matches
             SET status = 'ready',
                 nakama_match_id = NULL,
                 started_at = NULL,
                 ready_at = NOW(),
                 ready_player1 = false,
                 ready_player2 = false,
                 spectator_count = 0,
                 last_activity_at = NOW()
             WHERE id = $1 AND status = 'in_progress'`,
            [tournamentMatchId]
          );
          // Re-fetch so we fall through to the normal start path below.
          tournamentMatch = getTournamentMatchForStart(nk, tournamentMatchId);
        } else {
          return returnExistingMatch(tournamentMatchId, topLevelMatchId, tournamentMatch.started_at);
        }
      } else {
        throw new Error('Match activity timestamp is unavailable; it will be repaired automatically');
      }
    }
  }

  if (tournamentMatch.status !== 'ready' && tournamentMatch.status !== 'in_progress') {
    throw new Error('Match is not ready to start');
  }

  if (tournamentMatch.status === 'ready' && !isBotMatch) {
    var readyPlayer1 = parsePgBoolean(tournamentMatch.ready_player1);
    var readyPlayer2 = parsePgBoolean(tournamentMatch.ready_player2);
    if (!(readyPlayer1 && readyPlayer2)) {
      throw new Error('Both players must be ready before starting the match');
    }
  }

  var questionsNeeded = tournamentMatch.question_count ? parseInt(tournamentMatch.question_count, 10) : 0;
  if (!Number.isFinite(questionsNeeded) || questionsNeeded <= 0) {
    questionsNeeded = 10;
  }

  var resolvedCategory = '';
  var tournamentCategory = '';
  var tournamentCategoryRaw = tournamentMatch.tournament_category;
  if (typeof tournamentCategoryRaw === 'string' && tournamentCategoryRaw.trim().length > 0) {
    tournamentCategory = normalizeCategory(tournamentCategoryRaw);
  }
  var existingMatchCategoryRaw = tournamentMatch.match_category;
  var matchCategory = '';
  if (typeof existingMatchCategoryRaw === 'string' && existingMatchCategoryRaw.trim().length > 0) {
    matchCategory = normalizeCategory(existingMatchCategoryRaw);
  }

  var allowedChildCategories: string[] | null = null;
  var shouldPersistMatchCategory = false;
  if (tournamentCategory) {
    var childCategories = getChildCategoryKeysForParent(nk, logger, tournamentCategory);
    if (childCategories.length > 0) {
      allowedChildCategories = childCategories;
      var childSet: {[key: string]: boolean} = {};
      for (var cc = 0; cc < childCategories.length; cc++) {
        childSet[childCategories[cc]] = true;
      }
      if (matchCategory && childSet[matchCategory] && isValidCategoryFromDb(nk, logger, matchCategory)) {
        resolvedCategory = matchCategory;
      } else {
        shouldPersistMatchCategory = true;
      }
    } else {
      resolvedCategory = tournamentCategory;
    }
  } else if (matchCategory && isValidCategoryFromDb(nk, logger, matchCategory)) {
    resolvedCategory = matchCategory;
  } else {
    shouldPersistMatchCategory = true;
  }

  if (!resolvedCategory) {
    var chosen = pickRandomEligibleCategoryForTournament(
      nk,
      logger,
      questionsNeeded,
      allowedChildCategories || undefined
    );
    chosen = normalizeCategory(chosen);

    if (shouldPersistMatchCategory) {
      try {
        var updateSql = `UPDATE tournament_matches SET category = $1 WHERE id = $2`;
        var updateParams: any[] = [chosen, tournamentMatchId];
        if (matchCategory) {
          updateSql += ` AND (category IS NULL OR category = $3)`;
          updateParams.push(matchCategory);
        } else {
          updateSql += ` AND category IS NULL`;
        }
        nk.sqlExec(updateSql, updateParams);
      } catch (updateErr) {
        logger.warn('Failed to persist tournament match category: ' + updateErr);
      }
    }

    try {
      var catVerify = nk.sqlQuery(`SELECT category FROM tournament_matches WHERE id = $1`, [tournamentMatchId]);
      var catRows = Array.isArray(catVerify) ? catVerify : [];
      if (catRows.length > 0 && typeof catRows[0].category === 'string' && catRows[0].category.trim().length > 0) {
        resolvedCategory = normalizeCategory(catRows[0].category);
      } else {
        resolvedCategory = chosen;
      }
    } catch (verifyErr) {
      logger.warn('Failed to verify tournament match category: ' + verifyErr);
      resolvedCategory = chosen;
    }
  }

  if (!resolvedCategory || !isValidCategoryFromDb(nk, logger, resolvedCategory)) {
    var fallbackCategory = getDefaultCategoryKey(nk, logger);
    if (!fallbackCategory) {
      throw new Error('No valid categories available for tournament match');
    }
    resolvedCategory = fallbackCategory;
  }

  var parentCategory = getParentCategoryKeyForChild(nk, logger, resolvedCategory);
  var lockKey = 'tournament_match_start:' + tournamentMatchId;
  var lock: RuntimeLeaseLock | null = tryAcquireRuntimeLockWithRetry(nk, logger, lockKey, 30000, 2, 250);

  if (!lock) {
    // Another request holds the start lock.  Poll up to 5 times (5 × 1 s)
    // for the other request to finish initializing the Nakama match so we
    // can return the existing match instead of throwing.
    for (var retry = 0; retry < 5; retry++) {
      var raceResult = nk.sqlQuery(
        `SELECT status, nakama_match_id, started_at FROM tournament_matches WHERE id = $1`,
        [tournamentMatchId]
      );
      var raceRows = Array.isArray(raceResult) ? raceResult : [];
      var raceRow = raceRows.length > 0 ? raceRows[0] : null;
      if (raceRow && raceRow.status === 'in_progress' && raceRow.nakama_match_id) {
        var raceMatchId = String(raceRow.nakama_match_id);
        if (raceMatchId.indexOf('__starting__:') !== 0) {
          logger.info('Tournament match start race resolved after retry ' + retry + ': ' + tournamentMatchId);
          return returnExistingMatch(tournamentMatchId, raceMatchId, raceRow.started_at);
        }
      }
      // Still initializing — wait 1 s and poll again.
      if (retry < 4) {
        try { nk.sqlQuery(`SELECT pg_sleep(1)`); } catch (_se) { /* ignore */ }
      }
    }
    throw new Error('Match is currently being started by another request. Please retry.');
  }

  try {
    var lockedResult = nk.sqlQuery(
      `SELECT status, nakama_match_id, ready_player1, ready_player2, started_at
       FROM tournament_matches WHERE id = $1`,
      [tournamentMatchId]
    );
    var lockedRows = Array.isArray(lockedResult) ? lockedResult : [];
    if (lockedRows.length === 0) {
      throw new Error('Tournament match not found');
    }
    var lockedMatch = lockedRows[0];

    if (lockedMatch.status === 'in_progress' && lockedMatch.nakama_match_id) {
      var inProgressMatchId = String(lockedMatch.nakama_match_id);
      if (inProgressMatchId.indexOf('__starting__:') !== 0) {
        return returnExistingMatch(tournamentMatchId, inProgressMatchId, lockedMatch.started_at);
      }
    }

    var existingNakamaMatchId = lockedMatch.nakama_match_id ? String(lockedMatch.nakama_match_id) : null;
    var isInitializing = !!existingNakamaMatchId && existingNakamaMatchId.indexOf('__starting__:') === 0;
    if (isInitializing) {
      var startedAtMs = lockedMatch.started_at ? new Date(lockedMatch.started_at).getTime() : NaN;
      var isStale = Number.isFinite(startedAtMs) && Date.now() - startedAtMs > MATCH_START_INITIALIZATION_GRACE_MS;
      if (isStale) {
        nk.sqlExec(
          `UPDATE tournament_matches
           SET status = 'ready',
               nakama_match_id = NULL,
               started_at = NULL,
               ready_at = NOW(),
               spectator_count = 0,
               last_activity_at = NOW()
           WHERE id = $1 AND nakama_match_id = $2`,
          [tournamentMatchId, existingNakamaMatchId]
        );
        var staleRefetch = nk.sqlQuery(
          `SELECT status, nakama_match_id, ready_player1, ready_player2
           FROM tournament_matches WHERE id = $1`,
          [tournamentMatchId]
        );
        var staleRows = Array.isArray(staleRefetch) ? staleRefetch : [];
        if (staleRows.length === 0) {
          throw new Error('Tournament match not found');
        }
        lockedMatch = staleRows[0];
        existingNakamaMatchId = lockedMatch.nakama_match_id ? String(lockedMatch.nakama_match_id) : null;
        isInitializing = !!existingNakamaMatchId && existingNakamaMatchId.indexOf('__starting__:') === 0;
      }
    }
    if (isInitializing) {
      throw new Error('Match is currently being initialized. Please retry in a few seconds.');
    }
    if (lockedMatch.status !== 'ready' && lockedMatch.status !== 'in_progress') {
      throw new Error('Match is not ready to start');
    }

    if (lockedMatch.status === 'ready' && !isBotMatch) {
      var ready1 = parsePgBoolean(lockedMatch.ready_player1);
      var ready2 = parsePgBoolean(lockedMatch.ready_player2);
      if (!(ready1 && ready2)) {
        throw new Error('Both players must be ready before starting the match');
      }
    }

    var startToken =
      '__starting__:' +
      tournamentMatchId +
      ':' +
      Date.now().toString(36) +
      ':' +
      Math.floor(Math.random() * 1000000).toString(36);

    var claimResult = nk.sqlExec(
      `UPDATE tournament_matches SET
       status = 'in_progress',
       nakama_match_id = $1,
       started_at = NOW(),
       spectator_count = 0,
       last_activity_at = NOW()
       WHERE id = $2
         AND nakama_match_id IS NULL
         AND status IN ('ready', 'in_progress')`,
      [startToken, tournamentMatchId]
    );

    var claimed = false;
    if (claimResult && typeof claimResult === 'object' && 'rowsAffected' in claimResult) {
      claimed = (claimResult as { rowsAffected: number }).rowsAffected > 0;
    } else {
      var verifyResult = nk.sqlQuery(
        `SELECT nakama_match_id FROM tournament_matches WHERE id = $1`,
        [tournamentMatchId]
      );
      var verifyRows = Array.isArray(verifyResult) ? verifyResult : [];
      claimed = verifyRows.length > 0 && verifyRows[0].nakama_match_id === startToken;
    }

    if (!claimed) {
      var existingResult = nk.sqlQuery(
        `SELECT status, nakama_match_id, started_at FROM tournament_matches WHERE id = $1`,
        [tournamentMatchId]
      );
      var existingRows = Array.isArray(existingResult) ? existingResult : [];
      var existingMatchId = existingRows.length > 0 ? existingRows[0].nakama_match_id : null;
      if (!existingMatchId) {
        throw new Error('Failed to claim tournament match start. Please retry.');
      }
      if (String(existingMatchId).indexOf('__starting__:') === 0) {
        throw new Error('Match is currently being initialized. Please retry in a few seconds.');
      }
      logger.info('Tournament match already started (race): ' + tournamentMatchId + ' -> ' + existingMatchId);
      return returnExistingMatch(
        tournamentMatchId,
        String(existingMatchId),
        existingRows.length > 0 ? existingRows[0].started_at : null
      );
    }

    var tournamentBotPolicy = getTournamentBotPolicy(
      nk,
      logger,
      tournamentMatch.tournament_id,
      tournamentMatch.bot_policy
    );
    var botDisplayName = 'Tournament Player';
    if (player1IsBot) {
      botDisplayName = getTournamentBotDisplayName(
        tournamentMatch.player1_bot_key,
        tournamentMatch.player1_participant_id,
        tournamentMatch.player1_bot_name
      );
    } else if (player2IsBot) {
      botDisplayName = getTournamentBotDisplayName(
        tournamentMatch.player2_bot_key,
        tournamentMatch.player2_participant_id,
        tournamentMatch.player2_bot_name
      );
    }

    var nakamaMatchId: string;
    try {
      nakamaMatchId = nk.matchCreate('quiz_match', {
        category: resolvedCategory,
        parentCategory: parentCategory || '',
        bot: isBotMatch ? 'true' : 'false',
        isTournament: 'true',
        allowSpectators: tournamentMatch.allow_spectators ? 'true' : 'false',
        tournamentId: tournamentMatch.tournament_id,
        tournamentMatchId: tournamentMatchId,
        tournamentRound: String(parseInt(tournamentMatch.round_number, 10) || 1),
        tournamentPlayer1UserId: tournamentMatch.player1_id || '',
        tournamentPlayer2UserId: tournamentMatch.player2_id || '',
        tournamentPlayer1IsBot: player1IsBot ? 'true' : 'false',
        tournamentPlayer2IsBot: player2IsBot ? 'true' : 'false',
        botDisplayName: botDisplayName,
        botDifficultyProfile: JSON.stringify(tournamentBotPolicy.difficulty),
        player1: tournamentMatch.player1_id || '',
        player2: tournamentMatch.player2_id || '',
      });
    } catch (createError) {
      nk.sqlExec(
        `UPDATE tournament_matches
         SET status = 'ready',
             nakama_match_id = NULL,
             started_at = NULL,
             ready_at = NOW(),
             spectator_count = 0,
             last_activity_at = NOW()
         WHERE id = $1 AND nakama_match_id = $2`,
        [tournamentMatchId, startToken]
      );
      throw createError;
    }

    var finalizeResult = nk.sqlExec(
      `UPDATE tournament_matches
       SET nakama_match_id = $1,
           last_activity_at = NOW()
       WHERE id = $2 AND nakama_match_id = $3`,
      [nakamaMatchId, tournamentMatchId, startToken]
    );
    var finalized = false;
    if (finalizeResult && typeof finalizeResult === 'object' && 'rowsAffected' in finalizeResult) {
      finalized = (finalizeResult as { rowsAffected: number }).rowsAffected > 0;
    } else {
      var finalizeVerify = nk.sqlQuery(
        `SELECT nakama_match_id FROM tournament_matches WHERE id = $1`,
        [tournamentMatchId]
      );
      var finalizeRows = Array.isArray(finalizeVerify) ? finalizeVerify : [];
      finalized = finalizeRows.length > 0 && finalizeRows[0].nakama_match_id === nakamaMatchId;
    }
    if (!finalized) {
      nk.sqlExec(
        `UPDATE tournament_matches
         SET status = 'ready',
             nakama_match_id = NULL,
             started_at = NULL,
             ready_at = NOW(),
             spectator_count = 0,
             last_activity_at = NOW()
         WHERE id = $1 AND nakama_match_id = $2`,
        [tournamentMatchId, startToken]
      );
      logger.warn(
        'Orphaned Nakama match on finalize failure: ' + nakamaMatchId +
        ' for tournament match ' + tournamentMatchId +
        ' — the Nakama match was created but the DB update failed. ' +
        'It will self-terminate when idle.'
      );
      throw new Error('Failed to finalize tournament match start. Please retry.');
    }

    logger.info('Tournament match started: ' + tournamentMatchId + ' -> ' + nakamaMatchId);
    return {
      matchId: nakamaMatchId,
      tournamentMatchId: tournamentMatchId,
      startedAt: new Date().toISOString(),
      alreadyInProgress: false,
    };
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }
}
