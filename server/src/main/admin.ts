import { RateLimiter } from '../rate-limiter';
import { getTelegramUserFromInitData } from './auth-telegram';
import {
  clampMmr,
  getQuestionCountDefaults,
  getQuestionCountCaps,
  getCategoriesFromDb,
  getMmrCeiling,
  getMmrFloor,
  getTelegramBotToken,
  invalidateCategoriesCache,
  isValidCategoryFromDb,
  normalizeCategoryType,
} from './config';
import { GAME_CONFIG, getLeaderboardDisplayName } from './constants';
import { refreshQuestionCache } from './match-helpers';
import { getRankTierKeyForMmr } from './mmr';
import { rpcGetOnlineStats, rpcHealthCheck, rpcServerStatus } from './rpc-core';
import { updateTimeBasedLeaderboards } from './tournament-advance';
import { enqueueCategoryNotificationCampaign } from '../features/notification-campaigns';

// ADMIN PANEL RPC FUNCTIONS
// ============================================================================

// Get admin telegram IDs from environment (comma-separated)
export function getAdminTelegramIds(ctx: nkruntime.Context): number[] {
  var adminIdsStr = ctx.env['ADMIN_TELEGRAM_IDS'] || '';
  if (!adminIdsStr) return [];
  return adminIdsStr.split(',').map(function(id: string) {
    return parseInt(id.trim(), 10);
  }).filter(function(id: number) {
    return !isNaN(id);
  });
}

// Check if a telegram ID is an admin (from env or database)
export function isAdminTelegramId(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  ctx: nkruntime.Context,
  telegramId: number
): { isAdmin: boolean; adminLevel: string } {
  // First check environment variable for bootstrap admins
  var envAdminIds = getAdminTelegramIds(ctx);
  if (envAdminIds.indexOf(telegramId) !== -1) {
    return { isAdmin: true, adminLevel: 'super_admin' };
  }

  // Check database
  try {
    var result = nk.sqlQuery(
      `SELECT admin_level FROM admin_users WHERE telegram_id = $1 AND is_active = true`,
      [telegramId]
    );
    var rows = Array.isArray(result) ? result : (result.rows || []);
    if (rows.length > 0) {
      return { isAdmin: true, adminLevel: rows[0].admin_level || 'admin' };
    }
  } catch (error) {
    logger.error('Error checking admin status: ' + error);
  }

  return { isAdmin: false, adminLevel: '' };
}

// Helper: Require admin authentication
export function requireAdmin(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): { telegramId: number; adminLevel: string } {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  var telegramId: number = 0;

  // First try to get telegram ID from global_mmr storage
  var reads: nkruntime.StorageReadRequest[] = [{
    collection: 'player_data',
    key: 'global_mmr',
    userId: ctx.userId,
  }];
  var results = nk.storageRead(reads);
  if (results && results.length > 0 && results[0].value.telegramId) {
    telegramId = results[0].value.telegramId;
  }

  // Fallback: try telegram storage key (used by local admin login)
  if (!telegramId) {
    var telegramReads: nkruntime.StorageReadRequest[] = [{
      collection: 'player_data',
      key: 'telegram',
      userId: ctx.userId,
    }];
    var telegramResults = nk.storageRead(telegramReads);
    if (telegramResults && telegramResults.length > 0 && telegramResults[0].value.telegramId) {
      telegramId = telegramResults[0].value.telegramId;
    }
  }

  if (!telegramId) {
    throw new Error('Telegram ID not found - please login via Telegram');
  }

  var adminCheck = isAdminTelegramId(nk, logger, ctx, telegramId);
  if (!adminCheck.isAdmin) {
    throw new Error('Admin access required');
  }

  // Check if admin is banned (real-time ban check to prevent banned admin access)
  try {
    var banResult = nk.sqlQuery(
      `SELECT id FROM user_bans
       WHERE (user_id = $1 OR telegram_id = $2)
       AND is_active = true
       AND (is_permanent = true OR expires_at > NOW())
       LIMIT 1`,
      [ctx.userId, telegramId]
    );
    var banRows = Array.isArray(banResult) ? banResult : [];
    if (banRows.length > 0) {
      logger.warn('Banned admin attempted access: telegramId=' + telegramId + ', userId=' + ctx.userId);
      throw new Error('Your admin access has been revoked. Please contact a super administrator.');
    }
  } catch (banCheckError) {
    // If it's our own ban error, rethrow it
    if (banCheckError instanceof Error && banCheckError.message.includes('admin access has been revoked')) {
      throw banCheckError;
    }
    // For other errors (like table not existing), log and continue
    logger.warn('Ban check error (non-fatal): ' + banCheckError);
  }

  return { telegramId: telegramId, adminLevel: adminCheck.adminLevel };
}

// Helper: Require super admin authentication
export function requireSuperAdmin(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): { telegramId: number; adminLevel: string } {
  var admin = requireAdmin(ctx, nk, logger);
  if (admin.adminLevel !== 'super_admin') {
    throw new Error('Super admin access required');
  }
  return admin;
}

var ADMIN_FEATURE_FLAGS = [
  'query_platform',
  'capability_session',
  'dashboard_snapshot',
  'home_control_snapshot',
  'jobs_snapshot',
];
var ADMIN_PREFERENCES_COLLECTION = 'admin_preferences';
var ADMIN_PREFERENCES_KEY = 'console';
var ADMIN_MAX_SAVED_VIEWS_PER_PAGE = 8;
var ADMIN_MAX_SAVED_VIEW_LABEL_LENGTH = 80;
var ADMIN_MAX_SAVED_VIEW_QUERY_LENGTH = 2000;
var ADMIN_MAX_PAGE_PREFERENCE_ENTRIES = 50;

type AdminSavedViewRecord = {
  id: string;
  label: string;
  query: string;
  updatedAt: number;
};

type AdminPreferencesRecord = {
  savedViews: { [key: string]: AdminSavedViewRecord[] };
  pagePreferences: { [key: string]: any };
};

var BASE_ADMIN_CAPABILITIES = [
  'dashboard.view',
  'questions.view',
  'questions.create',
  'questions.update',
  'questions.import',
  'questions.export',
  'users.view',
  'matches.view',
  'categories.view',
  'categories.manage',
  'tournaments.view',
  'tournaments.create',
  'tournaments.update',
  'seasons.view',
  'seasons.create',
  'analytics.view',
  'home_control.view',
  'game_settings.view',
  'game_settings.update',
  'rank_tiers.view',
  'rank_tiers.manage',
  'referral_codes.view',
  'referral_codes.manage',
  'ai_questions.view',
  'ai_questions.manage',
  'audit.view',
];

var SUPER_ADMIN_ONLY_CAPABILITIES = [
  'questions.delete',
  'users.adjust_mmr',
  'users.ban',
  'users.unban',
  'tournaments.start',
  'tournaments.cancel',
  'tournaments.delete',
  'tournaments.pause',
  'tournaments.resume',
  'tournaments.manage_participants',
  'tournaments.shuffle_seeds',
  'tournaments.repair',
  'seasons.end',
  'ranked.reset',
];

function getAdminCapabilities(adminLevel: string): string[] {
  if (adminLevel === 'super_admin') {
    return BASE_ADMIN_CAPABILITIES.concat(SUPER_ADMIN_ONLY_CAPABILITIES);
  }
  return BASE_ADMIN_CAPABILITIES.slice();
}

function getDefaultAdminPreferences(): AdminPreferencesRecord {
  return {
    savedViews: {},
    pagePreferences: {},
  };
}

function sanitizeAdminPagePreferences(raw: any): { [key: string]: any } {
  var sanitized: { [key: string]: any } = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return sanitized;
  }

  var keys = Object.keys(raw).slice(0, ADMIN_MAX_PAGE_PREFERENCE_ENTRIES);
  for (var i = 0; i < keys.length; i += 1) {
    var key = String(keys[i] || '').trim();
    if (!key || key.length > 120) {
      continue;
    }

    try {
      var encoded = JSON.stringify(raw[key]);
      if (!encoded || encoded.length > 10_000) {
        continue;
      }
      sanitized[key] = JSON.parse(encoded);
    } catch (_error) {
      // Ignore unsupported preference values.
    }
  }

  return sanitized;
}

function sanitizeAdminPreferences(raw: any): AdminPreferencesRecord {
  var next = getDefaultAdminPreferences();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return next;
  }

  var savedViewsRaw = raw.savedViews;
  if (savedViewsRaw && typeof savedViewsRaw === 'object' && !Array.isArray(savedViewsRaw)) {
    var pageKeys = Object.keys(savedViewsRaw);
    for (var i = 0; i < pageKeys.length; i += 1) {
      var pageKey = String(pageKeys[i] || '').trim();
      if (!pageKey || pageKey.length > 120) {
        continue;
      }

      var pageViews = savedViewsRaw[pageKey];
      if (!Array.isArray(pageViews)) {
        continue;
      }

      var sanitizedViews: AdminSavedViewRecord[] = [];
      for (var j = 0; j < pageViews.length; j += 1) {
        var view = pageViews[j];
        if (!view || typeof view !== 'object') {
          continue;
        }

        var id = String(view.id || '').trim();
        var label = String(view.label || '').trim();
        var query = String(view.query || '').trim();
        var updatedAt = Number(view.updatedAt || 0);
        if (!id || !label || !query) {
          continue;
        }

        sanitizedViews.push({
          id: id,
          label: label.slice(0, ADMIN_MAX_SAVED_VIEW_LABEL_LENGTH),
          query: query.slice(0, ADMIN_MAX_SAVED_VIEW_QUERY_LENGTH),
          updatedAt: Number.isFinite(updatedAt) ? Math.floor(updatedAt) : Date.now(),
        });
      }

      sanitizedViews.sort(function(a: any, b: any) {
        return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
      });

      if (sanitizedViews.length > 0) {
        next.savedViews[pageKey] = sanitizedViews.slice(0, ADMIN_MAX_SAVED_VIEWS_PER_PAGE);
      }
    }
  }

  next.pagePreferences = sanitizeAdminPagePreferences(raw.pagePreferences);
  return next;
}

function readAdminPreferences(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama
): AdminPreferencesRecord {
  var userId = String(ctx.userId || '').trim();
  if (!userId) {
    return getDefaultAdminPreferences();
  }

  var results = nk.storageRead([{
    collection: ADMIN_PREFERENCES_COLLECTION,
    key: ADMIN_PREFERENCES_KEY,
    userId: userId,
  }]);

  if (!results || results.length === 0 || !results[0] || !results[0].value) {
    return getDefaultAdminPreferences();
  }

  return sanitizeAdminPreferences(results[0].value);
}

function writeAdminPreferences(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  preferences: AdminPreferencesRecord
) {
  var userId = String(ctx.userId || '').trim();
  if (!userId) {
    throw new Error('Authentication required');
  }

  nk.storageWrite([{
    collection: ADMIN_PREFERENCES_COLLECTION,
    key: ADMIN_PREFERENCES_KEY,
    userId: userId,
    value: sanitizeAdminPreferences(preferences),
    permissionRead: 0,
    permissionWrite: 0,
  }]);
}

export function requireAdminCapability(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  capability: string
): { telegramId: number; adminLevel: string } {
  var admin = requireAdmin(ctx, nk, logger);
  if (getAdminCapabilities(admin.adminLevel).indexOf(capability) === -1) {
    throw new Error('Missing required admin capability: ' + capability);
  }
  return admin;
}

function parseRpcPayload<T>(payload: string): T {
  return JSON.parse(payload) as T;
}

