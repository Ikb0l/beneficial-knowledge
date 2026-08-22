import { autoReportTournamentResult, runTournamentMaintenanceCycle } from '../main/tournament-advance';
import { replaceParticipantInPendingOrReadyMatchWithBot } from '../main/tournament-bots';
import { startTournamentRuntimeMatch, MATCH_START_INITIALIZATION_GRACE_MS } from '../main/tournament-match-start';
import { shouldSendRealtimeNotification, shouldStoreNotification } from './notifications';
import { sendTournamentEventNotification } from '../telegram-bot';

// TOURNAMENT EXPERIENCE RPCs
// ============================================================================

// Ready check timeout in milliseconds (60 seconds).
export var READY_CHECK_TIMEOUT_MS = 60000;
// Match no-show timeout mirrors the client ready-check window.
export var MATCH_NOSHOW_TIMEOUT_MS = READY_CHECK_TIMEOUT_MS;
// Human-vs-human no-show mirrors the client ready-check window too; local
// timeout only closes UI, while this server-side timer advances the bracket.
export var MATCH_NOSHOW_HVH_TIMEOUT_MS = READY_CHECK_TIMEOUT_MS;
// Disconnect grace for stalled in-progress matches (60 seconds)
export var DISCONNECT_GRACE_MS = 60000;
// Both-ready rows should have a runtime match almost immediately.
export var READY_MATCH_START_REPAIR_GRACE_MS = 5000;

function parsePgBoolean(value: any): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

function getTournamentMatchContextLabel(row: any): string {
  var bracketType = String(row.bracket_type || 'winners');
  var roundNumber = parseInt(row.round_number) || 0;
  if (bracketType === 'grand_final') return 'Grand Final';
  if (!roundNumber) return 'Match';
  if (bracketType === 'losers') return 'Losers Round ' + roundNumber;
  return 'Round ' + roundNumber;
}

function buildTournamentActionLabel(action: string, row: any, opponentName: string): string {
  var context = getTournamentMatchContextLabel(row);
  var opponent = opponentName || 'Opponent';
  if (action === 'rejoin_match') return context + ' - Rejoin vs ' + opponent;
  if (action === 'play_match') return context + ' - Play vs ' + opponent;
  if (action === 'ready_up') return context + ' - Ready vs ' + opponent;
  if (action === 'waiting_for_opponent') return context + ' - Waiting for ' + opponent;
  return context;
}

export function rpcTournamentReadyCheck(
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
    var tournamentId = request.tournamentId;
    var matchId = request.matchId;
    var ready = request.ready === true;

    if (!tournamentId || !matchId) {
      throw new Error('tournamentId and matchId are required');
    }

    // Get the match details to verify user is a participant
    var matchResult = nk.sqlQuery(
      `SELECT tm.id, tm.status, tm.ready_player1, tm.ready_player2,
              tm.nakama_match_id, tm.started_at,
              p1.user_id as player1_id, p2.user_id as player2_id,
              p1.is_bot as p1_is_bot, p2.is_bot as p2_is_bot,
              p1.status as p1_status, p2.status as p2_status,
              COALESCE(
                NULLIF(TRIM(CONCAT(s1.value->>'firstName', ' ', s1.value->>'lastName')), ''),
                s1.value->>'username',
                u1.display_name,
                u1.username,
                'Player'
              ) as p1_name,
              COALESCE(
                NULLIF(TRIM(CONCAT(s2.value->>'firstName', ' ', s2.value->>'lastName')), ''),
                s2.value->>'username',
                u2.display_name,
                u2.username,
                'Player'
              ) as p2_name,
              t.status as tournament_status
       FROM tournament_matches tm
       JOIN tournaments t ON t.id = tm.tournament_id
       LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       LEFT JOIN users u1 ON u1.id = p1.user_id
       LEFT JOIN users u2 ON u2.id = p2.user_id
       LEFT JOIN storage s1 ON s1.user_id = p1.user_id AND s1.collection = 'player_data' AND s1.key = 'telegram'
       LEFT JOIN storage s2 ON s2.user_id = p2.user_id AND s2.collection = 'player_data' AND s2.key = 'telegram'
       WHERE tm.id = $1 AND tm.tournament_id = $2`,
      [matchId, tournamentId]
    );

    var matchRows = Array.isArray(matchResult) ? matchResult : [];
    if (matchRows.length === 0) {
      throw new Error('Match not found');
    }

    var match = matchRows[0];
    var isPlayer1 = match.player1_id === ctx.userId;
    var isPlayer2 = match.player2_id === ctx.userId;

    if (!isPlayer1 && !isPlayer2) {
      throw new Error('User is not a participant in this match');
    }

    var opponentIsBot = isPlayer1
      ? (match.p2_is_bot === true || match.p2_is_bot === 't')
      : (match.p1_is_bot === true || match.p1_is_bot === 't');
    var userIsBot = isPlayer1
      ? (match.p1_is_bot === true || match.p1_is_bot === 't')
      : (match.p2_is_bot === true || match.p2_is_bot === 't');

    if (userIsBot) {
      throw new Error('Bots cannot perform ready checks');
    }

    if (match.tournament_status === 'completed' || match.tournament_status === 'paused' || match.tournament_status === 'cancelled') {
      throw new Error('Tournament is ' + match.tournament_status);
    }

    // Check participant status before the bot-opponent shortcut. Otherwise a
    // stale ready row can let an already forfeited/eliminated player start a
    // new human-vs-bot runtime match.
    var invalidStatuses = ['disqualified', 'forfeited', 'eliminated'];
    var userParticipantStatus = isPlayer1 ? match.p1_status : match.p2_status;
    if (userParticipantStatus && invalidStatuses.indexOf(userParticipantStatus) !== -1) {
      throw new Error('You cannot mark ready - your status is: ' + userParticipantStatus);
    }
    var opponentParticipantStatus = isPlayer1 ? match.p2_status : match.p1_status;
    if (opponentParticipantStatus && invalidStatuses.indexOf(opponentParticipantStatus) !== -1) {
      throw new Error('Opponent is no longer active in this tournament');
    }

    if (opponentIsBot) {
      // Bot opponent — auto-accept: the human pressing ready immediately starts the match.
      if (!ready) {
        // Cancel: clear human ready flag as normal.
        if (isPlayer1) {
          nk.sqlExec(
            `UPDATE tournament_matches
             SET ready_player1 = false,
                 ready_at = CASE WHEN ready_player2 = true THEN COALESCE(ready_at, NOW()) ELSE NULL END
             WHERE id = $1 AND status = 'ready'`,
            [matchId]
          );
        } else {
          nk.sqlExec(
            `UPDATE tournament_matches
             SET ready_player2 = false,
                 ready_at = CASE WHEN ready_player1 = true THEN COALESCE(ready_at, NOW()) ELSE NULL END
             WHERE id = $1 AND status = 'ready'`,
            [matchId]
          );
        }
        return JSON.stringify({ success: true, ready: false, cancelled: true });
      }

      // Mark both ready (bot is always ready) and start the runtime match.
      nk.sqlExec(
        `UPDATE tournament_matches
         SET ready_player1 = true,
             ready_player2 = true,
             ready_at = COALESCE(ready_at, NOW())
         WHERE id = $1`,
        [matchId]
      );
      var botStartResult = startTournamentRuntimeMatch(
        nk, logger, matchId,
        { actorUserId: ctx.userId, requireParticipantUser: true }
      );
      return JSON.stringify({
        success: true,
        ready: true,
        bothReady: true,
        nakamaMatchId: botStartResult ? botStartResult.matchId : null,
        matchId: matchId,
        tournamentMatchId: matchId,
        startedAt: botStartResult ? botStartResult.startedAt : null,
        alreadyInProgress: botStartResult ? botStartResult.alreadyInProgress : false,
      });
    }

    if (match.status === 'in_progress' && match.nakama_match_id && String(match.nakama_match_id).indexOf('__starting__:') !== 0) {
      return JSON.stringify({
        success: true,
        ready: true,
        bothReady: true,
        nakamaMatchId: match.nakama_match_id,
        matchId: matchId,
        tournamentMatchId: matchId,
        startedAt: match.started_at || null,
        alreadyInProgress: true,
      });
    }

    if (match.status !== 'ready') {
      throw new Error('Match is not in ready state');
    }

    // Update ready status for this player - use explicit queries for clarity and safety
    if (ready) {
      if (isPlayer1) {
        nk.sqlExec(
          `UPDATE tournament_matches SET ready_player1 = true, ready_at = COALESCE(ready_at, NOW()) WHERE id = $1`,
          [matchId]
        );
      } else {
        nk.sqlExec(
          `UPDATE tournament_matches SET ready_player2 = true, ready_at = COALESCE(ready_at, NOW()) WHERE id = $1`,
          [matchId]
        );
      }

      // Check if both players are now ready
      var checkResult = nk.sqlQuery(
        `SELECT ready_player1, ready_player2 FROM tournament_matches WHERE id = $1`,
        [matchId]
      );
      var checkRows = Array.isArray(checkResult) ? checkResult : [];
      var bothReady = checkRows.length > 0
        && parsePgBoolean(checkRows[0].ready_player1)
        && parsePgBoolean(checkRows[0].ready_player2);
      var startResult: any = null;
      if (bothReady) {
        startResult = startTournamentRuntimeMatch(
          nk,
          logger,
          matchId,
          {
            actorUserId: ctx.userId,
            requireParticipantUser: true,
          }
        );
      } else {
        // Race window: the opponent may have started the match between
        // our ready-set and both-check above. Re-query for the nakama_match_id.
        var raceCheckResult = nk.sqlQuery(
          `SELECT nakama_match_id, started_at FROM tournament_matches WHERE id = $1`,
          [matchId]
        );
        var raceCheckRows = Array.isArray(raceCheckResult) ? raceCheckResult : [];
        var raceNakamaId = raceCheckRows.length > 0 ? raceCheckRows[0].nakama_match_id : null;
        if (raceNakamaId && String(raceNakamaId).indexOf('__starting__:') !== 0) {
          bothReady = true;
          startResult = {
            matchId: String(raceNakamaId),
            tournamentMatchId: matchId,
            startedAt: raceCheckRows[0].started_at || null,
            alreadyInProgress: true,
          };
        }
      }

      // Notify opponent that we're ready
      var opponentId = isPlayer1 ? match.player2_id : match.player1_id;
      if (opponentId) {
        var senderName = isPlayer1 ? match.p1_name : match.p2_name;
        var readyTitle = 'Opponent is ready!';
        var readyBody = (senderName ? senderName : 'Your opponent') + ' is ready to play.';
        try {
          createTournamentNotification(
            nk,
            logger,
            opponentId,
            'tournament_ready_check',
            readyTitle,
            readyBody,
            {
              matchId: matchId,
              tournamentId: tournamentId,
              opponentName: senderName || 'Opponent',
              opponentReady: true,
              bothReady: bothReady,
              nakamaMatchId: startResult ? startResult.matchId : null,
              tournamentMatchId: matchId,
              startedAt: startResult ? startResult.startedAt : null,
            },
            '/tournament/' + tournamentId
          );
        } catch (notifyError) {
          logger.warn('Failed to send ready notification: ' + notifyError);
        }
      }

      return JSON.stringify({
        success: true,
        ready: true,
        bothReady: bothReady,
        nakamaMatchId: startResult ? startResult.matchId : null,
        matchId: matchId,
        tournamentMatchId: matchId,
        startedAt: startResult ? startResult.startedAt : null,
        alreadyInProgress: startResult ? startResult.alreadyInProgress : false,
      });
    } else {
      // User cancelled ready check - clear only this user's ready flag.
      if (isPlayer1) {
        nk.sqlExec(
          `UPDATE tournament_matches
           SET ready_player1 = false,
               ready_at = CASE WHEN ready_player2 = true THEN COALESCE(ready_at, NOW()) ELSE NULL END
           WHERE id = $1 AND status = 'ready'`,
          [matchId]
        );
      } else {
        nk.sqlExec(
          `UPDATE tournament_matches
           SET ready_player2 = false,
               ready_at = CASE WHEN ready_player1 = true THEN COALESCE(ready_at, NOW()) ELSE NULL END
           WHERE id = $1 AND status = 'ready'`,
          [matchId]
        );
      }

      // Notify opponent that ready check was cancelled
      var opponentId = isPlayer1 ? match.player2_id : match.player1_id;
      if (opponentId) {
        var cancelSenderName = isPlayer1 ? match.p1_name : match.p2_name;
        var cancelTitle = 'Ready check cancelled';
        var cancelBody = (cancelSenderName ? cancelSenderName : 'Your opponent') + ' cancelled the ready check.';
        try {
          createTournamentNotification(
            nk,
            logger,
            opponentId,
            'tournament_ready_check',
            cancelTitle,
            cancelBody,
            {
              matchId: matchId,
              tournamentId: tournamentId,
              opponentName: cancelSenderName || 'Opponent',
              opponentReady: false,
              cancelled: true,
            },
            '/tournament/' + tournamentId
          );
        } catch (notifyError) {
          logger.warn('Failed to send ready cancel notification: ' + notifyError);
        }
      }

      return JSON.stringify({
        success: true,
        ready: false,
        cancelled: true,
      });
    }
  } catch (error) {
    logger.error('Error in tournament ready check: ' + error);
    throw error;
  }
}

export function rpcCheckActiveTournamentMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    repairStuckTournamentMatchStarts(nk, logger);

    // Check if user has an active tournament match (in_progress status)
    var result = nk.sqlQuery(
      `SELECT tm.id as match_id, tm.tournament_id, tm.nakama_match_id,
              tm.last_activity_at,
              EXTRACT(EPOCH FROM (NOW() - tm.last_activity_at))::int as idle_seconds,
              t.name as tournament_name
       FROM tournament_matches tm
       JOIN tournament_participants p ON p.tournament_id = tm.tournament_id AND p.user_id = $1
       JOIN tournaments t ON t.id = tm.tournament_id
       WHERE tm.status = 'in_progress'
         AND tm.nakama_match_id IS NOT NULL
         AND tm.nakama_match_id NOT LIKE '__starting__:%'
         AND (
           tm.player1_participant_id = p.id
           OR tm.player2_participant_id = p.id
         )
         AND t.status IN ('in_progress', 'paused') AND p.status NOT IN ('forfeited', 'eliminated', 'disqualified')
       LIMIT 1`,
      [ctx.userId]
    );

    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      var initializingResult = nk.sqlQuery(
        `SELECT tm.id as match_id, tm.tournament_id, t.name as tournament_name
         FROM tournament_matches tm
         JOIN tournament_participants p ON p.tournament_id = tm.tournament_id AND p.user_id = $1
         JOIN tournaments t ON t.id = tm.tournament_id
         WHERE tm.status = 'in_progress'
           AND tm.nakama_match_id LIKE '__starting__:%'
           AND (
             tm.player1_participant_id = p.id
             OR tm.player2_participant_id = p.id
           )
           AND t.status IN ('in_progress', 'paused') AND p.status NOT IN ('forfeited', 'eliminated', 'disqualified')
         LIMIT 1`,
        [ctx.userId]
      );
      var initializingRows = Array.isArray(initializingResult) ? initializingResult : [];
      if (initializingRows.length > 0) {
        var initMatch = initializingRows[0];
        return JSON.stringify({
          hasActiveMatch: false,
          initializing: true,
          tournamentId: initMatch.tournament_id,
          tournamentName: initMatch.tournament_name,
          matchId: initMatch.match_id,
        });
      }
      return JSON.stringify({
        hasActiveMatch: false,
        initializing: false,
      });
    }

    var match = rows[0];

    // Only return hasActiveMatch when the Nakama runtime match is likely
    // still alive. A stale/invalid last_activity_at means the match is
    // probably dead, so showing a rejoin popup for it would fail.
    var idleSeconds = Number(match.idle_seconds);
    if (!Number.isFinite(idleSeconds) || idleSeconds >= 60) {
      return JSON.stringify({
        hasActiveMatch: false,
        initializing: false,
      });
    }

    return JSON.stringify({
      hasActiveMatch: true,
      initializing: false,
      tournamentId: match.tournament_id,
      tournamentName: match.tournament_name,
      matchId: match.match_id,
      nakamaMatchId: match.nakama_match_id,
    });
  } catch (error) {
    logger.error('Error checking active tournament match: ' + error);
    throw error;
  }
}

function isInactiveTournamentParticipantStatus(status: any): boolean {
  var normalized = String(status || '').trim().toLowerCase();
  return normalized === 'forfeited' || normalized === 'eliminated' || normalized === 'disqualified';
}

