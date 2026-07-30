import { syncTournamentStatuses } from '../features/helpers';
import { cleanupOldNotifications } from '../features/notifications';
import { dispatchNotificationCampaigns, runCommunityOnlineDetector } from '../features/notification-campaigns';
import { tournamentExperienceHelpers } from '../features/tournament-experience';
import { getCategoriesFromDb } from './config';
import { cleanupExpiredChallenges } from './friends';

// RPC: Cron job for tournament no-show check
export function rpcCronTournamentNoshowCheck(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  logger.debug('Running tournament no-show check job');
  // autoForfeitNoShowMatches internally handles bot-vs-bot resolution
  // and progression passes (with LIMIT 50), so a separate pre-loop is
  // redundant and doubles advisory-lock contention.
  tournamentExperienceHelpers.autoForfeitNoShowMatches(nk, logger);

  // Dead-tournament auto-cancel: cancel in_progress tournaments that
  // have total_rounds = NULL (stuck from creation without bracket init)
  // and zero match activity for > 30 minutes.
  try {
    var deadResult = nk.sqlQuery(
      `UPDATE tournaments
       SET status = 'cancelled',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE status = 'in_progress'
         AND total_rounds IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM tournament_matches tm
           WHERE tm.tournament_id = tournaments.id
             AND tm.last_activity_at > NOW() - INTERVAL '30 minutes'
         )
       RETURNING id, name`,
      []
    );
    var deadRows = Array.isArray(deadResult) ? deadResult : [];
    for (var d = 0; d < deadRows.length; d++) {
      logger.warn(
        'Auto-cancelled dead tournament: ' + deadRows[d].name +
        ' (' + deadRows[d].id + ') - total_rounds NULL, no activity > 30 min'
      );
    }

    // Also cancel in_progress tournaments that have total_rounds set
    // but zero matches exist and no updates for > 30 minutes.
    var orphanResult = nk.sqlQuery(
      `UPDATE tournaments
       SET status = 'cancelled',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE status = 'in_progress'
         AND total_rounds IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM tournament_matches tm
           WHERE tm.tournament_id = tournaments.id
         )
         AND updated_at < NOW() - INTERVAL '30 minutes'
       RETURNING id, name`,
      []
    );
    var orphanRows = Array.isArray(orphanResult) ? orphanResult : [];
    for (var o = 0; o < orphanRows.length; o++) {
      logger.warn(
        'Auto-cancelled orphan tournament: ' + orphanRows[o].name +
        ' (' + orphanRows[o].id + ') - zero matches, no updates > 30 min'
      );
    }

    // Logging-only watchdog: warn about in_progress tournaments that have
    // matches but zero recent activity.  These may have stalled progression
    // and need manual investigation (not safe to auto-cancel).
    var stalledResult = nk.sqlQuery(
      `SELECT t.id, t.name
       FROM tournaments t
       WHERE t.status = 'in_progress'
         AND t.total_rounds IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM tournament_matches tm
           WHERE tm.tournament_id = t.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM tournament_matches tm
           WHERE tm.tournament_id = t.id
             AND tm.last_activity_at > NOW() - INTERVAL '30 minutes'
         )
       LIMIT 5`,
      []
    );
    var stalledRows = Array.isArray(stalledResult) ? stalledResult : [];
    for (var s = 0; s < stalledRows.length; s++) {
      logger.warn(
        'Stalled tournament detected: ' + stalledRows[s].name +
        ' (' + stalledRows[s].id + ') has matches but no activity > 30 min'
      );
    }
  } catch (watchdogError) {
    logger.warn('Tournament dead-tournament auto-cancel failed: ' + watchdogError);
  }

  return JSON.stringify({ success: true, job: 'tournament_noshow_check' });
}

// RPC: Cron job for tournament reminders
export function rpcCronTournamentReminders(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  logger.debug('Running tournament reminder check job');
  sendTournamentStartingReminders(nk, logger);
  return JSON.stringify({ success: true, job: 'tournament_reminders' });
}

// RPC: Cron job for syncing tournament statuses
export function rpcCronTournamentStatusSync(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  logger.debug('Running tournament status sync job');
  syncTournamentStatuses(nk, logger);
  return JSON.stringify({ success: true, job: 'tournament_status_sync' });
}

// RPC: Cron job for notification cleanup
export function rpcCronNotificationCleanup(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  logger.debug('Running notification cleanup job');
  cleanupOldNotifications(nk, logger);
  cleanupExpiredChallenges(nk, logger);
  return JSON.stringify({ success: true, job: 'notification_cleanup' });
}

// RPC: Cron job for online threshold community alerts
export function rpcCronCommunityOnlineDetector(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  logger.debug('Running community online detector job');
  runCommunityOnlineDetector(nk, logger);
  return JSON.stringify({ success: true, job: 'community_online_detector' });
}

// RPC: Cron job to dispatch pending notification campaigns
export function rpcCronNotificationCampaignDispatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  logger.debug('Running notification campaign dispatch job');
  dispatchNotificationCampaigns(nk, logger);
  return JSON.stringify({ success: true, job: 'notification_campaign_dispatch' });
}