// Helper: Log admin action
export function logAdminAction(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  adminId: string,
  adminTelegramId: number,
  actionType: string,
  targetType: string,
  targetId: string,
  oldValue: any,
  newValue: any,
  metadata?: any
): void {
  try {
    nk.sqlExec(
      `INSERT INTO admin_audit_log (admin_id, admin_telegram_id, action_type, target_type, target_id, old_value, new_value, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [adminId, adminTelegramId, actionType, targetType, targetId,
       oldValue ? JSON.stringify(oldValue) : null,
       newValue ? JSON.stringify(newValue) : null,
       metadata ? JSON.stringify(metadata) : null]
    );
  } catch (error) {
    logger.error('Failed to log admin action: ' + error);
  }
}

var RANKED_RESET_JOB_CONFIG_KEY = 'ranked_reset_job';
var RANKED_RESET_CONFIRM_TEXT = 'RESET RANKED DATA';
var RANKED_RESET_PLAYER_BATCH_SIZE = 100;
var RANKED_RESET_LEADERBOARD_DELETE_BATCH_SIZE = 200;

function parseDbJsonValue(value: any): any {
  if (Array.isArray(value)) {
    var str = '';
    for (var i = 0; i < value.length; i++) {
      str += String.fromCharCode(value[i]);
    }
    try {
      return JSON.parse(str);
    } catch (_e) {
      return str;
    }
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_e) {
      return value;
    }
  }

  return value;
}

function getRankedResetJob(nk: nkruntime.Nakama, logger: nkruntime.Logger): any | null {
  try {
    var result = nk.sqlQuery(
      `SELECT config_value FROM game_config WHERE config_key = $1`,
      [RANKED_RESET_JOB_CONFIG_KEY]
    );
    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) return null;
    var parsed = parseDbJsonValue(rows[0].config_value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    logger.error('Failed to read ranked reset job state: ' + error);
    return null;
  }
}

function saveRankedResetJob(nk: nkruntime.Nakama, logger: nkruntime.Logger, job: any): void {
  try {
    nk.sqlExec(
      `INSERT INTO game_config (config_key, config_value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (config_key) DO UPDATE
       SET config_value = $2::jsonb, updated_at = NOW()`,
      [RANKED_RESET_JOB_CONFIG_KEY, JSON.stringify(job || {})]
    );
  } catch (error) {
    logger.error('Failed to write ranked reset job state: ' + error);
    throw error;
  }
}

function buildResetGlobalMmrValue(oldValue: any): any {
  var next = oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue)
    ? JSON.parse(JSON.stringify(oldValue))
    : {};

  next.mmr = GAME_CONFIG.STARTING_MMR;
  next.rd = GAME_CONFIG.STARTING_RD;
  next.volatility = GAME_CONFIG.STARTING_VOLATILITY;
  next.gamesPlayed = 0;
  next.wins = 0;
  next.losses = 0;
  next.draws = 0;
  next.rankTier = 'bronze';
  next.peakMmr = GAME_CONFIG.STARTING_MMR;

  return next;
}

function getRankedResetTotalPlayers(nk: nkruntime.Nakama): number {
  var countResult = nk.sqlQuery(
    `SELECT COUNT(DISTINCT user_id) as count
     FROM storage
     WHERE collection = 'player_data' AND key = 'global_mmr'`
  );
  var countRows = Array.isArray(countResult) ? countResult : [];
  if (countRows.length === 0) return 0;
  var parsed = parseInt(countRows[0].count, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getRankedResetPlayerBatch(
  nk: nkruntime.Nakama,
  offset: number,
  limit: number
): string[] {
  var safeOffset = Math.max(0, Math.floor(offset || 0));
  var safeLimit = Math.max(1, Math.min(1000, Math.floor(limit || 100)));
  var result = nk.sqlQuery(
    `SELECT user_id
     FROM storage
     WHERE collection = 'player_data' AND key = 'global_mmr'
     ORDER BY user_id ASC
     LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset]
  );
  var rows = Array.isArray(result) ? result : [];
  var userIds: string[] = [];
  for (var i = 0; i < rows.length; i++) {
    var userId = String(rows[i].user_id || '');
    if (userId) userIds.push(userId);
  }
  return userIds;
}

function getRankedResetCategoryLeaderboardIds(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): string[] {
  var ids: string[] = [];
  var seen: {[key: string]: boolean} = {};
  var categories = getCategoriesFromDb(nk, logger);
  for (var categoryKey in categories) {
    if (!Object.prototype.hasOwnProperty.call(categories, categoryKey)) continue;
    var safeCategory = String(categoryKey || '').trim();
    if (!safeCategory) continue;
    var baseId = 'category_' + safeCategory;
    var candidateIds = [
      baseId,
      baseId + '_daily',
      baseId + '_weekly',
      baseId + '_monthly',
    ];
    for (var i = 0; i < candidateIds.length; i++) {
      var id = candidateIds[i];
      if (!seen[id]) {
        seen[id] = true;
        ids.push(id);
      }
    }
  }
  return ids;
}

function getRankedResetResponse(job: any): any {
  var progress = job?.progress || {};
  var totals = job?.totals || {};
  return {
    jobId: job?.jobId || '',
    status: job?.status || 'unknown',
    stage: job?.stage || 'unknown',
    reason: job?.reason || '',
    createdAt: job?.createdAt || null,
    updatedAt: job?.updatedAt || null,
    completedAt: job?.completedAt || null,
    totals: {
      players: Number(totals.players) || 0,
      categoryLeaderboards: Number(totals.categoryLeaderboards) || 0,
    },
    progress: {
      playersProcessed: Number(progress.playersProcessed) || 0,
      playersTotal: Number(progress.playersTotal) || 0,
      categoryBoardsProcessed: Number(progress.categoryBoardsProcessed) || 0,
      categoryBoardsTotal: Number(progress.categoryBoardsTotal) || 0,
      categoryRecordsDeleted: Number(progress.categoryRecordsDeleted) || 0,
      matchHistoryRowsDeleted: Number(progress.matchHistoryRowsDeleted) || 0,
    },
    error: job?.error || null,
  };
}

function getDashboardWarnings(
  summary: any,
  healthCheck: any,
  onlineStats: any,
  recentActions: any[]
): Array<{ id: string; tone: string; title: string; description: string }> {
  var warnings: Array<{ id: string; tone: string; title: string; description: string }> = [];

  if (!healthCheck || healthCheck.status !== 'healthy') {
    warnings.push({
      id: 'server-health',
      tone: 'warning',
      title: 'Server health needs attention',
      description: 'Health check is unavailable or not reporting a healthy status.',
    });
  }

  if (!summary || (summary.totalQuestions || 0) === 0) {
    warnings.push({
      id: 'question-stock',
      tone: 'danger',
      title: 'Question library is empty',
      description: 'No active questions are available for matches.',
    });
  }

  if (summary && summary.totalUsers > 0 && (summary.activeUsers24h || 0) === 0) {
    warnings.push({
      id: 'user-activity',
      tone: 'warning',
      title: 'No active users in the last 24 hours',
      description: 'The platform has registered users but no match activity in the last day.',
    });
  }

  if (onlineStats && (onlineStats.playersOnline || 0) === 0) {
    warnings.push({
      id: 'online-now',
      tone: 'info',
      title: 'No users are online right now',
      description: 'Useful for sanity-checking notifications, tournaments, or engagement campaigns.',
    });
  }

  if (!recentActions || recentActions.length === 0) {
    warnings.push({
      id: 'audit-activity',
      tone: 'info',
      title: 'No recent admin actions',
      description: 'Audit history is currently empty or no recent activity was found.',
    });
  }

  return warnings;
}

function toIsoTimestamp(value: any): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new Date(value).toISOString();
  }

  var date = new Date(String(value));
  if (isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function getTimestampSortValue(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  var date = new Date(String(value));
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

function getAiGenerationJobCounts(nk: nkruntime.Nakama, logger: nkruntime.Logger): {[key: string]: number} {
  var counts: {[key: string]: number} = {};
  try {
    var rows = nk.sqlQuery(
      `SELECT status, COUNT(*) as count
       FROM ai_generation_jobs
       GROUP BY status`
    );
    var safeRows = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < safeRows.length; i++) {
      var statusKey = String(safeRows[i].status || '').trim();
      if (!statusKey) continue;
      counts[statusKey] = parseInt(safeRows[i].count, 10) || 0;
    }
  } catch (error) {
    logger.warn('Unable to read AI generation job counts: ' + error);
  }
  return counts;
}

function getRecentAiGenerationJobs(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  limit: number
): any[] {
  try {
    var rows = nk.sqlQuery(
      `SELECT j.*, p.profile_key, s.pack_key
       FROM ai_generation_jobs j
       LEFT JOIN ai_provider_profiles p ON p.id = j.profile_id
       LEFT JOIN ai_source_packs s ON s.id = j.source_pack_id
       ORDER BY j.created_at DESC
       LIMIT $1`,
      [limit]
    );
    var safeRows = Array.isArray(rows) ? rows : [];
    var items: any[] = [];
    for (var i = 0; i < safeRows.length; i++) {
      var allowedTypes = parseDbJsonValue(safeRows[i].allowed_question_types);
      items.push({
        id: safeRows[i].id,
        requestedBy: safeRows[i].requested_by,
        triggerType: safeRows[i].trigger_type,
        status: safeRows[i].status,
        categoryKey: safeRows[i].category_key,
        sourcePackId: safeRows[i].source_pack_id,
        sourcePackKey: safeRows[i].pack_key || null,
        profileId: safeRows[i].profile_id,
        profileKey: safeRows[i].profile_key || null,
        questionTargetCount: parseInt(safeRows[i].question_target_count, 10) || 0,
        autoPublish: safeRows[i].auto_publish !== false,
        strictMode: safeRows[i].strict_mode !== false,
        allowedQuestionTypes: Array.isArray(allowedTypes) ? allowedTypes : [],
        scheduleIntervalMinutes: safeRows[i].schedule_interval_minutes,
        nextRunAt: safeRows[i].next_run_at,
        lastRunAt: safeRows[i].last_run_at,
        startedAt: safeRows[i].started_at,
        finishedAt: safeRows[i].finished_at,
        stats: parseDbJsonValue(safeRows[i].stats) || {},
        errorSummary: safeRows[i].error_summary || '',
        createdAt: safeRows[i].created_at,
        updatedAt: safeRows[i].updated_at,
      });
    }
    return items;
  } catch (error) {
    logger.warn('Unable to read recent AI generation jobs: ' + error);
    return [];
  }
}

function buildJobsSnapshot(
  adminLevel: string,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  aiLimit: number,
  recentJobsLimit: number
): any {
  var canViewRankedReset = adminLevel === 'super_admin';
  var rankedResetRaw = canViewRankedReset ? getRankedResetJob(nk, logger) : null;
  var rankedReset = rankedResetRaw ? getRankedResetResponse(rankedResetRaw) : null;
  var aiJobs = getRecentAiGenerationJobs(nk, logger, aiLimit);
  var aiCounts = getAiGenerationJobCounts(nk, logger);

  var activeJobs = (aiCounts.pending || 0) + (aiCounts.running || 0) + (aiCounts.scheduled || 0);
  if (rankedReset && (rankedReset.status === 'pending' || rankedReset.status === 'in_progress')) {
    activeJobs += 1;
  }

  var failedJobs = aiCounts.failed || 0;
  if (rankedReset && rankedReset.status === 'failed') {
    failedJobs += 1;
  }

  var queuedJobs = (aiCounts.pending || 0) + (aiCounts.scheduled || 0);

  var warnings: Array<{ id: string; tone: string; title: string; description: string }> = [];
  if (rankedReset && rankedReset.status === 'failed') {
    warnings.push({
      id: 'ranked-reset-failed',
      tone: 'danger',
      title: 'Ranked reset failed',
      description: 'The latest ranked reset job failed and needs super-admin attention.',
    });
  } else if (rankedReset && rankedReset.status === 'in_progress') {
    warnings.push({
      id: 'ranked-reset-running',
      tone: 'warning',
      title: 'Ranked reset is in progress',
      description: 'A destructive maintenance job is actively running against ranked data.',
    });
  }

  if ((aiCounts.failed || 0) > 0) {
    warnings.push({
      id: 'ai-jobs-failed',
      tone: 'warning',
      title: 'AI generation jobs failed recently',
      description: String(aiCounts.failed || 0) + ' AI jobs are in failed status.',
    });
  }

  var recentJobs: any[] = [];

  if (rankedReset) {
    recentJobs.push({
      id: rankedReset.jobId,
      kind: 'ranked_reset',
      title: 'Ranked reset',
      label: rankedReset.stage || 'unknown',
      status: rankedReset.status,
      detail:
        String(rankedReset.progress.playersProcessed || 0) +
        '/' +
        String(rankedReset.progress.playersTotal || 0) +
        ' players reset',
      updatedAt: toIsoTimestamp(rankedReset.updatedAt),
      routePath: '/game-settings',
    });
  }

  for (var aiIndex = 0; aiIndex < aiJobs.length; aiIndex++) {
    recentJobs.push({
      id: aiJobs[aiIndex].id,
      kind: 'ai_generation',
      title: 'AI generation',
      label: aiJobs[aiIndex].categoryKey || 'Unscoped',
      status: aiJobs[aiIndex].status,
      detail: String(aiJobs[aiIndex].questionTargetCount || 0) + ' target questions',
      updatedAt: aiJobs[aiIndex].updatedAt,
      routePath: '/ai-questions',
    });
  }

  recentJobs.sort(function(a: any, b: any) {
    return getTimestampSortValue(b.updatedAt) - getTimestampSortValue(a.updatedAt);
  });

  return {
    summary: {
      activeJobs: activeJobs,
      failedJobs: failedJobs,
      queuedJobs: queuedJobs,
    },
    canViewRankedReset: canViewRankedReset,
    rankedReset: rankedReset,
    aiJobs: aiJobs,
    recentJobs: recentJobs.slice(0, recentJobsLimit),
    warnings: warnings,
  };
}

// RPC: Admin authenticate
export function rpcAdminAuthenticate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var request = JSON.parse(payload || '{}');
    var initData = request.initData;

    if (!initData) {
      return JSON.stringify({ isAdmin: false, error: 'Missing initData' });
    }

    // Validate and parse Telegram initData (enforces signature unless explicitly allowed)
    var allowInsecure = ctx.env['ALLOW_INSECURE_TELEGRAM_AUTH'] === 'true';
    var botToken = getTelegramBotToken(ctx, nk, logger);
    var telegramUser = getTelegramUserFromInitData(initData, botToken, allowInsecure, nk, logger);
    var telegramId = telegramUser.id;
    var adminCheck = isAdminTelegramId(nk, logger, ctx, telegramId);

    if (!adminCheck.isAdmin) {
      logger.warn('Non-admin login attempt from telegram ID: ' + telegramId);
      return JSON.stringify({ isAdmin: false, error: 'Not authorized' });
    }

    // Update last login
    try {
      nk.sqlExec(
        `UPDATE admin_users SET last_login_at = NOW() WHERE telegram_id = $1`,
        [telegramId]
      );
    } catch (e) {
      // May not exist in DB if env-based admin
    }

    var displayName = telegramUser.first_name || 'Admin';
    if (telegramUser.last_name) {
      displayName += ' ' + telegramUser.last_name;
    }

    logger.info('Admin authenticated: ' + displayName + ' (telegram ID: ' + telegramId + ')');

    return JSON.stringify({
      isAdmin: true,
      adminLevel: adminCheck.adminLevel,
      roleKey: adminCheck.adminLevel,
      userId: ctx.userId || '',
      telegramId: telegramId,
      displayName: displayName,
      capabilities: getAdminCapabilities(adminCheck.adminLevel),
      featureFlags: ADMIN_FEATURE_FLAGS,
    });
  } catch (error) {
    logger.error('Admin auth error: ' + error);
    return JSON.stringify({ isAdmin: false, error: String(error) });
  }
}

// RPC: Verify admin session
export function rpcAdminVerifySession(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdmin(ctx, nk, logger);

    // Get display name from telegram storage
    var displayName = 'Admin';
    try {
      var telegramData = nk.storageRead([{
        collection: 'player_data',
        key: 'telegram',
        userId: ctx.userId,
      }]);
      if (telegramData && telegramData.length > 0 && telegramData[0].value) {
        var firstName = telegramData[0].value.firstName || '';
        var lastName = telegramData[0].value.lastName || '';
        displayName = (firstName + ' ' + lastName).trim() || 'Admin';
      }
    } catch (e) {
      logger.warn('Error getting display name: ' + e);
    }

    // Return full adminInfo for secure session restore
    return JSON.stringify({
      valid: true,
      adminId: ctx.userId,
      adminInfo: {
        isAdmin: true,
        adminLevel: admin.adminLevel,
        roleKey: admin.adminLevel,
        userId: ctx.userId,
        telegramId: admin.telegramId,
        displayName: displayName,
        capabilities: getAdminCapabilities(admin.adminLevel),
        featureFlags: ADMIN_FEATURE_FLAGS,
      }
    });
  } catch (error) {
    return JSON.stringify({ valid: false, error: String(error) });
  }
}

export function rpcAdminGetPreferences(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdmin(ctx, nk, logger);
    var preferences = readAdminPreferences(ctx, nk);
    return JSON.stringify({ preferences: preferences });
  } catch (error) {
    logger.error('Get admin preferences error: ' + error);
    throw error;
  }
}

export function rpcAdminUpdatePreferences(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var current = readAdminPreferences(ctx, nk);

    if (request.pagePreferences !== undefined) {
      current.pagePreferences = sanitizeAdminPagePreferences(request.pagePreferences);
    }

    writeAdminPreferences(ctx, nk, current);
    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'admin_preferences_update', 'admin_preferences', ctx.userId || '', null, current);

    return JSON.stringify({ success: true, preferences: current });
  } catch (error) {
    logger.error('Update admin preferences error: ' + error);
    throw error;
  }
}

export function rpcAdminUpsertSavedView(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var storageKey = String(request.storageKey || '').trim();
    var label = String(request.label || '').trim();
    var query = String(request.query || '').trim();

    if (!storageKey) {
      throw new Error('Storage key required');
    }
    if (!label) {
      throw new Error('Saved view label required');
    }
    if (!query) {
      throw new Error('Saved view query required');
    }

    var safeLabel = label.slice(0, ADMIN_MAX_SAVED_VIEW_LABEL_LENGTH);
    var safeQuery = query.slice(0, ADMIN_MAX_SAVED_VIEW_QUERY_LENGTH);
    var preferences = readAdminPreferences(ctx, nk);
    var pageViews = Array.isArray(preferences.savedViews[storageKey]) ? preferences.savedViews[storageKey] : [];
    var existingView = null as any;

    for (var i = 0; i < pageViews.length; i += 1) {
      var candidate = pageViews[i];
      if (!candidate) continue;
      if (String(candidate.label || '').toLowerCase() === safeLabel.toLowerCase()) {
        existingView = candidate;
        break;
      }
    }

    var nextView = {
      id: existingView && existingView.id ? String(existingView.id) : nk.uuidv4(),
      label: safeLabel,
      query: safeQuery,
      updatedAt: Date.now(),
    };

    var nextViews = [nextView];
    for (var viewIndex = 0; viewIndex < pageViews.length; viewIndex += 1) {
      var view = pageViews[viewIndex];
      if (!view || String(view.id || '') === nextView.id) {
        continue;
      }
      if (String(view.label || '').toLowerCase() === safeLabel.toLowerCase()) {
        continue;
      }
      nextViews.push(view);
    }

    preferences.savedViews[storageKey] = nextViews.slice(0, ADMIN_MAX_SAVED_VIEWS_PER_PAGE);
    writeAdminPreferences(ctx, nk, preferences);
    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'admin_saved_view_upsert',
      'admin_preferences',
      storageKey,
      existingView || null,
      nextView
    );

    return JSON.stringify({ success: true, views: preferences.savedViews[storageKey], preferences: preferences });
  } catch (error) {
    logger.error('Upsert saved view error: ' + error);
    throw error;
  }
}

