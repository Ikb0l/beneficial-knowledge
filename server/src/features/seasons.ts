import { requireAdminCapability } from '../main/admin';
import { getAdminInfoForFeatures, logAdminActionFeatures, parseJsonb, requireAdminForFeatures, requireSuperAdminForFeatures } from './helpers';

// SEASONS RPCs
// ============================================================================

export function rpcGetCurrentSeason(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    // Get active season
    var seasonResult = nk.sqlQuery(
      `SELECT id, season_number, name, start_date, end_date, reward_config
       FROM seasons
       WHERE is_active = true AND NOW() BETWEEN start_date AND end_date
       LIMIT 1`
    );
    var seasonRows = Array.isArray(seasonResult) ? seasonResult : [];

    if (seasonRows.length === 0) {
      return JSON.stringify({
        season: null,
        userRanking: null,
        topPlayers: [],
      });
    }

    var season = seasonRows[0];
    var userRanking = null;

    // Get user's ranking if authenticated
    if (ctx.userId) {
      var rankResult = nk.sqlQuery(
        `SELECT sr.mmr, sr.peak_mmr, sr.games_played, sr.wins, sr.losses,
                (SELECT COUNT(*) + 1 FROM season_rankings sr2
                 WHERE sr2.season_id = sr.season_id AND sr2.mmr > sr.mmr) as rank
         FROM season_rankings sr
         WHERE sr.season_id = $1 AND sr.user_id = $2`,
        [season.id, ctx.userId]
      );
      var rankRows = Array.isArray(rankResult) ? rankResult : [];

      if (rankRows.length > 0) {
        userRanking = {
          mmr: parseInt(rankRows[0].mmr),
          peakMmr: parseInt(rankRows[0].peak_mmr),
          gamesPlayed: parseInt(rankRows[0].games_played),
          wins: parseInt(rankRows[0].wins),
          losses: parseInt(rankRows[0].losses),
          rank: parseInt(rankRows[0].rank),
        };
      }
    }

    // Get top 10 players
    var topResult = nk.sqlQuery(
      `SELECT sr.user_id, sr.mmr, sr.games_played, sr.wins,
              s.value->>'firstName' as first_name,
              s.value->>'lastName' as last_name
       FROM season_rankings sr
       LEFT JOIN storage s ON s.user_id = sr.user_id AND s.collection = 'player_data' AND s.key = 'telegram'
       WHERE sr.season_id = $1
       ORDER BY sr.mmr DESC
       LIMIT 10`,
      [season.id]
    );
    var topRows = Array.isArray(topResult) ? topResult : [];

    var topPlayers = topRows.map(function(row: any, index: number) {
      return {
        rank: index + 1,
        userId: row.user_id,
        displayName: (row.first_name || 'Player') + (row.last_name ? ' ' + row.last_name : ''),
        mmr: parseInt(row.mmr),
        gamesPlayed: parseInt(row.games_played),
        wins: parseInt(row.wins),
      };
    });

    return JSON.stringify({
      season: {
        id: season.id,
        seasonNumber: parseInt(season.season_number),
        name: season.name,
        startDate: season.start_date,
        endDate: season.end_date,
        rewardConfig: parseJsonb(season.reward_config, {}),
      },
      userRanking: userRanking,
      topPlayers: topPlayers,
    });
  } catch (error) {
    logger.error('Error getting current season: ' + error);
    throw error;
  }
}

// Admin: list seasons (active + historical)
export function rpcAdminListSeasons(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'seasons.view');
    var request = JSON.parse(payload || '{}');
    var includeInactive = request.includeInactive !== false;

    var whereClause = includeInactive ? '' : 'WHERE is_active = true';
    var result = nk.sqlQuery(
      `SELECT id, season_number, name, start_date, end_date, is_active, rewards_distributed
       FROM seasons
       ${whereClause}
       ORDER BY start_date DESC`
    );
    var rows = Array.isArray(result) ? result : [];

    var seasons = rows.map(function(row: any) {
      return {
        id: row.id,
        seasonNumber: parseInt(row.season_number),
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        isActive: row.is_active,
        rewardsDistributed: row.rewards_distributed,
      };
    });

    return JSON.stringify({ seasons: seasons });
  } catch (error) {
    logger.error('Error listing seasons: ' + error);
    throw error;
  }
}

export function rpcGetSeasonLeaderboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var request = JSON.parse(payload || '{}');
    var seasonId = request.seasonId;
    var limitValue = Number(request.limit);
    var limit = Number.isFinite(limitValue) ? Math.floor(limitValue) : 50;
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;

    var offsetValue = Number(request.offset);
    var offset = Number.isFinite(offsetValue) ? Math.max(0, Math.floor(offsetValue)) : 0;

    // If no seasonId, get current season
    if (!seasonId) {
      var currentResult = nk.sqlQuery(
        `SELECT id FROM seasons WHERE is_active = true LIMIT 1`
      );
      var currentRows = Array.isArray(currentResult) ? currentResult : [];
      if (currentRows.length > 0) {
        seasonId = currentRows[0].id;
      }
    }

    if (!seasonId) {
      return JSON.stringify({
        leaderboard: [],
        total: 0,
      });
    }

    var countResult = nk.sqlQuery(
      `SELECT COUNT(*) as total FROM season_rankings WHERE season_id = $1`,
      [seasonId]
    );
    var countRows = Array.isArray(countResult) ? countResult : [];
    var total = countRows.length > 0 ? parseInt(countRows[0].total) : 0;

    var result = nk.sqlQuery(
      `SELECT sr.user_id, sr.mmr, sr.peak_mmr, sr.games_played, sr.wins, sr.losses,
              s.value->>'firstName' as first_name,
              s.value->>'lastName' as last_name
       FROM season_rankings sr
       LEFT JOIN storage s ON s.user_id = sr.user_id AND s.collection = 'player_data' AND s.key = 'telegram'
       WHERE sr.season_id = $1
       ORDER BY sr.mmr DESC
       LIMIT $2 OFFSET $3`,
      [seasonId, limit, offset]
    );
    var rows = Array.isArray(result) ? result : [];

    var leaderboard = rows.map(function(row: any, index: number) {
      return {
        rank: offset + index + 1,
        userId: row.user_id,
        displayName: (row.first_name || 'Player') + (row.last_name ? ' ' + row.last_name : ''),
        mmr: parseInt(row.mmr),
        peakMmr: parseInt(row.peak_mmr),
        gamesPlayed: parseInt(row.games_played),
        wins: parseInt(row.wins),
        losses: parseInt(row.losses),
      };
    });

    return JSON.stringify({
      leaderboard: leaderboard,
      total: total,
      limit: limit,
      offset: offset,
    });
  } catch (error) {
    logger.error('Error getting season leaderboard: ' + error);
    throw error;
  }
}

