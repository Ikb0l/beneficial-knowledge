import { tournamentExperienceHelpers } from '../features/tournament-experience';
import { clampMmr } from './config';
import { getLeaderboardDisplayName } from './constants';
import { getRankTierKeyForMmr } from './mmr';
import { refreshRuntimeLock, releaseRuntimeLock, tryAcquireRuntimeLockWithRetry, RuntimeLeaseLock } from './runtime-locks';
import { getTournamentBotDisplayName, getTournamentBotPolicy } from './tournament-bots';
import { startTournamentRuntimeMatch } from './tournament-match-start';

// ============================================================================
// TOURNAMENT AUTO-ADVANCEMENT FUNCTIONS
// ============================================================================

export var BEST_OF_ALLOWED_MAIN = [1, 3, 5];
var TOURNAMENT_LOCK_LEASE_MS = 120000;
var BOT_AUTO_RESOLVE_LOCK_REFRESH_EVERY = 8;

export function normalizeBestOfValueMain(value: any, fallbackValue: number): number {
  var num = Number(value);
  if (!Number.isFinite(num)) return fallbackValue;
  if (BEST_OF_ALLOWED_MAIN.indexOf(num) === -1) return fallbackValue;
  return num;
}

function toByteArrayMain(value: any): number[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  var arrayLike = value as {[key: string]: any; length?: any};
  var lengthNum = Number(arrayLike.length);
  if (Number.isInteger(lengthNum) && lengthNum > 0 && lengthNum <= 1024 * 1024) {
    var out: number[] = [];
    for (var i = 0; i < lengthNum; i++) {
      if (!Object.prototype.hasOwnProperty.call(arrayLike, String(i))) {
        return null;
      }
      out.push(arrayLike[String(i)]);
    }
    return out;
  }

  var keys = Object.keys(arrayLike);
  if (keys.length === 0) {
    return null;
  }
  for (var k = 0; k < keys.length; k++) {
    if (!/^\d+$/.test(keys[k])) {
      return null;
    }
  }

  keys.sort(function(a: string, b: string) {
    return parseInt(a, 10) - parseInt(b, 10);
  });
  if (parseInt(keys[0], 10) !== 0) {
    return null;
  }

  var decoded: number[] = [];
  for (var idx = 0; idx < keys.length; idx++) {
    if (parseInt(keys[idx], 10) !== idx) {
      return null;
    }
    decoded.push(arrayLike[keys[idx]]);
  }
  return decoded;
}

function coerceFiniteNumberMain(value: any): number | null {
  var num = Number(value);
  if (Number.isFinite(num)) {
    return num;
  }
  if (value && typeof value === 'object') {
    try {
      var primitive = typeof value.valueOf === 'function' ? value.valueOf() : value;
      num = Number(primitive);
      if (Number.isFinite(num)) {
        return num;
      }
    } catch (_e) {
      // Ignore and continue fallback coercions.
    }
    try {
      var str = String(value);
      if (/^-?\d+(\.\d+)?$/.test(str)) {
        num = Number(str);
        if (Number.isFinite(num)) {
          return num;
        }
      }
    } catch (_e2) {
      // Ignore and return null below.
    }
  }
  return null;
}

function tryNormalizeSerializableMain(value: any): any {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_e) {
    return null;
  }
}

function parseJsonFromByteArrayMain(value: any): any {
  var bytes = toByteArrayMain(value);
  if (!bytes || bytes.length === 0) {
    return null;
  }

  var text = '';
  for (var i = 0; i < bytes.length; i++) {
    var nextRaw = coerceFiniteNumberMain(bytes[i]);
    if (nextRaw === null || nextRaw < 0 || nextRaw > 255) {
      return null;
    }
    var next = nextRaw;
    text += String.fromCharCode(Math.floor(next));
  }

  try {
    return JSON.parse(text);
  } catch (_e) {
    return null;
  }
}

export function parseBestOfConfig(value: any): any {
  if (!value) return {};
  if (Array.isArray(value) || typeof value === 'object') {
    var fromBytes = parseJsonFromByteArrayMain(value);
    if (fromBytes !== null) {
      return fromBytes;
    }
    var normalized = tryNormalizeSerializableMain(value);
    if (normalized !== null && normalized !== undefined) {
      var fromNormalizedBytes = parseJsonFromByteArrayMain(normalized);
      if (fromNormalizedBytes !== null) {
        return fromNormalizedBytes;
      }
      if (typeof normalized === 'string') {
        try {
          return JSON.parse(normalized);
        } catch (_e2) {
          // Fall through to object/default handling.
        }
      }
      if (typeof normalized === 'object') {
        return normalized;
      }
    }
  }
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_e) {
      return {};
    }
  }
  return {};
}

export function getBestOfForMatchConfig(
  config: any,
  bracketType: string,
  roundNumber: number,
  isOpeningRound: boolean
): number {
  if (!config || typeof config !== 'object') {
    return 1;
  }
  if (isOpeningRound && config.opening !== undefined) {
    return normalizeBestOfValueMain(config.opening, 1);
  }
  if (bracketType === 'grand_final') {
    return normalizeBestOfValueMain(config.grand_final, 1);
  }
  var bracketConfig = config[bracketType];
  if (Array.isArray(bracketConfig)) {
    var idx = Math.max(0, roundNumber - 1);
    if (idx < bracketConfig.length) {
      return normalizeBestOfValueMain(bracketConfig[idx], 1);
    }
  } else if (bracketConfig && typeof bracketConfig === 'object') {
    var key = String(roundNumber);
    if (Object.prototype.hasOwnProperty.call(bracketConfig, key)) {
      return normalizeBestOfValueMain(bracketConfig[key], 1);
    }
  }
  if (config.default !== undefined) {
    return normalizeBestOfValueMain(config.default, 1);
  }
  return 1;
}