export function rpcAdminDeleteSavedView(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var storageKey = String(request.storageKey || '').trim();
    var viewId = String(request.viewId || '').trim();

    if (!storageKey) {
      throw new Error('Storage key required');
    }
    if (!viewId) {
      throw new Error('Saved view ID required');
    }

    var preferences = readAdminPreferences(ctx, nk);
    var pageViews = Array.isArray(preferences.savedViews[storageKey]) ? preferences.savedViews[storageKey] : [];
    var removedView = null as any;
    var nextViews: any[] = [];

    for (var i = 0; i < pageViews.length; i += 1) {
      var view = pageViews[i];
      if (!view) continue;
      if (String(view.id || '') === viewId) {
        removedView = view;
        continue;
      }
      nextViews.push(view);
    }

    if (nextViews.length > 0) {
      preferences.savedViews[storageKey] = nextViews;
    } else {
      delete preferences.savedViews[storageKey];
    }

    writeAdminPreferences(ctx, nk, preferences);
    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'admin_saved_view_delete',
      'admin_preferences',
      storageKey,
      removedView,
      null
    );

    return JSON.stringify({ success: true, views: nextViews, preferences: preferences });
  } catch (error) {
    logger.error('Delete saved view error: ' + error);
    throw error;
  }
}

// RPC: Operations center snapshot
export function rpcAdminGetDashboardSnapshot(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var days = Math.max(1, Math.min(parseInt(request.days || '7', 10), 30));
    var recentMatchesLimit = Math.max(1, Math.min(parseInt(request.recentMatchesLimit || '5', 10), 20));
    var recentActionsLimit = Math.max(1, Math.min(parseInt(request.recentActionsLimit || '6', 10), 20));
    var recentJobsLimit = Math.max(1, Math.min(parseInt(request.recentJobsLimit || '4', 10), 10));

    var summary = parseRpcPayload<any>(rpcAdminGetDashboardStats(ctx, logger, nk, '{}'));
    var activity = parseRpcPayload<any>(rpcAdminGetActivityChart(ctx, logger, nk, JSON.stringify({ days: days })));
    var recentMatchesResponse = parseRpcPayload<any>(
      rpcAdminListMatches(ctx, logger, nk, JSON.stringify({ limit: recentMatchesLimit, offset: 0 }))
    );
    var healthCheck = parseRpcPayload<any>(rpcHealthCheck(ctx, logger, nk, '{}'));
    var serverStatus = parseRpcPayload<any>(rpcServerStatus(ctx, logger, nk, '{}'));
    var onlineStats = parseRpcPayload<any>(rpcGetOnlineStats(ctx, logger, nk, '{}'));

    var recentAuditRows = nk.sqlQuery(
      `SELECT al.id, al.action_type, al.target_type, al.target_id, al.created_at,
              COALESCE(u.username, 'Unknown') as admin_name
       FROM admin_audit_log al
       LEFT JOIN users u ON al.admin_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [recentActionsLimit]
    );
    var recentActions = (Array.isArray(recentAuditRows) ? recentAuditRows : []).map(function(row: any) {
      return {
        id: row.id,
        actionType: row.action_type,
        targetType: row.target_type,
        targetId: row.target_id,
        adminName: row.admin_name,
        createdAt: row.created_at,
      };
    });
    var jobsSnapshot = buildJobsSnapshot(admin.adminLevel, nk, logger, 4, recentJobsLimit);

    return JSON.stringify({
      summary: summary,
      activity: activity.data || [],
      recentMatches: recentMatchesResponse.items || [],
      recentActions: recentActions,
      jobsSummary: jobsSnapshot.summary,
      recentJobs: jobsSnapshot.recentJobs,
      healthCheck: healthCheck,
      serverStatus: serverStatus,
      onlineStats: onlineStats,
      warnings: getDashboardWarnings(summary, healthCheck, onlineStats, recentActions).concat(jobsSnapshot.warnings),
    });
  } catch (error) {
    logger.error('Dashboard snapshot error: ' + error);
    throw error;
  }
}

// RPC: Jobs center snapshot
export function rpcAdminGetJobsSnapshot(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var aiLimit = Math.max(1, Math.min(parseInt(request.aiLimit || '8', 10), 20));
    var recentJobsLimit = Math.max(1, Math.min(parseInt(request.recentJobsLimit || '8', 10), 20));

    return JSON.stringify(
      buildJobsSnapshot(admin.adminLevel, nk, logger, aiLimit, recentJobsLimit)
    );
  } catch (error) {
    logger.error('Jobs snapshot error: ' + error);
    throw error;
  }
}

// RPC: Get dashboard stats
export function rpcAdminGetDashboardStats(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'categories.view');

    // Get counts from various tables
    var totalUsers = 0;
    var activeUsers24h = 0;
    var totalMatches = 0;
    var matchesToday = 0;
    var totalQuestions = 0;
    var bannedUsers = 0;
    var newUsersToday = 0;

    // Total users (count storage entries)
    try {
      var userCountResult = nk.sqlQuery(`SELECT COUNT(DISTINCT user_id) as count FROM storage WHERE collection = 'player_data' AND key = 'global_mmr'`);
      var rows = Array.isArray(userCountResult) ? userCountResult : [];
      if (rows.length > 0) totalUsers = parseInt(rows[0].count) || 0;
    } catch (e) { logger.warn('Error counting users: ' + e); }

    // Total questions
    try {
      var questionCountResult = nk.sqlQuery(`SELECT COUNT(*) as count FROM questions WHERE is_active = true`);
      var qRows = Array.isArray(questionCountResult) ? questionCountResult : [];
      if (qRows.length > 0) totalQuestions = parseInt(qRows[0].count) || 0;
    } catch (e) { logger.warn('Error counting questions: ' + e); }

    // Total matches
    try {
      var matchCountResult = nk.sqlQuery(`SELECT COUNT(*) as count FROM match_history`);
      var mRows = Array.isArray(matchCountResult) ? matchCountResult : [];
      if (mRows.length > 0) totalMatches = parseInt(mRows[0].count) || 0;
    } catch (e) { logger.warn('Error counting matches: ' + e); }

    // Matches today
    try {
      var matchTodayResult = nk.sqlQuery(`SELECT COUNT(*) as count FROM match_history WHERE completed_at >= CURRENT_DATE`);
      var mtRows = Array.isArray(matchTodayResult) ? matchTodayResult : [];
      if (mtRows.length > 0) matchesToday = parseInt(mtRows[0].count) || 0;
    } catch (e) { logger.warn('Error counting matches today: ' + e); }

    // Banned users
    try {
      var banCountResult = nk.sqlQuery(`SELECT COUNT(*) as count FROM user_bans WHERE is_active = true`);
      var bRows = Array.isArray(banCountResult) ? banCountResult : [];
      if (bRows.length > 0) bannedUsers = parseInt(bRows[0].count) || 0;
    } catch (e) { logger.warn('Error counting bans: ' + e); }

    // Active users in last 24 hours (users who played at least one match)
    try {
      var activeResult = nk.sqlQuery(
        `SELECT COUNT(DISTINCT user_id) as count FROM (
           SELECT player1_id as user_id FROM match_history WHERE completed_at >= NOW() - INTERVAL '24 hours'
           UNION
           SELECT player2_id as user_id FROM match_history WHERE completed_at >= NOW() - INTERVAL '24 hours'
         ) as active_users`
      );
      var aRows = Array.isArray(activeResult) ? activeResult : [];
      if (aRows.length > 0) activeUsers24h = parseInt(aRows[0].count) || 0;
    } catch (e) { logger.warn('Error counting active users: ' + e); }

    // New users today (users who created their account today)
    try {
      var newUsersResult = nk.sqlQuery(
        `SELECT COUNT(*) as count FROM users WHERE create_time >= CURRENT_DATE`
      );
      var nRows = Array.isArray(newUsersResult) ? newUsersResult : [];
      if (nRows.length > 0) newUsersToday = parseInt(nRows[0].count) || 0;
    } catch (e) { logger.warn('Error counting new users: ' + e); }

    return JSON.stringify({
      totalUsers: totalUsers,
      activeUsers24h: activeUsers24h,
      totalMatches: totalMatches,
      matchesToday: matchesToday,
      totalQuestions: totalQuestions,
      activeCategories: Object.keys(getCategoriesFromDb(nk, logger)).length,
      bannedUsers: bannedUsers,
      newUsersToday: newUsersToday,
    });
  } catch (error) {
    logger.error('Dashboard stats error: ' + error);
    throw error;
  }
}

// RPC: Get activity chart data
export function rpcAdminGetActivityChart(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var days = parseInt(request.days) || 7;
    // Validate days parameter to prevent SQL injection and ensure reasonable range
    if (days < 1 || days > 365 || !Number.isFinite(days)) {
      days = 7;
    }

    var data: any[] = [];

    try {
      var result = nk.sqlQuery(
        `SELECT DATE(completed_at) as date, COUNT(*) as matches
         FROM match_history
         WHERE completed_at >= CURRENT_DATE - INTERVAL '1 day' * $1
         GROUP BY DATE(completed_at)
         ORDER BY date`,
        [days]
      );
      var rows = Array.isArray(result) ? result : [];
      for (var i = 0; i < rows.length; i++) {
        data.push({
          date: rows[i].date,
          matches: parseInt(rows[i].matches) || 0,
          users: 0,
          newUsers: 0,
        });
      }
    } catch (e) {
      logger.warn('Error getting activity data: ' + e);
    }

    return JSON.stringify({ data: data });
  } catch (error) {
    logger.error('Activity chart error: ' + error);
    throw error;
  }
}

// RPC: List questions with filters
export function rpcAdminListQuestions(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'questions.view');
    var request = JSON.parse(payload || '{}');

    var category = request.category;
    var difficulty = request.difficulty;
    var questionType = request.questionType;
    var search = request.search;
    var isActive = request.isActive;
    var sortBy = request.sortBy || 'createdAt';
    var sortOrder = (request.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    var limit = Math.min(request.limit || 20, 100);
    var offset = request.offset || 0;

    var conditions: string[] = [];
    var params: any[] = [];
    var paramIndex = 1;

    if (category) {
      conditions.push('category = $' + paramIndex++);
      params.push(category);
    }
    if (difficulty) {
      conditions.push('difficulty = $' + paramIndex++);
      params.push(difficulty);
    }
    if (questionType) {
      conditions.push('question_type = $' + paramIndex++);
      params.push(questionType);
    }
    if (typeof isActive === 'boolean') {
      conditions.push('is_active = $' + paramIndex++);
      params.push(isActive);
    }
    if (search) {
      conditions.push('question_text ILIKE $' + paramIndex++);
      params.push('%' + search + '%');
    }

    var whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    var sortColumns: {[key: string]: string} = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      timesShown: 'times_shown',
      difficulty: "CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 4 END",
      accuracy: "CASE WHEN COALESCE(times_shown, 0) > 0 THEN COALESCE(times_correct, 0)::float / times_shown ELSE 0 END",
      questionType: 'question_type',
    };
    var orderBy = sortColumns[sortBy] || sortColumns.createdAt;

    // Get total count
    var countResult = nk.sqlQuery('SELECT COUNT(*) as count FROM questions ' + whereClause, params);
    var countRows = Array.isArray(countResult) ? countResult : [];
    var total = countRows.length > 0 ? parseInt(countRows[0].count) : 0;

    // Get questions
    params.push(limit);
    params.push(offset);
    var result = nk.sqlQuery(
      `SELECT id, category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type,
              times_shown, times_correct, average_answer_time_ms, created_at, updated_at, is_active
       FROM questions ${whereClause}
       ORDER BY ${orderBy} ${sortOrder}, created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    var rows = Array.isArray(result) ? result : [];
    var questions = rows.map(function(row: any) {
      var options = row.options;
      try {
        if (Array.isArray(options) && options.length > 0 && typeof options[0] === 'number') {
          var byteString = '';
          for (var j = 0; j < options.length; j++) {
            byteString += String.fromCharCode(options[j]);
          }
          options = JSON.parse(byteString);
        } else if (typeof options === 'string') {
          options = JSON.parse(options);
        }
      } catch (e) {
        options = [];
      }
      return {
        id: row.id,
        category: row.category,
        difficulty: row.difficulty,
        questionText: row.question_text,
        options: options,
        questionType: row.question_type || 'mcq',
        correctIndex: row.correct_index,
        explanation: row.explanation,
        sourceReference: row.source_reference,
        timesShown: row.times_shown || 0,
        timesCorrect: row.times_correct || 0,
        averageAnswerTimeMs: row.average_answer_time_ms || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: row.is_active,
      };
    });

    return JSON.stringify({
      items: questions,
      total: total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error('List questions error: ' + error);
    throw error;
  }
}

// RPC: Get single question
export function rpcAdminGetQuestion(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'questions.view');
    var request = JSON.parse(payload || '{}');
    var questionId = request.questionId;

    if (!questionId) {
      throw new Error('Question ID required');
    }

    var result = nk.sqlQuery(
      `SELECT id, category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type,
              times_shown, times_correct, average_answer_time_ms, created_at, updated_at, is_active
       FROM questions WHERE id = $1`,
      [questionId]
    );

    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      throw new Error('Question not found');
    }

    var row = rows[0];
    var options = row.options;
    try {
      if (Array.isArray(options) && options.length > 0 && typeof options[0] === 'number') {
        var byteString = '';
        for (var j = 0; j < options.length; j++) {
          byteString += String.fromCharCode(options[j]);
        }
        options = JSON.parse(byteString);
      } else if (typeof options === 'string') {
        options = JSON.parse(options);
      }
    } catch (e) {
      options = [];
    }
    return JSON.stringify({
      question: {
        id: row.id,
        category: row.category,
        difficulty: row.difficulty,
        questionText: row.question_text,
        options: options,
        questionType: row.question_type || 'mcq',
        correctIndex: row.correct_index,
        explanation: row.explanation,
        sourceReference: row.source_reference,
        timesShown: row.times_shown || 0,
        timesCorrect: row.times_correct || 0,
        averageAnswerTimeMs: row.average_answer_time_ms || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: row.is_active,
      },
    });
  } catch (error) {
    logger.error('Get question error: ' + error);
    throw error;
  }
}