export function resolvePlayableTournamentMatchesWithInactiveParticipants(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId?: string | null,
  maxRows?: number
): number {
  var limit = Number(maxRows) || 50;
  if (limit < 1) limit = 1;
  if (limit > 200) limit = 200;

  var params: any[] = [];
  var tournamentFilter = '';
  if (tournamentId) {
    params.push(tournamentId);
    tournamentFilter = ' AND tm.tournament_id = $1';
  }

  var result = nk.sqlQuery(
    `SELECT tm.id as match_id, tm.tournament_id, tm.status as match_status,
            tm.round_number, tm.match_number, tm.bracket_type,
            tm.player1_participant_id, tm.player2_participant_id,
            p1.user_id as p1_user_id, p2.user_id as p2_user_id,
            p1.status as p1_status, p2.status as p2_status,
            p1.seed_number as p1_seed, p2.seed_number as p2_seed
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
     LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
     WHERE t.status = 'in_progress'
       AND tm.status IN ('ready', 'in_progress')
       AND tm.player1_participant_id IS NOT NULL
       AND tm.player2_participant_id IS NOT NULL
       AND (
         p1.status IN ('forfeited', 'eliminated', 'disqualified')
         OR p2.status IN ('forfeited', 'eliminated', 'disqualified')
       )` +
      tournamentFilter +
    ` ORDER BY tm.round_number ASC, tm.match_number ASC
      LIMIT ` + limit,
    params
  );

  var rows = Array.isArray(result) ? result : [];
  var resolvedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var p1Inactive = isInactiveTournamentParticipantStatus(row.p1_status);
    var p2Inactive = isInactiveTournamentParticipantStatus(row.p2_status);
    if (!p1Inactive && !p2Inactive) {
      continue;
    }

    var winnerIsP1 = true;
    var reason = 'inactive_participant';
    if (p1Inactive && !p2Inactive) {
      winnerIsP1 = false;
    } else if (!p1Inactive && p2Inactive) {
      winnerIsP1 = true;
    } else {
      reason = 'inactive_participants';
      var p1Seed = Number(row.p1_seed);
      var p2Seed = Number(row.p2_seed);
      if (!Number.isFinite(p1Seed)) p1Seed = Number.MAX_SAFE_INTEGER;
      if (!Number.isFinite(p2Seed)) p2Seed = Number.MAX_SAFE_INTEGER;
      winnerIsP1 = p1Seed <= p2Seed;
    }

    var winnerUserId = winnerIsP1 ? row.p1_user_id : row.p2_user_id;
    var player1Score = winnerIsP1 ? 1 : 0;
    var player2Score = winnerIsP1 ? 0 : 1;

    try {
      autoReportTournamentResult(
        nk,
        logger,
        row.match_id,
        winnerUserId || null,
        player1Score,
        player2Score,
        false,
        true
      );
      nk.sqlExec(
        `UPDATE tournament_matches
         SET forfeit_reason = $1,
             nakama_match_id = NULL,
             spectator_count = 0,
             last_activity_at = NOW()
         WHERE id = $2
           AND status IN ('completed', 'ready', 'in_progress')`,
        [reason, row.match_id]
      );
      resolvedCount++;
      logger.warn(
        'Resolved tournament match with inactive participant(s): ' +
        row.match_id +
        ' tournament=' + row.tournament_id +
        ' p1_status=' + row.p1_status +
        ' p2_status=' + row.p2_status +
        ' winner_slot=' + (winnerIsP1 ? 'player1' : 'player2')
      );
    } catch (resolveError) {
      logger.error('Failed to resolve inactive-participant tournament match ' + row.match_id + ': ' + resolveError);
    }
  }

  return resolvedCount;
}