export function getBestOfForTournamentMatch(
  nk: nkruntime.Nakama,
  tournamentId: string,
  bracketType: string,
  roundNumber: number
): number {
  try {
    var configResult = nk.sqlQuery(
      `SELECT best_of_by_round, seeding_mode FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    var configRows = Array.isArray(configResult) ? configResult : [];
    if (configRows.length === 0) return 1;
    var config = parseBestOfConfig(configRows[0].best_of_by_round);
    var seedingMode = configRows[0].seeding_mode || 'mmr';
    var isOpeningRound = seedingMode === 'random_opening_round' && bracketType === 'winners' && roundNumber === 1;
    return getBestOfForMatchConfig(config, bracketType, roundNumber, isOpeningRound);
  } catch (_e) {
    return 1;
  }
}

function parsePgBoolean(value: any): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

function tryAcquireTournamentLock(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  lockKey: string,
  leaseMs: number
): RuntimeLeaseLock | null {
  return tryAcquireRuntimeLockWithRetry(nk, logger, lockKey, leaseMs, 2, 250);
}

function refreshTournamentLock(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  lock: RuntimeLeaseLock | null
): boolean {
  return refreshRuntimeLock(nk, logger, lock, TOURNAMENT_LOCK_LEASE_MS);
}

function claimTournamentRewardGrant(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  userId: string,
  rewardKey: string,
  rewardType: string
): boolean {
  try {
    var result = nk.sqlQuery(
      `INSERT INTO tournament_reward_claims (tournament_id, user_id, reward_key, reward_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tournament_id, user_id, reward_key, reward_type) DO NOTHING
       RETURNING id`,
      [tournamentId, userId, rewardKey, rewardType]
    );
    var rows = Array.isArray(result) ? result : [];
    return rows.length > 0;
  } catch (error) {
    var msg = '' + error;
    // Keep backward compatibility while migrations are being rolled out.
    if (msg.indexOf('relation "tournament_reward_claims" does not exist') !== -1) {
      logger.warn('tournament_reward_claims missing; reward grant dedupe unavailable');
      return true;
    }
    logger.error('Failed to claim reward grant lock: ' + error);
    return false;
  }
}

function awardTournamentCoins(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  tournamentId: string,
  rewardKey: string,
  amount: number
): void {
  var safeAmount = Math.floor(Number(amount));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    return;
  }
  try {
    nk.sqlExec(
      `INSERT INTO user_wallets (user_id, coins, lifetime_coins_earned, updated_at)
       VALUES ($1, $2, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET coins = user_wallets.coins + $2,
           lifetime_coins_earned = user_wallets.lifetime_coins_earned + CASE WHEN $2 > 0 THEN $2 ELSE 0 END,
           lifetime_coins_spent = user_wallets.lifetime_coins_spent + CASE WHEN $2 < 0 THEN ABS($2) ELSE 0 END,
           updated_at = NOW()`,
      [userId, safeAmount]
    );

    var balanceAfter = safeAmount;
    var balanceResult = nk.sqlQuery(
      `SELECT coins FROM user_wallets WHERE user_id = $1`,
      [userId]
    );
    var balanceRows = Array.isArray(balanceResult) ? balanceResult : [];
    if (balanceRows.length > 0) {
      var parsedBalance = Number(balanceRows[0].coins);
      if (Number.isFinite(parsedBalance)) {
        balanceAfter = Math.floor(parsedBalance);
      }
    }

    nk.sqlExec(
      `INSERT INTO coin_transactions
       (user_id, amount, balance_after, transaction_type, reference_type, reference_id, description)
       VALUES ($1, $2, $3, 'tournament_reward', 'tournament', $4, $5)`,
      [userId, safeAmount, balanceAfter, tournamentId, 'Tournament reward (' + rewardKey + ')']
    );
  } catch (error) {
    logger.error('Failed to award tournament coins to ' + userId + ': ' + error);
  }
}

function awardTournamentBadge(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  tournamentId: string,
  rewardKey: string,
  badgeKey: string
): void {
  if (!badgeKey) return;
  try {
    var badgeResult = nk.sqlQuery(
      `SELECT id FROM badges WHERE badge_key = $1 AND is_active = true`,
      [badgeKey]
    );
    var badgeRows = Array.isArray(badgeResult) ? badgeResult : [];
    if (badgeRows.length === 0 || !badgeRows[0].id) {
      logger.warn('Tournament reward badge not found or inactive: ' + badgeKey);
      return;
    }

    nk.sqlExec(
      `INSERT INTO user_badges (user_id, badge_id, earned_from, earned_metadata)
       VALUES ($1, $2, 'tournament', $3::jsonb)
       ON CONFLICT (user_id, badge_id) DO NOTHING`,
      [
        userId,
        badgeRows[0].id,
        JSON.stringify({
          tournamentId: tournamentId,
          rewardKey: rewardKey,
        }),
      ]
    );
  } catch (error) {
    logger.error('Failed to award tournament badge [' + badgeKey + '] to ' + userId + ': ' + error);
  }
}

export function autoReportTournamentResult(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentMatchId: string,
  winnerId: string | null,
  player1Score: number,
  player2Score: number,
  strict?: boolean,
  forceSeriesComplete?: boolean,
  skipBotAutoResolve?: boolean
): void {
  var isStrict = !!strict;
  try {
    var winnerIdRaw = typeof winnerId === 'string' ? winnerId.trim() : '';
    winnerId = winnerIdRaw ? winnerIdRaw : null;
    logger.info('Auto-reporting tournament match result: ' + tournamentMatchId + ', winner: ' + winnerId);

    // Get tournament match details
    var matchResult = nk.sqlQuery(
      `SELECT tm.id, tm.tournament_id, tm.round_number, tm.match_number,
              tm.player1_participant_id, tm.player2_participant_id,
              tm.bracket_type, tm.status,
              tm.best_of, tm.series_wins_player1, tm.series_wins_player2, tm.series_game_count,
              p1.user_id as player1_id, p2.user_id as player2_id,
              p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot,
              p1.seed_number as player1_seed, p2.seed_number as player2_seed,
              p1.losses_count as player1_losses, p2.losses_count as player2_losses,
              t.total_rounds, t.current_round, t.format, t.rewards, t.bracket_size, t.status as tournament_status,
              t.grand_final_reset, t.bot_policy
       FROM tournament_matches tm
       JOIN tournaments t ON t.id = tm.tournament_id
       LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       WHERE tm.id = $1`,
      [tournamentMatchId]
    );
    var matchRows = Array.isArray(matchResult) ? matchResult : [];

    if (matchRows.length === 0) {
      logger.error('Tournament match not found for auto-report: ' + tournamentMatchId);
      if (isStrict) {
        throw new Error('Tournament match not found');
      }
      return;
    }

    var match = matchRows[0];

    if (match.tournament_status !== 'in_progress') {
      logger.warn(
        'Skipping tournament auto-report because tournament is not in progress: ' +
        match.tournament_id + ' status=' + match.tournament_status
      );
      if (isStrict) {
        throw new Error('Tournament is not in progress');
      }
      return;
    }

    if (match.status === 'completed' || match.status === 'bye') {
      logger.warn('Tournament match already resolved: ' + tournamentMatchId);
      if (isStrict) {
        throw new Error('Tournament match already resolved');
      }
      return;
    }

    if (!match.player1_participant_id || !match.player2_participant_id) {
      logger.warn('Tournament match missing participant assignments: ' + tournamentMatchId);
      if (isStrict) {
        throw new Error('Tournament match is missing players');
      }
      return;
    }

    if (isStrict && match.status === 'pending') {
      throw new Error('Tournament match is not ready');
    }

    var isDoubleElimination = match.format === 'double_elimination';

    // Read series state early — needed for seed tiebreaker logging below.
    var bestOf = normalizeBestOfValueMain(match.best_of, 1);
    var seriesWinsP1 = Number(match.series_wins_player1) || 0;
    var seriesWinsP2 = Number(match.series_wins_player2) || 0;
    var seriesGameCount = Number(match.series_game_count) || 0;

    // Determine winner participant ID
    var winnerParticipantId: string | null = null;
    var loserParticipantId: string | null = null;

    var validWinnerIds: string[] = [];
    if (match.player1_id) validWinnerIds.push(match.player1_id);
    if (match.player2_id) validWinnerIds.push(match.player2_id);

    if (winnerId && validWinnerIds.indexOf(winnerId) === -1) {
      logger.warn('Invalid winnerId for tournament match ' + tournamentMatchId + ': ' + winnerId);
      if (isStrict) {
        throw new Error('winnerId must match either player1 or player2');
      }
      winnerId = null;
    }

    var player1Seed = Number(match.player1_seed);
    var player2Seed = Number(match.player2_seed);
    var player1IsBot = parsePgBoolean(match.player1_is_bot);
    var player2IsBot = parsePgBoolean(match.player2_is_bot);
    var botInvolvedMatch = player1IsBot || player2IsBot;
    if (!Number.isFinite(player1Seed)) player1Seed = Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(player2Seed)) player2Seed = Number.MAX_SAFE_INTEGER;
    var player1Losses = Number(match.player1_losses);
    var player2Losses = Number(match.player2_losses);
    if (!Number.isFinite(player1Losses)) player1Losses = 0;
    if (!Number.isFinite(player2Losses)) player2Losses = 0;

    if (winnerId !== null && winnerId === match.player1_id) {
      winnerParticipantId = match.player1_participant_id;
      loserParticipantId = match.player2_participant_id;
    } else if (winnerId !== null && winnerId === match.player2_id) {
      winnerParticipantId = match.player2_participant_id;
      loserParticipantId = match.player1_participant_id;
    } else {
      // Draw - use score tiebreaker
      if (player1Score > player2Score) {
        winnerParticipantId = match.player1_participant_id;
        loserParticipantId = match.player2_participant_id;
        winnerId = match.player1_id;
      } else if (player2Score > player1Score) {
        winnerParticipantId = match.player2_participant_id;
        loserParticipantId = match.player1_participant_id;
        winnerId = match.player2_id;
      } else {
        // True tie - higher seed wins (lower seed number = higher seed).
        // ⚠️  SEED TIEBREAKER: only hit when BOTH score and winnerId are
        // unresolved.  In normal operation (match engine endMatch) this
        // should be extremely rare — it means two humans tied on every
        // question.  If this fires from the cron (stalled match / dead-man's
        // switch), scores were 0-0 and we're guessing.  Log loudly.
        logger.warn(
          'SEED TIEBREAKER used for tournament match ' + tournamentMatchId +
          ' (p1=' + match.player1_id + ' p2=' + match.player2_id +
          ' p1Score=' + player1Score + ' p2Score=' + player2Score +
          ' p1Seed=' + player1Seed + ' p2Seed=' + player2Seed +
          ' forceSeriesComplete=' + (!!forceSeriesComplete) +
          ' seriesWinsP1=' + seriesWinsP1 + ' seriesWinsP2=' + seriesWinsP2 +
          ').  The higher seed wins — verify this is correct!'
        );
        var player1Wins = player1Seed <= player2Seed;
        winnerParticipantId = player1Wins ? match.player1_participant_id : match.player2_participant_id;
        loserParticipantId = player1Wins ? match.player2_participant_id : match.player1_participant_id;
        winnerId = player1Wins ? match.player1_id : match.player2_id;
        logger.info('Score tie resolved by seed - ' + (player1Wins ? 'player1' : 'player2') + ' wins');
      }
    }

    // Series handling (best-of)
    var requiredWins = Math.ceil(bestOf / 2);
    // seriesGameCount already read above alongside seriesWinsP1/seriesWinsP2

    var player1ScoreValue = Number(player1Score) || 0;
    var player2ScoreValue = Number(player2Score) || 0;
    var expectedSeriesGameCount = seriesGameCount;

    var applyTotalScoreDeltas = function(): void {
      if (match.player1_participant_id) {
        nk.sqlExec(
          `UPDATE tournament_participants SET total_score = total_score + $1 WHERE id = $2`,
          [player1ScoreValue, match.player1_participant_id]
        );
      }
      if (match.player2_participant_id) {
        nk.sqlExec(
          `UPDATE tournament_participants SET total_score = total_score + $1 WHERE id = $2`,
          [player2ScoreValue, match.player2_participant_id]
        );
      }
    };

    seriesGameCount += 1;
    if (forceSeriesComplete) {
      if (winnerParticipantId === match.player1_participant_id) {
        seriesWinsP1 = requiredWins;
      } else if (winnerParticipantId === match.player2_participant_id) {
        seriesWinsP2 = requiredWins;
      }
    } else {
      if (winnerParticipantId === match.player1_participant_id) {
        seriesWinsP1 += 1;
      } else if (winnerParticipantId === match.player2_participant_id) {
        seriesWinsP2 += 1;
      }
    }

    var seriesComplete = forceSeriesComplete || seriesWinsP1 >= requiredWins || seriesWinsP2 >= requiredWins;

    if (!seriesComplete) {
      var progressResult = nk.sqlQuery(
        `UPDATE tournament_matches SET
         player1_score = $1,
         player2_score = $2,
         series_wins_player1 = $3,
         series_wins_player2 = $4,
         series_game_count = $5,
         status = 'ready',
         ready_player1 = false,
         ready_player2 = false,
         ready_at = NOW(),
         nakama_match_id = NULL,
         started_at = NULL,
         spectator_count = 0,
         winner_participant_id = NULL,
         completed_at = NULL,
         last_activity_at = NOW()
         WHERE id = $6
           AND status NOT IN ('completed', 'bye')
           AND series_game_count = $7
         RETURNING id`,
        [player1ScoreValue, player2ScoreValue, seriesWinsP1, seriesWinsP2, seriesGameCount, tournamentMatchId, expectedSeriesGameCount]
      );
      var progressRows = Array.isArray(progressResult) ? progressResult : [];
      if (progressRows.length === 0) {
        logger.warn('Tournament match series update conflict (concurrent): ' + tournamentMatchId);
        if (isStrict) {
          throw new Error('Tournament match was updated concurrently');
        }
        return;
      }
      applyTotalScoreDeltas();
      logger.info('Series ongoing for tournament match ' + tournamentMatchId + ' (' + seriesWinsP1 + '-' + seriesWinsP2 + ' of Bo' + bestOf + ')');
      return;
    }

    // Series complete - update match result (guard against concurrent reports)
    var updateResult = nk.sqlQuery(
      `UPDATE tournament_matches SET
       status = 'completed',
       winner_participant_id = $1,
       player1_score = $2,
       player2_score = $3,
       series_wins_player1 = $4,
       series_wins_player2 = $5,
       series_game_count = $6,
       nakama_match_id = NULL,
       spectator_count = 0,
       completed_at = NOW(),
       last_activity_at = NOW()
        WHERE id = $7
          AND status NOT IN ('completed', 'bye')
          AND series_game_count = $8
        RETURNING id`,
      [winnerParticipantId, player1ScoreValue, player2ScoreValue, seriesWinsP1, seriesWinsP2, seriesGameCount, tournamentMatchId, expectedSeriesGameCount]
    );
    var updateRows = Array.isArray(updateResult) ? updateResult : [];
    if (updateRows.length === 0) {
      logger.warn('Tournament match completion conflict (concurrent): ' + tournamentMatchId);
      if (isStrict) {
        throw new Error('Tournament match was updated concurrently');
      }
      return;
    }
    applyTotalScoreDeltas();

    // Update winner participant stats (series complete)
    if (winnerParticipantId) {
      nk.sqlExec(
        `UPDATE tournament_participants SET
         matches_won = matches_won + 1,
         matches_played = matches_played + 1
         WHERE id = $1`,
        [winnerParticipantId]
      );
    }

    var shouldResetGrandFinal = false;

    // Handle loser (series complete)
    if (loserParticipantId) {
      var winnerIsPlayer1 = winnerParticipantId === match.player1_participant_id;
      var loserLossesCount = winnerIsPlayer1 ? player2Losses : player1Losses;

      if (isDoubleElimination) {
        var isGrandFinal = match.bracket_type === 'grand_final';
        var isWinnersBracket = match.bracket_type === 'winners';
        var isFirstGrandFinal = isGrandFinal && (match.match_number || 1) === 1;
        var allowGrandFinalReset = match.grand_final_reset === true;
        var canResetGrandFinal = allowGrandFinalReset && isFirstGrandFinal && loserLossesCount === 0;
        shouldResetGrandFinal = canResetGrandFinal;

        if (isWinnersBracket || canResetGrandFinal) {
          var targetBracket = isWinnersBracket ? 'losers' : 'grand_final';
          nk.sqlExec(
            `UPDATE tournament_participants SET
             matches_played = matches_played + 1,
             losses_count = losses_count + 1,
             bracket_position = $1
             WHERE id = $2`,
            [targetBracket, loserParticipantId]
          );
        } else {
          var totalLosersRounds = Math.max(0, (match.total_rounds - 1) * 2);
          var eliminationRound = match.round_number;
          if (isGrandFinal) {
            eliminationRound = totalLosersRounds + (match.match_number || 1);
          }
          nk.sqlExec(
            `UPDATE tournament_participants SET
             matches_played = matches_played + 1,
             losses_count = losses_count + 1,
             status = 'eliminated',
             eliminated_at = NOW(),
             elimination_round = $1
             WHERE id = $2`,
            [eliminationRound, loserParticipantId]
          );
        }
      } else {
        nk.sqlExec(
          `UPDATE tournament_participants SET
           matches_played = matches_played + 1,
           status = 'eliminated',
           eliminated_at = NOW(),
           elimination_round = $1
           WHERE id = $2`,
          [match.round_number, loserParticipantId]
        );
      }
    }

    if (botInvolvedMatch) {
      if (!player1IsBot && match.player1_participant_id) {
        nk.sqlExec(
          `UPDATE tournament_participants
           SET bot_influenced = true
           WHERE id = $1`,
          [match.player1_participant_id]
        );
      }
      if (!player2IsBot && match.player2_participant_id) {
        nk.sqlExec(
          `UPDATE tournament_participants
           SET bot_influenced = true
           WHERE id = $1`,
          [match.player2_participant_id]
        );
      }
    }

    if (isDoubleElimination) {
      advanceDoubleElimination(nk, logger, match, winnerParticipantId, loserParticipantId, shouldResetGrandFinal);
    } else {
      // Check if round is complete and advance
      checkRoundCompletionAndAdvance(nk, logger, match, winnerParticipantId);
    }

    if (!skipBotAutoResolve) {
      autoResolveReadyBotMatches(nk, logger, match.tournament_id);
    }

    logger.info('Tournament match auto-reported successfully: ' + tournamentMatchId);

  } catch (error) {
    logger.error('Error auto-reporting tournament match result: ' + error);
    if (isStrict) {
      throw error;
    }
  }
}

export function autoResolveReadyBotMatches(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  maxMatchesToResolve?: number
): number {
  var lockKey = 'tournament_bot_auto_resolve:' + tournamentId;
  var lock = tryAcquireTournamentLock(nk, logger, lockKey, TOURNAMENT_LOCK_LEASE_MS);
  if (!lock) {
    return 0;
  }

  var resolvedCount = 0;
  var maxIterations = Number(maxMatchesToResolve) || 512;
  if (maxIterations < 1) {
    maxIterations = 1;
  }

  // Track matches that failed resolution so we can skip them and continue
  // resolving other matches.  Without this, a single poisoned bot match
  // blocks resolution of ALL remaining bot matches until the next cron tick.
  var failedMatchIds: string[] = [];
  var consecutiveFailures = 0;
  var MAX_CONSECUTIVE_FAILURES = 5;

  try {
    for (var i = 0; i < maxIterations; i++) {
      // Build exclusion clause for matches that already failed this cycle.
      var queryParams: any[] = [tournamentId];
      var excludeClause = '';
      if (failedMatchIds.length > 0) {
        for (var fi = 0; fi < failedMatchIds.length; fi++) {
          excludeClause += ' AND tm.id != $' + (queryParams.length + 1);
          queryParams.push(failedMatchIds[fi]);
        }
      }

      var matchResult = nk.sqlQuery(
        `SELECT tm.id, tm.player1_participant_id, tm.player2_participant_id,
                p1.seed_number as player1_seed, p2.seed_number as player2_seed,
                t.question_count
         FROM tournament_matches tm
         JOIN tournaments t ON t.id = tm.tournament_id
         JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
         JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
         WHERE tm.tournament_id = $1
           AND tm.status = 'ready'
           AND t.status = 'in_progress'
           AND p1.is_bot = true
           AND p2.is_bot = true
           AND p1.status NOT IN ('forfeited', 'eliminated', 'disqualified')
           AND p2.status NOT IN ('forfeited', 'eliminated', 'disqualified')` +
           excludeClause +
         ` ORDER BY tm.round_number ASC, tm.match_number ASC
         LIMIT 1`,
        queryParams
      );
      var matchRows = Array.isArray(matchResult) ? matchResult : [];
      if (matchRows.length === 0) {
        break;
      }

      var match = matchRows[0];
      var questionCount = Number(match.question_count);
      if (!Number.isFinite(questionCount) || questionCount <= 0) {
        questionCount = 10;
      }

      var player1Seed = Number(match.player1_seed);
      var player2Seed = Number(match.player2_seed);
      if (!Number.isFinite(player1Seed)) player1Seed = Number.MAX_SAFE_INTEGER;
      if (!Number.isFinite(player2Seed)) player2Seed = Number.MAX_SAFE_INTEGER;

      var winnerIsPlayer1 = false;
      if (player1Seed === player2Seed) {
        winnerIsPlayer1 = Math.random() < 0.5;
      } else {
        winnerIsPlayer1 = player1Seed < player2Seed;
      }

      var maxScore = Math.max(1, Math.floor(questionCount));
      var spread = Math.max(1, Math.floor(maxScore * 0.2));
      var loserScore = Math.max(0, maxScore - spread - Math.floor(Math.random() * Math.max(1, spread / 2)));
      var winnerScore = Math.min(maxScore, loserScore + Math.max(1, Math.floor(Math.random() * spread) + 1));
      if (winnerScore <= loserScore) {
        winnerScore = Math.min(maxScore, loserScore + 1);
      }

      var player1Score = winnerIsPlayer1 ? winnerScore : loserScore;
      var player2Score = winnerIsPlayer1 ? loserScore : winnerScore;

      autoReportTournamentResult(
        nk,
        logger,
        match.id,
        null,
        player1Score,
        player2Score,
        false,
        true,
        true
      );

      var verifyResult = nk.sqlQuery(
        `SELECT status FROM tournament_matches WHERE id = $1`,
        [match.id]
      );
      var verifyRows = Array.isArray(verifyResult) ? verifyResult : [];
      if (verifyRows.length > 0 && verifyRows[0].status !== 'ready') {
        resolvedCount++;
        consecutiveFailures = 0;
        if (
          resolvedCount % BOT_AUTO_RESOLVE_LOCK_REFRESH_EVERY === 0 &&
          !refreshTournamentLock(nk, logger, lock)
        ) {
          logger.warn(
            'Bot auto-resolve lock refresh failed for tournament ' +
            tournamentId +
            '; ending this cycle before the lease can overlap.'
          );
          break;
        }
      } else {
        // Track the failed match so we skip it on subsequent iterations
        // and continue resolving other bot matches.
        failedMatchIds.push(match.id);
        consecutiveFailures++;
        logger.warn(
          'Bot auto-resolve failed for match ' + match.id +
          ' (tournament ' + tournamentId + ')' +
          ' — consecutive failures: ' + consecutiveFailures +
          ', total skipped this cycle: ' + failedMatchIds.length
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error(
            'Bot auto-resolve: ' + MAX_CONSECUTIVE_FAILURES +
            ' consecutive failures for tournament ' + tournamentId +
            ' — bailing out. Skipped IDs: ' + failedMatchIds.join(',')
          );
          break;
        }
        continue;
      }
    }

    // Human-vs-bot matches: only auto-start if the match has been
    // sitting in 'ready' past the no-show window (60s). Otherwise the
    // human presses Play and the match starts instantly via ready-check.
    for (var j = 0; j < maxIterations; j++) {
      var hvbMatchResult = nk.sqlQuery(
        `SELECT tm.id
         FROM tournament_matches tm
         JOIN tournaments t ON t.id = tm.tournament_id
         LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
         LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
         WHERE tm.tournament_id = $1
           AND tm.status = 'ready'
           AND tm.ready_at IS NOT NULL
           AND (
             (tm.round_number = 1 AND tm.ready_at < NOW() - INTERVAL '60 seconds')
             OR
             (tm.round_number > 1 AND tm.ready_at < NOW() - INTERVAL '10 seconds')
           )
           AND t.status = 'in_progress'
           AND COALESCE(p1.status, 'active') NOT IN ('forfeited', 'eliminated', 'disqualified')
           AND COALESCE(p2.status, 'active') NOT IN ('forfeited', 'eliminated', 'disqualified')
           AND (
             (p1.is_bot = true AND (p2.is_bot = false OR p2.is_bot IS NULL))
             OR (p2.is_bot = true AND (p1.is_bot = false OR p1.is_bot IS NULL))
           )
         ORDER BY tm.round_number ASC, tm.match_number ASC
         LIMIT 1`,
        [tournamentId]
      );
      var hvbRows = Array.isArray(hvbMatchResult) ? hvbMatchResult : [];
      if (hvbRows.length === 0) {
        break;
      }

      try {
        startTournamentRuntimeMatch(nk, logger, hvbRows[0].id, {});
        resolvedCount++;
        if (
          resolvedCount % BOT_AUTO_RESOLVE_LOCK_REFRESH_EVERY === 0 &&
          !refreshTournamentLock(nk, logger, lock)
        ) {
          logger.warn(
            'Bot auto-start lock refresh failed for tournament ' +
            tournamentId +
            '; ending this cycle before the lease can overlap.'
          );
          break;
        }
        logger.info('Auto-started human-vs-bot tournament match: ' + hvbRows[0].id);
      } catch (hvbError) {
        logger.warn('Failed to auto-start human-vs-bot match ' + hvbRows[0].id + ': ' + hvbError);
        break;
      }
    }
  } catch (error) {
    logger.error('Failed to auto-resolve bot tournament matches: ' + error);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }

  if (resolvedCount > 0) {
    logger.info(
      'Auto-resolved ' + resolvedCount + ' bot tournament matches for tournament ' + tournamentId
    );
  }

  return resolvedCount;
}

export function checkRoundCompletionAndAdvance(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  match: any,
  winnerParticipantId: string | null
): void {
  var lockKey =
    'tournament_round_advance:' +
    match.tournament_id + ':' +
    String(match.round_number) + ':' +
    String(match.bracket_type || 'winners');
  var lock = tryAcquireTournamentLock(nk, logger, lockKey, 120000);
  if (!lock) {
    logger.info('Round advance lock busy, skipping duplicate check: ' + lockKey);
    return;
  }
  try {
    var statusResult = nk.sqlQuery(
      `SELECT status, total_rounds, rewards FROM tournaments WHERE id = $1`,
      [match.tournament_id]
    );
    var statusRows = Array.isArray(statusResult) ? statusResult : [];
    if (statusRows.length === 0) {
      return;
    }
    var tournamentStatus = statusRows[0].status;
    if (tournamentStatus !== 'in_progress') {
      logger.info(
        'Skipping round advance because tournament is not in progress: ' +
        match.tournament_id + ' status=' + tournamentStatus
      );
      return;
    }
    var totalRounds = parseInt(statusRows[0].total_rounds) || parseInt(match.total_rounds) || 0;
    var rewards = statusRows[0].rewards !== undefined ? statusRows[0].rewards : match.rewards;

    // Check if all matches in current round are complete. Pending empty
    // placeholders still count as pending; otherwise bye-heavy rounds can
    // advance before the whole round has been populated.
    var roundCheck = nk.sqlQuery(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status NOT IN ('completed', 'bye') THEN 1 ELSE 0 END) as pending
       FROM tournament_matches
       WHERE tournament_id = $1 AND round_number = $2 AND bracket_type = $3
       `,
      [match.tournament_id, match.round_number, match.bracket_type || 'winners']
    );
    var roundRows = Array.isArray(roundCheck) ? roundCheck : [];
    var totalMatches = roundRows.length > 0 ? parseInt(roundRows[0].total) || 0 : 0;
    var pendingMatches = roundRows.length > 0 ? parseInt(roundRows[0].pending) : 1;

    logger.info(
      'Round ' + match.round_number + ' check: ' +
      pendingMatches + ' pending matches out of ' + totalMatches
    );

    if (totalMatches > 0 && pendingMatches === 0) {
      // All matches in round complete
      if (totalRounds > 0 && match.round_number >= totalRounds) {
        // Before completing, check no matches are still in_progress or ready
        // (same guard as double elimination — prevents premature crown).
        var activeCheckResult = nk.sqlQuery(
          `SELECT 1 FROM tournament_matches
           WHERE tournament_id = $1
             AND status IN ('in_progress', 'ready')
           LIMIT 1`,
          [match.tournament_id]
        );
        var activeCheckRows = Array.isArray(activeCheckResult) ? activeCheckResult : [];
        if (activeCheckRows.length > 0) {
          logger.info(
            'Delaying single-elimination completion: matches still active for tournament ' +
            match.tournament_id
          );
          return;
        }
        // Tournament complete
        completeTournament(nk, logger, match.tournament_id, winnerParticipantId, rewards);
      } else {
        // Advance to next round
        advanceWinnersToNextRound(nk, logger, match);
      }
    }

  } catch (error) {
    logger.error('Error checking round completion: ' + error);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }
}

export function advanceWinnersToNextRound(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  match: any
): void {
  var nextRound = match.round_number + 1;
  var lockKey =
    'tournament_winners_advance:' +
    match.tournament_id + ':' +
    String(nextRound) + ':' +
    String(match.bracket_type || 'winners');
  var lock = tryAcquireTournamentLock(nk, logger, lockKey, 120000);
  if (!lock) {
    logger.info('Winners advance lock busy, skipping duplicate advance: ' + lockKey);
    return;
  }
  try {
    // Update tournament current round
    nk.sqlExec(
      `UPDATE tournaments
       SET current_round = CASE WHEN current_round < $1 THEN $1 ELSE current_round END,
           updated_at = NOW()
       WHERE id = $2
         AND status IN ('in_progress', 'paused')`,
      [nextRound, match.tournament_id]
    );

    // Get all winners from the completed round
    var winnersResult = nk.sqlQuery(
      `SELECT tm.match_number, tm.winner_participant_id
       FROM tournament_matches tm
       WHERE tm.tournament_id = $1 AND tm.round_number = $2 AND tm.bracket_type = $3
       AND tm.status IN ('completed', 'bye')
       ORDER BY tm.match_number ASC`,
      [match.tournament_id, match.round_number, match.bracket_type || 'winners']
    );
    var winners = Array.isArray(winnersResult) ? winnersResult : [];

    logger.debug('Evaluating winners advancement from round ' + match.round_number + ' to round ' + nextRound + ' with ' + winners.length + ' winners');
    var changedMatches = 0;

    var shouldCheckAutoAdvancedNextRound = false;
    var autoAdvancedWinnerForNextRound: string | null = null;

    // Pair winners for next round (match 1&2 winners -> next round match 1, etc.)
    for (var w = 0; w < winners.length; w += 2) {
      var nextMatchNumber = Math.ceil((w + 1) / 2);
      var player1Winner = winners[w]?.winner_participant_id || null;
      var player2Winner = winners[w + 1]?.winner_participant_id || null;

      // Handle byes - if only one player, they win automatically
      var nextStatus = 'pending';
      var autoWinner: string | null = null;
      if (player1Winner && player2Winner) {
        nextStatus = 'ready';
      } else if (player1Winner || player2Winner) {
        nextStatus = 'bye';
        autoWinner = player1Winner || player2Winner;
      } else {
        nextStatus = 'bye';
      }

      // Check if next round match exists
      var existingMatch = nk.sqlQuery(
        `SELECT id, status, player1_participant_id, player2_participant_id, winner_participant_id
         FROM tournament_matches
         WHERE tournament_id = $1 AND round_number = $2 AND match_number = $3 AND bracket_type = $4`,
        [match.tournament_id, nextRound, nextMatchNumber, match.bracket_type || 'winners']
      );
      var matchChanged = false;

      if (Array.isArray(existingMatch) && existingMatch.length > 0) {
        var existing = existingMatch[0];
        var existingStatus = String(existing.status || '');
        if (existingStatus === 'in_progress' || existingStatus === 'completed') {
          logger.debug(
            'Skipping winners advancement overwrite for active/completed match ' +
            existing.id +
            ' status=' +
            existingStatus
          );
          continue;
        }

        var existingP1 = existing.player1_participant_id || null;
        var existingP2 = existing.player2_participant_id || null;
        var existingWinner = existing.winner_participant_id || null;
        if (
          existingP1 === player1Winner &&
          existingP2 === player2Winner &&
          existingWinner === autoWinner &&
          existingStatus === nextStatus
        ) {
          continue;
        }

        if (nextStatus === 'pending' && (existingStatus === 'ready' || existingStatus === 'bye')) {
          logger.debug(
            'Skipping winners advancement downgrade to pending for match ' +
            existing.id
          );
          continue;
        }

        // Update existing match only when progression data has changed.
        nk.sqlExec(
          `UPDATE tournament_matches SET
           player1_participant_id = $1,
           player2_participant_id = $2,
           status = $3,
           winner_participant_id = $4,
           completed_at = CASE WHEN $3::VARCHAR = 'bye' THEN NOW() ELSE NULL END,
           ready_player1 = false,
           ready_player2 = false,
           ready_at = CASE WHEN $3::VARCHAR = 'ready' THEN NOW() ELSE NULL END,
           nakama_match_id = CASE WHEN $3::VARCHAR IN ('ready', 'pending') THEN NULL ELSE nakama_match_id END,
           started_at = CASE WHEN $3::VARCHAR IN ('ready', 'pending') THEN NULL ELSE started_at END,
           spectator_count = CASE WHEN $3::VARCHAR IN ('ready', 'pending') THEN 0 ELSE spectator_count END,
           last_activity_at = CASE WHEN $3::VARCHAR IN ('ready', 'pending') THEN NOW() ELSE last_activity_at END
           WHERE tournament_id = $5 AND round_number = $6 AND match_number = $7 AND bracket_type = $8`,
          [player1Winner, player2Winner, nextStatus, autoWinner, match.tournament_id, nextRound, nextMatchNumber, match.bracket_type || 'winners']
        );
        matchChanged = true;
      } else {
        // Create new match (shouldn't happen if bracket was generated correctly)
        var fallbackBestOf = getBestOfForTournamentMatch(nk, match.tournament_id, match.bracket_type || 'winners', nextRound);
        nk.sqlExec(
          `INSERT INTO tournament_matches (tournament_id, round_number, match_number, bracket_type,
                                           player1_participant_id, player2_participant_id, status,
                                           winner_participant_id, completed_at, best_of,
                                           ready_player1, ready_player2, ready_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $7::VARCHAR = 'bye' THEN NOW() ELSE NULL END, $9,
                   false, false, CASE WHEN $7::VARCHAR = 'ready' THEN NOW() ELSE NULL END)`,
          [match.tournament_id, nextRound, nextMatchNumber, match.bracket_type || 'winners',
           player1Winner, player2Winner, nextStatus, autoWinner, fallbackBestOf]
        );
        matchChanged = true;
      }

      if (matchChanged) {
        changedMatches++;
      }

      if (matchChanged && nextStatus === 'bye' && autoWinner) {
        shouldCheckAutoAdvancedNextRound = true;
        autoAdvancedWinnerForNextRound = autoWinner;
      }

      // Send notifications to players for their next match
      if (matchChanged && nextStatus === 'ready' && player1Winner && player2Winner) {
        notifyPlayersOfNextMatch(nk, logger, match.tournament_id, player1Winner, player2Winner);
      }
    }

    if (changedMatches > 0) {
      broadcastTournamentBracketUpdate(nk, logger, match.tournament_id);
      logger.info(
        'Round ' +
        match.round_number +
        ' complete, advanced to round ' +
        nextRound +
        ' (matches updated=' +
        changedMatches +
        ')'
      );
    } else {
      logger.debug(
        'No winners advancement changes required for round ' +
        match.round_number +
        ' -> ' +
        nextRound
      );
    }

    // Evaluate bye-only progress only after every match in the next round has
    // been populated. Doing this inside the loop can advance from a partially
    // written round and strand later human participants behind pending
    // placeholders.
    if (shouldCheckAutoAdvancedNextRound && autoAdvancedWinnerForNextRound) {
      var nextMatch = {
        tournament_id: match.tournament_id,
        round_number: nextRound,
        match_number: 1,
        bracket_type: match.bracket_type || 'winners',
        total_rounds: match.total_rounds,
        format: match.format,
        bracket_size: match.bracket_size,
        rewards: match.rewards,
      };
      if (match.format === 'double_elimination') {
        logger.info('Auto-advanced bye in double elimination round ' + nextRound);
        advanceDoubleElimination(nk, logger, nextMatch, autoAdvancedWinnerForNextRound, null, true);
      } else {
        checkRoundCompletionAndAdvance(nk, logger, nextMatch, autoAdvancedWinnerForNextRound);
      }
    }

  } catch (error) {
    logger.error('Error advancing winners to next round: ' + error);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }
}

export function getLosersRoundMatchCount(bracketSize: number, roundNumber: number): number {
  if (!bracketSize || roundNumber <= 0) return 0;
  if (roundNumber % 2 === 1) {
    return Math.floor(bracketSize / Math.pow(2, (roundNumber + 3) / 2));
  }
  return Math.floor(bracketSize / Math.pow(2, (roundNumber / 2) + 1));
}

export function isRoundComplete(
  nk: nkruntime.Nakama,
  tournamentId: string,
  roundNumber: number,
  bracketType: string
): boolean {
  // Count both total matches and pending matches. Pending empty placeholders
  // are not complete; they mean the round still needs population. Bye matches
  // with no winner are already resolved empty slots and do not block progress.
  var roundCheck = nk.sqlQuery(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status NOT IN ('completed', 'bye') THEN 1 ELSE 0 END) as pending
     FROM tournament_matches
     WHERE tournament_id = $1 AND round_number = $2 AND bracket_type = $3`,
    [tournamentId, roundNumber, bracketType]
  );
  var roundRows = Array.isArray(roundCheck) ? roundCheck : [];
  if (roundRows.length === 0) return false;
  var totalMatches = parseInt(roundRows[0].total) || 0;
  var pendingMatches = parseInt(roundRows[0].pending) || 0;
  return totalMatches > 0 && pendingMatches === 0;
}

export function getWinnersFromRound(
  nk: nkruntime.Nakama,
  tournamentId: string,
  roundNumber: number,
  bracketType: string
): string[] {
  var result = nk.sqlQuery(
    `SELECT match_number, winner_participant_id
     FROM tournament_matches
     WHERE tournament_id = $1 AND round_number = $2 AND bracket_type = $3
       AND status IN ('completed', 'bye')
     ORDER BY match_number ASC`,
    [tournamentId, roundNumber, bracketType]
  );
  var rows = Array.isArray(result) ? result : [];
  var winners: string[] = [];
  for (var i = 0; i < rows.length; i++) {
    // Push null for NULL winners to preserve bracket slot positions.
    // Skipping nulls (e.g. double-forfeit) would misalign all subsequent
    // pairings in populateLosersRound, routing wrong participants into
    // losers bracket matches.
    winners.push(rows[i].winner_participant_id || null);
  }
  return winners;
}

export function getLosersFromWinnersRound(
  nk: nkruntime.Nakama,
  tournamentId: string,
  roundNumber: number
): string[] {
  var result = nk.sqlQuery(
    `SELECT match_number, player1_participant_id, player2_participant_id, winner_participant_id, status
     FROM tournament_matches
     WHERE tournament_id = $1 AND round_number = $2 AND bracket_type = 'winners'
       AND status IN ('completed', 'bye')
     ORDER BY match_number ASC`,
    [tournamentId, roundNumber]
  );
  var rows = Array.isArray(result) ? result : [];
  var losers: string[] = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.status === 'bye') {
      // Bye matches have no loser — push null to preserve slot position.
      losers.push(null as any);
      continue;
    }
    if (row.winner_participant_id === row.player1_participant_id) {
      losers.push(row.player2_participant_id || null);
    } else if (row.winner_participant_id === row.player2_participant_id) {
      losers.push(row.player1_participant_id || null);
    } else {
      // Unresolved winner (NULL or neither player) — push null to preserve slot.
      losers.push(null as any);
    }
  }
  return losers;
}

export function populateLosersRound(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  bracketSize: number,
  totalRounds: number,
  roundNumber: number
): boolean {
  var matchesInRound = getLosersRoundMatchCount(bracketSize, roundNumber);
  if (matchesInRound <= 0) return false;

  var ready = false;
  if (roundNumber === 1) {
    ready = isRoundComplete(nk, tournamentId, 1, 'winners');
  } else if (roundNumber % 2 === 0) {
    var winnersRound = (roundNumber / 2) + 1;
    ready = isRoundComplete(nk, tournamentId, roundNumber - 1, 'losers') &&
      isRoundComplete(nk, tournamentId, winnersRound, 'winners');
  } else {
    ready = isRoundComplete(nk, tournamentId, roundNumber - 1, 'losers');
  }

  if (!ready) return false;

  var participants: Array<string | null> = [];

  if (roundNumber === 1) {
    var w1Losers = getLosersFromWinnersRound(nk, tournamentId, 1);
    for (var l = 0; l < w1Losers.length; l++) {
      participants.push(w1Losers[l]);
    }
  } else if (roundNumber % 2 === 0) {
    var winnersRoundNumber = (roundNumber / 2) + 1;
    var losersFromWinners = getLosersFromWinnersRound(nk, tournamentId, winnersRoundNumber);
    var winnersFromLosers = getWinnersFromRound(nk, tournamentId, roundNumber - 1, 'losers');
    var maxPairs = Math.max(winnersFromLosers.length, losersFromWinners.length);
    for (var p = 0; p < maxPairs; p++) {
      participants.push(winnersFromLosers[p] || null);
      participants.push(losersFromWinners[p] || null);
    }
  } else {
    var winnersOnly = getWinnersFromRound(nk, tournamentId, roundNumber - 1, 'losers');
    for (var w = 0; w < winnersOnly.length; w++) {
      participants.push(winnersOnly[w]);
    }
  }

  var expectedSlots = matchesInRound * 2;
  while (participants.length < expectedSlots) {
    participants.push(null);
  }

  var updated = false;

  for (var matchNum = 1; matchNum <= matchesInRound; matchNum++) {
    var p1 = participants[(matchNum - 1) * 2] || null;
    var p2 = participants[(matchNum - 1) * 2 + 1] || null;
    var nextStatus = 'pending';
    var autoWinner: string | null = null;

    if (p1 && p2) {
      nextStatus = 'ready';
    } else if (p1 || p2) {
      nextStatus = 'bye';
      autoWinner = p1 || p2;
    } else {
      nextStatus = 'bye';
    }

    var existingMatch = nk.sqlQuery(
      `SELECT id, status, player1_participant_id, player2_participant_id, winner_participant_id
       FROM tournament_matches
       WHERE tournament_id = $1 AND round_number = $2 AND match_number = $3 AND bracket_type = 'losers'`,
      [tournamentId, roundNumber, matchNum]
    );
    var existingRows = Array.isArray(existingMatch) ? existingMatch : [];
    if (existingRows.length > 0) {
      var existingRow = existingRows[0];
      var existingStatus = existingRow.status;
      // Never touch a match that is currently being played.
      if (existingStatus === 'in_progress') {
        continue;
      }
      // A completed match with the correct participants is final.
      // But if the participants differ from what the bracket now
      // expects, the match was prematurely populated (e.g. the
      // lower round appeared empty when isRoundComplete checked)
      // and completed with wrong players.  Reset it so the correct
      // participants can play.
      if (existingStatus === 'completed') {
        if (existingRow.player1_participant_id === p1 &&
            existingRow.player2_participant_id === p2 &&
            existingRow.winner_participant_id) {
          continue;
        }
        // Wrong participants or missing winner — reset to the
        // correct state so the bracket repairs itself.
      }
      if (existingRow.player1_participant_id === p1 &&
          existingRow.player2_participant_id === p2 &&
          existingRow.status === nextStatus) {
        continue;
      }
      nk.sqlExec(
        `UPDATE tournament_matches SET
         player1_participant_id = $1,
         player2_participant_id = $2,
         status = $3,
         winner_participant_id = $4,
         completed_at = CASE WHEN $3::VARCHAR = 'bye' THEN NOW() ELSE NULL END,
         ready_at = CASE WHEN $3::VARCHAR = 'ready' THEN NOW() ELSE NULL END,
         nakama_match_id = CASE WHEN $3::VARCHAR IN ('ready', 'pending') THEN NULL ELSE nakama_match_id END,
         started_at = CASE WHEN $3::VARCHAR IN ('ready', 'pending') THEN NULL ELSE started_at END,
         spectator_count = CASE WHEN $3::VARCHAR IN ('ready', 'pending') THEN 0 ELSE spectator_count END,
         last_activity_at = NOW()
         WHERE id = $5`,
        [p1, p2, nextStatus, autoWinner, existingRows[0].id]
      );
    } else {
      var losersBestOf = getBestOfForTournamentMatch(nk, tournamentId, 'losers', roundNumber);
      nk.sqlExec(
        `INSERT INTO tournament_matches (tournament_id, round_number, match_number, bracket_type,
                                         player1_participant_id, player2_participant_id, status,
                                         winner_participant_id, completed_at, best_of,
                                         ready_at, ready_player1, ready_player2)
         VALUES ($1, $2, $3, 'losers', $4, $5, $6, $7,
                 CASE WHEN $6::VARCHAR = 'bye' THEN NOW() ELSE NULL END, $8,
                 CASE WHEN $6::VARCHAR = 'ready' THEN NOW() ELSE NULL END, false, false)`,
        [tournamentId, roundNumber, matchNum, p1, p2, nextStatus, autoWinner, losersBestOf]
      );
    }
    updated = true;

    if (nextStatus === 'ready' && p1 && p2) {
      notifyPlayersOfNextMatch(nk, logger, tournamentId, p1, p2);
    }
  }

  if (updated) {
    broadcastTournamentBracketUpdate(nk, logger, tournamentId);
  }
  return updated;
}

export function tryPopulateLosersRounds(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  bracketSize: number,
  totalRounds: number
): void {
  var totalLosersRounds = Math.max(0, (totalRounds - 1) * 2);
  var madeProgress = true;
  var safety = 0;
  while (madeProgress && safety < totalLosersRounds + 1) {
    madeProgress = false;
    for (var round = 1; round <= totalLosersRounds; round++) {
      if (populateLosersRound(nk, logger, tournamentId, bracketSize, totalRounds, round)) {
        madeProgress = true;
      }
    }
    safety++;
  }
}

export function tryCreateGrandFinal(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  totalRounds: number
): void {
  var totalLosersRounds = Math.max(0, (totalRounds - 1) * 2);
  if (!isRoundComplete(nk, tournamentId, totalRounds, 'winners')) return;
  if (!isRoundComplete(nk, tournamentId, totalLosersRounds, 'losers')) return;

  // Defence: ensure no lower losers rounds are still waiting on matches.
  // The last-round check alone can pass while earlier rounds still have
  // 'ready' or 'pending' matches (e.g. when the bracket populates slowly
  // after a fast all-bot winners bracket).
  var unfinishedLosersResult = nk.sqlQuery(
    `SELECT 1 FROM tournament_matches
     WHERE tournament_id = $1
       AND bracket_type = 'losers'
       AND status IN ('ready', 'in_progress', 'pending')
     LIMIT 1`,
    [tournamentId]
  );
  var unfinishedRows = Array.isArray(unfinishedLosersResult) ? unfinishedLosersResult : [];
  if (unfinishedRows.length > 0) {
    logger.info(
      'Delaying grand final creation: losers bracket has unfinished matches for tournament ' + tournamentId
    );
    return;
  }

  var winnersFinal = nk.sqlQuery(
    `SELECT winner_participant_id FROM tournament_matches
     WHERE tournament_id = $1 AND round_number = $2 AND bracket_type = 'winners'
       AND status IN ('completed', 'bye')
     ORDER BY match_number ASC LIMIT 1`,
    [tournamentId, totalRounds]
  );
  // Find the losers champion: walk backwards from the last losers round
  // to find a round that actually has a completed match with a winner.
  // The calculated last round may be a bye with no participants assigned.
  var loserParticipantId: string | null = null;
  for (var lr = totalLosersRounds; lr >= 1; lr--) {
    var losersRoundResult = nk.sqlQuery(
      `SELECT winner_participant_id FROM tournament_matches
       WHERE tournament_id = $1 AND round_number = $2 AND bracket_type = 'losers'
         AND status IN ('completed', 'bye')
         AND winner_participant_id IS NOT NULL
       ORDER BY match_number ASC LIMIT 1`,
      [tournamentId, lr]
    );
    var lrRows = Array.isArray(losersRoundResult) ? losersRoundResult : [];
    if (lrRows.length > 0 && lrRows[0].winner_participant_id) {
      loserParticipantId = lrRows[0].winner_participant_id;
      break;
    }
  }

  var winnersRows = Array.isArray(winnersFinal) ? winnersFinal : [];
  if (winnersRows.length === 0) return;

  var winnerParticipantId = winnersRows[0].winner_participant_id;
  if (!winnerParticipantId || !loserParticipantId) return;

  var grandFinalResult = nk.sqlQuery(
    `SELECT id, status, player1_participant_id, player2_participant_id
     FROM tournament_matches
     WHERE tournament_id = $1 AND bracket_type = 'grand_final'
     ORDER BY round_number ASC, match_number ASC LIMIT 1`,
    [tournamentId]
  );
  var grandRows = Array.isArray(grandFinalResult) ? grandFinalResult : [];
  if (grandRows.length > 0) {
    if (grandRows[0].status === 'completed' || grandRows[0].status === 'in_progress') {
      return;
    }
    if (grandRows[0].player1_participant_id === winnerParticipantId &&
        grandRows[0].player2_participant_id === loserParticipantId &&
        grandRows[0].status === 'ready') {
      return;
    }
    nk.sqlExec(
      `UPDATE tournament_matches SET
       player1_participant_id = $1,
       player2_participant_id = $2,
       status = 'ready',
       ready_player1 = false,
       ready_player2 = false,
       ready_at = NOW(),
       nakama_match_id = NULL,
       started_at = NULL,
       spectator_count = 0,
       last_activity_at = NOW()
       WHERE id = $3`,
      [winnerParticipantId, loserParticipantId, grandRows[0].id]
    );
  } else {
    var grandFinalBestOf = getBestOfForTournamentMatch(nk, tournamentId, 'grand_final', 1);
    nk.sqlExec(
      `INSERT INTO tournament_matches (tournament_id, round_number, match_number, bracket_type,
                                       player1_participant_id, player2_participant_id, status, best_of,
                                       ready_player1, ready_player2, ready_at)
       VALUES ($1, $2, 1, 'grand_final', $3, $4, 'ready', $5, false, false, NOW())`,
      [tournamentId, totalRounds + totalLosersRounds + 1, winnerParticipantId, loserParticipantId, grandFinalBestOf]
    );
  }

  notifyPlayersOfNextMatch(nk, logger, tournamentId, winnerParticipantId, loserParticipantId);
  broadcastTournamentBracketUpdate(nk, logger, tournamentId);
}

export function createGrandFinalReset(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  totalRounds: number,
  winnerParticipantId: string | null,
  loserParticipantId: string | null
): void {
  if (!winnerParticipantId || !loserParticipantId) return;

  var totalLosersRounds = Math.max(0, (totalRounds - 1) * 2);
  var existingReset = nk.sqlQuery(
    `SELECT id, status, player1_participant_id, player2_participant_id
     FROM tournament_matches
     WHERE tournament_id = $1 AND bracket_type = 'grand_final' AND match_number = 2
     LIMIT 1`,
    [tournamentId]
  );
  var resetRows = Array.isArray(existingReset) ? existingReset : [];

  if (resetRows.length === 0) {
    var resetBestOf = getBestOfForTournamentMatch(nk, tournamentId, 'grand_final', totalRounds + totalLosersRounds + 2);
    nk.sqlExec(
      `INSERT INTO tournament_matches (tournament_id, round_number, match_number, bracket_type,
                                       player1_participant_id, player2_participant_id, status, best_of,
                                       ready_player1, ready_player2, ready_at)
       VALUES ($1, $2, 2, 'grand_final', $3, $4, 'ready', $5, false, false, NOW())`,
      [tournamentId, totalRounds + totalLosersRounds + 2, winnerParticipantId, loserParticipantId, resetBestOf]
    );
  } else {
    if (resetRows[0].status === 'completed' || resetRows[0].status === 'in_progress') {
      return;
    }
    if (resetRows[0].player1_participant_id === winnerParticipantId &&
        resetRows[0].player2_participant_id === loserParticipantId &&
        resetRows[0].status === 'ready') {
      return;
    }
    nk.sqlExec(
      `UPDATE tournament_matches SET
       player1_participant_id = $1,
       player2_participant_id = $2,
       status = 'ready',
       ready_player1 = false,
       ready_player2 = false,
       ready_at = NOW(),
       nakama_match_id = NULL,
       started_at = NULL,
       spectator_count = 0,
       last_activity_at = NOW()
       WHERE id = $3`,
      [winnerParticipantId, loserParticipantId, resetRows[0].id]
    );
  }

  notifyPlayersOfNextMatch(nk, logger, tournamentId, winnerParticipantId, loserParticipantId);
  broadcastTournamentBracketUpdate(nk, logger, tournamentId);
}

export function advanceDoubleElimination(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  match: any,
  winnerParticipantId: string | null,
  loserParticipantId: string | null,
  shouldResetGrandFinal: boolean
): void {
  var lockKey = 'tournament_double_advance:' + match.tournament_id;
  var lock = tryAcquireTournamentLock(nk, logger, lockKey, 120000);
  if (!lock) {
    logger.info('Double elimination advance lock busy, skipping duplicate advance: ' + match.tournament_id);
    return;
  }
  try {
    var statusResult = nk.sqlQuery(
      `SELECT status FROM tournaments WHERE id = $1`,
      [match.tournament_id]
    );
    var statusRows = Array.isArray(statusResult) ? statusResult : [];
    if (statusRows.length === 0) return;
    if (statusRows[0].status !== 'in_progress') {
      logger.info(
        'Skipping double elimination advance because tournament is not in progress: ' +
        match.tournament_id + ' status=' + statusRows[0].status
      );
      return;
    }

  var bracketSize = parseInt(match.bracket_size) || 0;
  var totalRounds = parseInt(match.total_rounds) || 0;
  if (!bracketSize || !totalRounds) {
    return;
  }

  if (match.bracket_type === 'grand_final') {
    if (shouldResetGrandFinal) {
      createGrandFinalReset(nk, logger, match.tournament_id, totalRounds, winnerParticipantId, loserParticipantId);
      return;
    }
    // Before completing, ensure the losers bracket is fully resolved.
    // Otherwise a fast all-bot winners bracket can crown a champion while
    // human players are still waiting for losers matches.
    tryPopulateLosersRounds(nk, logger, match.tournament_id, bracketSize, totalRounds);
    autoResolveReadyBotMatches(nk, logger, match.tournament_id);
    var remainingLosersResult = nk.sqlQuery(
      `SELECT 1 FROM tournament_matches
       WHERE tournament_id = $1
         AND bracket_type = 'losers'
         AND status IN ('ready', 'in_progress', 'pending')
       LIMIT 1`,
      [match.tournament_id]
    );
    var remainingRows = Array.isArray(remainingLosersResult) ? remainingLosersResult : [];
    if (remainingRows.length > 0) {
      logger.info(
        'Delaying tournament completion: losers bracket still has ' +
        'unresolved matches for tournament ' + match.tournament_id
      );
      return;
    }
    completeTournament(nk, logger, match.tournament_id, winnerParticipantId, match.rewards);
    return;
  }

  if (match.bracket_type === 'winners') {
    if (match.round_number < totalRounds && isRoundComplete(nk, match.tournament_id, match.round_number, 'winners')) {
      advanceWinnersToNextRound(nk, logger, match);
    }
  }

  tryPopulateLosersRounds(nk, logger, match.tournament_id, bracketSize, totalRounds);
  tryCreateGrandFinal(nk, logger, match.tournament_id, totalRounds);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }
}

export function runInitialTournamentProgressionPass(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string
): void {
  var lockKey = 'tournament_initial_progress:' + tournamentId;
  var lock = tryAcquireTournamentLock(nk, logger, lockKey, 120000);
  if (!lock) {
    logger.info('Initial tournament progression lock busy, skipping duplicate pass: ' + tournamentId);
    return;
  }

  try {
    var metaResult = nk.sqlQuery(
      `SELECT id, status, format, bracket_size, total_rounds, rewards
       FROM tournaments
       WHERE id = $1`,
      [tournamentId]
    );
    var metaRows = Array.isArray(metaResult) ? metaResult : [];
    if (metaRows.length === 0) {
      logger.warn('Initial progression skipped: tournament not found ' + tournamentId);
      return;
    }

    var meta = metaRows[0];
    if (meta.status !== 'in_progress') {
      logger.info(
        'Initial progression skipped because tournament is not in progress: ' +
        tournamentId +
        ' status=' +
        meta.status
      );
      return;
    }

    var bracketSize = parseInt(meta.bracket_size) || 0;
    var totalRounds = parseInt(meta.total_rounds) || 0;

    if (!bracketSize) {
      logger.warn(
        'Initial progression skipped: bracket_size is missing for ' + tournamentId
      );
      return;
    }

    // Auto-recover: if total_rounds is NULL but bracket_size is set,
    // compute it and fix the DB instead of skipping the tournament.
    if (!totalRounds) {
      totalRounds = Math.ceil(Math.log2(bracketSize));
      if (totalRounds < 1) {
        totalRounds = 1;
      }
      nk.sqlExec(
        `UPDATE tournaments SET total_rounds = $1, updated_at = NOW()
         WHERE id = $2 AND total_rounds IS NULL`,
        [totalRounds, tournamentId]
      );
      logger.info(
        'Fixed NULL total_rounds for tournament ' + tournamentId +
        ': computed ' + totalRounds + ' from bracket_size=' + bracketSize
      );
    }

    var summaryResult = nk.sqlQuery(
      `SELECT bracket_type, status, COUNT(*)::int as count
       FROM tournament_matches
       WHERE tournament_id = $1
       GROUP BY bracket_type, status`,
      [tournamentId]
    );
    var summaryRows = Array.isArray(summaryResult) ? summaryResult : [];
    var beforeCounts: {[key: string]: number} = {};
    for (var i = 0; i < summaryRows.length; i++) {
      var summaryKey = String(summaryRows[i].bracket_type || 'winners') + ':' + String(summaryRows[i].status || '');
      beforeCounts[summaryKey] = Number(summaryRows[i].count) || 0;
    }
    logger.info(
      'Running initial tournament progression pass for ' +
      tournamentId +
      ' (format=' +
      meta.format +
      ', rounds=' +
      totalRounds +
      ', bracketSize=' +
      bracketSize +
      ', before=' +
      JSON.stringify(beforeCounts) +
      ')'
    );

    if (meta.format === 'double_elimination') {
      for (var winnersRound = 1; winnersRound < totalRounds; winnersRound++) {
        if (!isRoundComplete(nk, tournamentId, winnersRound, 'winners')) {
          break;
        }
        advanceWinnersToNextRound(
          nk,
          logger,
          {
            tournament_id: tournamentId,
            round_number: winnersRound,
            bracket_type: 'winners',
            total_rounds: totalRounds,
            format: meta.format,
            bracket_size: bracketSize,
            rewards: meta.rewards,
          }
        );
      }
      tryPopulateLosersRounds(nk, logger, tournamentId, bracketSize, totalRounds);
      tryCreateGrandFinal(nk, logger, tournamentId, totalRounds);

      // Recovery: if grand final is already resolved but tournament status still
      // says in_progress (e.g. transient lock contention on completion callback),
      // reconcile by completing the tournament here.
      //
      // IMPORTANT: Check for a pending grand-final reset match first.
      // When grand_final_reset is enabled and the winners-bracket champion lost
      // the first grand final, a second grand final (match_number = 2) is created
      // with status 'ready' or 'in_progress'.  The tournament must not be
      // completed until that reset match is resolved.
      var pendingResetResult = nk.sqlQuery(
        `SELECT id FROM tournament_matches
         WHERE tournament_id = $1
           AND bracket_type = 'grand_final'
           AND match_number >= 2
           AND status IN ('pending', 'ready', 'in_progress')
         LIMIT 1`,
        [tournamentId]
      );
      var pendingResetRows = Array.isArray(pendingResetResult) ? pendingResetResult : [];
      if (pendingResetRows.length === 0) {
        var grandFinalRowsResult = nk.sqlQuery(
          `SELECT winner_participant_id
           FROM tournament_matches
           WHERE tournament_id = $1
             AND bracket_type = 'grand_final'
             AND status = 'completed'
             AND winner_participant_id IS NOT NULL
           ORDER BY match_number DESC, round_number DESC
           LIMIT 1`,
          [tournamentId]
        );
        var grandFinalRows = Array.isArray(grandFinalRowsResult) ? grandFinalRowsResult : [];
        if (grandFinalRows.length > 0 && grandFinalRows[0].winner_participant_id) {
          completeTournament(
            nk,
            logger,
            tournamentId,
            grandFinalRows[0].winner_participant_id,
            meta.rewards
          );
        }
      }
    } else {
      checkRoundCompletionAndAdvance(
        nk,
        logger,
        {
          tournament_id: tournamentId,
          round_number: 1,
          bracket_type: 'winners',
          total_rounds: totalRounds,
          format: meta.format,
          rewards: meta.rewards,
        },
        null
      );
    }

    var afterResult = nk.sqlQuery(
      `SELECT bracket_type, status, COUNT(*)::int as count
       FROM tournament_matches
       WHERE tournament_id = $1
       GROUP BY bracket_type, status`,
      [tournamentId]
    );
    var afterRows = Array.isArray(afterResult) ? afterResult : [];
    var afterCounts: {[key: string]: number} = {};
    for (var j = 0; j < afterRows.length; j++) {
      var afterKey = String(afterRows[j].bracket_type || 'winners') + ':' + String(afterRows[j].status || '');
      afterCounts[afterKey] = Number(afterRows[j].count) || 0;
    }

    logger.info(
      'Initial tournament progression pass completed for ' +
      tournamentId +
      ' (after=' +
      JSON.stringify(afterCounts) +
      ')'
    );

    if (JSON.stringify(beforeCounts) === JSON.stringify(afterCounts)) {
      logger.warn(
        'Initial progression made no observable bracket-status changes for tournament ' +
        tournamentId +
        '. This may indicate no byes or a bracket that is waiting on player matches.'
      );
    }
  } catch (error) {
    logger.error('Failed initial tournament progression pass for ' + tournamentId + ': ' + error);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }
}

export function runTournamentMaintenanceCycle(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  maxCycles?: number
): number {
  var lockKey = 'tournament_maintenance:' + tournamentId;
  var lock = tryAcquireTournamentLock(nk, logger, lockKey, TOURNAMENT_LOCK_LEASE_MS);
  if (!lock) {
    logger.info('Tournament maintenance lock busy, skipping duplicate cycle: ' + tournamentId);
    return 0;
  }

  var cycles = Number(maxCycles) || 16;
  if (cycles < 1) cycles = 1;
  if (cycles > 64) cycles = 64;
  var totalResolved = 0;

  try {
    for (var cycle = 0; cycle < cycles; cycle++) {
      runInitialTournamentProgressionPass(nk, logger, tournamentId);
      if (!refreshTournamentLock(nk, logger, lock)) {
        logger.warn(
          'Tournament maintenance lock refresh failed after progression for tournament ' +
          tournamentId +
          '; ending this cycle before the lease can overlap.'
        );
        break;
      }
      var resolved = autoResolveReadyBotMatches(nk, logger, tournamentId, 32);
      totalResolved += resolved;
      if (!refreshTournamentLock(nk, logger, lock)) {
        logger.warn(
          'Tournament maintenance lock refresh failed after bot resolution for tournament ' +
          tournamentId +
          '; ending this cycle before the lease can overlap.'
        );
        break;
      }

      if (resolved > 0) {
        runInitialTournamentProgressionPass(nk, logger, tournamentId);
        continue;
      }

      break;
    }

    if (totalResolved > 0) {
      logger.info(
        'Tournament maintenance cycle resolved ' +
        totalResolved +
        ' bot/stale matches for tournament ' +
        tournamentId
      );
    }
  } catch (error) {
    logger.error('Tournament maintenance cycle failed for ' + tournamentId + ': ' + error);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }

  return totalResolved;
}

export function completeTournament(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  winnerParticipantId: string | null,
  rewards: any
): void {
  var lockKey = 'tournament_complete:' + tournamentId;
  var lock = tryAcquireTournamentLock(nk, logger, lockKey, 120000);
  if (!lock) {
    logger.info('Tournament completion lock busy, skipping duplicate completion: ' + tournamentId);
    return;
  }
  try {
    logger.info('Completing tournament: ' + tournamentId);

    var tournamentResult = nk.sqlQuery(
      `SELECT status, winner_id FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    var tournamentRows = Array.isArray(tournamentResult) ? tournamentResult : [];
    if (tournamentRows.length === 0) {
      logger.warn('Tournament not found while completing: ' + tournamentId);
      return;
    }
    var tournamentRow = tournamentRows[0];
    var currentStatus = tournamentRow.status;
    if (currentStatus !== 'in_progress' && currentStatus !== 'paused' && currentStatus !== 'completed') {
      logger.warn(
        'Skipping completion for tournament in invalid status: ' +
        tournamentId + ' status=' + currentStatus
      );
      return;
    }

    // Get winner user ID
    var winnerId: string | null = tournamentRow.winner_id || null;
    if (winnerParticipantId) {
      var winnerResult = nk.sqlQuery(
        `SELECT user_id FROM tournament_participants WHERE id = $1`,
        [winnerParticipantId]
      );
      if (Array.isArray(winnerResult) && winnerResult.length > 0) {
        winnerId = winnerResult[0].user_id;
      }

      // Update winner participant status
      nk.sqlExec(
        `UPDATE tournament_participants SET
         status = 'winner',
         final_placement = 1
         WHERE id = $1`,
        [winnerParticipantId]
      );
    }

    // Transition status only once; allow re-entry when already completed to recover side effects.
    var completeResult = nk.sqlQuery(
      `UPDATE tournaments SET
       status = 'completed',
       completed_at = COALESCE(completed_at, NOW()),
       winner_id = COALESCE($1, winner_id),
       updated_at = NOW()
       WHERE id = $2
         AND status IN ('in_progress', 'paused')
       RETURNING id`,
      [winnerId, tournamentId]
    );
    var completeRows = Array.isArray(completeResult) ? completeResult : [];
    var transitioned = completeRows.length > 0;

    if (!transitioned && winnerId) {
      // Tournament may already be completed; backfill winner_id if missing.
      nk.sqlExec(
        `UPDATE tournaments
         SET winner_id = COALESCE(winner_id, $1),
             updated_at = NOW()
         WHERE id = $2`,
        [winnerId, tournamentId]
      );
    }

    // Eliminate any participants still stuck in 'active' status so they get placements.
    nk.sqlExec(
      `UPDATE tournament_participants
       SET status = 'eliminated',
           eliminated_at = COALESCE(eliminated_at, NOW())
       WHERE tournament_id = $1
         AND status NOT IN ('winner', 'eliminated', 'forfeited', 'disqualified')`,
      [tournamentId]
    );

    // Assign final placements
    assignFinalPlacements(nk, logger, tournamentId);

    // Distribute rewards safely (idempotent per user/reward type).
    distributeTournamentRewards(nk, logger, tournamentId, rewards);

    // Notify all participants (deduped by notification unique index).
    notifyTournamentCompletion(nk, logger, tournamentId, winnerId);
    broadcastTournamentBracketUpdate(nk, logger, tournamentId);

    logger.info(
      'Tournament completion processed: ' +
      tournamentId +
      ', winner: ' + winnerId +
      ', transitioned=' + transitioned
    );

  } catch (error) {
    logger.error('Error completing tournament: ' + error);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }
}