// RPC: Create question
export function rpcAdminCreateQuestion(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'questions.create');
    var request = JSON.parse(payload || '{}');
    var question = request.question;

    if (!question) {
      throw new Error('Question data required');
    }

    // Validate
    if (!question.category || !isValidCategoryFromDb(nk, logger, question.category)) {
      throw new Error('Invalid category');
    }
    if (!question.difficulty || ['easy', 'medium', 'hard'].indexOf(question.difficulty) === -1) {
      throw new Error('Invalid difficulty');
    }
    if (!question.questionText) {
      throw new Error('Question text required');
    }

    var questionTypeRaw = (question.questionType !== undefined && question.questionType !== null)
      ? question.questionType
      : question.question_type;
    var questionType = typeof questionTypeRaw === 'string' ? questionTypeRaw.toLowerCase() : 'mcq';
    var allowedTypes = ['mcq', 'true_false', 'true_false_not_given', 'heading_match'];
    if (allowedTypes.indexOf(questionType) === -1) {
      throw new Error('Invalid question type');
    }

    var options = question.options;
    if (questionType === 'true_false') {
      options = ['True', 'False'];
    } else if (questionType === 'true_false_not_given') {
      options = ['True', 'False', 'Not Given'];
    }

    if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
      throw new Error('Options must be an array of 2 to 6 items');
    }
    for (var oi = 0; oi < options.length; oi++) {
      if (typeof options[oi] !== 'string' || options[oi].trim().length === 0) {
        throw new Error('All options must be non-empty strings');
      }
    }

    if (typeof question.correctIndex !== 'number' || !Number.isInteger(question.correctIndex) ||
      question.correctIndex < 0 || question.correctIndex >= options.length) {
      throw new Error('Invalid correct index');
    }

    var questionId = nk.uuidv4();
    nk.sqlExec(
      `INSERT INTO questions (id, category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [questionId, question.category, question.difficulty, question.questionText,
       JSON.stringify(options), question.correctIndex, question.explanation || '',
       question.sourceReference || '', questionType, ctx.userId]
    );

    // Refresh cache for this category
    refreshQuestionCache(question.category, nk, logger);

    // Log action
    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'question_create', 'question', questionId, null, question);

    logger.info('Question created: ' + questionId + ' by admin: ' + admin.telegramId);

    return JSON.stringify({ success: true, questionId: questionId });
  } catch (error) {
    logger.error('Create question error: ' + error);
    throw error;
  }
}

// RPC: Update question
export function rpcAdminUpdateQuestion(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'questions.update');
    var request = JSON.parse(payload || '{}');
    var questionId = request.questionId;
    var updates = request.updates;

    if (!questionId || !updates) {
      throw new Error('Question ID and updates required');
    }

    // Get current question for audit log
    var currentResult = nk.sqlQuery('SELECT * FROM questions WHERE id = $1', [questionId]);
    var currentRows = Array.isArray(currentResult) ? currentResult : [];
    if (currentRows.length === 0) {
      throw new Error('Question not found');
    }
    var oldQuestion = currentRows[0];

    var oldQuestionType = oldQuestion.question_type || 'mcq';
    var newQuestionType = oldQuestionType;
    if (updates.questionType !== undefined && updates.questionType !== null) {
      if (typeof updates.questionType !== 'string') throw new Error('Invalid question type');
      newQuestionType = updates.questionType.toLowerCase();
    } else if (updates.question_type !== undefined && updates.question_type !== null) {
      if (typeof updates.question_type !== 'string') throw new Error('Invalid question type');
      newQuestionType = updates.question_type.toLowerCase();
    }
    var allowedTypes = ['mcq', 'true_false', 'true_false_not_given', 'heading_match'];
    if (allowedTypes.indexOf(newQuestionType) === -1) {
      throw new Error('Invalid question type');
    }

    var optionsCurrent: any = oldQuestion.options;
    if (typeof optionsCurrent === 'string') {
      try { optionsCurrent = JSON.parse(optionsCurrent); } catch (e) { optionsCurrent = null; }
    } else if (Array.isArray(optionsCurrent) && optionsCurrent.length > 0 && typeof optionsCurrent[0] === 'number') {
      try {
        var byteString = '';
        for (var b = 0; b < optionsCurrent.length; b++) {
          byteString += String.fromCharCode(optionsCurrent[b]);
        }
        optionsCurrent = JSON.parse(byteString);
      } catch (e) { optionsCurrent = null; }
    }

    // Build update query
    var setClauses: string[] = ['updated_at = NOW()', 'updated_by = $1'];
    var params: any[] = [ctx.userId];
    var paramIndex = 2;

    if (updates.category) {
      if (!isValidCategoryFromDb(nk, logger, updates.category)) throw new Error('Invalid category');
      setClauses.push('category = $' + paramIndex++);
      params.push(updates.category);
    }
    if (updates.difficulty) {
      if (['easy', 'medium', 'hard'].indexOf(updates.difficulty) === -1) throw new Error('Invalid difficulty');
      setClauses.push('difficulty = $' + paramIndex++);
      params.push(updates.difficulty);
    }
    if (updates.questionText) {
      setClauses.push('question_text = $' + paramIndex++);
      params.push(updates.questionText);
    }

    // Apply question type first (it may imply canonical options)
    if ((updates.questionType !== undefined && updates.questionType !== null) ||
        (updates.question_type !== undefined && updates.question_type !== null)) {
      setClauses.push('question_type = $' + paramIndex++);
      params.push(newQuestionType);
    }

    // Determine effective options for validation and/or updating
    var optionsEffective = optionsCurrent;
    if (updates.options !== undefined) {
      optionsEffective = updates.options;
    }
    if (newQuestionType === 'true_false') {
      optionsEffective = ['True', 'False'];
      // Always normalize options for TF
      setClauses.push('options = $' + paramIndex++);
      params.push(JSON.stringify(optionsEffective));
    } else if (newQuestionType === 'true_false_not_given') {
      optionsEffective = ['True', 'False', 'Not Given'];
      // Always normalize options for TFNG
      setClauses.push('options = $' + paramIndex++);
      params.push(JSON.stringify(optionsEffective));
    } else if (updates.options !== undefined) {
      if (!Array.isArray(optionsEffective) || optionsEffective.length < 2 || optionsEffective.length > 6) {
        throw new Error('Options must be an array of 2 to 6 items');
      }
      setClauses.push('options = $' + paramIndex++);
      params.push(JSON.stringify(optionsEffective));
    }

    if (Array.isArray(optionsEffective)) {
      for (var oi = 0; oi < optionsEffective.length; oi++) {
        if (typeof optionsEffective[oi] !== 'string' || optionsEffective[oi].trim().length === 0) {
          throw new Error('All options must be non-empty strings');
        }
      }
    }

    var correctIndexEffective: any = oldQuestion.correct_index;
    if (typeof correctIndexEffective !== 'number') {
      correctIndexEffective = parseInt(correctIndexEffective, 10);
    }
    if (typeof updates.correctIndex === 'number') {
      correctIndexEffective = updates.correctIndex;
    } else if (updates.correct_index !== undefined && updates.correct_index !== null) {
      correctIndexEffective = typeof updates.correct_index === 'number'
        ? updates.correct_index
        : parseInt(updates.correct_index, 10);
    }

    if (!Number.isFinite(correctIndexEffective) || !Number.isInteger(correctIndexEffective)) {
      throw new Error('Invalid correct index');
    }
    var optionsCount = Array.isArray(optionsEffective) ? optionsEffective.length : 0;
    if (optionsCount < 2 || optionsCount > 6) {
      throw new Error('Invalid options for correct index validation');
    }
    if (correctIndexEffective < 0 || correctIndexEffective >= optionsCount) {
      throw new Error('Invalid correct index');
    }

    if (typeof updates.correctIndex === 'number') {
      setClauses.push('correct_index = $' + paramIndex++);
      params.push(updates.correctIndex);
    } else if (updates.correct_index !== undefined && updates.correct_index !== null) {
      setClauses.push('correct_index = $' + paramIndex++);
      params.push(typeof updates.correct_index === 'number'
        ? updates.correct_index
        : parseInt(updates.correct_index, 10));
    }
    if (updates.explanation !== undefined) {
      setClauses.push('explanation = $' + paramIndex++);
      params.push(updates.explanation);
    }
    if (updates.sourceReference !== undefined) {
      setClauses.push('source_reference = $' + paramIndex++);
      params.push(updates.sourceReference);
    }

    params.push(questionId);
    nk.sqlExec(
      'UPDATE questions SET ' + setClauses.join(', ') + ' WHERE id = $' + paramIndex,
      params
    );

    // Refresh cache
    var categoryToRefresh = updates.category || oldQuestion.category;
    refreshQuestionCache(categoryToRefresh, nk, logger);
    if (updates.category && updates.category !== oldQuestion.category) {
      refreshQuestionCache(oldQuestion.category, nk, logger);
    }

    // Log action
    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'question_update', 'question', questionId, oldQuestion, updates);

    logger.info('Question updated: ' + questionId + ' by admin: ' + admin.telegramId);

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Update question error: ' + error);
    throw error;
  }
}

// RPC: Delete question (soft delete)
export function rpcAdminDeleteQuestion(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var questionId = request.questionId;

    if (!questionId) {
      throw new Error('Question ID required');
    }

    // Get question for category refresh
    var result = nk.sqlQuery('SELECT category FROM questions WHERE id = $1', [questionId]);
    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      throw new Error('Question not found');
    }

    nk.sqlExec('UPDATE questions SET is_active = false, updated_at = NOW(), updated_by = $1 WHERE id = $2', [ctx.userId, questionId]);

    // Refresh cache
    refreshQuestionCache(rows[0].category, nk, logger);

    // Log action
    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'question_delete', 'question', questionId, null, null);

    logger.info('Question deleted: ' + questionId + ' by admin: ' + admin.telegramId);

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Delete question error: ' + error);
    throw error;
  }
}

export function rpcAdminBulkDeleteQuestions(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var questionIds = Array.isArray(request.questionIds) ? request.questionIds : [];

    if (questionIds.length === 0) {
      throw new Error('questionIds array required');
    }

    var uniqueIds: string[] = [];
    var seen: {[key: string]: boolean} = {};
    for (var i = 0; i < questionIds.length; i++) {
      var questionId = String(questionIds[i] || '').trim();
      if (!questionId || seen[questionId]) {
        continue;
      }
      seen[questionId] = true;
      uniqueIds.push(questionId);
    }

    if (uniqueIds.length === 0) {
      throw new Error('No valid question IDs provided');
    }

    var placeholders = uniqueIds.map(function(_: any, index: number) {
      return '$' + (index + 1);
    }).join(', ');
    var rowsResult = nk.sqlQuery(
      'SELECT id, category FROM questions WHERE id IN (' + placeholders + ')',
      uniqueIds
    );
    var rows = Array.isArray(rowsResult) ? rowsResult : [];
    if (rows.length === 0) {
      throw new Error('No matching questions found');
    }

    nk.sqlExec(
      'UPDATE questions SET is_active = false, updated_at = NOW(), updated_by = $1 WHERE id IN (' + uniqueIds.map(function(_: any, index: number) {
        return '$' + (index + 2);
      }).join(', ') + ')',
      [ctx.userId].concat(uniqueIds)
    );

    var refreshedCategories: {[key: string]: boolean} = {};
    for (var r = 0; r < rows.length; r++) {
      var categoryKey = String(rows[r].category || '').trim();
      if (!categoryKey || refreshedCategories[categoryKey]) {
        continue;
      }
      refreshedCategories[categoryKey] = true;
      refreshQuestionCache(categoryKey, nk, logger);
    }

    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'question_bulk_delete',
      'question',
      'batch',
      null,
      { questionIds: uniqueIds, deletedCount: rows.length }
    );

    return JSON.stringify({ success: true, deletedCount: rows.length });
  } catch (error) {
    logger.error('Bulk delete questions error: ' + error);
    throw error;
  }
}

// RPC: Toggle question active status
export function rpcAdminToggleQuestion(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'questions.update');
    var request = JSON.parse(payload || '{}');
    var questionId = request.questionId;
    var isActive = request.isActive;

    if (!questionId || typeof isActive !== 'boolean') {
      throw new Error('Question ID and isActive required');
    }

    var result = nk.sqlQuery('SELECT category FROM questions WHERE id = $1', [questionId]);
    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      throw new Error('Question not found');
    }

    nk.sqlExec('UPDATE questions SET is_active = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3', [isActive, ctx.userId, questionId]);

    refreshQuestionCache(rows[0].category, nk, logger);

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'question_toggle', 'question', questionId, { isActive: !isActive }, { isActive: isActive });

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Toggle question error: ' + error);
    throw error;
  }
}

// RPC: Bulk import questions
export function rpcAdminBulkImportQuestions(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'categories.manage');

    // Rate limiting for bulk import to prevent DoS
    var rateCheck = RateLimiter.isRateLimited(nk, ctx.userId || '', 'admin_bulk_import_questions', logger);
    if (rateCheck.limited) {
      throw new Error('Rate limit exceeded. Please wait ' +
        Math.ceil((rateCheck.retryAfterMs || 0) / 1000) + ' seconds before importing again.');
    }

    var request = JSON.parse(payload || '{}');
    var questions = request.questions;
    var category = request.category;
    var allowedQuestionTypes = request.allowedQuestionTypes;

    if (!questions || !Array.isArray(questions)) {
      throw new Error('Questions array required');
    }

    if (!category || typeof category !== 'string' || !isValidCategoryFromDb(nk, logger, category)) {
      throw new Error('Valid category required');
    }

    var supportedQuestionTypes = ['mcq', 'true_false', 'true_false_not_given', 'heading_match'];
    var allowedTypeMap: {[key: string]: boolean} = {};

    if (Array.isArray(allowedQuestionTypes)) {
      for (var ti = 0; ti < allowedQuestionTypes.length; ti++) {
        var rawType = allowedQuestionTypes[ti];
        if (typeof rawType !== 'string') continue;
        var normalizedType = rawType.toLowerCase();
        if (supportedQuestionTypes.indexOf(normalizedType) !== -1) {
          allowedTypeMap[normalizedType] = true;
        }
      }
    }

    if (Object.keys(allowedTypeMap).length === 0) {
      return JSON.stringify({ imported: 0, errors: ['No question types selected'] });
    }

    // Limit maximum questions per import to prevent server overload
    var MAX_QUESTIONS_PER_IMPORT = 500;
    if (questions.length > MAX_QUESTIONS_PER_IMPORT) {
      throw new Error('Maximum ' + MAX_QUESTIONS_PER_IMPORT + ' questions per import. You sent ' + questions.length);
    }

    var imported = 0;
    var errors: string[] = [];

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      try {
        var qCategory: string = (q && typeof q.category === 'string') ? q.category : category;
        if (qCategory !== category) {
          errors.push('Question ' + i + ': Category mismatch (expected ' + category + ')');
          continue;
        }

        var questionText = q.questionText !== undefined && q.questionText !== null
          ? q.questionText
          : q.question_text;
        if (typeof questionText !== 'string' || questionText.trim().length === 0) {
          errors.push('Question ' + i + ': Question text required');
          continue;
        }

        var difficulty = q.difficulty;
        if (typeof difficulty === 'string') {
          difficulty = difficulty.toLowerCase();
        }
        if (!difficulty) {
          difficulty = 'medium';
        }
        if (['easy', 'medium', 'hard'].indexOf(difficulty) === -1) {
          errors.push('Question ' + i + ': Invalid difficulty');
          continue;
        }

        var questionTypeRaw = (q.questionType !== undefined && q.questionType !== null)
          ? q.questionType
          : q.question_type;
        var questionType = typeof questionTypeRaw === 'string' ? questionTypeRaw.toLowerCase() : 'mcq';
        var allowedTypes = ['mcq', 'true_false', 'true_false_not_given', 'heading_match'];
        if (allowedTypes.indexOf(questionType) === -1) {
          errors.push('Question ' + i + ': Invalid question type');
          continue;
        }
        if (!allowedTypeMap[questionType]) {
          errors.push('Question ' + i + ': Question type not allowed');
          continue;
        }

        var options = q.options;
        if (questionType === 'true_false') {
          options = ['True', 'False'];
        } else if (questionType === 'true_false_not_given') {
          options = ['True', 'False', 'Not Given'];
        } else {
          if (typeof options === 'string') {
            try {
              options = JSON.parse(options);
            } catch (e) {
              errors.push('Question ' + i + ': Invalid options JSON');
              continue;
            }
          }
        }

        if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
          errors.push('Question ' + i + ': Options must be an array of 2 to 6 items');
          continue;
        }
        var hasInvalidOption = false;
        for (var oi = 0; oi < options.length; oi++) {
          if (typeof options[oi] !== 'string' || options[oi].trim().length === 0) {
            hasInvalidOption = true;
            break;
          }
        }
        if (hasInvalidOption) {
          errors.push('Question ' + i + ': All options must be non-empty strings');
          continue;
        }

        var correctIndexRaw = (q.correctIndex !== undefined && q.correctIndex !== null)
          ? q.correctIndex
          : q.correct_index;
        var correctIndex = typeof correctIndexRaw === 'number'
          ? correctIndexRaw
          : parseInt(correctIndexRaw, 10);
        if (!Number.isFinite(correctIndex) || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
          errors.push('Question ' + i + ': Invalid correct index');
          continue;
        }

        var questionId = nk.uuidv4();
        nk.sqlExec(
          `INSERT INTO questions (id, category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [questionId, qCategory, difficulty, questionText.trim(),
           JSON.stringify(options), correctIndex, q.explanation || '',
           q.sourceReference || q.source_reference || '', questionType, ctx.userId]
        );
        imported++;
      } catch (e) {
        errors.push('Question ' + i + ': ' + String(e));
      }
    }

    // Refresh all caches - use database categories
    var dbCategories = getCategoriesFromDb(nk, logger);
    for (var catId in dbCategories) {
      refreshQuestionCache(catId, nk, logger);
    }

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'question_bulk_import', 'question', '', null, { imported: imported, errors: errors.length });

    logger.info('Bulk import: ' + imported + ' questions imported by admin: ' + admin.telegramId);

    return JSON.stringify({ imported: imported, errors: errors });
  } catch (error) {
    logger.error('Bulk import error: ' + error);
    throw error;
  }
}

