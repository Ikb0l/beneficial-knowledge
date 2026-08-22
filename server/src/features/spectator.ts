// ============================================================================
// SPECTATOR RPCs
// ============================================================================
import { getTournamentBotDisplayName } from '../main/tournament-bots';

function parsePgBoolean(value: any): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

export function rpcGetSpectatorMatches(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    // Get active tournament matches that allow spectators
    var result = nk.sqlQuery(
      `SELECT tm.id, tm.nakama_match_id, tm.round_number, tm.spectator_count,
              t.id as tournament_id, t.name as tournament_name, t.allow_spectators,
              p1.id as player1_participant_id, p2.id as player2_participant_id,
              p1.user_id as player1_id, p2.user_id as player2_id,
              p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot,
              bp1.bot_key as player1_bot_key, bp2.bot_key as player2_bot_key,
              COALESCE(
                bp1.display_name,
                NULLIF(TRIM(CONCAT(s1.value->>'firstName', ' ', s1.value->>'lastName')), ''),
                s1.value->>'username',
                u1.display_name,
                u1.username,
                'Player'
              ) as p1_name,
              COALESCE(
                bp2.display_name,
                NULLIF(TRIM(CONCAT(s2.value->>'firstName', ' ', s2.value->>'lastName')), ''),
                s2.value->>'username',
                u2.display_name,
                u2.username,
                'Player'
              ) as p2_name
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
       WHERE tm.status = 'in_progress'
         AND t.status = 'in_progress'
         AND t.allow_spectators = true
         AND tm.nakama_match_id IS NOT NULL
         AND tm.nakama_match_id NOT LIKE '__starting__:%'
         AND (p1.user_id IS NULL OR p1.user_id <> $1)
         AND (p2.user_id IS NULL OR p2.user_id <> $1)
       ORDER BY tm.spectator_count DESC, tm.started_at DESC NULLS LAST
       LIMIT 50`,
      [ctx.userId]
    );
    var rows = Array.isArray(result) ? result : [];

    var matches: any[] = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var nakamaMatchId = row.nakama_match_id ? String(row.nakama_match_id) : '';
      if (!nakamaMatchId || nakamaMatchId.indexOf('__starting__:') === 0) {
        continue;
      }
      if (row.player1_id === ctx.userId || row.player2_id === ctx.userId) {
        continue;
      }

      // Match may be stale in DB until cron reconciliation runs; skip dead runtime matches.
      try {
        var runtimeMatch = nk.matchGet(nakamaMatchId);
        if (!runtimeMatch) {
          continue;
        }
      } catch (matchGetError) {
        logger.warn('Failed to verify spectator match runtime state for ' + nakamaMatchId + ': ' + matchGetError);
        continue;
      }
      var player1IsBot = parsePgBoolean(row.player1_is_bot);
      var player2IsBot = parsePgBoolean(row.player2_is_bot);
      var player1Name = player1IsBot
        ? getTournamentBotDisplayName(row.player1_bot_key, row.player1_participant_id, row.p1_name)
        : (row.p1_name || 'Unknown');
      var player2Name = player2IsBot
        ? getTournamentBotDisplayName(row.player2_bot_key, row.player2_participant_id, row.p2_name)
        : (row.p2_name || 'Unknown');

      matches.push({
        matchId: row.id,
        nakamaMatchId: nakamaMatchId,
        tournamentId: row.tournament_id,
        tournamentName: row.tournament_name,
        roundNumber: parseInt(row.round_number),
        player1: {
          id: row.player1_id,
          name: player1Name,
        },
        player2: {
          id: row.player2_id,
          name: player2Name,
        },
        spectatorCount: parseInt(row.spectator_count) || 0,
      });

      if (matches.length >= 20) {
        break;
      }
    }

    return JSON.stringify({
      matches: matches,
    });
  } catch (error) {
    logger.error('Error getting spectator matches: ' + error);
    throw error;
  }
}

// ============================================================================