export function assignFinalPlacements(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string
): void {
  try {
    // Get participants ordered by: winner first, then by elimination round (later = better), then by score
    var participantsResult = nk.sqlQuery(
      `SELECT id, user_id, status, elimination_round, total_score
       FROM tournament_participants
       WHERE tournament_id = $1
       ORDER BY
         CASE WHEN status = 'winner' THEN 0 ELSE 1 END,
         elimination_round DESC NULLS LAST,
         total_score DESC`,
      [tournamentId]
    );

    var participants = Array.isArray(participantsResult) ? participantsResult : [];

    for (var i = 0; i < participants.length; i++) {
      var placement = i + 1;
      if (participants[i].status !== 'winner') {
        nk.sqlExec(
          `UPDATE tournament_participants SET final_placement = $1 WHERE id = $2`,
          [placement, participants[i].id]
        );
      }
    }

    logger.info('Assigned placements for ' + participants.length + ' participants');

  } catch (error) {
    logger.error('Error assigning final placements: ' + error);
  }
}

export function distributeTournamentRewards(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  rewards: any
): void {
  try {
    // Parse rewards if string
    if (typeof rewards === 'string') {
      try {
        rewards = JSON.parse(rewards);
      } catch (e) {
        rewards = {};
      }
    }
    if (!rewards) rewards = {};

    var botPolicy = getTournamentBotPolicy(nk, logger, tournamentId);

    // Get participants with placements
    var participantsResult = nk.sqlQuery(
      `SELECT id, user_id, final_placement, is_bot, bot_influenced
       FROM tournament_participants
       WHERE tournament_id = $1 AND final_placement IS NOT NULL
       ORDER BY final_placement`,
      [tournamentId]
    );
    var participants = Array.isArray(participantsResult) ? participantsResult : [];
    var humanPlacement = 0;

    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      var isBot = parsePgBoolean(p.is_bot);
      var botInfluenced = parsePgBoolean(p.bot_influenced);

      if (isBot || !p.user_id) {
        continue;
      }

      humanPlacement += 1;
      var rewardKey = '';

      if (humanPlacement === 1) rewardKey = '1st';
      else if (humanPlacement === 2) rewardKey = '2nd';
      else if (humanPlacement === 3) rewardKey = '3rd';
      else if (humanPlacement <= 8) rewardKey = 'top8';
      else rewardKey = 'participant';

      var reward = rewards[rewardKey];
      if (!reward) continue;

      // Award coin reward; bot-influenced placements can be scaled down by policy.
      var rewardCoins = Number(reward.coins);
      if (Number.isFinite(rewardCoins) && rewardCoins > 0) {
        var coinMultiplier = botInfluenced ? botPolicy.rewardCoinMultiplier : 1;
        var scaledCoins = Math.floor(rewardCoins * coinMultiplier);
        if (scaledCoins > 0 &&
            claimTournamentRewardGrant(nk, logger, tournamentId, p.user_id, rewardKey, 'coins')) {
          awardTournamentCoins(nk, logger, p.user_id, tournamentId, rewardKey, scaledCoins);
        }
      }

      // Award badge reward.
      var badgeKey = typeof reward.badge === 'string' ? reward.badge.trim() : '';
      if (badgeKey &&
          claimTournamentRewardGrant(nk, logger, tournamentId, p.user_id, rewardKey, 'badge')) {
        awardTournamentBadge(nk, logger, p.user_id, tournamentId, rewardKey, badgeKey);
      }

      // Award MMR bonus
      var rewardMmrBonus = Number(reward.mmr_bonus);
      var skipMmrBonus = botInfluenced && botPolicy.skipMmrBonusWhenBotInfluenced;
      if (!skipMmrBonus &&
          Number.isFinite(rewardMmrBonus) && rewardMmrBonus > 0 &&
          claimTournamentRewardGrant(nk, logger, tournamentId, p.user_id, rewardKey, 'mmr_bonus')) {
        awardMmrBonus(nk, logger, p.user_id, rewardMmrBonus);
      }

      logger.info(
        'Processed ' +
        rewardKey +
        ' tournament result for user ' +
        p.user_id +
        ' (humanPlacement=' +
        humanPlacement +
        ', botInfluenced=' +
        botInfluenced +
        ')'
      );
    }

  } catch (error) {
    logger.error('Error distributing tournament rewards: ' + error);
  }
}