// RPC: Export questions
export function rpcAdminExportQuestions(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var category = request.category;

    var query = `SELECT id, category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type
                 FROM questions WHERE is_active = true`;
    var params: any[] = [];

    if (category) {
      query += ' AND category = $1';
      params.push(category);
    }

    query += ' ORDER BY category, difficulty';

    var result = nk.sqlQuery(query, params);
    var rows = Array.isArray(result) ? result : [];

    var questions: any[] = [];
    var errors: string[] = [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var options = row.options;
      try {
        if (Array.isArray(options) && options.length > 0 && typeof options[0] === 'number') {
          var byteString = '';
          for (var j = 0; j < options.length; j++) {
            byteString += String.fromCharCode(options[j]);
          }
          options = JSON.parse(byteString);
        } else if (typeof options === 'string') {
          options = JSON.parse(options);
        }
      } catch (parseError) {
        errors.push('Question ' + row.id + ': Invalid options JSON');
        continue;
      }

      if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
        errors.push('Question ' + row.id + ': Invalid options length');
        continue;
      }
      if (typeof row.correct_index !== 'number' || row.correct_index < 0 || row.correct_index >= options.length) {
        errors.push('Question ' + row.id + ': Invalid correct index');
        continue;
      }

      questions.push({
        category: row.category,
        difficulty: row.difficulty,
        questionText: row.question_text,
        options: options,
        correctIndex: row.correct_index,
        questionType: row.question_type || 'mcq',
        explanation: row.explanation,
        sourceReference: row.source_reference,
      });
    }

    return JSON.stringify({ questions: questions, total: questions.length, errors: errors });
  } catch (error) {
    logger.error('Export questions error: ' + error);
    throw error;
  }
}

// RPC: Force refresh all question caches (for immediate effect after category changes)
export function rpcAdminRefreshQuestionCache(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var category = request.category; // Optional: refresh specific category

    var refreshedCategories: string[] = [];

    if (category) {
      // Refresh specific category
      refreshQuestionCache(category, nk, logger);
      refreshedCategories.push(category);
    } else {
      // Refresh all categories from database
      var allCategories = getCategoriesFromDb(nk, logger);
      for (var catId in allCategories) {
        refreshQuestionCache(catId, nk, logger);
        refreshedCategories.push(catId);
      }
    }

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'cache_refresh', 'question_cache', '',
      null, { categories: refreshedCategories });

    logger.info('Question cache refreshed for ' + refreshedCategories.length + ' categories by admin: ' + admin.telegramId);

    return JSON.stringify({
      success: true,
      refreshedCategories: refreshedCategories,
      count: refreshedCategories.length,
    });
  } catch (error) {
    logger.error('Cache refresh error: ' + error);
    throw error;
  }
}

// RPC: List users
export function rpcAdminListUsers(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'users.view');
    var request = JSON.parse(payload || '{}');
    var search = request.search;
    var sortBy = request.sortBy || 'mmr';
    var sortOrder = (request.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    var banStatus = typeof request.banStatus === 'string' ? request.banStatus.toLowerCase() : '';
    var activityBucket = typeof request.activityBucket === 'string' ? request.activityBucket.toLowerCase() : '';
    var rankTier = typeof request.rankTier === 'string' ? request.rankTier.toLowerCase().trim() : '';
    var limit = Math.min(request.limit || 20, 100);
    var offset = request.offset || 0;

    // Get users from storage
    var users: any[] = [];

    // Build query with optional search filter
    var queryParams: any[] = [];
    var whereClause = "s.collection = 'player_data' AND s.key = 'global_mmr'";

    if (search && search.trim()) {
      var trimmed = search.toLowerCase().trim();
      var searchPattern = '%' + trimmed + '%';
      var isNumericSearch = /^[0-9]+$/.test(trimmed);
      var searchClauses = [
        'LOWER(u.username) LIKE $1',
        "LOWER(COALESCE(u.display_name, '')) LIKE $1",
        "LOWER(COALESCE(s.value->>'firstName', '')) LIKE $1",
        "LOWER(COALESCE(s.value->>'displayName', '')) LIKE $1",
      ];
      queryParams.push(searchPattern);
      if (isNumericSearch) {
        searchClauses.push("COALESCE(s.value->>'telegramId', '') = $" + (queryParams.length + 1));
        searchClauses.push('u.id::text = $' + (queryParams.length + 1));
        queryParams.push(trimmed);
      }
      whereClause += ' AND (' + searchClauses.join(' OR ') + ')';
    }

    if (banStatus === 'banned') {
      whereClause += ` AND EXISTS (
        SELECT 1
        FROM user_bans ub
        WHERE ub.user_id = u.id
          AND ub.is_active = true
          AND (ub.is_permanent = true OR ub.expires_at > NOW())
      )`;
    } else if (banStatus === 'active') {
      whereClause += ` AND NOT EXISTS (
        SELECT 1
        FROM user_bans ub
        WHERE ub.user_id = u.id
          AND ub.is_active = true
          AND (ub.is_permanent = true OR ub.expires_at > NOW())
      )`;
    }

    if (rankTier) {
      queryParams.push(rankTier);
      whereClause += " AND LOWER(COALESCE(s.value->>'rankTier', 'bronze')) = $" + queryParams.length;
    }

    if (activityBucket === 'active_24h') {
      whereClause += ` AND u.update_time >= NOW() - INTERVAL '1 day'`;
    } else if (activityBucket === 'active_7d') {
      whereClause += ` AND u.update_time >= NOW() - INTERVAL '7 days'`;
    } else if (activityBucket === 'active_30d') {
      whereClause += ` AND u.update_time >= NOW() - INTERVAL '30 days'`;
    } else if (activityBucket === 'dormant_30d') {
      whereClause += ` AND u.update_time < NOW() - INTERVAL '30 days'`;
    }

    queryParams.push(limit);
    queryParams.push(offset);
    var limitParam = '$' + (queryParams.length - 1);
    var offsetParam = '$' + queryParams.length;

    var sortColumns: { [key: string]: string } = {
      lastActiveAt: 'u.update_time',
      mmr: "(s.value->>'mmr')::int",
      gamesPlayed: "COALESCE((s.value->>'gamesPlayed')::int, 0)",
      winRate: "CASE WHEN COALESCE((s.value->>'gamesPlayed')::int, 0) > 0 THEN (COALESCE((s.value->>'wins')::float, 0) / (s.value->>'gamesPlayed')::float) ELSE 0 END",
      createdAt: 'u.create_time',
    };
    var orderBy = sortColumns[sortBy] || sortColumns.mmr;

    var result = nk.sqlQuery(
      `SELECT s.user_id, s.value, u.username, u.display_name, u.avatar_url, u.create_time, u.update_time
       FROM storage s
       JOIN users u ON s.user_id = u.id
       WHERE ${whereClause}
       ORDER BY ${orderBy} ${sortOrder}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      queryParams
    );

    var rows = Array.isArray(result) ? result : [];

    // Collect user IDs to batch check ban status
    var userIds = rows.map(function(row: any) { return row.user_id; });
    var bannedUserIds: {[key: string]: boolean} = {};

    // Batch query ban status for all users in this page
    if (userIds.length > 0) {
      try {
        var placeholders = userIds.map(function(_: any, i: number) { return '$' + (i + 1); }).join(',');
        var banCheckResult = nk.sqlQuery(
          'SELECT user_id FROM user_bans WHERE user_id IN (' + placeholders + ') AND is_active = true AND (is_permanent = true OR expires_at > NOW())',
          userIds
        );
        var banRows = Array.isArray(banCheckResult) ? banCheckResult : [];
        for (var i = 0; i < banRows.length; i++) {
          bannedUserIds[banRows[i].user_id] = true;
        }
      } catch (e) {
        logger.warn('Error checking ban status: ' + e);
      }
    }

    users = rows.map(function(row: any) {
      var value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return {
        userId: row.user_id,
        username: row.username || '',
        displayName: row.display_name || value.displayName || '',
        avatarUrl: row.avatar_url || '',
        telegramId: value.telegramId || 0,
        mmr: value.mmr || 1000,
        rankTier: value.rankTier || 'bronze',
        gamesPlayed: value.gamesPlayed || 0,
        wins: value.wins || 0,
        losses: value.losses || 0,
        winRate: value.gamesPlayed > 0 ? (value.wins / value.gamesPlayed * 100) : 0,
        isBanned: !!bannedUserIds[row.user_id],
        createdAt: row.create_time,
        lastActiveAt: row.update_time,
      };
    });

    // Get total count with same filter as main query
    var countParams: any[] = [];
    var countWhereClause = "s.collection = 'player_data' AND s.key = 'global_mmr'";
    if (search && search.trim()) {
      var countTrimmed = search.toLowerCase().trim();
      var countSearchPattern = '%' + countTrimmed + '%';
      var countIsNumericSearch = /^[0-9]+$/.test(countTrimmed);
      var countSearchClauses = [
        'LOWER(u.username) LIKE $1',
        "LOWER(COALESCE(u.display_name, '')) LIKE $1",
        "LOWER(COALESCE(s.value->>'firstName', '')) LIKE $1",
        "LOWER(COALESCE(s.value->>'displayName', '')) LIKE $1",
      ];
      countParams.push(countSearchPattern);
      if (countIsNumericSearch) {
        countSearchClauses.push("COALESCE(s.value->>'telegramId', '') = $" + (countParams.length + 1));
        countSearchClauses.push('u.id::text = $' + (countParams.length + 1));
        countParams.push(countTrimmed);
      }
      countWhereClause += ' AND (' + countSearchClauses.join(' OR ') + ')';
    }
    if (banStatus === 'banned') {
      countWhereClause += ` AND EXISTS (
        SELECT 1
        FROM user_bans ub
        WHERE ub.user_id = u.id
          AND ub.is_active = true
          AND (ub.is_permanent = true OR ub.expires_at > NOW())
      )`;
    } else if (banStatus === 'active') {
      countWhereClause += ` AND NOT EXISTS (
        SELECT 1
        FROM user_bans ub
        WHERE ub.user_id = u.id
          AND ub.is_active = true
          AND (ub.is_permanent = true OR ub.expires_at > NOW())
      )`;
    }
    if (rankTier) {
      countParams.push(rankTier);
      countWhereClause += " AND LOWER(COALESCE(s.value->>'rankTier', 'bronze')) = $" + countParams.length;
    }
    if (activityBucket === 'active_24h') {
      countWhereClause += ` AND u.update_time >= NOW() - INTERVAL '1 day'`;
    } else if (activityBucket === 'active_7d') {
      countWhereClause += ` AND u.update_time >= NOW() - INTERVAL '7 days'`;
    } else if (activityBucket === 'active_30d') {
      countWhereClause += ` AND u.update_time >= NOW() - INTERVAL '30 days'`;
    } else if (activityBucket === 'dormant_30d') {
      countWhereClause += ` AND u.update_time < NOW() - INTERVAL '30 days'`;
    }
    var countResult = nk.sqlQuery(
      `SELECT COUNT(*) as count FROM storage s JOIN users u ON s.user_id = u.id WHERE ${countWhereClause}`,
      countParams
    );
    var countRows = Array.isArray(countResult) ? countResult : [];
    var total = countRows.length > 0 ? parseInt(countRows[0].count) : 0;

    return JSON.stringify({
      items: users,
      total: total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error('List users error: ' + error);
    throw error;
  }
}

// RPC: Get user details
export function rpcAdminGetUser(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'users.view');
    var request = JSON.parse(payload || '{}');
    var userId = request.userId;

    if (!userId) {
      throw new Error('User ID required');
    }

    var reads: nkruntime.StorageReadRequest[] = [
      {
        collection: 'player_data',
        key: 'global_mmr',
        userId: userId,
      },
      {
        collection: 'player_data',
        key: 'category_mmr',
        userId: userId,
      },
      {
        collection: 'player_data',
        key: 'stats',
        userId: userId,
      },
    ];
    var results = nk.storageRead(reads);
    var globalMmr = null as any;
    var categoryMmr = {} as any;
    var stats = {} as any;

    for (var resultIndex = 0; resultIndex < (results || []).length; resultIndex++) {
      var storageObject = results[resultIndex];
      if (!storageObject) continue;
      if (storageObject.key === 'global_mmr') {
        globalMmr = storageObject.value || {};
      } else if (storageObject.key === 'category_mmr') {
        categoryMmr = storageObject.value || {};
      } else if (storageObject.key === 'stats') {
        stats = storageObject.value || {};
      }
    }

    if (!globalMmr) {
      throw new Error('User not found');
    }
    var account = { username: '', displayName: '', avatarUrl: '', createdAt: null as any, updatedAt: null as any };
    try {
      var userResult = nk.sqlQuery(
        'SELECT username, display_name, avatar_url, create_time, update_time FROM users WHERE id = $1',
        [userId]
      );
      var userRows = Array.isArray(userResult) ? userResult : [];
      if (userRows.length > 0) {
        account = {
          username: userRows[0].username || '',
          displayName: userRows[0].display_name || '',
          avatarUrl: userRows[0].avatar_url || '',
          createdAt: userRows[0].create_time,
          updatedAt: userRows[0].update_time,
        };
      }
    } catch (e) {
      logger.warn('Error reading user account info: ' + e);
    }

    // Check ban status
    var isBanned = false;
    try {
      var banResult = nk.sqlQuery(
        `SELECT id FROM user_bans WHERE user_id = $1 AND is_active = true AND (is_permanent = true OR expires_at > NOW()) LIMIT 1`,
        [userId]
      );
      var banRows = Array.isArray(banResult) ? banResult : [];
      isBanned = banRows.length > 0;
    } catch (e) {}

    var categoryStats: { [key: string]: { mmr: number; gamesPlayed: number; wins: number } } = {};
    if (categoryMmr && typeof categoryMmr === 'object' && !Array.isArray(categoryMmr)) {
      for (var categoryKey in categoryMmr) {
        if (!Object.prototype.hasOwnProperty.call(categoryMmr, categoryKey)) continue;
        var categoryValue = categoryMmr[categoryKey] || {};
        categoryStats[categoryKey] = {
          mmr: parseInt(categoryValue.mmr, 10) || GAME_CONFIG.STARTING_MMR,
          gamesPlayed: parseInt(categoryValue.gamesPlayed, 10) || 0,
          wins: parseInt(categoryValue.wins, 10) || 0,
        };
      }
    }

    var recentMatches: any[] = [];
    try {
      var recentMatchResult = nk.sqlQuery(
        `SELECT m.match_id, m.category, m.player1_id, m.player2_id, m.player1_score, m.player2_score, m.winner_id, m.completed_at,
                COALESCE(u1.display_name, u1.username, 'Unknown') as player1_name,
                COALESCE(u2.display_name, u2.username, 'Unknown') as player2_name
         FROM match_history m
         LEFT JOIN users u1 ON m.player1_id = u1.id
         LEFT JOIN users u2 ON m.player2_id = u2.id
         WHERE m.player1_id = $1 OR m.player2_id = $1
         ORDER BY m.completed_at DESC
         LIMIT 10`,
        [userId]
      );
      var recentMatchRows = Array.isArray(recentMatchResult) ? recentMatchResult : [];
      recentMatches = recentMatchRows.map(function(row: any) {
        return {
          matchId: row.match_id,
          category: row.category || '',
          player1Id: row.player1_id || '',
          player1Name: row.player1_name || 'Unknown',
          player1Score: parseInt(row.player1_score, 10) || 0,
          player2Id: row.player2_id || '',
          player2Name: row.player2_name || 'Unknown',
          player2Score: parseInt(row.player2_score, 10) || 0,
          winnerId: row.winner_id || null,
          completedAt: row.completed_at,
        };
      });
    } catch (recentMatchError) {
      logger.warn('Failed to load recent matches for user ' + userId + ': ' + recentMatchError);
    }

    var banHistory: any[] = [];
    try {
      var banHistoryResult = nk.sqlQuery(
        `SELECT b.*,
                banned_by_user.username as banned_by_username,
                banned_by_user.display_name as banned_by_display_name,
                unbanned_by_user.username as unbanned_by_username,
                unbanned_by_user.display_name as unbanned_by_display_name
         FROM user_bans b
         LEFT JOIN users banned_by_user ON b.banned_by = banned_by_user.id
         LEFT JOIN users unbanned_by_user ON b.unbanned_by = unbanned_by_user.id
         WHERE b.user_id = $1
         ORDER BY b.created_at DESC
         LIMIT 10`,
        [userId]
      );
      var banHistoryRows = Array.isArray(banHistoryResult) ? banHistoryResult : [];
      banHistory = banHistoryRows.map(function(row: any) {
        return {
          id: row.id,
          userId: row.user_id,
          username: account.username || '',
          telegramId: row.telegram_id || 0,
          bannedBy: row.banned_by || '',
          bannedByName: row.banned_by_display_name || row.banned_by_username || 'System',
          reason: row.reason || '',
          isPermanent: row.is_permanent === true,
          expiresAt: row.expires_at,
          isActive: row.is_active === true,
          createdAt: row.created_at,
          unbannedAt: row.unbanned_at,
          unbannedBy: row.unbanned_by || null,
          unbannedByName: row.unbanned_by_display_name || row.unbanned_by_username || null,
        };
      });
    } catch (banHistoryError) {
      logger.warn('Failed to load ban history for user ' + userId + ': ' + banHistoryError);
    }

    var mmrHistory: any[] = [];
    try {
      var mmrHistoryResult = nk.sqlQuery(
        `SELECT m.*,
                admin_user.username as adjusted_by_username,
                admin_user.display_name as adjusted_by_display_name
         FROM mmr_adjustments m
         LEFT JOIN users admin_user ON m.adjusted_by = admin_user.id
         WHERE m.user_id = $1
         ORDER BY m.created_at DESC
         LIMIT 10`,
        [userId]
      );
      var mmrHistoryRows = Array.isArray(mmrHistoryResult) ? mmrHistoryResult : [];
      mmrHistory = mmrHistoryRows.map(function(row: any) {
        return {
          id: row.id,
          userId: row.user_id,
          adjustedBy: row.adjusted_by || '',
          adjustedByName: row.adjusted_by_display_name || row.adjusted_by_username || 'Unknown',
          oldMmr: parseInt(row.old_mmr, 10) || 0,
          newMmr: parseInt(row.new_mmr, 10) || 0,
          reason: row.reason || '',
          createdAt: row.created_at,
        };
      });
    } catch (mmrHistoryError) {
      logger.warn('Failed to load MMR history for user ' + userId + ': ' + mmrHistoryError);
    }

    var totalScore = parseInt(stats.totalScore, 10) || 0;
    var averageScore = parseFloat(stats.averageScore);
    if (!Number.isFinite(averageScore)) {
      averageScore = 0;
    }

    return JSON.stringify({
      user: {
        userId: userId,
        username: account.username || '',
        displayName: globalMmr.displayName || account.displayName || '',
        avatarUrl: account.avatarUrl || '',
        telegramId: globalMmr.telegramId || 0,
        mmr: globalMmr.mmr || 1000,
        peakMmr: globalMmr.peakMmr || globalMmr.mmr || 1000,
        rankTier: globalMmr.rankTier || 'bronze',
        gamesPlayed: globalMmr.gamesPlayed || 0,
        wins: globalMmr.wins || 0,
        losses: globalMmr.losses || 0,
        winRate: globalMmr.gamesPlayed > 0 ? (globalMmr.wins / globalMmr.gamesPlayed * 100) : 0,
        isBanned: isBanned,
        createdAt: account.createdAt,
        lastActiveAt: account.updatedAt,
        totalScore: totalScore,
        averageScore: averageScore,
        bestStreak: globalMmr.bestStreak || 0,
        categoryStats: categoryStats,
        recentMatches: recentMatches,
        banHistory: banHistory,
        mmrHistory: mmrHistory,
      },
    });
  } catch (error) {
    logger.error('Get user error: ' + error);
    throw error;
  }
}

// RPC: Update user MMR
export function rpcAdminUpdateUserMmr(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'users.adjust_mmr');
    var request = JSON.parse(payload || '{}');
    var userId = request.userId;
    var newMmr = request.newMmr;
    var reason = request.reason;

    if (!userId || typeof newMmr !== 'number' || !reason) {
      throw new Error('User ID, new MMR, and reason required');
    }

    // Validate MMR is within reasonable range
    var mmrFloor = getMmrFloor(nk, logger);
    var mmrCeiling = getMmrCeiling(nk, logger);
    if (!Number.isFinite(newMmr) || newMmr < mmrFloor || newMmr > mmrCeiling) {
      throw new Error('MMR must be between ' + mmrFloor + ' and ' + mmrCeiling);
    }

    // Validate reason is not empty and is reasonably sized
    if (typeof reason !== 'string' || reason.trim().length < 5) {
      throw new Error('Reason must be at least 5 characters');
    }
    if (reason.length > 500) {
      throw new Error('Reason must be less than 500 characters');
    }

    // Get current MMR
    var reads: nkruntime.StorageReadRequest[] = [{
      collection: 'player_data',
      key: 'global_mmr',
      userId: userId,
    }];
    var results = nk.storageRead(reads);

    if (!results || results.length === 0) {
      throw new Error('User not found');
    }

    var value = results[0].value;
    var oldMmr = value.mmr || 1000;

    // Safety check: limit maximum single adjustment to +/-1000
    // This prevents accidental extreme changes (typos like 100 instead of 1000)
    var adjustment = Math.abs(newMmr - oldMmr);
    var MAX_SINGLE_ADJUSTMENT = 1000;
    if (adjustment > MAX_SINGLE_ADJUSTMENT) {
      throw new Error('Maximum single adjustment is +/-' + MAX_SINGLE_ADJUSTMENT + ' MMR. Current change: ' + adjustment + '. Make multiple smaller adjustments if needed.');
    }

    // Update MMR
    value.mmr = clampMmr(nk, logger, newMmr);
    value.rankTier = getRankTierKeyForMmr(nk, logger, value.mmr);
    if (newMmr > (value.peakMmr || 0)) {
      value.peakMmr = newMmr;
    }

    var writes: nkruntime.StorageWriteRequest[] = [{
      collection: 'player_data',
      key: 'global_mmr',
      userId: userId,
      value: value,
      permissionRead: 2,
      permissionWrite: 0,
    }];
    nk.storageWrite(writes);

    // Update leaderboard
    var leaderboardName = getLeaderboardDisplayName(nk, logger, userId, value.displayName || '');
    nk.leaderboardRecordWrite('global_mmr', userId, leaderboardName, value.mmr);
    updateTimeBasedLeaderboards(nk, logger, userId, leaderboardName, value.mmr);

    // Record adjustment
    try {
      nk.sqlExec(
        `INSERT INTO mmr_adjustments (user_id, user_telegram_id, adjusted_by, old_mmr, new_mmr, adjustment, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, value.telegramId || 0, ctx.userId, oldMmr, newMmr, newMmr - oldMmr, reason]
      );
    } catch (e) {
      logger.warn('Failed to record MMR adjustment: ' + e);
    }

    // Log action
    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'mmr_adjust', 'user', userId,
      { mmr: oldMmr }, { mmr: newMmr, reason: reason });

    logger.info('MMR adjusted for user ' + userId + ': ' + oldMmr + ' -> ' + newMmr + ' by admin: ' + admin.telegramId);

    return JSON.stringify({ success: true, oldMmr: oldMmr, newMmr: newMmr });
  } catch (error) {
    logger.error('Update MMR error: ' + error);
    throw error;
  }
}