export function repairStuckTournamentMatchStarts(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  try {
    resolvePlayableTournamentMatchesWithInactiveParticipants(nk, logger);

    // Repair dead Nakama matches: if a tournament match is in_progress
    // with a real Nakama match ID but has had no activity for > 45 seconds,
    // the Nakama match was likely killed by idle timeout without triggering
    // matchTerminate (Nakama's idle-empty-match killer stops the Go handler
    // but may not call the JS matchTerminate callback).
    //
    // Strategy depends on player types:
    // - Human-vs-Bot: check activity window first; only forfeit if the human
    //   truly never played (match had < 30 s of activity).  Otherwise reset
    //   to 'ready' so an active player isn't punished for a Nakama engine
    //   glitch.
    // - Human-vs-Human: reset to 'ready' so both get another chance to reconnect
    // - Bot-vs-Bot: reset to 'ready' (shouldn't happen, but safe fallback)
    var deadResult = nk.sqlQuery(
      `SELECT tm.id, tm.tournament_id, tm.player1_participant_id, tm.player2_participant_id,
              p1.is_bot as p1_bot, p2.is_bot as p2_bot,
              p1.user_id as p1_uid, p2.user_id as p2_uid,
              p1.status as p1_status, p2.status as p2_status,
              tm.started_at, tm.last_activity_at,
              EXTRACT(EPOCH FROM (NOW() - tm.last_activity_at))::int as stale_seconds
       FROM tournament_matches tm
       JOIN tournaments t ON t.id = tm.tournament_id
       LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       WHERE t.status = 'in_progress'
         AND tm.status = 'in_progress'
         AND tm.nakama_match_id IS NOT NULL
         AND tm.nakama_match_id NOT LIKE '__starting__:%'
         AND tm.last_activity_at IS NOT NULL
         AND tm.last_activity_at < NOW() - INTERVAL '45 seconds'
       LIMIT 25`,
      []
    );
    var deadRows = Array.isArray(deadResult) ? deadResult : [];
    for (var di = 0; di < deadRows.length; di++) {
      var deadMatch = deadRows[di];
      if (
        isInactiveTournamentParticipantStatus(deadMatch.p1_status) ||
        isInactiveTournamentParticipantStatus(deadMatch.p2_status)
      ) {
        logger.warn(
          'Skipping dead-match reset because participant is inactive: ' +
          deadMatch.id +
          ' p1_status=' + deadMatch.p1_status +
          ' p2_status=' + deadMatch.p2_status
        );
        continue;
      }
      var p1IsBot = deadMatch.p1_bot === true || deadMatch.p1_bot === 't' || deadMatch.p1_bot === 'true';
      var p2IsBot = deadMatch.p2_bot === true || deadMatch.p2_bot === 't' || deadMatch.p2_bot === 'true';
      // If participant row is missing (LEFT JOIN returned NULL), treat the slot as "bot-like"
      // so the match gets reset to 'ready' rather than force-forfeiting a potentially
      // valid player whose participant row was transiently unavailable.
      var p1Missing = deadMatch.p1_bot === null || deadMatch.p1_bot === undefined;
      var p2Missing = deadMatch.p2_bot === null || deadMatch.p2_bot === undefined;
      if (p1Missing && p2Missing) {
        // Both participant rows gone — reset to ready so the dead-man's switch or
        // progression pass can clean it up. Force-forfeiting with no participants
        // would leave a bracket slot orphaned.
        nk.sqlExec(
          `UPDATE tournament_matches SET status = 'ready', nakama_match_id = NULL, started_at = NULL, ready_at = NOW(), ready_player1 = false, ready_player2 = false, spectator_count = 0, last_activity_at = NOW() WHERE id = $1`,
          [deadMatch.id]
        );
        logger.warn('Reset dead match with missing participants to ready: ' + deadMatch.id);
        continue;
      }
      var humanIsP1 = !p1IsBot && p2IsBot;
      var humanIsP2 = p1IsBot && !p2IsBot;
      var bothBots = p1IsBot && p2IsBot;
      var bothHuman = !p1IsBot && !p2IsBot;

      if (humanIsP1 || humanIsP2) {
        // Human-vs-Bot: two-tier timeout (Dota 2 / FACEIT pattern).
        //
        // Tier 1 — stale 45-300s: reset to 'ready'.  Could be a transient
        // Nakama engine glitch (idle-empty-match killer), not the human's
        // fault.  Give them another chance to rejoin.
        //
        // Tier 2 — stale >300s (5 min): the human genuinely abandoned the
        // match.  Force-forfeit to prevent the infinite ready→in_progress
        // →ready cycle that would otherwise freeze the bracket forever.
        var staleSeconds = Number(deadMatch.stale_seconds);
        if (!Number.isFinite(staleSeconds)) staleSeconds = 999;
        var humanUid = humanIsP1 ? deadMatch.p1_uid : deadMatch.p2_uid;
        var humanParticipantId = humanIsP1 ? deadMatch.player1_participant_id : deadMatch.player2_participant_id;
        var botParticipantId = humanIsP1 ? deadMatch.player2_participant_id : deadMatch.player1_participant_id;

        if (staleSeconds > 300) {
          // Tier 2: force-forfeit.  The bot advances.  This matches how
          // Dota 2 / FACEIT handle abandoned matches — after a grace
          // period the absent player loses.
          try {
            nk.sqlExec(
              `UPDATE tournament_matches
               SET status = 'completed',
                   winner_participant_id = $1,
                   nakama_match_id = NULL,
                   started_at = COALESCE(started_at, NOW()),
                   completed_at = NOW(),
                   forfeit_reason = 'abandoned',
                   last_activity_at = NOW()
               WHERE id = $2`,
              [botParticipantId, deadMatch.id]
            );
            // Mark human as forfeited in tournament
            nk.sqlExec(
              `UPDATE tournament_participants
               SET status = 'forfeited',
                   eliminated_at = COALESCE(eliminated_at, NOW())
               WHERE id = $1
                 AND status NOT IN ('forfeited', 'disqualified', 'eliminated')`,
              [humanParticipantId]
            );
            logger.warn(
              'Force-forfeited abandoned human-vs-bot match ' + deadMatch.id +
              ' human=' + humanUid + ' stale=' + staleSeconds + 's (Tier 2)'
            );
            // Notify the human
            try {
              tournamentExperienceHelpers.createTournamentNotification(
                nk, logger, humanUid,
                'tournament_match_forfeit_loss',
                'Match Forfeited — Abandoned',
                'You were inactive for over 5 minutes and your match was forfeited.',
                { matchId: deadMatch.id, reason: 'abandoned' },
                '/tournament/' + String(deadMatch.tournament_id || '')
              );
            } catch (_notifyErr) { /* best-effort */ }
          } catch (forceResolveErr) {
            logger.error('Failed to force-forfeit abandoned match ' + deadMatch.id + ': ' + forceResolveErr);
            // Fallback: reset to ready so the cron can retry
            nk.sqlExec(
              `UPDATE tournament_matches SET status = 'ready', nakama_match_id = NULL, started_at = NULL, ready_at = NOW(), ready_player1 = false, ready_player2 = false, spectator_count = 0, last_activity_at = NOW() WHERE id = $1`,
              [deadMatch.id]
            );
          }
        } else {
          // Tier 1: reset to 'ready' so the human can rejoin.
          nk.sqlExec(
            `UPDATE tournament_matches SET status = 'ready', nakama_match_id = NULL, started_at = NULL, ready_at = NOW(), ready_player1 = false, ready_player2 = false, spectator_count = 0, last_activity_at = NOW() WHERE id = $1`,
            [deadMatch.id]
          );
          logger.info(
            'Reset dead human-vs-bot tournament match to ready: ' +
            deadMatch.id + ' human=' + humanUid + ' stale=' + staleSeconds + 's (Tier 1)'
          );
        }
      } else if (bothHuman) {
        // Human-vs-Human: two-tier timeout.
        // Tier 1 (45-600s): reset to ready — could be a Nakama glitch.
        // Tier 2 (>600s / 10 min): both players abandoned.  Force-forfeit
        // both to unblock the bracket (match becomes a double-forfeit,
        // next round gets a bye from this slot).
        var hvhStaleSeconds = Number(deadMatch.stale_seconds);
        if (!Number.isFinite(hvhStaleSeconds)) hvhStaleSeconds = 999;
        if (hvhStaleSeconds > 600) {
          try {
            nk.sqlExec(
              `UPDATE tournament_matches
               SET status = 'forfeit',
                   nakama_match_id = NULL,
                   started_at = COALESCE(started_at, NOW()),
                   completed_at = NOW(),
                   forfeit_reason = 'double_abandoned',
                   last_activity_at = NOW()
               WHERE id = $1`,
              [deadMatch.id]
            );
            // Eliminate both participants
            nk.sqlExec(
              `UPDATE tournament_participants
               SET status = 'forfeited',
                   eliminated_at = COALESCE(eliminated_at, NOW())
               WHERE id IN ($1, $2)
                 AND status NOT IN ('forfeited', 'disqualified', 'eliminated')`,
              [deadMatch.player1_participant_id, deadMatch.player2_participant_id]
            );
            logger.warn(
              'Force-forfeited abandoned HvH match ' + deadMatch.id +
              ' stale=' + hvhStaleSeconds + 's — both players eliminated (Tier 2)'
            );
          } catch (forceResolveErr) {
            logger.error('Failed to force-forfeit abandoned HvH match ' + deadMatch.id + ': ' + forceResolveErr);
            nk.sqlExec(
              `UPDATE tournament_matches SET status = 'ready', nakama_match_id = NULL, started_at = NULL, ready_at = NOW(), ready_player1 = false, ready_player2 = false, spectator_count = 0, last_activity_at = NOW() WHERE id = $1`,
              [deadMatch.id]
            );
          }
        } else {
          // Tier 1: reset to ready, give them another chance.
          nk.sqlExec(
            `UPDATE tournament_matches SET status = 'ready', nakama_match_id = NULL, started_at = NULL, ready_at = NOW(), ready_player1 = false, ready_player2 = false, spectator_count = 0, last_activity_at = NOW() WHERE id = $1`,
            [deadMatch.id]
          );
          logger.info(
            'Reset dead HvH tournament match to ready: ' +
            deadMatch.id + ' stale=' + hvhStaleSeconds + 's (Tier 1)'
          );
        }
      } else {
        // Bot-vs-Bot (shouldn't happen): reset to ready for auto-resolve.
        nk.sqlExec(
          `UPDATE tournament_matches SET status = 'ready', nakama_match_id = NULL, started_at = NULL, ready_at = NOW(), ready_player1 = false, ready_player2 = false, spectator_count = 0, last_activity_at = NOW() WHERE id = $1`,
          [deadMatch.id]
        );
        logger.info('Reset dead bot-vs-bot tournament match to ready: ' + deadMatch.id);
      }
    }

    var placeholderCutoffIso = new Date(Date.now() - MATCH_START_INITIALIZATION_GRACE_MS).toISOString();
    nk.sqlExec(
      `UPDATE tournament_matches tm
       SET status = 'ready',
           nakama_match_id = NULL,
           started_at = NULL,
           ready_at = COALESCE(tm.ready_at, NOW()),
           spectator_count = 0,
           last_activity_at = NOW()
       FROM tournaments t
       WHERE tm.tournament_id = t.id
         AND t.status = 'in_progress'
         AND tm.status = 'in_progress'
         AND (
           tm.nakama_match_id LIKE '__starting__:%'
           OR tm.nakama_match_id IS NULL
         )
         AND (tm.started_at IS NULL OR tm.started_at < $1)`,
      [placeholderCutoffIso]
    );

    var readyCutoffIso = new Date(Date.now() - READY_MATCH_START_REPAIR_GRACE_MS).toISOString();
    var readyResult = nk.sqlQuery(
      `SELECT tm.id as match_id
       FROM tournament_matches tm
       JOIN tournaments t ON t.id = tm.tournament_id
       JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       WHERE t.status = 'in_progress'
         AND tm.status = 'ready'
         AND tm.ready_player1 = true
         AND tm.ready_player2 = true
         AND tm.ready_at IS NOT NULL
         AND tm.ready_at < $1
         AND tm.player1_participant_id IS NOT NULL
         AND tm.player2_participant_id IS NOT NULL
         AND tm.nakama_match_id IS NULL
         AND p1.status NOT IN ('forfeited', 'eliminated', 'disqualified')
         AND p2.status NOT IN ('forfeited', 'eliminated', 'disqualified')
       ORDER BY tm.ready_at ASC
       LIMIT 25`,
      [readyCutoffIso]
    );
    var readyRows = Array.isArray(readyResult) ? readyResult : [];
    for (var i = 0; i < readyRows.length; i++) {
      try {
        var startResult = startTournamentRuntimeMatch(nk, logger, readyRows[i].match_id, {});
        logger.info('Repaired both-ready tournament match start: ' + readyRows[i].match_id + ' -> ' + startResult.matchId);
      } catch (startError) {
        logger.warn('Failed to repair both-ready tournament match start ' + readyRows[i].match_id + ': ' + startError);
      }
    }
  } catch (error) {
    logger.error('Error repairing stuck tournament match starts: ' + error);
  }
}