export function awardMmrBonus(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  mmrBonus: number
): void {
  try {
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'global_mmr', userId: userId },
    ];
    var results = nk.storageRead(reads);

    if (results.length > 0 && results[0].value) {
      var mmrData = results[0].value;
      mmrData.mmr = clampMmr(nk, logger, (mmrData.mmr || 1000) + mmrBonus);
      mmrData.rankTier = getRankTierKeyForMmr(nk, logger, mmrData.mmr);
      if (mmrData.mmr > (mmrData.peakMmr || 0)) {
        mmrData.peakMmr = mmrData.mmr;
      }

      var writes: nkruntime.StorageWriteRequest[] = [{
        collection: 'player_data',
        key: 'global_mmr',
        userId: userId,
        value: mmrData,
        permissionRead: 2,
        permissionWrite: 0,
      }];
      nk.storageWrite(writes);
      var displayName = getLeaderboardDisplayName(nk, logger, userId, mmrData.displayName || '');
      nk.leaderboardRecordWrite('global_mmr', userId, displayName, Math.round(mmrData.mmr), undefined, undefined);
      updateTimeBasedLeaderboards(nk, logger, userId, displayName, mmrData.mmr);
    }
  } catch (e) {
    logger.error('Failed to award MMR bonus to ' + userId + ': ' + e);
  }
}