// RPC: Start full ranked reset job
export function rpcAdminStartRankedReset(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var reason = String(request.reason || '').trim();
    var confirmText = String(request.confirmText || '').trim();
    var maintenanceConfirmed = request.maintenanceConfirmed === true;

    if (!maintenanceConfirmed) {
      throw new Error('Maintenance window confirmation is required');
    }
    if (confirmText !== RANKED_RESET_CONFIRM_TEXT) {
      throw new Error('Confirmation text mismatch');
    }
    if (reason.length < 10) {
      throw new Error('Reason must be at least 10 characters');
    }
    if (reason.length > 500) {
      throw new Error('Reason must be less than 500 characters');
    }

    var existingJob = getRankedResetJob(nk, logger);
    if (existingJob && (existingJob.status === 'pending' || existingJob.status === 'in_progress')) {
      throw new Error('A ranked reset job is already running');
    }

    var activeMatches = nk.matchList(1000, true, undefined, undefined, undefined, undefined);
    var activeMatchCount = activeMatches ? activeMatches.length : 0;
    if (activeMatchCount > 0) {
      throw new Error('Cannot start reset while matches are active (' + activeMatchCount + ')');
    }

    var totalPlayers = getRankedResetTotalPlayers(nk);
    var categoryLeaderboards = getRankedResetCategoryLeaderboardIds(nk, logger);
    var now = Date.now();
    var job = {
      jobId: nk.uuidv4(),
      status: 'in_progress',
      stage: 'reset_players',
      reason: reason,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      requestedBy: ctx.userId || '',
      requestedByTelegramId: admin.telegramId,
      totals: {
        players: totalPlayers,
        categoryLeaderboards: categoryLeaderboards.length,
      },
      progress: {
        playersProcessed: 0,
        playersTotal: totalPlayers,
        categoryBoardsProcessed: 0,
        categoryBoardsTotal: categoryLeaderboards.length,
        categoryRecordsDeleted: 0,
        matchHistoryRowsDeleted: 0,
      },
      cursor: {
        playerOffset: 0,
        categoryBoardIndex: 0,
      },
      categoryLeaderboardIds: categoryLeaderboards,
      error: null,
    };
    saveRankedResetJob(nk, logger, job);

    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'mmr_reset_all',
      'game_config',
      job.jobId,
      existingJob || null,
      {
        status: job.status,
        stage: job.stage,
        reason: reason,
        totals: job.totals,
      },
      { maintenanceConfirmed: true, activeMatches: activeMatchCount }
    );

    return JSON.stringify(getRankedResetResponse(job));
  } catch (error) {
    logger.error('Start ranked reset error: ' + error);
    throw error;
  }
}

