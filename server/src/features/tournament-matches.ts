// ============================================================================
import { autoReportTournamentResult } from '../main/tournament-advance';
import { getCategoriesFromDb, getDefaultCategoryKey, isValidCategoryFromDb } from '../main/config';
import { normalizeCategory } from '../main/constants';
import {
  getTournamentBotDisplayName,
  getTournamentBotPolicy,
  reconcileTournamentMatchBots,
} from '../main/tournament-bots';
import { startTournamentRuntimeMatch } from '../main/tournament-match-start';
import { requireAdminForFeatures } from './helpers';

// TOURNAMENT MATCH RPCs
// ============================================================================

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

  // Fallback to any valid category
  var fallback = getDefaultCategoryKey(nk, logger);
  if (fallback) return fallback;
  throw new Error('No valid categories available for tournament match');
}

function parsePgBoolean(value: any): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

export function rpcStartTournamentMatch(
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
    var tournamentMatchId = request.matchId;

    if (!tournamentMatchId) {
      throw new Error('matchId is required');
    }

    return JSON.stringify(startTournamentRuntimeMatch(
      nk,
      logger,
      tournamentMatchId,
      {
        actorUserId: ctx.userId,
        requireParticipantUser: true,
      }
    ));
  } catch (error) {
    logger.error('Error starting tournament match: ' + error);
    throw error;
  }
}

export function rpcReportTournamentMatchResult(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  // This should typically be called by the server after match ends
  // But we'll support manual reporting for edge cases (admin only)
  try {
    requireAdminForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var tournamentMatchId = request.tournamentMatchId;
    var winnerId = request.winnerId || null;
    var player1Score = Number(request.player1Score) || 0;
    var player2Score = Number(request.player2Score) || 0;

    if (!tournamentMatchId) {
      throw new Error('tournamentMatchId is required');
    }

    autoReportTournamentResult(nk, logger, tournamentMatchId, winnerId, player1Score, player2Score, true, true);

    logger.info('Tournament match result reported: ' + tournamentMatchId + ', winner: ' + winnerId);

    return JSON.stringify({
      success: true,
      tournamentMatchId: tournamentMatchId,
      winnerId: winnerId,
    });
  } catch (error) {
    logger.error('Error reporting tournament match result: ' + error);
    throw error;
  }
}