export function notifyPlayersOfNextMatch(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  participant1Id: string,
  participant2Id: string
): void {
  try {
    // Get match, users, and names for notification context
    var result = nk.sqlQuery(
      `SELECT tm.id as match_id, t.name as tournament_name,
              p1.id as player1_participant_id, p2.id as player2_participant_id,
              p1.user_id as player1_user_id, p2.user_id as player2_user_id,
              p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot,
              bp1.bot_key as player1_bot_key, bp2.bot_key as player2_bot_key,
              COALESCE(
                bp1.display_name,
                NULLIF(TRIM(CONCAT(s1.value->>'firstName', ' ', s1.value->>'lastName')), ''),
                s1.value->>'username',
                u1.display_name,
                u1.username,
                'Player'
              ) as player1_name,
              COALESCE(
                bp2.display_name,
                NULLIF(TRIM(CONCAT(s2.value->>'firstName', ' ', s2.value->>'lastName')), ''),
                s2.value->>'username',
                u2.display_name,
                u2.username,
                'Player'
              ) as player2_name
       FROM tournament_matches tm
       JOIN tournaments t ON t.id = tm.tournament_id
       LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       LEFT JOIN tournament_bot_profiles bp1 ON bp1.id = p1.bot_profile_id
       LEFT JOIN tournament_bot_profiles bp2 ON bp2.id = p2.bot_profile_id
       LEFT JOIN users u1 ON u1.id = p1.user_id
       LEFT JOIN users u2 ON u2.id = p2.user_id
       LEFT JOIN storage s1 ON s1.user_id = p1.user_id AND s1.collection = 'player_data' AND s1.key = 'telegram'
       LEFT JOIN storage s2 ON s2.user_id = p2.user_id AND s2.collection = 'player_data' AND s2.key = 'telegram'
       WHERE tm.tournament_id = $1
         AND (
           (tm.player1_participant_id = $2 AND tm.player2_participant_id = $3) OR
           (tm.player1_participant_id = $3 AND tm.player2_participant_id = $2)
         )
       ORDER BY tm.round_number DESC, tm.match_number DESC
       LIMIT 1`,
      [tournamentId, participant1Id, participant2Id]
    );

    if (!Array.isArray(result) || result.length === 0) return;

    var row = result[0];
    var tournamentName = row.tournament_name || 'Tournament';
    var matchId = row.match_id;
    var roundNumber = parseInt(row.round_number) || null;
    var matchNumber = parseInt(row.match_number) || null;
    var bracketType = row.bracket_type || null;
    var player1Id = row.player1_user_id;
    var player2Id = row.player2_user_id;
    var player1IsBot = parsePgBoolean(row.player1_is_bot);
    var player2IsBot = parsePgBoolean(row.player2_is_bot);
    var player1Name = player1IsBot
      ? getTournamentBotDisplayName(row.player1_bot_key, row.player1_participant_id, row.player1_name)
      : (row.player1_name || 'Player');
    var player2Name = player2IsBot
      ? getTournamentBotDisplayName(row.player2_bot_key, row.player2_participant_id, row.player2_name)
      : (row.player2_name || 'Player');

    var roundText = bracketType === 'grand_final'
      ? 'Grand Final'
      : (roundNumber
        ? ((bracketType === 'losers' ? 'Losers Round ' : 'Round ') + roundNumber)
        : 'Your next match');
    var title = roundText + ' is Ready!';
    var body = roundText + ' in ' + tournamentName + ' is ready to play!';

    if (player1Id && !player1IsBot) {
      tournamentExperienceHelpers.createTournamentNotification(
        nk,
        logger,
        player1Id,
        'tournament_match_ready',
        title,
        body,
	        {
	          tournamentId: tournamentId,
	          tournamentName: tournamentName,
	          matchId: matchId,
	          opponentName: player2Name,
	          roundNumber: roundNumber,
	          matchNumber: matchNumber,
	          bracketType: bracketType,
	        },
        '/tournament/' + tournamentId
      );
    }

    if (player2Id && !player2IsBot) {
      tournamentExperienceHelpers.createTournamentNotification(
        nk,
        logger,
        player2Id,
        'tournament_match_ready',
        title,
        body,
	        {
	          tournamentId: tournamentId,
	          tournamentName: tournamentName,
	          matchId: matchId,
	          opponentName: player1Name,
	          roundNumber: roundNumber,
	          matchNumber: matchNumber,
	          bracketType: bracketType,
	        },
        '/tournament/' + tournamentId
      );
    }
  } catch (e) {
    logger.error('Failed to notify players of next match: ' + e);
  }
}