export function rpcGetCurrentTournamentAction(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    repairStuckTournamentMatchStarts(nk, logger);

    var result = nk.sqlQuery(
      `SELECT t.id as tournament_id, t.name as tournament_name, t.status as tournament_status,
              t.tournament_start, t.total_rounds,
              tp.id as participant_id, tp.status as participant_status, tp.final_placement,
              tm.id as match_id, tm.status as match_status, tm.nakama_match_id, tm.last_activity_at,
              CASE
                WHEN tm.last_activity_at IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - tm.last_activity_at))::int
                ELSE NULL
              END as match_idle_seconds,
              tm.ready_player1, tm.ready_player2, tm.round_number, tm.match_number, tm.bracket_type,
              tm.player1_participant_id, tm.player2_participant_id,
              p1.user_id as player1_user_id, p2.user_id as player2_user_id,
              p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot,
              COALESCE(
                NULLIF(TRIM(CONCAT(s1.value->>'firstName', ' ', s1.value->>'lastName')), ''),
                s1.value->>'username',
                u1.display_name,
                u1.username,
                'Player'
              ) as p1_name,
              COALESCE(
                NULLIF(TRIM(CONCAT(s2.value->>'firstName', ' ', s2.value->>'lastName')), ''),
                s2.value->>'username',
                u2.display_name,
                u2.username,
                'Player'
              ) as p2_name
       FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       LEFT JOIN tournament_matches tm ON tm.tournament_id = t.id
        AND (tm.player1_participant_id = tp.id OR tm.player2_participant_id = tp.id)
        AND tm.status IN ('ready', 'in_progress')
       LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       LEFT JOIN users u1 ON u1.id = p1.user_id
       LEFT JOIN users u2 ON u2.id = p2.user_id
       LEFT JOIN storage s1 ON s1.user_id = p1.user_id AND s1.collection = 'player_data' AND s1.key = 'telegram'
       LEFT JOIN storage s2 ON s2.user_id = p2.user_id AND s2.collection = 'player_data' AND s2.key = 'telegram'
       WHERE tp.user_id = $1
         AND t.status IN ('registration', 'upcoming', 'in_progress', 'paused', 'completed')
       ORDER BY
         CASE
           WHEN t.status IN ('completed', 'cancelled') THEN 99
           WHEN tm.status = 'in_progress'
             AND tm.nakama_match_id IS NOT NULL
             AND tm.nakama_match_id NOT LIKE '__starting__:%'
             AND tm.last_activity_at IS NOT NULL
             AND tm.last_activity_at > NOW() - INTERVAL '180 seconds' THEN 0
           WHEN tm.status = 'in_progress'
             AND tm.nakama_match_id IS NOT NULL
             AND tm.nakama_match_id NOT LIKE '__starting__:%'
             AND (tm.last_activity_at IS NULL OR tm.last_activity_at <= NOW() - INTERVAL '180 seconds') THEN 9
           WHEN tm.status = 'ready' THEN 1
           WHEN t.status = 'in_progress' AND tp.status = 'active' THEN 2
           WHEN t.status = 'paused' AND tp.status = 'active' THEN 3
           WHEN t.status = 'registration' THEN 4
           WHEN t.status = 'upcoming' THEN 5
           WHEN t.status IN ('in_progress', 'paused') THEN 6
           WHEN t.status = 'completed' THEN 7
           ELSE 8
         END,
         CASE
           WHEN t.status IN ('registration', 'upcoming', 'in_progress', 'paused') THEN t.tournament_start
           ELSE NULL
         END ASC NULLS LAST,
         t.tournament_start DESC NULLS LAST
       LIMIT 1`,
      [ctx.userId]
    );
    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      return JSON.stringify({
        action: {
          kind: 'none',
          label: 'Tournaments',
        },
      });
    }

    var row = rows[0];
    var kind = 'view';
    var label = 'View tournament';
    var rawNakamaMatchId = row.nakama_match_id ? String(row.nakama_match_id) : '';
    var liveNakamaMatchId = rawNakamaMatchId && rawNakamaMatchId.indexOf('__starting__:') !== 0
      ? rawNakamaMatchId
      : '';
    var isPlayer1 = row.player1_participant_id === row.participant_id;
    var userReady = isPlayer1 ? parsePgBoolean(row.ready_player1) : parsePgBoolean(row.ready_player2);
    var opponentReady = isPlayer1 ? parsePgBoolean(row.ready_player2) : parsePgBoolean(row.ready_player1);
    var opponentName = isPlayer1 ? row.p2_name : row.p1_name;
    var opponentIsBot = isPlayer1 ? parsePgBoolean(row.player2_is_bot) : parsePgBoolean(row.player1_is_bot);

    // Forfeited / eliminated / disqualified players must never see play or
    // rejoin actions — their tournament journey is over.  Check this before
    // the per-match-state branches below so a stale in_progress / ready match
    // doesn't let them back in.
    var inactiveStatuses = ['eliminated', 'forfeited', 'disqualified'];
    if (inactiveStatuses.indexOf(String(row.participant_status || '')) !== -1) {
      kind = 'view_results';
      label = 'View results';
    } else if (row.tournament_status === 'completed' || row.tournament_status === 'cancelled') {
      kind = 'view_results';
      label = 'View results';
    } else if (row.match_status === 'in_progress' && liveNakamaMatchId) {
      // Only return "rejoin" when the Nakama runtime match is likely still
      // alive.  If last_activity_at is stale, the match is
      // probably dead and repairStuckTournamentMatchStarts (called above) will
      // clean it up. Keeping the default action is better than a broken
      // rejoin attempt.
      var matchIdleSeconds = Number(row.match_idle_seconds);
      if (Number.isFinite(matchIdleSeconds) && matchIdleSeconds < 45) {
        kind = 'rejoin_match';
        label = buildTournamentActionLabel(kind, row, opponentName);
      }
      // If stale/unknown, keep the default view action.
    } else if (row.match_status === 'ready') {
      if (opponentIsBot) {
        kind = 'play_match';
        label = buildTournamentActionLabel(kind, row, opponentName);
      } else if (userReady && !opponentReady) {
        kind = 'waiting_for_opponent';
        label = buildTournamentActionLabel(kind, row, opponentName);
      } else {
        kind = 'ready_up';
        label = buildTournamentActionLabel(kind, row, opponentName);
      }
    } else if (row.tournament_status === 'in_progress' || row.tournament_status === 'paused') {
        kind = 'waiting_next_round';
        label = 'Waiting next round';
    } else if (row.tournament_status === 'completed') {
      kind = 'view_results';
      label = 'View results';
    } else if (row.tournament_status === 'registration') {
      kind = 'registered';
      label = 'Registered';
    } else if (row.tournament_status === 'upcoming') {
      kind = 'waiting_start';
      label = 'Waiting for start';
    }

    return JSON.stringify({
      action: {
        kind: kind,
        label: label,
        tournamentId: row.tournament_id,
        tournamentName: row.tournament_name,
        tournamentStatus: row.tournament_status,
        participantStatus: row.participant_status || null,
        finalPlacement: row.final_placement ? parseInt(row.final_placement) : null,
        matchId: row.match_id || null,
        nakamaMatchId: liveNakamaMatchId || null,
        opponentName: opponentName || 'Opponent',
        roundNumber: row.round_number ? parseInt(row.round_number) : null,
        matchNumber: row.match_number ? parseInt(row.match_number) : null,
        bracketType: row.bracket_type || null,
        totalRounds: row.total_rounds ? parseInt(row.total_rounds) : null,
        userReady: userReady,
        opponentReady: opponentReady,
      },
    });
  } catch (error) {
    logger.error('Error getting current tournament action: ' + error);
    throw error;
  }
}