// RPC: Continue ranked reset job in safe chunks
export function rpcAdminContinueRankedReset(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var admin = requireSuperAdmin(ctx, nk, logger);
  var request = JSON.parse(payload || '{}');
  var requestedJobId = String(request.jobId || '').trim();
  if (!requestedJobId) {
    throw new Error('jobId is required');
  }

  var job = getRankedResetJob(nk, logger);
  if (!job) {
    throw new Error('No ranked reset job found');
  }
  if (job.jobId !== requestedJobId) {
    throw new Error('Job ID mismatch');
  }
  if (job.status === 'completed' || job.status === 'failed') {
    return JSON.stringify(getRankedResetResponse(job));
  }

  try {
    if (!job.progress || typeof job.progress !== 'object') {
      job.progress = {
        playersProcessed: 0,
        playersTotal: Number(job?.totals?.players) || 0,
        categoryBoardsProcessed: 0,
        categoryBoardsTotal: Number(job?.totals?.categoryLeaderboards) || 0,
        categoryRecordsDeleted: 0,
        matchHistoryRowsDeleted: 0,
      };
    }
    if (!job.cursor || typeof job.cursor !== 'object') {
      job.cursor = { playerOffset: 0, categoryBoardIndex: 0 };
    }

    if (job.stage === 'reset_players') {
      var playerOffset = Math.max(0, Math.floor(Number(job.cursor.playerOffset) || 0));
      var playersTotal = Math.max(0, Math.floor(Number(job.progress.playersTotal) || 0));

      if (playerOffset >= playersTotal) {
        job.stage = 'wipe_ranked_history';
      } else {
        var batchUserIds = getRankedResetPlayerBatch(nk, playerOffset, RANKED_RESET_PLAYER_BATCH_SIZE);
        if (batchUserIds.length === 0) {
          job.cursor.playerOffset = playersTotal;
          job.progress.playersProcessed = playersTotal;
          job.stage = 'wipe_ranked_history';
        } else {
          var reads: nkruntime.StorageReadRequest[] = [];
          for (var r = 0; r < batchUserIds.length; r++) {
            reads.push({ collection: 'player_data', key: 'global_mmr', userId: batchUserIds[r] });
            reads.push({ collection: 'player_data', key: 'category_mmr', userId: batchUserIds[r] });
          }
          var results = nk.storageRead(reads);
          var globalByUser: {[key: string]: any} = {};
          for (var i = 0; i < results.length; i++) {
            if (results[i] && results[i].key === 'global_mmr') {
              globalByUser[results[i].userId] = results[i].value;
            }
          }

          var writes: nkruntime.StorageWriteRequest[] = [];
          var deletes: nkruntime.StorageDeleteRequest[] = [];
          for (var u = 0; u < batchUserIds.length; u++) {
            var userId = batchUserIds[u];
            var nextGlobal = buildResetGlobalMmrValue(globalByUser[userId]);
            writes.push({
              collection: 'player_data',
              key: 'global_mmr',
              userId: userId,
              value: nextGlobal,
              permissionRead: 2,
              permissionWrite: 0,
            });
            writes.push({
              collection: 'player_data',
              key: 'category_mmr',
              userId: userId,
              value: {},
              permissionRead: 2,
              permissionWrite: 0,
            });
            deletes.push({
              collection: 'player_data',
              key: 'match_history',
              userId: userId,
            });
          }

          if (writes.length > 0) {
            nk.storageWrite(writes);
          }
          if (deletes.length > 0) {
            nk.storageDelete(deletes);
          }

          for (var lb = 0; lb < batchUserIds.length; lb++) {
            var leaderboardUserId = batchUserIds[lb];
            var displayName = getLeaderboardDisplayName(nk, logger, leaderboardUserId, '');
            try {
              nk.leaderboardRecordWrite('global_mmr', leaderboardUserId, displayName, GAME_CONFIG.STARTING_MMR);
              updateTimeBasedLeaderboards(nk, logger, leaderboardUserId, displayName, GAME_CONFIG.STARTING_MMR);
            } catch (leaderboardError) {
              logger.warn('Failed to reset global leaderboard record for ' + leaderboardUserId + ': ' + leaderboardError);
            }
          }

          playerOffset += batchUserIds.length;
          if (playerOffset > playersTotal) playerOffset = playersTotal;
          job.cursor.playerOffset = playerOffset;
          job.progress.playersProcessed = playerOffset;
          if (playerOffset >= playersTotal) {
            job.stage = 'wipe_ranked_history';
          }
        }
      }
    }

    if (job.stage === 'wipe_ranked_history') {
      var deleteResult = nk.sqlExec(`DELETE FROM match_history`);
      var rowsAffected = Number((deleteResult as any)?.rowsAffected);
      job.progress.matchHistoryRowsDeleted = Number.isFinite(rowsAffected) && rowsAffected >= 0 ? rowsAffected : 0;
      job.stage = 'clear_category_leaderboards';
    }

    if (job.stage === 'clear_category_leaderboards') {
      var leaderboardIds = Array.isArray(job.categoryLeaderboardIds) ? job.categoryLeaderboardIds : [];
      var boardIndex = Math.max(0, Math.floor(Number(job.cursor.categoryBoardIndex) || 0));
      var didDeleteBatch = false;

      while (boardIndex < leaderboardIds.length) {
        var boardId = String(leaderboardIds[boardIndex] || '');
        if (!boardId) {
          boardIndex++;
          continue;
        }

        var records = nk.leaderboardRecordsList(
          boardId,
          [],
          RANKED_RESET_LEADERBOARD_DELETE_BATCH_SIZE,
          undefined,
          0
        );
        var rows = records && records.records ? records.records : [];

        if (rows.length === 0) {
          boardIndex++;
          job.cursor.categoryBoardIndex = boardIndex;
          job.progress.categoryBoardsProcessed = boardIndex;
          continue;
        }

        var deleted = 0;
        for (var d = 0; d < rows.length; d++) {
          var ownerId = rows[d]?.ownerId || '';
          if (!ownerId) continue;
          try {
            nk.leaderboardRecordDelete(boardId, ownerId);
            deleted++;
          } catch (deleteError) {
            logger.warn('Failed to delete leaderboard record ' + boardId + '/' + ownerId + ': ' + deleteError);
          }
        }
        job.progress.categoryRecordsDeleted = (Number(job.progress.categoryRecordsDeleted) || 0) + deleted;
        didDeleteBatch = true;
        break;
      }

      if (!didDeleteBatch && boardIndex >= leaderboardIds.length) {
        job.cursor.categoryBoardIndex = leaderboardIds.length;
        job.progress.categoryBoardsProcessed = leaderboardIds.length;
        job.stage = 'complete';
        job.status = 'completed';
        job.completedAt = Date.now();
      }
    }

    job.updatedAt = Date.now();
    saveRankedResetJob(nk, logger, job);

    if (job.status === 'completed') {
      logAdminAction(
        nk,
        logger,
        ctx.userId || '',
        admin.telegramId,
        'mmr_reset_all',
        'game_config',
        job.jobId,
        { status: 'in_progress' },
        {
          status: 'completed',
          playersProcessed: job.progress.playersProcessed,
          playersTotal: job.progress.playersTotal,
          categoryBoardsProcessed: job.progress.categoryBoardsProcessed,
          categoryBoardsTotal: job.progress.categoryBoardsTotal,
          categoryRecordsDeleted: job.progress.categoryRecordsDeleted,
          matchHistoryRowsDeleted: job.progress.matchHistoryRowsDeleted,
        },
        null
      );
    }

    return JSON.stringify(getRankedResetResponse(job));
  } catch (error) {
    job.status = 'failed';
    job.error = String(error);
    job.updatedAt = Date.now();
    saveRankedResetJob(nk, logger, job);
    logger.error('Continue ranked reset error: ' + error);
    return JSON.stringify(getRankedResetResponse(job));
  }
}

// RPC: Get ranked reset job status
export function rpcAdminGetRankedResetStatus(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireSuperAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var requestedJobId = String(request.jobId || '').trim();
    var job = getRankedResetJob(nk, logger);
    if (!job) {
      throw new Error('No ranked reset job found');
    }
    if (requestedJobId && requestedJobId !== job.jobId) {
      throw new Error('Job ID mismatch');
    }
    return JSON.stringify(getRankedResetResponse(job));
  } catch (error) {
    logger.error('Get ranked reset status error: ' + error);
    throw error;
  }
}

// RPC: Ban user
export function rpcAdminBanUser(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'users.ban');
    var request = JSON.parse(payload || '{}');
    var userId = request.userId;
    var reason = request.reason;
    var permanent = request.permanent || false;
    var duration = request.duration; // in seconds

    if (!userId || !reason) {
      throw new Error('User ID and reason required');
    }

    // Get user telegram ID
    var reads: nkruntime.StorageReadRequest[] = [{
      collection: 'player_data',
      key: 'global_mmr',
      userId: userId,
    }];
    var results = nk.storageRead(reads);
    var telegramId = results && results.length > 0 ? results[0].value.telegramId : null;

    var expiresAt = null;
    if (!permanent && duration) {
      expiresAt = new Date(Date.now() + duration * 1000).toISOString();
    }

    var banId = nk.uuidv4();
    nk.sqlExec(
      `INSERT INTO user_bans (id, user_id, telegram_id, banned_by, reason, is_permanent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [banId, userId, telegramId, ctx.userId, reason, permanent, expiresAt]
    );

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'user_ban', 'user', userId, null, { reason: reason, permanent: permanent });

    logger.info('User banned: ' + userId + ' by admin: ' + admin.telegramId);

    return JSON.stringify({ success: true, banId: banId });
  } catch (error) {
    logger.error('Ban user error: ' + error);
    throw error;
  }
}

// RPC: Unban user
export function rpcAdminUnbanUser(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'users.unban');
    var request = JSON.parse(payload || '{}');
    var userId = request.userId;

    if (!userId) {
      throw new Error('User ID required');
    }

    nk.sqlExec(
      `UPDATE user_bans SET is_active = false, unbanned_at = NOW(), unbanned_by = $1 WHERE user_id = $2 AND is_active = true`,
      [ctx.userId, userId]
    );

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'user_unban', 'user', userId, null, null);

    logger.info('User unbanned: ' + userId + ' by admin: ' + admin.telegramId);

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Unban user error: ' + error);
    throw error;
  }
}

// RPC: List matches
export function rpcAdminListMatches(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'matches.view');
    var request = JSON.parse(payload || '{}');
    var category = request.category;
    var userId = request.userId;
    var limit = Math.min(request.limit || 20, 100);
    var offset = request.offset || 0;

    var conditions: string[] = [];
    var params: any[] = [];
    var paramIndex = 1;

    if (category) {
      conditions.push('category = $' + paramIndex++);
      params.push(category);
    }
    if (userId) {
      conditions.push('(player1_id = $' + paramIndex + ' OR player2_id = $' + paramIndex + ')');
      paramIndex++;
      params.push(userId);
    }

    var whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total
    var countResult = nk.sqlQuery('SELECT COUNT(*) as count FROM match_history ' + whereClause, params);
    var countRows = Array.isArray(countResult) ? countResult : [];
    var total = countRows.length > 0 ? parseInt(countRows[0].count) : 0;

    params.push(limit);
    params.push(offset);
    var result = nk.sqlQuery(
      `SELECT m.match_id, m.category, m.player1_id, m.player2_id, m.player1_score, m.player2_score, m.winner_id, m.completed_at,
              u1.username as player1_username, u2.username as player2_username
       FROM match_history m
       LEFT JOIN users u1 ON m.player1_id = u1.id
       LEFT JOIN users u2 ON m.player2_id = u2.id
       ${whereClause.replace('player1_id', 'm.player1_id').replace('player2_id', 'm.player2_id').replace('category', 'm.category')}
       ORDER BY m.completed_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    var rows = Array.isArray(result) ? result : [];
    var matches = rows.map(function(row: any) {
      return {
        matchId: row.match_id,
        category: row.category,
        player1Id: row.player1_id,
        player1Name: row.player1_username || 'Unknown',
        player1Score: row.player1_score,
        player2Id: row.player2_id,
        player2Name: row.player2_username || 'Unknown',
        player2Score: row.player2_score,
        winnerId: row.winner_id,
        completedAt: row.completed_at,
      };
    });

    return JSON.stringify({
      items: matches,
      total: total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error('List matches error: ' + error);
    throw error;
  }
}

// RPC: Get match details
export function rpcAdminGetMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'matches.view');
    var request = JSON.parse(payload || '{}');
    var matchId = request.matchId;

    if (!matchId) {
      throw new Error('Match ID required');
    }

    var result = nk.sqlQuery(
      `SELECT m.*, u1.username as player1_username, u2.username as player2_username
       FROM match_history m
       LEFT JOIN users u1 ON m.player1_id = u1.id
       LEFT JOIN users u2 ON m.player2_id = u2.id
       WHERE m.match_id = $1`,
      [matchId]
    );

    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      throw new Error('Match not found');
    }

    var row = rows[0];
    var questionsData = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : (row.questions_data || []);

    return JSON.stringify({
      match: {
        matchId: row.match_id,
        category: row.category,
        player1Id: row.player1_id,
        player1Name: row.player1_username || 'Unknown',
        player1Score: row.player1_score,
        player2Id: row.player2_id,
        player2Name: row.player2_username || 'Unknown',
        player2Score: row.player2_score,
        winnerId: row.winner_id,
        player1MmrBefore: row.player1_mmr_before,
        player1MmrAfter: row.player1_mmr_after,
        player2MmrBefore: row.player2_mmr_before,
        player2MmrAfter: row.player2_mmr_after,
        durationSeconds: row.duration_seconds,
        questionsData: questionsData,
        completedAt: row.completed_at,
      },
    });
  } catch (error) {
    logger.error('Get match error: ' + error);
    throw error;
  }
}

// RPC: List categories with stats (from database)
function getCategoryQuestionCountCap(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  categoryType: 'normal' | 'vocabulary'
): number {
  var caps = getQuestionCountCaps(nk, logger);
  return categoryType === 'vocabulary' ? caps.vocabularyMax : caps.normalMax;
}

function parseBooleanFlag(value: any, fallback: boolean): boolean {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 't') return true;
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'f') return false;
  return fallback;
}

function parseOptionalQuestionCountOverride(value: any): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  var parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

export function rpcAdminListCategories(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');
    var includeInactive = request.includeInactive || false;

    var categories: any[] = [];

    // Get all categories from database
    var whereClause = includeInactive ? '' : 'WHERE is_active = true';
    var catResult = nk.sqlQuery(
      `SELECT * FROM categories ${whereClause} ORDER BY display_order ASC`
    );
    var catRows = Array.isArray(catResult) ? catResult : [];
    var questionCountDefaults = getQuestionCountDefaults(nk, logger);
    var questionCountCaps = getQuestionCountCaps(nk, logger);

    // Get question counts per category
    var statsResult = nk.sqlQuery(
      `SELECT category,
              COUNT(*) as total,
              SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
              SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
              SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard
       FROM questions
       WHERE is_active = true
       GROUP BY category`
    );

    var statsRows = Array.isArray(statsResult) ? statsResult : [];
    var statsByCategory: {[key: string]: any} = {};
    for (var i = 0; i < statsRows.length; i++) {
      statsByCategory[statsRows[i].category] = {
        total: parseInt(statsRows[i].total) || 0,
        easy: parseInt(statsRows[i].easy) || 0,
        medium: parseInt(statsRows[i].medium) || 0,
        hard: parseInt(statsRows[i].hard) || 0,
      };
    }

    for (var j = 0; j < catRows.length; j++) {
      var cat = catRows[j];
      var stats = statsByCategory[cat.category_key] || { total: 0, easy: 0, medium: 0, hard: 0 };
      var categoryType = normalizeCategoryType(cat.category_type);
      var categoryCap = categoryType === 'vocabulary'
        ? questionCountCaps.vocabularyMax
        : questionCountCaps.normalMax;
      var categoryDefault = categoryType === 'vocabulary'
        ? questionCountDefaults.vocabularyDefault
        : questionCountDefaults.normalDefault;
      var questionOverride = parseOptionalQuestionCountOverride(cat.questions_per_match);
      var effectiveQuestionCount = questionOverride !== null ? questionOverride : categoryDefault;
      if (effectiveQuestionCount > categoryCap) {
        effectiveQuestionCount = categoryCap;
      }
      categories.push({
        id: cat.id,
        categoryKey: cat.category_key,
        name: cat.name,
        description: cat.description || '',
        icon: cat.icon || '',
        iconUrl: cat.icon_url || '',
        parentId: cat.parent_id,
        categoryType: categoryType,
        isActive: cat.is_active,
        minQuestionsRequired: cat.min_questions_required || 10,
        questionsPerMatch: effectiveQuestionCount,
        questionsPerMatchOverride: questionOverride,
        useGlobalQuestionCount: questionOverride === null,
        timePerQuestion: cat.time_per_question || 15,
        displayOrder: cat.display_order || 0,
        questionCount: stats.total,
        easyCount: stats.easy,
        mediumCount: stats.medium,
        hardCount: stats.hard,
        createdAt: cat.created_at,
        updatedAt: cat.updated_at,
      });
    }

    return JSON.stringify({ categories: categories });
  } catch (error) {
    logger.error('List categories error: ' + error);
    throw error;
  }
}