/**
 * Broadcast a bracket-state-change notification to all active human
 * participants so clients can refresh their bracket view without polling.
 * Runs outside advisory locks — best-effort, non-blocking.
 */
export function broadcastTournamentBracketUpdate(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string
): void {
  try {
    var result = nk.sqlQuery(
      `SELECT tp.user_id, t.name as tournament_name
       FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       WHERE tp.tournament_id = $1
         AND tp.user_id IS NOT NULL
         AND COALESCE(tp.is_bot, false) = false
         AND tp.status NOT IN ('forfeited', 'disqualified')`,
      [tournamentId]
    );
    var rows = Array.isArray(result) ? result : [];
    var tournamentName = rows.length > 0 ? (rows[0].tournament_name || 'Tournament') : 'Tournament';

    // Include a timestamp-based matchId so each broadcast is a new
    // notification (the unique index key is user_id+type+tournamentId+matchId).
    var broadcastNonce = Date.now().toString(36);
    for (var i = 0; i < rows.length; i++) {
      var userId = rows[i].user_id;
      if (!userId) continue;
      try {
        tournamentExperienceHelpers.createTournamentNotification(
          nk,
          logger,
          userId,
          'tournament_bracket_update',
          tournamentName + ' — Bracket Updated',
          'The tournament bracket has advanced. Tap to see the latest matches.',
          {
            tournamentId: tournamentId,
            tournamentName: tournamentName,
            matchId: 'bracket_' + broadcastNonce,
          },
          '/tournament/' + tournamentId
        );
      } catch (notifyErr) {
        // Best-effort — skip users whose notifications fail.
      }
    }
    logger.debug(
      'Broadcast bracket update for tournament ' + tournamentId +
      ' to ' + rows.length + ' participants'
    );
  } catch (e) {
    logger.warn('Failed to broadcast bracket update for tournament ' + tournamentId + ': ' + e);
  }
}