// Auto-forfeit helper function for cron job
export function autoForfeitNoShowMatches(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  try {
    repairStuckTournamentMatchStarts(nk, logger);

    // Backfill legacy rows where ready_at was historically null after entering ready state.
    nk.sqlExec(
      `UPDATE tournament_matches tm
       SET ready_at = NOW()
       FROM tournaments t
       WHERE tm.tournament_id = t.id
         AND t.status = 'in_progress'
         AND tm.status = 'ready'
         AND tm.ready_at IS NULL`,
      []
    );

    // Find matches that stayed in ready state beyond no-show timeout.
    // Using NOW() - INTERVAL in SQL gives exact timing regardless of cron schedule.
    // Human-vs-bot: 60s (bot auto-readies, human just clicks Play).
    // Human-vs-human: same server-authoritative 60s ready-check window.
    var hvbNoShowSeconds = Math.max(1, Math.ceil(MATCH_NOSHOW_TIMEOUT_MS / 1000));
    var hvhNoShowSeconds = Math.max(1, Math.ceil(MATCH_NOSHOW_HVH_TIMEOUT_MS / 1000));

    var result = nk.sqlQuery(
      `SELECT tm.id as match_id, tm.tournament_id, tm.ready_player1, tm.ready_player2,
              tm.round_number, tm.match_number, tm.bracket_type,
              tm.player1_participant_id, tm.player2_participant_id,
              p1.user_id as player1_user_id, p2.user_id as player2_user_id,
              p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot,
              p1.seed_number as player1_seed, p2.seed_number as player2_seed
       FROM tournament_matches tm
       LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       JOIN tournaments t ON t.id = tm.tournament_id
       WHERE tm.status = 'ready'
         AND tm.ready_at IS NOT NULL
         AND t.status = 'in_progress'
         AND NOT (tm.ready_player1 = true AND tm.ready_player2 = true)
         AND NOT (COALESCE(p1.is_bot, false) = true AND COALESCE(p2.is_bot, false) = true)
         AND (
           -- Human-vs-bot: 60s (bot is always ready, the human just clicks Play)
           ((COALESCE(p1.is_bot, false) = true OR COALESCE(p2.is_bot, false) = true)
            AND tm.ready_at < NOW() - INTERVAL '` + hvbNoShowSeconds + ` seconds')
           OR
           -- Human-vs-human: aligns with client READY_CHECK_TIMEOUT_MS
           ((COALESCE(p1.is_bot, false) = false AND COALESCE(p2.is_bot, false) = false)
            AND tm.ready_at < NOW() - INTERVAL '` + hvhNoShowSeconds + ` seconds')
         )`,
      []
    );

    var rows = Array.isArray(result) ? result : [];
    for (var i = 0; i < rows.length; i++) {
      var match = rows[i];
      var player1IsBot = parsePgBoolean(match.player1_is_bot);
      var player2IsBot = parsePgBoolean(match.player2_is_bot);
      var readyPlayer1 = parsePgBoolean(match.ready_player1);
      var readyPlayer2 = parsePgBoolean(match.ready_player2);
      var sendNoShowLoss = function(userId: string | null | undefined, reason: string, bodyText: string): void {
        if (!userId) return;
        try {
          createTournamentNotification(
            nk,
            logger,
            userId,
            'tournament_match_forfeit_loss',
            'Match Forfeited - No Show',
            bodyText,
	            {
	              matchId: match.match_id,
	              tournamentId: match.tournament_id,
	              reason: reason,
	              roundNumber: match.round_number ? parseInt(match.round_number) : null,
	              matchNumber: match.match_number ? parseInt(match.match_number) : null,
	              bracketType: match.bracket_type || null,
	            },
            '/tournament/' + match.tournament_id
          );
        } catch (notifyError) {
          logger.warn('Failed to send no-show forfeit notification: ' + notifyError);
        }
      };

      if (!readyPlayer1 && !readyPlayer2) {
        logger.info('Double no-show detected in match ' + match.match_id);
        var participant1 = match.player1_participant_id ? String(match.player1_participant_id) : '';
        var participant2 = match.player2_participant_id ? String(match.player2_participant_id) : '';
        if (!participant1 || !participant2) {
          logger.warn('Double no-show skipped due to missing participants for match ' + match.match_id);
          continue;
        }

        if (!player1IsBot) {
          nk.sqlExec(
            `UPDATE tournament_participants
             SET status = 'forfeited',
                 eliminated_at = COALESCE(eliminated_at, NOW())
             WHERE id = $1
               AND status NOT IN ('forfeited', 'disqualified', 'eliminated')`,
            [participant1]
          );
        }
        if (!player2IsBot) {
          nk.sqlExec(
            `UPDATE tournament_participants
             SET status = 'forfeited',
                 eliminated_at = COALESCE(eliminated_at, NOW())
             WHERE id = $1
               AND status NOT IN ('forfeited', 'disqualified', 'eliminated')`,
            [participant2]
          );
        }

        var replacedAny = false;
        var replacementP1 = replaceParticipantInPendingOrReadyMatchWithBot(
          nk,
          logger,
          match.tournament_id,
          participant1
        );
        if (replacementP1.replaced) {
          replacedAny = true;
        }
        var replacementP2 = replaceParticipantInPendingOrReadyMatchWithBot(
          nk,
          logger,
          match.tournament_id,
          participant2
        );
        if (replacementP2.replaced) {
          replacedAny = true;
        }

        sendNoShowLoss(
          match.player1_user_id,
          'double_no_show',
          'You missed the ready-check window and were marked as a no-show.'
        );
        sendNoShowLoss(
          match.player2_user_id,
          'double_no_show',
          'You missed the ready-check window and were marked as a no-show.'
        );

        if (replacedAny) {
          nk.sqlExec(
            `UPDATE tournament_matches
             SET forfeit_reason = 'double_no_show_replaced'
             WHERE id = $1`,
            [match.match_id]
          );
          runTournamentMaintenanceCycle(nk, logger, match.tournament_id);
          logger.info('Double no-show participants replaced by bots for match ' + match.match_id);
          continue;
        }

        // When bots are disabled and both humans no-show, advance the higher seed
        // (lower seed number) so the bracket doesn't get an empty slot.
        var dnsWinnerUserId: string | null = null;
        var dnsWinnerSeed = Number.MAX_SAFE_INTEGER;
        if (match.player1_user_id && typeof match.player1_seed === 'number') {
          dnsWinnerUserId = match.player1_user_id;
          dnsWinnerSeed = Number(match.player1_seed);
        }
        if (match.player2_user_id && typeof match.player2_seed === 'number' && Number(match.player2_seed) < dnsWinnerSeed) {
          dnsWinnerUserId = match.player2_user_id;
        }
        autoReportTournamentResult(nk, logger, match.match_id, dnsWinnerUserId, 1, 0, false, true);
        nk.sqlExec(
          `UPDATE tournament_matches
           SET forfeit_reason = 'double_no_show'
           WHERE id = $1 AND status = 'completed'`,
          [match.match_id]
        );
        logger.info('Fallback double no-show resolved by seed for match ' + match.match_id);
        continue;
      }

      var readyParticipantId: string | null = null;
      var readyUserId: string | null = null;
      var noShowParticipantId: string | null = null;
      var noShowUserId: string | null = null;
      var noShowWasBot = false;

      // Determine winner (the one who was ready) and loser (no-show)
      if (readyPlayer1 && !readyPlayer2) {
        readyParticipantId = match.player1_participant_id;
        readyUserId = match.player1_user_id;
        noShowParticipantId = match.player2_participant_id;
        noShowUserId = match.player2_user_id;
        noShowWasBot = player2IsBot;
        logger.info('No-show detected in match ' + match.match_id + ': player 2');
      } else if (readyPlayer2 && !readyPlayer1) {
        readyParticipantId = match.player2_participant_id;
        readyUserId = match.player2_user_id;
        noShowParticipantId = match.player1_participant_id;
        noShowUserId = match.player1_user_id;
        noShowWasBot = player1IsBot;
        logger.info('No-show detected in match ' + match.match_id + ': player 1');
      } else {
        logger.warn('Unexpected ready flags during no-show evaluation for match ' + match.match_id);
        continue;
      }

      if (!readyUserId || !readyParticipantId || !noShowParticipantId) {
        logger.warn('Auto-forfeit skipped: missing winner user for match ' + match.match_id);
        continue;
      }

      if (!noShowWasBot) {
        nk.sqlExec(
          `UPDATE tournament_participants
           SET status = 'forfeited',
               eliminated_at = COALESCE(eliminated_at, NOW())
           WHERE id = $1
             AND status NOT IN ('forfeited', 'disqualified', 'eliminated')`,
          [noShowParticipantId]
        );
      }

      var replacementResult = replaceParticipantInPendingOrReadyMatchWithBot(
        nk,
        logger,
        match.tournament_id,
        noShowParticipantId
      );

      if (replacementResult.replaced) {
        nk.sqlExec(
          `UPDATE tournament_matches
           SET forfeit_reason = 'no_show_replaced'
           WHERE id = $1`,
          [match.match_id]
        );
        try {
          createTournamentNotification(
            nk,
            logger,
            readyUserId,
            'tournament_match_ready',
            'Opponent Replaced By Bot',
            'Your opponent no-showed. A tournament bot has been assigned. Start the match to continue.',
            {
              matchId: match.match_id,
              tournamentId: match.tournament_id,
              reason: 'opponent_no_show_replaced',
              roundNumber: match.round_number ? parseInt(match.round_number) : null,
              bracketType: match.bracket_type || null,
            },
            '/tournament/' + match.tournament_id
          );
        } catch (notifyError) {
          logger.warn('Failed to send no-show replacement notification: ' + notifyError);
        }

        if (noShowUserId) {
          sendNoShowLoss(
            noShowUserId,
            'no_show_replaced',
            'You missed the match start time and were replaced by a bot.'
          );
        }
        runTournamentMaintenanceCycle(nk, logger, match.tournament_id);
        logger.info('Replaced no-show participant with bot for match ' + match.match_id);
        continue;
      }

      // Fallback: if replacement could not be applied, keep legacy auto-forfeit advancement.
      var winnerIsPlayer1 = readyParticipantId === match.player1_participant_id;
      var player1Score = winnerIsPlayer1 ? 1 : 0;
      var player2Score = winnerIsPlayer1 ? 0 : 1;
      autoReportTournamentResult(nk, logger, match.match_id, readyUserId, player1Score, player2Score, false, true);
      nk.sqlExec(
        `UPDATE tournament_matches SET forfeit_reason = 'no_show' WHERE id = $1 AND status = 'completed'`,
        [match.match_id]
      );
      logger.info('Fallback no-show auto-forfeit applied for match ' + match.match_id);
    }

    resolvePlayableTournamentMatchesWithInactiveParticipants(nk, logger);

    // Resolve in-progress matches with no connected players past grace window
    try {
      var graceMs = DISCONNECT_GRACE_MS;
      var cutoffIso = new Date(Date.now() - graceMs).toISOString();
      var initializationCutoffIso = new Date(Date.now() - MATCH_START_INITIALIZATION_GRACE_MS).toISOString();
      var stalledResult = nk.sqlQuery(
        `SELECT tm.id as match_id, tm.nakama_match_id,
                (EXTRACT(EPOCH FROM (NOW() - COALESCE(tm.last_activity_at, tm.started_at, NOW()))) * 1000)::int as stale_ms
         FROM tournament_matches tm
         JOIN tournaments t ON t.id = tm.tournament_id
         WHERE tm.status = 'in_progress'
           AND tm.nakama_match_id IS NOT NULL
           AND tm.nakama_match_id NOT LIKE '__starting__:%'
           AND t.status = 'in_progress'
           AND tm.last_activity_at IS NOT NULL
           AND tm.last_activity_at < $1
           AND (tm.started_at IS NULL OR tm.started_at < $2)`,
        [cutoffIso, initializationCutoffIso]
      );
      var stalledRows = Array.isArray(stalledResult) ? stalledResult : [];
      for (var k = 0; k < stalledRows.length; k++) {
        var stalled = stalledRows[k];
        var nakamaMatchId = stalled.nakama_match_id;
        var shouldResolve = false;
        if (!nakamaMatchId) {
          shouldResolve = true;
        } else if (String(nakamaMatchId).indexOf('__starting__:') === 0) {
          // Defensive guard in case old rows bypass query filters.
          shouldResolve = false;
        } else {
          try {
            var matchInfo = nk.matchGet(nakamaMatchId);
            shouldResolve = !matchInfo || matchInfo.size === 0;
          } catch (matchError) {
            // NEVER force-resolve on a transient matchGet error.  If Nakama is
            // restarting or has a momentary hiccup, falsely resolving a LIVE
            // match would award the win to the wrong player (0-0 → seed
            // tiebreaker).  Instead, skip this match this tick — the next cron
            // run (20 s later) will re-evaluate.
            logger.warn(
              'matchGet failed for ' + nakamaMatchId +
              ' (match ' + stalled.match_id + ') — skipping, will retry: ' + matchError
            );
            shouldResolve = false;
          }
        }
        if (shouldResolve) {
          // DO NOT force-complete with fake 0-0 scores.  If the Nakama engine
          // died, the match may have had a real score in progress.  Resetting
          // to 'ready' lets autoResolveReadyBotMatches (or the player) restart
          // the match and play a fresh game with real scores.
          //
          // Only force-forfeit with seed tiebreaker if the match has been dead
          // for > 10 minutes (belt-and-suspenders — the dead-man's switch below).
          var staleMs = Number(stalled.stale_ms);
          if (!Number.isFinite(staleMs)) staleMs = 0;
          if (staleMs > 600_000) {
            logger.error(
              'FORCE-RESOLVING stalled match after 10 min dead: ' + stalled.match_id +
              ' — using seed tiebreaker as last resort'
            );
            autoReportTournamentResult(nk, logger, stalled.match_id, null, 0, 0, false, true);
          } else {
            logger.warn(
              'Resetting stalled tournament match to ready (dead Nakama engine): ' +
              stalled.match_id + ' stale_ms=' + Math.round(staleMs)
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
               WHERE id = $1
                 AND status = 'in_progress'`,
              [stalled.match_id]
            );
          }
        }
      }
    } catch (stalledError) {
      logger.error('Error checking stalled tournament matches: ' + stalledError);
    }

    // =========================================================================
    // DEAD-MAN'S SWITCH: Any ready match (including bot-vs-bot) stuck for > 10
    // minutes is force-resolved.  This should NEVER fire in normal operation —
    // autoResolveReadyBotMatches handles bot matches within seconds and the
    // no-show forfeit path above handles human matches within 60-180s.  This
    // exists only as a belt-and-suspenders backstop against unknown bugs.
    // =========================================================================
    try {
      var deadManResult = nk.sqlQuery(
        `SELECT tm.id, tm.tournament_id, tm.player1_participant_id, tm.player2_participant_id,
                COALESCE(p1.is_bot, false) as p1_bot, COALESCE(p2.is_bot, false) as p2_bot
         FROM tournament_matches tm
         LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
         LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
         JOIN tournaments t ON t.id = tm.tournament_id
         WHERE tm.status = 'ready'
           AND tm.ready_at IS NOT NULL
           AND tm.ready_at < NOW() - INTERVAL '10 minutes'
           AND t.status = 'in_progress'
         LIMIT 10`,
        []
      );
      var deadManRows = Array.isArray(deadManResult) ? deadManResult : [];
      for (var dm = 0; dm < deadManRows.length; dm++) {
        var dmMatch = deadManRows[dm];
        var dmP1Bot = dmMatch.p1_bot === true || dmMatch.p1_bot === 't' || dmMatch.p1_bot === 'true';
        var dmP2Bot = dmMatch.p2_bot === true || dmMatch.p2_bot === 't' || dmMatch.p2_bot === 'true';
        logger.warn(
          'DEAD-MAN SWITCH: Force-resolving ready match stuck >10 min: ' +
          dmMatch.id + ' tournament=' + dmMatch.tournament_id +
          ' p1_bot=' + dmP1Bot + ' p2_bot=' + dmP2Bot
        );
        try {
          // Dead-man's switch: force-resolve a match stuck in 'ready' >10 min.
          // This should NEVER fire in normal operation — if it does, something
          // else broke and we need to unblock the bracket.
          //
          // Strategy:
          // - HvB: Bot advances, human forfeits  (human abandoned)
          // - HvH: Both forfeit, but the match completes with the higher seed
          //   as "technical winner" so the bracket advances.  The "winner" is
          //   eliminated immediately after, creating a bye in the next round.
          //   This is better than a frozen bracket.
          // - BvB: autoResolveReadyBotMatches handles this.
          //
          // We NEVER pass 0-0 scores to autoReportTournamentResult because
          // that triggers the seed tiebreaker WITHOUT eliminating the loser —
          // giving an undeserved win to a player who may have been losing.
          if (dmP1Bot && dmP2Bot) {
            runTournamentMaintenanceCycle(nk, logger, dmMatch.tournament_id, 2);
          } else if (dmP1Bot && !dmP2Bot) {
            // Human is P2, human abandoned → bot (P1) wins
            nk.sqlExec(
              `UPDATE tournament_matches
               SET status = 'completed', winner_participant_id = $1,
                   nakama_match_id = NULL, started_at = COALESCE(started_at, NOW()),
                   completed_at = NOW(), forfeit_reason = 'deadman_abandoned',
                   player1_score = 1, player2_score = 0,
                   last_activity_at = NOW()
               WHERE id = $2 AND status = 'ready'`,
              [dmMatch.player1_participant_id, dmMatch.id]
            );
            nk.sqlExec(
              `UPDATE tournament_participants
               SET status = 'forfeited', eliminated_at = COALESCE(eliminated_at, NOW())
               WHERE id = $1 AND status NOT IN ('forfeited', 'disqualified', 'eliminated')`,
              [dmMatch.player2_participant_id]
            );
          } else if (!dmP1Bot && dmP2Bot) {
            // Human is P1, human abandoned → bot (P2) wins
            nk.sqlExec(
              `UPDATE tournament_matches
               SET status = 'completed', winner_participant_id = $1,
                   nakama_match_id = NULL, started_at = COALESCE(started_at, NOW()),
                   completed_at = NOW(), forfeit_reason = 'deadman_abandoned',
                   player1_score = 0, player2_score = 1,
                   last_activity_at = NOW()
               WHERE id = $2 AND status = 'ready'`,
              [dmMatch.player2_participant_id, dmMatch.id]
            );
            nk.sqlExec(
              `UPDATE tournament_participants
               SET status = 'forfeited', eliminated_at = COALESCE(eliminated_at, NOW())
               WHERE id = $1 AND status NOT IN ('forfeited', 'disqualified', 'eliminated')`,
              [dmMatch.player1_participant_id]
            );
          } else {
            // Both human — both abandoned for >10 min.
            // Forfeit both, complete match with higher seed as winner.
            // The winner is ALSO eliminated, so the next round gets a bye.
            var dmP1Seed = Number.MAX_SAFE_INTEGER;
            var dmP2Seed = Number.MAX_SAFE_INTEGER;
            try {
              var dmSeedResult = nk.sqlQuery(
                `SELECT p1.seed_number as p1_seed, p2.seed_number as p2_seed
                 FROM tournament_participants p1, tournament_participants p2
                 WHERE p1.id = $1 AND p2.id = $2`,
                [dmMatch.player1_participant_id, dmMatch.player2_participant_id]
              );
              var dmSeedRows = Array.isArray(dmSeedResult) ? dmSeedResult : [];
              if (dmSeedRows.length > 0) {
                dmP1Seed = Number(dmSeedRows[0].p1_seed) || Number.MAX_SAFE_INTEGER;
                dmP2Seed = Number(dmSeedRows[0].p2_seed) || Number.MAX_SAFE_INTEGER;
              }
            } catch (_seedErr) { /* use defaults */ }
            var dmWinnerParticipantId = dmP1Seed <= dmP2Seed
              ? dmMatch.player1_participant_id
              : dmMatch.player2_participant_id;
            var dmWinnerScore = dmP1Seed <= dmP2Seed ? 1 : 0;
            var dmLoserScore = dmP1Seed <= dmP2Seed ? 0 : 1;

            nk.sqlExec(
              `UPDATE tournament_matches
               SET status = 'completed', winner_participant_id = $1,
                   nakama_match_id = NULL, started_at = COALESCE(started_at, NOW()),
                   completed_at = NOW(), forfeit_reason = 'deadman_double_abandoned',
                   player1_score = $2, player2_score = $3,
                   last_activity_at = NOW()
               WHERE id = $4 AND status = 'ready'`,
              [dmWinnerParticipantId, dmWinnerScore, dmLoserScore, dmMatch.id]
            );
            // Forfeit BOTH — the "winner" is also eliminated
            nk.sqlExec(
              `UPDATE tournament_participants
               SET status = 'forfeited', eliminated_at = COALESCE(eliminated_at, NOW())
               WHERE id IN ($1, $2)
                 AND status NOT IN ('forfeited', 'disqualified', 'eliminated')`,
              [dmMatch.player1_participant_id, dmMatch.player2_participant_id]
            );
            logger.error(
              'DEAD-MAN SWITCH: Both humans abandoned match ' + dmMatch.id +
              ' (>10 min stuck). Both forfeited, bracket advances with bye.'
            );
            // Skip autoReportTournamentResult — we directly set the match.
            // But trigger bracket advancement so the bye propagates.
            try {
              runTournamentMaintenanceCycle(nk, logger, dmMatch.tournament_id, 4);
            } catch (_resolveErr) { /* best-effort */ }
            continue;
          }
          // For HvB cases above, trigger bracket advancement after direct match update
          try {
            runTournamentMaintenanceCycle(nk, logger, dmMatch.tournament_id, 4);
          } catch (_resolveErr2) { /* best-effort */ }
        } catch (deadManErr) {
          logger.error('DEAD-MAN SWITCH failed for match ' + dmMatch.id + ': ' + deadManErr);
        }
      }
      if (deadManRows.length > 0) {
        logger.warn('DEAD-MAN SWITCH activated: force-resolved ' + deadManRows.length + ' stuck ready matches');
      }
    } catch (deadManCatchErr) {
      logger.error('DEAD-MAN SWITCH query failed: ' + deadManCatchErr);
    }

    // Unconditionally resolve bot-vs-bot and stale human-vs-bot matches
    // across ALL in_progress tournaments. This ensures bot matches progress
    // even when there are no human no-shows to trigger resolution.
    try {
      var allActiveResult = nk.sqlQuery(
        `SELECT id FROM tournaments WHERE status = 'in_progress'`,
        []
      );
      var allActiveRows = Array.isArray(allActiveResult) ? allActiveResult : [];
      for (var p = 0; p < allActiveRows.length && p < 50; p++) {
        try {
          runTournamentMaintenanceCycle(nk, logger, allActiveRows[p].id);
        } catch (progErr) {
          logger.warn('Failed tournament maintenance cycle for ' + allActiveRows[p].id + ': ' + progErr);
        }
      }
    } catch (allErr) {
      logger.error('Error in unconditional bot-match resolution: ' + allErr);
    }
  } catch (error) {
    logger.error('Error in auto-forfeit job: ' + error);
  }
}

// Tournament notification helper - creates a notification for a user
export function createTournamentNotification(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  type: string,
  title: string,
  body: string,
  data: any,
  actionUrl?: string,
  expiresAtMinutes?: number
): void {
  try {
    if (!shouldStoreNotification(nk, userId, type)) {
      return;
    }

    var payloadData: any = {};
    if (data && typeof data === 'object') {
      for (var key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          payloadData[key] = data[key];
        }
      }
    }
    payloadData.type = type;
    payloadData.title = title;
    payloadData.body = body;
    payloadData.inbox = true;
    payloadData.createdAt = new Date().toISOString();
    if (actionUrl) {
      payloadData.actionUrl = actionUrl;
    }

    // Compute expires_at based on notification type to prevent stale alerts.
    var expiresAt: string | null = null;
    var expiresMinutes = expiresAtMinutes;
    if (expiresMinutes === undefined || expiresMinutes === null) {
      if (type === 'tournament_ready_check' || type === 'tournament_match_ready') {
        expiresMinutes = 30;
      } else if (type === 'tournament_reminder_1h' || type === 'tournament_reminder_15m') {
        expiresMinutes = 120;
      } else if (type === 'tournament_match_forfeit_win' || type === 'tournament_match_forfeit_loss') {
        expiresMinutes = 1440;
      } else if (type === 'tournament_eliminated' || type === 'tournament_victory' || type === 'tournament_complete') {
        expiresMinutes = 4320;
      } else {
        expiresMinutes = 1440;
      }
    }
    if (expiresMinutes > 0) {
      var expireDate = new Date(Date.now() + expiresMinutes * 60 * 1000);
      expiresAt = expireDate.toISOString();
    }

    // Insert into notifications table with idempotency guard.
    var insertResult = nk.sqlQuery(
      `INSERT INTO notifications (user_id, type, title, body, data, action_url, is_read, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, NOW(), $7)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userId, type, title, body, JSON.stringify(payloadData), actionUrl || null, expiresAt]
    );
    var insertRows = Array.isArray(insertResult) ? insertResult : [];
    var persisted = insertRows.length > 0;
    if (!persisted && type === 'tournament_ready_check' && payloadData.nakamaMatchId && payloadData.tournamentId && payloadData.matchId) {
      var updateResult = nk.sqlQuery(
        `UPDATE notifications
         SET title = $3,
             body = $4,
             data = $5,
             action_url = $6,
             is_read = false,
             created_at = NOW(),
             expires_at = $9
         WHERE user_id = $1
           AND type = $2
           AND data->>'tournamentId' = $7
           AND data->>'matchId' = $8
         RETURNING id`,
        [
          userId,
          type,
          title,
          body,
          JSON.stringify(payloadData),
          actionUrl || null,
          String(payloadData.tournamentId),
          String(payloadData.matchId),
          expiresAt,
        ]
      );
      var updateRows = Array.isArray(updateResult) ? updateResult : [];
      persisted = updateRows.length > 0;
    }
    if (!persisted) {
      return;
    }

    // Send real-time only if user notification preferences allow it.
    if (shouldSendRealtimeNotification(nk, userId, type)) {
      nk.notificationSend(userId, title, payloadData, 1, undefined, true);
    }

    // Send Telegram bot notification for selected tournament event types.
    try {
      sendTournamentEventNotification(nk, logger, userId, type, payloadData, title, body);
    } catch (botError) {
      logger.warn('Failed to send tournament bot notification: ' + botError);
    }
  } catch (error) {
    var message = '' + error;
    if (message.indexOf('idx_notifications_tournament_reminder_unique') !== -1) {
      logger.debug('Duplicate tournament reminder suppressed for user ' + userId);
      return;
    }
    if (message.indexOf('idx_notifications_tournament_event_unique') !== -1) {
      logger.debug('Duplicate tournament event notification suppressed for user ' + userId);
      return;
    }
    logger.warn('Failed to create tournament notification: ' + error);
  }
}

// Match ready notification - called when a match becomes ready
export function sendMatchReadyNotification(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  tournamentId: string,
  tournamentName: string,
  matchId: string,
  opponentName: string,
  matchContext?: {
    roundNumber?: number | null;
    matchNumber?: number | null;
    bracketType?: string | null;
  }
): void {
  var roundText = matchContext && matchContext.bracketType === 'grand_final'
    ? 'Grand Final'
    : (matchContext && matchContext.roundNumber
      ? ((matchContext.bracketType === 'losers' ? 'Losers Round ' : 'Round ') + matchContext.roundNumber)
      : 'Your tournament match');
  var body = roundText + ' against ' + opponentName + ' in ' + tournamentName + ' is ready. Tap to play.';
  createTournamentNotification(
    nk,
    logger,
    userId,
    'tournament_match_ready',
    roundText + ' is Ready!',
    body,
    {
      tournamentId: tournamentId,
      matchId: matchId,
      opponentName: opponentName,
      tournamentName: tournamentName,
      roundNumber: matchContext?.roundNumber || null,
      matchNumber: matchContext?.matchNumber || null,
      bracketType: matchContext?.bracketType || null,
    },
    '/tournament/' + tournamentId
  );
}

// Elimination notification - called when user is eliminated
export function sendEliminationNotification(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  tournamentId: string,
  tournamentName: string,
  placement: number
): void {
  var title = 'Tournament Result';
  var body = 'You finished #' + placement + ' in ' + tournamentName;

  createTournamentNotification(
    nk,
    logger,
    userId,
    'tournament_eliminated',
    title,
    body,
    {
      tournamentId: tournamentId,
      placement: placement,
      tournamentName: tournamentName,
    },
    '/tournament/' + tournamentId
  );
}

// Victory notification - called when user wins tournament
export function sendVictoryNotification(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  tournamentId: string,
  tournamentName: string,
  rewards: any
): void {
  createTournamentNotification(
    nk,
    logger,
    userId,
    'tournament_victory',
    'Congratulations - You Won!',
    'You won ' + tournamentName + '! Check the final standings.',
    {
      tournamentId: tournamentId,
      tournamentName: tournamentName,
      rewards: rewards,
    },
    '/tournament/' + tournamentId
  );
}

// Export the auto-forfeit function for use in cron job
export var tournamentExperienceHelpers = {
  autoForfeitNoShowMatches: autoForfeitNoShowMatches,
  sendMatchReadyNotification: sendMatchReadyNotification,
  sendEliminationNotification: sendEliminationNotification,
  sendVictoryNotification: sendVictoryNotification,
  createTournamentNotification: createTournamentNotification,
  MATCH_NOSHOW_TIMEOUT_MS: MATCH_NOSHOW_TIMEOUT_MS,
  MATCH_NOSHOW_HVH_TIMEOUT_MS: MATCH_NOSHOW_HVH_TIMEOUT_MS,
};