// RPC: Create category
export function rpcAdminCreateCategory(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'categories.manage');
    var request = JSON.parse(payload || '{}');
    var category = request.category;
    var categoryKey = String((category && category.categoryKey) || '').trim().toLowerCase();
    var categoryName = String((category && category.name) || '').trim();
    var categoryType = normalizeCategoryType(category ? category.categoryType || category.category_type : 'normal');
    var categoryQuestionCap = getCategoryQuestionCountCap(nk, logger, categoryType);
    var questionCountDefaults = getQuestionCountDefaults(nk, logger);
    var categoryDefaultQuestionCount = categoryType === 'vocabulary'
      ? questionCountDefaults.vocabularyDefault
      : questionCountDefaults.normalDefault;
    var minQuestionsRequiredRaw = category ? category.minQuestionsRequired : undefined;
    var questionsPerMatchRaw = category ? category.questionsPerMatch : undefined;
    var useGlobalQuestionCountRaw = category
      ? (category.useGlobalQuestionCount !== undefined
        ? category.useGlobalQuestionCount
        : category.use_global_question_count)
      : undefined;
    var timePerQuestionRaw = category ? category.timePerQuestion : undefined;
    var minQuestionsRequired = Number.isFinite(Number(minQuestionsRequiredRaw))
      ? Math.max(1, Math.floor(Number(minQuestionsRequiredRaw)))
      : 10;
    var parsedQuestionOverride = parseOptionalQuestionCountOverride(questionsPerMatchRaw);
    var hasQuestionOverride = parsedQuestionOverride !== null;
    var useGlobalQuestionCount = useGlobalQuestionCountRaw === undefined
      ? !hasQuestionOverride
      : parseBooleanFlag(useGlobalQuestionCountRaw, !hasQuestionOverride);
    var questionsPerMatchOverride = useGlobalQuestionCount ? null : parsedQuestionOverride;
    var timePerQuestion = Number.isFinite(Number(timePerQuestionRaw))
      ? Math.max(5, Math.floor(Number(timePerQuestionRaw)))
      : 15;

    if (!category) {
      throw new Error('Category data required');
    }

    if (!categoryKey || !categoryName) {
      throw new Error('Category key and name are required');
    }

    // Validate category key format (alphanumeric and underscores only)
    if (!/^[a-z0-9_]+$/.test(categoryKey)) {
      throw new Error('Category key must be lowercase alphanumeric with underscores only');
    }

    if (!useGlobalQuestionCount && questionsPerMatchOverride === null) {
      throw new Error('questionsPerMatch must be at least 1 when useGlobalQuestionCount is false');
    }

    if (questionsPerMatchOverride !== null && questionsPerMatchOverride > categoryQuestionCap) {
      throw new Error('questionsPerMatch exceeds max for ' + categoryType + ' categories (' + categoryQuestionCap + ')');
    }

    // Check if category key already exists (reactivate if it exists but is inactive).
    var existingResult = nk.sqlQuery(
      'SELECT id, is_active, display_order FROM categories WHERE category_key = $1',
      [categoryKey]
    );
    var existingRows = Array.isArray(existingResult) ? existingResult : [];
    var existingCategory = existingRows.length > 0 ? existingRows[0] : null;
    if (existingCategory && existingCategory.is_active) {
      throw new Error('Category key already exists');
    }

    // Get next display order if not provided
    var displayOrder = category.displayOrder;
    if (displayOrder === undefined || displayOrder === null) {
      if (existingCategory && existingCategory.display_order !== undefined && existingCategory.display_order !== null) {
        displayOrder = parseInt(existingCategory.display_order) || 0;
      } else {
        var orderResult = nk.sqlQuery('SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM categories');
        var orderRows = Array.isArray(orderResult) ? orderResult : [];
        displayOrder = orderRows.length > 0 ? parseInt(orderRows[0].next_order) : 1;
      }
    }

    var result: any;
    var reactivated = false;

    if (existingCategory) {
      reactivated = true;
      result = nk.sqlQuery(
        `UPDATE categories
         SET name = $1,
             description = $2,
             icon = $3,
             icon_url = $4,
             parent_id = $5,
             category_type = $6,
             is_active = $7,
             min_questions_required = $8,
             questions_per_match = $9,
             time_per_question = $10,
             display_order = $11,
             updated_at = NOW()
         WHERE id = $12
         RETURNING id, category_key, name, is_active, created_at`,
        [
          categoryName,
          category.description || '',
          category.icon || '',
          category.iconUrl || '',
          category.parentId || null,
          categoryType,
          category.isActive !== false,
          minQuestionsRequired,
          questionsPerMatchOverride,
          timePerQuestion,
          displayOrder,
          existingCategory.id,
        ]
      );
    } else {
      result = nk.sqlQuery(
        `INSERT INTO categories (category_key, name, description, icon, icon_url, parent_id, category_type, is_active, min_questions_required, questions_per_match, time_per_question, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, category_key, name, is_active, created_at`,
        [
          categoryKey,
          categoryName,
          category.description || '',
          category.icon || '',
          category.iconUrl || '',
          category.parentId || null,
          categoryType,
          category.isActive !== false,
          minQuestionsRequired,
          questionsPerMatchOverride,
          timePerQuestion,
          displayOrder,
        ]
      );
    }

    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      throw new Error('Failed to create category');
    }

    // Create leaderboard for the new category
    try {
      nk.leaderboardCreate(
        'category_' + categoryKey,
        true,
        'desc',
        'set',
        undefined
      );
      nk.leaderboardCreate(
        'category_' + categoryKey + '_daily',
        true,
        'desc',
        'set',
        '0 0 * * *'
      );
      nk.leaderboardCreate(
        'category_' + categoryKey + '_weekly',
        true,
        'desc',
        'set',
        '0 0 * * 1'
      );
      nk.leaderboardCreate(
        'category_' + categoryKey + '_monthly',
        true,
        'desc',
        'set',
        '0 0 1 * *'
      );
    } catch (leaderboardError) {
      logger.warn('Failed to create category leaderboard: ' + leaderboardError);
    }

    // Invalidate cache
    invalidateCategoriesCache();

    // Queue player-facing alerts when a category becomes available.
    enqueueCategoryNotificationCampaign(nk, logger, {
      id: String(rows[0].id),
      categoryKey: String(rows[0].category_key || categoryKey),
      name: String(rows[0].name || categoryName),
      isActive: rows[0].is_active === true || rows[0].is_active === 't' || rows[0].is_active === 'true',
      reactivated: reactivated,
    });

    // Log admin action
    logAdminAction(
      nk,
      logger,
      ctx.userId,
      admin.telegramId,
      reactivated ? 'category_reactivate' : 'category_create',
      'category',
      rows[0].id,
      existingCategory || null,
      category
    );

    var effectiveQuestionsPerMatch = questionsPerMatchOverride !== null
      ? questionsPerMatchOverride
      : categoryDefaultQuestionCount;
    if (effectiveQuestionsPerMatch > categoryQuestionCap) {
      effectiveQuestionsPerMatch = categoryQuestionCap;
    }

    return JSON.stringify({
      success: true,
      reactivated: reactivated,
      category: {
        id: rows[0].id,
        categoryKey: rows[0].category_key,
        name: rows[0].name,
        categoryType: categoryType,
        questionsPerMatch: effectiveQuestionsPerMatch,
        questionsPerMatchOverride: questionsPerMatchOverride,
        useGlobalQuestionCount: useGlobalQuestionCount,
        createdAt: rows[0].created_at,
      },
    });
  } catch (error) {
    logger.error('Create category error: ' + error);
    throw error;
  }
}

// RPC: Update category
export function rpcAdminUpdateCategory(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'categories.manage');
    var request = JSON.parse(payload || '{}');
    var categoryId = request.categoryId;
    var updates = request.updates;

    if (!categoryId || !updates) {
      throw new Error('Category ID and updates required');
    }

    // Get current category for audit log
    var currentResult = nk.sqlQuery('SELECT * FROM categories WHERE id = $1', [categoryId]);
    var currentRows = Array.isArray(currentResult) ? currentResult : [];
    if (currentRows.length === 0) {
      throw new Error('Category not found');
    }
    var oldCategory = currentRows[0];
    var requestedCategoryType = updates.categoryType !== undefined ? updates.categoryType : updates.category_type;
    var effectiveCategoryType = normalizeCategoryType(
      requestedCategoryType !== undefined ? requestedCategoryType : oldCategory.category_type
    );
    var categoryQuestionCap = getCategoryQuestionCountCap(nk, logger, effectiveCategoryType);
    var currentQuestionOverride = parseOptionalQuestionCountOverride(oldCategory.questions_per_match);
    var hasQuestionsPerMatchInput = Object.prototype.hasOwnProperty.call(updates, 'questionsPerMatch')
      || Object.prototype.hasOwnProperty.call(updates, 'questions_per_match');
    var questionsPerMatchInputRaw = updates.questionsPerMatch !== undefined
      ? updates.questionsPerMatch
      : updates.questions_per_match;
    var requestedQuestionOverride = hasQuestionsPerMatchInput
      ? parseOptionalQuestionCountOverride(questionsPerMatchInputRaw)
      : null;
    var useGlobalQuestionCountInputRaw = updates.useGlobalQuestionCount !== undefined
      ? updates.useGlobalQuestionCount
      : updates.use_global_question_count;
    var hasUseGlobalQuestionCountInput = useGlobalQuestionCountInputRaw !== undefined;
    var requestedUseGlobalQuestionCount = hasUseGlobalQuestionCountInput
      ? parseBooleanFlag(useGlobalQuestionCountInputRaw, currentQuestionOverride === null)
      : false;
    var nextQuestionOverride = currentQuestionOverride;
    var shouldUpdateQuestionOverride = false;

    if (hasUseGlobalQuestionCountInput) {
      shouldUpdateQuestionOverride = true;
      if (requestedUseGlobalQuestionCount) {
        nextQuestionOverride = null;
      } else if (hasQuestionsPerMatchInput) {
        if (requestedQuestionOverride === null) {
          throw new Error('questionsPerMatch must be at least 1 when useGlobalQuestionCount is false');
        }
        nextQuestionOverride = requestedQuestionOverride;
      } else if (currentQuestionOverride === null) {
        throw new Error('questionsPerMatch must be provided when disabling useGlobalQuestionCount');
      }
    }

    if (hasQuestionsPerMatchInput) {
      shouldUpdateQuestionOverride = true;
      if (!hasUseGlobalQuestionCountInput || !requestedUseGlobalQuestionCount) {
        if (requestedQuestionOverride === null) {
          throw new Error('questionsPerMatch must be at least 1');
        }
        nextQuestionOverride = requestedQuestionOverride;
      }
    }

    if (nextQuestionOverride !== null && nextQuestionOverride > categoryQuestionCap) {
      throw new Error('questionsPerMatch exceeds max for ' + effectiveCategoryType + ' categories (' + categoryQuestionCap + ')');
    }

    if (shouldUpdateQuestionOverride) {
      updates.questionsPerMatch = nextQuestionOverride;
      updates.useGlobalQuestionCount = nextQuestionOverride === null;
    }
    if (updates.minQuestionsRequired !== undefined) {
      var parsedMinQuestions = parseInt(String(updates.minQuestionsRequired), 10);
      if (!Number.isFinite(parsedMinQuestions) || parsedMinQuestions < 1) {
        throw new Error('minQuestionsRequired must be at least 1');
      }
      updates.minQuestionsRequired = parsedMinQuestions;
    }
    if (updates.timePerQuestion !== undefined) {
      var parsedTimePerQuestion = parseInt(String(updates.timePerQuestion), 10);
      if (!Number.isFinite(parsedTimePerQuestion) || parsedTimePerQuestion < 5 || parsedTimePerQuestion > 200) {
        throw new Error('timePerQuestion must be between 5 and 200 seconds');
      }
      updates.timePerQuestion = parsedTimePerQuestion;
    }

    // Build update query dynamically
    var setClauses: string[] = ['updated_at = NOW()'];
    var params: any[] = [];
    var paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push('name = $' + paramIndex++);
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = $' + paramIndex++);
      params.push(updates.description);
    }
    if (updates.icon !== undefined) {
      setClauses.push('icon = $' + paramIndex++);
      params.push(updates.icon);
    }
    if (updates.iconUrl !== undefined) {
      setClauses.push('icon_url = $' + paramIndex++);
      params.push(updates.iconUrl);
    }
    if (updates.parentId !== undefined) {
      setClauses.push('parent_id = $' + paramIndex++);
      params.push(updates.parentId || null);
    }
    if (requestedCategoryType !== undefined) {
      setClauses.push('category_type = $' + paramIndex++);
      params.push(effectiveCategoryType);
    }
    if (updates.isActive !== undefined) {
      setClauses.push('is_active = $' + paramIndex++);
      params.push(updates.isActive);
    }
    if (updates.minQuestionsRequired !== undefined) {
      setClauses.push('min_questions_required = $' + paramIndex++);
      params.push(updates.minQuestionsRequired);
    }
    if (updates.questionsPerMatch !== undefined) {
      setClauses.push('questions_per_match = $' + paramIndex++);
      params.push(updates.questionsPerMatch);
    }
    if (updates.timePerQuestion !== undefined) {
      setClauses.push('time_per_question = $' + paramIndex++);
      params.push(updates.timePerQuestion);
    }
    if (updates.displayOrder !== undefined) {
      setClauses.push('display_order = $' + paramIndex++);
      params.push(updates.displayOrder);
    }

    params.push(categoryId);
    var updateQuery = 'UPDATE categories SET ' + setClauses.join(', ') + ' WHERE id = $' + paramIndex;

    nk.sqlExec(updateQuery, params);

    // Invalidate cache
    invalidateCategoriesCache();

    // Log admin action
    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'category_update', 'category', categoryId, oldCategory, updates);

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Update category error: ' + error);
    throw error;
  }
}

// RPC: Delete category
export function rpcAdminDeleteCategory(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'categories.manage');
    var request = JSON.parse(payload || '{}');
    var categoryId = request.categoryId;
    var force = request.force || false;

    if (!categoryId) {
      throw new Error('Category ID required');
    }

    // Get current category
    var currentResult = nk.sqlQuery('SELECT * FROM categories WHERE id = $1', [categoryId]);
    var currentRows = Array.isArray(currentResult) ? currentResult : [];
    if (currentRows.length === 0) {
      throw new Error('Category not found');
    }
    var category = currentRows[0];

    // Check for questions in this category
    var questionCountResult = nk.sqlQuery(
      'SELECT COUNT(*) as count FROM questions WHERE category = $1',
      [category.category_key]
    );
    var questionCountRows = Array.isArray(questionCountResult) ? questionCountResult : [];
    var questionCount = questionCountRows.length > 0 ? parseInt(questionCountRows[0].count) : 0;

    if (questionCount > 0 && !force) {
      return JSON.stringify({
        success: false,
        error: 'Category has ' + questionCount + ' questions. Set force=true to delete anyway or reassign questions first.',
        questionCount: questionCount,
      });
    }

    // Soft delete - set is_active to false
    nk.sqlExec('UPDATE categories SET is_active = false, updated_at = NOW() WHERE id = $1', [categoryId]);

    // Invalidate cache
    invalidateCategoriesCache();

    // Log admin action
    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'category_delete', 'category', categoryId, category, { deleted: true, force: force });

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Delete category error: ' + error);
    throw error;
  }
}

// RPC: Reorder categories
export function rpcAdminReorderCategories(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'categories.manage');
    var request = JSON.parse(payload || '{}');
    var categoryOrders = request.orders; // Array of {categoryId, displayOrder}

    if (!categoryOrders || !Array.isArray(categoryOrders)) {
      throw new Error('Orders array required');
    }

    for (var i = 0; i < categoryOrders.length; i++) {
      var item = categoryOrders[i];
      nk.sqlExec(
        'UPDATE categories SET display_order = $1, updated_at = NOW() WHERE id = $2',
        [item.displayOrder, item.categoryId]
      );
    }

    // Invalidate cache
    invalidateCategoriesCache();

    // Log admin action
    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'category_reorder', 'category', 'batch', null, categoryOrders);

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Reorder categories error: ' + error);
    throw error;
  }
}