export function notifyTournamentCompletion(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  winnerId: string | null
): void {
  try {
    // Get tournament name and all participants
    var result = nk.sqlQuery(
      `SELECT tp.user_id, tp.final_placement, tp.is_bot, t.name as tournament_name
       FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       WHERE tp.tournament_id = $1
         AND tp.user_id IS NOT NULL`,
      [tournamentId]
    );

    if (!Array.isArray(result) || result.length === 0) return;

    var tournamentName = result[0].tournament_name || 'Tournament';

    for (var i = 0; i < result.length; i++) {
      var userId = result[i].user_id;
      if (!userId || parsePgBoolean(result[i].is_bot)) {
        continue;
      }
      var placement = result[i].final_placement;
      var isWinner = userId === winnerId;
      tournamentExperienceHelpers.createTournamentNotification(
        nk,
        logger,
        userId,
        'tournament_complete',
        isWinner ? 'Congratulations Champion!' : tournamentName + ' Complete',
        isWinner
          ? 'You won ' + tournamentName + '!'
          : 'You finished #' + placement + ' in ' + tournamentName + '. Check final standings!',
        {
          tournamentId: tournamentId,
          placement: placement,
          tournamentName: tournamentName,
          winner: isWinner,
        },
        '/tournament/' + tournamentId
      );
    }
  } catch (e) {
    logger.error('Failed to notify tournament completion: ' + e);
  }
}