// Helper function to send tournament starting soon reminders
export function sendTournamentStartingReminders(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  try {
    // 1-hour reminder: tournaments starting in approximately 1 hour (50-70 minute window).
    var oneHourResult = nk.sqlQuery(
      `SELECT t.id, t.name, t.tournament_start, tp.user_id
       FROM tournaments t
       JOIN tournament_participants tp ON tp.tournament_id = t.id
       WHERE t.status IN ('registration', 'upcoming')
         AND t.tournament_start > NOW() + INTERVAL '50 minutes'
         AND t.tournament_start <= NOW() + INTERVAL '70 minutes'
         AND tp.status = 'registered'
         AND tp.user_id IS NOT NULL
         AND COALESCE(tp.is_bot, false) = false
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id = tp.user_id
             AND n.type = 'tournament_reminder_1h'
             AND n.data::jsonb->>'tournamentId' = t.id::text
         )`,
      []
    );

    var oneHourRows = Array.isArray(oneHourResult) ? oneHourResult : [];
    for (var h = 0; h < oneHourRows.length; h++) {
      var row1h = oneHourRows[h];
      tournamentExperienceHelpers.createTournamentNotification(
        nk,
        logger,
        row1h.user_id,
        'tournament_reminder_1h',
        row1h.name + ' starts in 1 hour!',
        'The tournament begins in approximately 1 hour. Get ready!',
        {
          tournamentId: row1h.id,
          tournamentName: row1h.name,
          startTime: row1h.tournament_start,
        },
        '/tournament/' + row1h.id
      );
      logger.debug('Sent 1-hour reminder for tournament ' + row1h.id + ' to user ' + row1h.user_id);
    }

    // Find tournaments starting in approximately 15 minutes (between 10-20 minutes).
    // Keep reminder cadence intentionally minimal to reduce alert fatigue.
    var fifteenMinResult = nk.sqlQuery(
      `SELECT t.id, t.name, t.tournament_start, tp.user_id
       FROM tournaments t
       JOIN tournament_participants tp ON tp.tournament_id = t.id
       WHERE t.status IN ('registration', 'upcoming')
         AND t.tournament_start > NOW() + INTERVAL '10 minutes'
         AND t.tournament_start <= NOW() + INTERVAL '20 minutes'
         AND tp.status = 'registered'
         AND tp.user_id IS NOT NULL
         AND COALESCE(tp.is_bot, false) = false
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id = tp.user_id
             AND n.type = 'tournament_reminder_15m'
             AND n.data::jsonb->>'tournamentId' = t.id::text
         )`,
      []
    );

    var fifteenMinRows = Array.isArray(fifteenMinResult) ? fifteenMinResult : [];
    for (var j = 0; j < fifteenMinRows.length; j++) {
      var row15 = fifteenMinRows[j];
      tournamentExperienceHelpers.createTournamentNotification(
        nk,
        logger,
        row15.user_id,
        'tournament_reminder_15m',
        row15.name + ' starts in 15 minutes!',
        'The tournament is about to begin. Get ready!',
        {
          tournamentId: row15.id,
          tournamentName: row15.name,
          startTime: row15.tournament_start,
        },
        '/tournament/' + row15.id
      );
      logger.debug('Sent 15-minute reminder for tournament ' + row15.id + ' to user ' + row15.user_id);
    }
  } catch (error) {
    logger.error('Error sending tournament reminders: ' + error);
  }
}

// Create all leaderboards
export function createLeaderboards(nk: nkruntime.Nakama, logger: nkruntime.Logger): void {
  var safeCreate = function(
    id: string,
    resetSchedule?: string
  ): void {
    try {
      nk.leaderboardCreate(id, true, 'desc', 'set', resetSchedule);
      logger.info('Created ' + id + ' leaderboard');
    } catch (error) {
      logger.debug('Leaderboard creation skipped for ' + id + ': ' + error);
    }
  };

  // Global MMR leaderboard (descending order, best = highest MMR)
  safeCreate('global_mmr', undefined);

  // Daily global leaderboard (resets every day at midnight)
  safeCreate('daily_mmr', '0 0 * * *');

  // Weekly leaderboard (resets every Monday at midnight)
  safeCreate('weekly_mmr', '0 0 * * 1');

  // Monthly leaderboard (resets on the 1st of each month at midnight)
  safeCreate('monthly_mmr', '0 0 1 * *');

  // Category-specific leaderboards (from database)
  var categoriesForLeaderboards = getCategoriesFromDb(nk, logger);
  for (var categoryId in categoriesForLeaderboards) {
    var leaderboardId = 'category_' + categoryId;
    safeCreate(leaderboardId, undefined);
    safeCreate(leaderboardId + '_daily', '0 0 * * *');
    safeCreate(leaderboardId + '_weekly', '0 0 * * 1');
    safeCreate(leaderboardId + '_monthly', '0 0 1 * *');
  }
}
