// ============================================================================
import { requireAdminCapability } from '../main/admin';

// ANALYTICS RPCs (Admin)
// ============================================================================

export function rpcAdminGetAnalyticsDashboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'analytics.view');

    // Get today's stats
    var today = new Date().toISOString().split('T')[0];
    var weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // DAU - users active today
    var dauResult = nk.sqlQuery(
      `SELECT COUNT(DISTINCT user_id) as count FROM user_activity_daily WHERE activity_date = $1`,
      [today]
    );
    var dauRows = Array.isArray(dauResult) ? dauResult : [];
    var dau = dauRows.length > 0 ? parseInt(dauRows[0].count) || 0 : 0;

    // WAU - users active in last 7 days
    var wauResult = nk.sqlQuery(
      `SELECT COUNT(DISTINCT user_id) as count FROM user_activity_daily WHERE activity_date >= $1`,
      [weekAgo]
    );
    var wauRows = Array.isArray(wauResult) ? wauResult : [];
    var wau = wauRows.length > 0 ? parseInt(wauRows[0].count) || 0 : 0;

    // MAU - users active in last 30 days
    var mauResult = nk.sqlQuery(
      `SELECT COUNT(DISTINCT user_id) as count FROM user_activity_daily WHERE activity_date >= $1`,
      [monthAgo]
    );
    var mauRows = Array.isArray(mauResult) ? mauResult : [];
    var mau = mauRows.length > 0 ? parseInt(mauRows[0].count) || 0 : 0;

    // Total users
    var totalUsersResult = nk.sqlQuery(
      `SELECT COUNT(DISTINCT user_id) as count FROM storage WHERE collection = 'player_data'`
    );
    var totalUsersRows = Array.isArray(totalUsersResult) ? totalUsersResult : [];
    var totalUsers = totalUsersRows.length > 0 ? parseInt(totalUsersRows[0].count) || 0 : 0;

    // Matches today
    var matchesResult = nk.sqlQuery(
      `SELECT COUNT(*) as count FROM match_history WHERE completed_at >= $1`,
      [today]
    );
    var matchesRows = Array.isArray(matchesResult) ? matchesResult : [];
    var matchesToday = matchesRows.length > 0 ? parseInt(matchesRows[0].count) || 0 : 0;

    // Total donations
    var donationsResult = nk.sqlQuery(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM donations WHERE payment_status = 'completed'`
    );
    var donationsRows = Array.isArray(donationsResult) ? donationsResult : [];
    var totalDonations = donationsRows.length > 0 ? parseInt(donationsRows[0].total) || 0 : 0;

    // Active tournaments
    var tournamentsResult = nk.sqlQuery(
      `SELECT COUNT(*) as count FROM tournaments WHERE status = 'in_progress'`
    );
    var tournamentsRows = Array.isArray(tournamentsResult) ? tournamentsResult : [];
    var activeTournaments = tournamentsRows.length > 0 ? parseInt(tournamentsRows[0].count) || 0 : 0;

    return JSON.stringify({
      dau: dau,
      wau: wau,
      mau: mau,
      totalUsers: totalUsers,
      matchesToday: matchesToday,
      totalDonationsCents: totalDonations,
      activeTournaments: activeTournaments,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error getting analytics dashboard: ' + error);
    throw error;
  }
}

export function rpcAdminGetUserEngagement(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'analytics.view');
    var request = JSON.parse(payload || '{}');

    var days = request.days || 30;
    var startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    var result = nk.sqlQuery(
      `SELECT activity_date,
              COUNT(DISTINCT user_id) as active_users,
              SUM(matches_played) as total_matches,
              SUM(session_count) as total_sessions,
              AVG(total_session_seconds) as avg_session_seconds
       FROM user_activity_daily
       WHERE activity_date >= $1
       GROUP BY activity_date
       ORDER BY activity_date`,
      [startDate]
    );
    var rows = Array.isArray(result) ? result : [];

    var data = rows.map(function(row: any) {
      return {
        date: row.activity_date,
        activeUsers: parseInt(row.active_users) || 0,
        totalMatches: parseInt(row.total_matches) || 0,
        totalSessions: parseInt(row.total_sessions) || 0,
        avgSessionSeconds: Math.round(parseFloat(row.avg_session_seconds) || 0),
      };
    });

    return JSON.stringify({
      data: data,
      days: days,
    });
  } catch (error) {
    logger.error('Error getting user engagement: ' + error);
    throw error;
  }
}

export function rpcAdminGetQuestionAnalytics(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'analytics.view');
    var request = JSON.parse(payload || '{}');

    var category = request.category;
    var difficulty = request.difficulty;
    var sortBy = request.sortBy || 'accuracy'; // accuracy, time, shown
    var limit = Math.min(request.limit || 50, 100);

    var query = `SELECT q.id, q.category, q.difficulty, q.question_text,
                        q.times_shown, q.times_correct, q.average_answer_time_ms,
                        CASE WHEN q.times_shown > 0 THEN
                          ROUND((q.times_correct::numeric / q.times_shown) * 100, 1)
                        ELSE 0 END as accuracy_pct
                 FROM questions q
                 WHERE q.is_active = true`;
    var params: any[] = [];

    if (category) {
      params.push(category);
      query += ` AND q.category = $` + params.length;
    }

    if (difficulty) {
      params.push(difficulty);
      query += ` AND q.difficulty = $` + params.length;
    }

    if (sortBy === 'accuracy') {
      query += ` ORDER BY accuracy_pct ASC`; // Hardest first
    } else if (sortBy === 'time') {
      query += ` ORDER BY q.average_answer_time_ms DESC`; // Slowest first
    } else {
      query += ` ORDER BY q.times_shown DESC`; // Most shown first
    }

    params.push(limit);
    query += ` LIMIT $` + params.length;

    var result = nk.sqlQuery(query, params);
    var rows = Array.isArray(result) ? result : [];

    var questions = rows.map(function(row: any) {
      return {
        id: row.id,
        category: row.category,
        difficulty: row.difficulty,
        questionText: row.question_text.substring(0, 100) + (row.question_text.length > 100 ? '...' : ''),
        timesShown: parseInt(row.times_shown) || 0,
        timesCorrect: parseInt(row.times_correct) || 0,
        accuracyPct: parseFloat(row.accuracy_pct) || 0,
        avgAnswerTimeMs: parseInt(row.average_answer_time_ms) || 0,
      };
    });

    return JSON.stringify({
      questions: questions,
      sortBy: sortBy,
    });
  } catch (error) {
    logger.error('Error getting question analytics: ' + error);
    throw error;
  }
}

export function rpcAdminGetTournamentAnalytics(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'analytics.view');

    // Total tournaments by status
    var statusResult = nk.sqlQuery(
      `SELECT status, COUNT(*) as count FROM tournaments GROUP BY status`
    );
    var statusRows = Array.isArray(statusResult) ? statusResult : [];

    var byStatus: {[key: string]: number} = {};
    for (var i = 0; i < statusRows.length; i++) {
      byStatus[statusRows[i].status] = parseInt(statusRows[i].count) || 0;
    }

    // Total participants
    var partResult = nk.sqlQuery(
      `SELECT COUNT(*) as total, COUNT(DISTINCT user_id) as unique_users FROM tournament_participants`
    );
    var partRows = Array.isArray(partResult) ? partResult : [];
    var totalParticipations = partRows.length > 0 ? parseInt(partRows[0].total) || 0 : 0;
    var uniqueParticipants = partRows.length > 0 ? parseInt(partRows[0].unique_users) || 0 : 0;

    // Avg participants per tournament
    var avgResult = nk.sqlQuery(
      `SELECT AVG(participant_count) as avg_participants
       FROM (SELECT tournament_id, COUNT(*) as participant_count
             FROM tournament_participants GROUP BY tournament_id) sub`
    );
    var avgRows = Array.isArray(avgResult) ? avgResult : [];
    var avgParticipants = avgRows.length > 0 ? Math.round(parseFloat(avgRows[0].avg_participants) || 0) : 0;

    // Completion rate
    var completionResult = nk.sqlQuery(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
         COUNT(*) as total
       FROM tournaments WHERE status IN ('completed', 'cancelled')`
    );
    var completionRows = Array.isArray(completionResult) ? completionResult : [];
    var completionRate = 0;
    if (completionRows.length > 0 && parseInt(completionRows[0].total) > 0) {
      completionRate = Math.round((parseInt(completionRows[0].completed) / parseInt(completionRows[0].total)) * 100);
    }

    return JSON.stringify({
      byStatus: byStatus,
      totalParticipations: totalParticipations,
      uniqueParticipants: uniqueParticipants,
      avgParticipantsPerTournament: avgParticipants,
      completionRate: completionRate,
    });
  } catch (error) {
    logger.error('Error getting tournament analytics: ' + error);
    throw error;
  }
}

export function rpcAdminGetRetentionCohorts(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'analytics.view');

    var result = nk.sqlQuery(
      `SELECT cohort_date, cohort_size, day_1_retained, day_7_retained, day_30_retained
       FROM retention_cohorts
       ORDER BY cohort_date DESC
       LIMIT 12`
    );
    var rows = Array.isArray(result) ? result : [];

    var cohorts = rows.map(function(row: any) {
      var size = parseInt(row.cohort_size) || 1;
      return {
        cohortDate: row.cohort_date,
        cohortSize: size,
        day1Pct: Math.round((parseInt(row.day_1_retained) || 0) / size * 100),
        day7Pct: Math.round((parseInt(row.day_7_retained) || 0) / size * 100),
        day30Pct: Math.round((parseInt(row.day_30_retained) || 0) / size * 100),
      };
    });

    return JSON.stringify({
      cohorts: cohorts,
    });
  } catch (error) {
    logger.error('Error getting retention cohorts: ' + error);
    throw error;
  }
}

// ============================================================================