export function updateTimeBasedLeaderboards(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  displayName: string,
  targetMmr: number
): void {
  if (typeof targetMmr !== 'number') {
    return;
  }

  var targetMmrInt = Math.round(targetMmr);
  var leaderboards = ['daily_mmr', 'weekly_mmr', 'monthly_mmr'];
  for (var i = 0; i < leaderboards.length; i++) {
    try {
      nk.leaderboardRecordWrite(leaderboards[i], userId, displayName, targetMmrInt, undefined, undefined);
    } catch (e) {
      logger.warn('Error updating leaderboard ' + leaderboards[i] + ': ' + e);
    }
  }
}

export function updateCategoryTimeLeaderboards(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  displayName: string,
  category: string,
  targetMmr: number
): void {
  if (typeof targetMmr !== 'number') {
    return;
  }

  var targetMmrInt = Math.round(targetMmr);
  var leaderboards = [
    'category_' + category,
    'category_' + category + '_daily',
    'category_' + category + '_weekly',
    'category_' + category + '_monthly',
  ];
  for (var i = 0; i < leaderboards.length; i++) {
    try {
      nk.leaderboardRecordWrite(leaderboards[i], userId, displayName, targetMmrInt, undefined, undefined);
    } catch (e) {
      logger.warn('Error updating leaderboard ' + leaderboards[i] + ': ' + e);
    }
  }
}