export function rpcAdminCreateSeason(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'seasons.create');
    var request = JSON.parse(payload || '{}');

    if (!request.name || !request.startDate || !request.endDate) {
      throw new Error('name, startDate, and endDate are required');
    }

    // Get next season number
    var numResult = nk.sqlQuery(`SELECT COALESCE(MAX(season_number), 0) + 1 as next FROM seasons`);
    var numRows = Array.isArray(numResult) ? numResult : [];
    var seasonNumber = numRows.length > 0 ? parseInt(numRows[0].next) : 1;

    var rewardConfig = request.rewardConfig || {
      grandmaster: { min_rank: 1, max_rank: 1 },
      master: { min_rank: 2, max_rank: 10 },
      diamond: { min_rank: 11, max_rank: 50 },
      platinum: { min_rank: 51, max_rank: 100 },
      gold: { min_rank: 101, max_rank: 500 },
      participant: { min_games: 10 },
    };

    var result = nk.sqlQuery(
      `INSERT INTO seasons (season_number, name, start_date, end_date, reward_config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [seasonNumber, request.name, request.startDate, request.endDate, JSON.stringify(rewardConfig)]
    );
    var rows = Array.isArray(result) ? result : [];

    return JSON.stringify({
      success: true,
      seasonId: rows.length > 0 ? rows[0].id : null,
      seasonNumber: seasonNumber,
    });
  } catch (error) {
    logger.error('Error creating season: ' + error);
    throw error;
  }
}

export function rpcAdminEndSeason(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdminForFeatures(ctx, nk, logger);
    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.seasonId) {
      throw new Error('seasonId is required');
    }

    // Start transaction
    nk.sqlExec(`BEGIN`, []);

    try {
      // Calculate final ranks
      nk.sqlExec(
        `UPDATE season_rankings sr
         SET final_rank = ranked.rank
         FROM (
           SELECT id, ROW_NUMBER() OVER (ORDER BY mmr DESC) as rank
           FROM season_rankings WHERE season_id = $1
         ) ranked
         WHERE sr.id = ranked.id AND sr.season_id = $1`,
        [request.seasonId]
      );

      // Assign reward tiers
      var seasonResult = nk.sqlQuery(
        `SELECT reward_config, name FROM seasons WHERE id = $1`,
        [request.seasonId]
      );
      var seasonRows = Array.isArray(seasonResult) ? seasonResult : [];

      if (seasonRows.length > 0) {
        var rewardConfig = parseJsonb<{[key: string]: any}>(seasonRows[0].reward_config, {});

        for (var tier in rewardConfig) {
          var config = rewardConfig[tier];
          if (config.min_rank && config.max_rank) {
            nk.sqlExec(
              `UPDATE season_rankings SET reward_tier = $1
               WHERE season_id = $2 AND final_rank >= $3 AND final_rank <= $4`,
              [tier, request.seasonId, config.min_rank, config.max_rank]
            );
          } else if (config.min_games) {
            nk.sqlExec(
              `UPDATE season_rankings SET reward_tier = $1
               WHERE season_id = $2 AND games_played >= $3 AND reward_tier IS NULL`,
              [tier, request.seasonId, config.min_games]
            );
          }
        }
      }

      // Mark season as ended and set rewards_distributed
      nk.sqlExec(
        `UPDATE seasons SET is_active = false, rewards_distributed = true WHERE id = $1`,
        [request.seasonId]
      );

      // Get count of rankings updated
      var countResult = nk.sqlQuery(
        `SELECT COUNT(*) as count FROM season_rankings WHERE season_id = $1 AND final_rank IS NOT NULL`,
        [request.seasonId]
      );
      var countRows = Array.isArray(countResult) ? countResult : [];
      var playersRanked = countRows.length > 0 ? parseInt(countRows[0].count) : 0;

      // Commit transaction
      nk.sqlExec(`COMMIT`, []);

      // Audit logging (after commit to ensure success)
      logAdminActionFeatures(nk, logger, adminInfo.adminId, adminInfo.telegramId,
        'end_season', 'season', request.seasonId, null,
        { seasonName: seasonRows.length > 0 ? seasonRows[0].name : '', playersRanked: playersRanked });

      logger.info('Season ' + request.seasonId + ' ended successfully, ' + playersRanked + ' players ranked');

      return JSON.stringify({
        success: true,
        seasonId: request.seasonId,
        playersRanked: playersRanked,
      });
    } catch (txError) {
      // Rollback on any error
      try {
        nk.sqlExec(`ROLLBACK`, []);
      } catch (rollbackError) {
        logger.error('Rollback failed: ' + rollbackError);
      }
      throw txError;
    }
  } catch (error) {
    logger.error('Error ending season: ' + error);
    throw error;
  }
}

// ============================================================================
