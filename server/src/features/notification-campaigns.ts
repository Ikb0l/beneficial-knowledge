import { getDbConfig } from '../main/config';
import { releaseRuntimeLock, tryAcquireRuntimeLockWithRetry, RuntimeLeaseLock } from '../main/runtime-locks';
import {
  shouldSendRealtimeNotification,
  shouldStoreNotification,
} from './notifications';
import {
  getUserLocale,
  getUserTelegramId,
  canSendPushNotification,
  sendPushNotification,
} from '../telegram-bot';

type CampaignType = 'category_new' | 'online_threshold' | 'tournament_new';
type CampaignStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

interface CampaignRow {
  id: string;
  campaign_type: CampaignType;
  title: string;
  body: string;
  payload_json: any;
  action_url: string | null;
  status: CampaignStatus;
  cursor_user_id: string | null;
}

interface CampaignCopy {
  title: string;
  body: string;
}

interface CampaignDispatchResult {
  inAppCreated: boolean;
  telegramSent: boolean;
  errorCount: number;
}

interface OnlineStateRow {
  is_above_threshold: any;
  last_count: any;
  last_sent_at: any;
}

var ONLINE_PRESENCE_WINDOW_SECONDS = 120;
var ONLINE_STATE_KEY = 'online_threshold';

function parsePgBoolean(value: any): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

function toFiniteNumber(value: any, fallback: number): number {
  var parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clampWhole(value: any, fallback: number, minValue: number, maxValue: number): number {
  var parsed = Math.floor(toFiniteNumber(value, fallback));
  if (parsed < minValue) return minValue;
  if (parsed > maxValue) return maxValue;
  return parsed;
}

function parseJsonObject(value: any): any {
  if (!value) return {};
  if (Array.isArray(value)) {
    var str = '';
    for (var i = 0; i < value.length; i++) {
      str += String.fromCharCode(value[i]);
    }
    try {
      return JSON.parse(str);
    } catch (_error2) {
      return {};
    }
  }
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return {};
    }
  }
  return {};
}

function parseTimestampMs(value: any): number | null {
  if (!value) return null;
  var parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatUtcDateTime(value: any): string {
  var timestampMs = parseTimestampMs(value);
  if (!timestampMs) {
    return '';
  }
  var date = new Date(timestampMs);
  var day = String(date.getUTCDate()).padStart(2, '0');
  var month = String(date.getUTCMonth() + 1).padStart(2, '0');
  var year = String(date.getUTCFullYear());
  var hours = String(date.getUTCHours()).padStart(2, '0');
  var minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return day + '.' + month + '.' + year + ' ' + hours + ':' + minutes + ' UTC';
}

function getCategoryCampaignCopy(_locale: string, payload: any, fallback: CampaignCopy): CampaignCopy {
  var categoryName = String(payload.categoryName || payload.name || '').trim();
  var safeName = categoryName || 'Yangi kategoriya';
  return {
    title: 'Yangi kategoriya ishga tushdi',
    body: safeName
      + ' kategoriyasi qo\'shildi. Ushbu bo\'lim uchun savollar bazasi yangilandi. '
      + 'Kirib, yangi savollar bilan darhol o\'yinni boshlang.',
  };
}

function getOnlineThresholdCampaignCopy(_locale: string, payload: any, fallback: CampaignCopy): CampaignCopy {
  var onlineCount = clampWhole(payload.onlineCount, 0, 0, 1000000000);
  return {
    title: 'Hamjamiyat faollashdi',
    body: 'Hozir ' + onlineCount
      + ' nafar o\'yinchi onlayn. Tezkor o\'yinga kirib, faol raqiblar bilan bahslashing.',
  };
}

function getTournamentNewCampaignCopy(_locale: string, payload: any, fallback: CampaignCopy): CampaignCopy {
  var tournamentName = String(payload.tournamentName || payload.name || '').trim();
  var safeName = tournamentName || 'Yangi turnir';
  var registrationEndText = formatUtcDateTime(payload.registrationEnd);
  var tournamentStartText = formatUtcDateTime(payload.tournamentStart);
  var details = '';
  if (registrationEndText) {
    details += ' Ro\'yxatdan o\'tish muddati: ' + registrationEndText + '.';
  }
  if (tournamentStartText) {
    details += ' Boshlanish vaqti: ' + tournamentStartText + '.';
  }
  return {
    title: 'Yangi turnir ochildi',
    body: safeName
      + ' turniri ro\'yxatdan o\'tish uchun ochildi.'
      + details
      + ' Joylar cheklangan, hozir qatnashing.',
  };
}

function getCampaignCopy(
  campaignType: CampaignType,
  locale: string,
  payload: any,
  fallbackTitle: string,
  fallbackBody: string
): CampaignCopy {
  var fallback: CampaignCopy = {
    title: fallbackTitle || 'Yangi bildirishnoma',
    body: fallbackBody || 'Siz uchun yangi bildirishnoma mavjud.',
  };
  if (campaignType === 'category_new') {
    return getCategoryCampaignCopy(locale, payload, fallback);
  }
  if (campaignType === 'online_threshold') {
    return getOnlineThresholdCampaignCopy(locale, payload, fallback);
  }
  if (campaignType === 'tournament_new') {
    return getTournamentNewCampaignCopy(locale, payload, fallback);
  }
  return fallback;
}

function getCampaignPreferenceKey(campaignType: CampaignType): string {
  if (campaignType === 'category_new') {
    return 'categoryNotification';
  }
  if (campaignType === 'tournament_new') {
    return 'tournamentNotification';
  }
  return 'onlineThresholdNotification';
}

function shouldReceiveCampaignNotification(
  nk: nkruntime.Nakama,
  userId: string,
  campaignType: CampaignType
): boolean {
  return shouldStoreNotification(nk, userId, campaignType);
}

function tryAcquireCampaignLock(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  lockKey: string
): RuntimeLeaseLock | null {
  return tryAcquireRuntimeLockWithRetry(nk, logger, lockKey, 60000, 2, 250);
}

function createCampaign(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  campaignType: CampaignType,
  dedupeKey: string,
  title: string,
  body: string,
  payload: any,
  actionUrl: string | null
): boolean {
  try {
    var campaignId = nk.uuidv4();
    var result = nk.sqlQuery(
      `INSERT INTO notification_campaigns
        (id, campaign_type, dedupe_key, title, body, payload_json, action_url, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending', NOW(), NOW())
       ON CONFLICT (campaign_type, dedupe_key) DO NOTHING
       RETURNING id`,
      [
        campaignId,
        campaignType,
        dedupeKey,
        title,
        body,
        JSON.stringify(payload || {}),
        actionUrl,
      ]
    );
    var rows = Array.isArray(result) ? result : [];
    return rows.length > 0;
  } catch (error) {
    logger.warn('Failed to create notification campaign: ' + error);
    return false;
  }
}

function dispatchCampaignToUser(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  campaign: CampaignRow,
  userId: string,
  locale: string,
  allowTelegramSend: boolean,
  preferenceKeyOverride?: string
): CampaignDispatchResult {
  var payload = parseJsonObject(campaign.payload_json);
  var copy = getCampaignCopy(campaign.campaign_type, locale, payload, campaign.title, campaign.body);
  var data: any = {
    ...payload,
    campaignId: campaign.id,
    type: campaign.campaign_type,
    title: copy.title,
    body: copy.body,
    inbox: true,
    createdAt: new Date().toISOString(),
  };
  if (campaign.action_url) {
    data.actionUrl = campaign.action_url;
  }

  var inAppCreated = false;
  var telegramSent = false;
  var errorCount = 0;

  try {
    var insertResult = nk.sqlQuery(
      `INSERT INTO notifications (user_id, type, title, body, data, action_url, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, false, NOW())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        userId,
        campaign.campaign_type,
        copy.title,
        copy.body,
        JSON.stringify(data),
        campaign.action_url,
      ]
    );
    var insertRows = Array.isArray(insertResult) ? insertResult : [];
    inAppCreated = insertRows.length > 0;
  } catch (insertError) {
    logger.warn('Failed to insert campaign notification for user ' + userId + ': ' + insertError);
    errorCount += 1;
  }

  if (inAppCreated && shouldSendRealtimeNotification(nk, userId, campaign.campaign_type)) {
    try {
      nk.notificationSend(userId, copy.title, data, 1, undefined, true);
    } catch (realtimeError) {
      logger.warn('Failed to send realtime campaign notification for user ' + userId + ': ' + realtimeError);
      errorCount += 1;
    }
  }

  var categoryIdPayload = String(payload.categoryId || '').trim();
  var tournamentIdPayload = String(payload.tournamentId || '').trim();
  var deepLinkPayload = campaign.campaign_type === 'category_new'
    ? (categoryIdPayload ? ('c_' + categoryIdPayload) : '')
    : (campaign.campaign_type === 'tournament_new'
      ? (tournamentIdPayload ? ('t_' + tournamentIdPayload) : '')
      : 'o_live');
  var preferenceKey = preferenceKeyOverride || getCampaignPreferenceKey(campaign.campaign_type);

  if (allowTelegramSend) {
    try {
      telegramSent = sendPushNotification(
        nk,
        logger,
        userId,
        copy.title,
        copy.body,
        false,
        preferenceKey,
        deepLinkPayload,
        locale
      );
    } catch (pushError) {
      logger.warn('Failed to send Telegram campaign notification for user ' + userId + ': ' + pushError);
      errorCount += 1;
    }
  }

  return {
    inAppCreated: inAppCreated,
    telegramSent: telegramSent,
    errorCount: errorCount,
  };
}

export function enqueueCategoryNotificationCampaign(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  category: {
    id: string;
    categoryKey: string;
    name: string;
    isActive: boolean;
    reactivated: boolean;
  }
): void {
  if (!category.isActive) {
    return;
  }

  var dedupeKey = 'category:' + category.id;
  var payload = {
    categoryId: category.id,
    categoryKey: category.categoryKey,
    categoryName: category.name,
    reactivated: category.reactivated === true,
    createdAt: new Date().toISOString(),
  };

  var created = createCampaign(
    nk,
    logger,
    'category_new',
    dedupeKey,
    'New Category Available',
    category.name + ' is now live. Jump in and play!',
    payload,
    '/'
  );
  if (created) {
    logger.info('Queued category notification campaign for category ' + category.id);
  }
}

export function enqueueTournamentCreatedCampaign(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournament: {
    id: string;
    name: string;
    registrationStart?: string;
    registrationEnd?: string;
    tournamentStart?: string;
  }
): void {
  if (!tournament || !tournament.id) {
    return;
  }

  var dedupeKey = 'tournament:' + String(tournament.id);
  var payload = {
    tournamentId: String(tournament.id),
    tournamentName: String(tournament.name || 'Tournament'),
    registrationStart: tournament.registrationStart || null,
    registrationEnd: tournament.registrationEnd || null,
    tournamentStart: tournament.tournamentStart || null,
    createdAt: new Date().toISOString(),
  };

  var actionUrl = '/tournament/' + String(tournament.id);
  var created = createCampaign(
    nk,
    logger,
    'tournament_new',
    dedupeKey,
    'New Tournament Open',
    String(tournament.name || 'Tournament') + ' is now open for registration. Join now!',
    payload,
    actionUrl
  );
  if (created) {
    logger.info('Queued tournament-created notification campaign for tournament ' + tournament.id);
  }
}

export function runCommunityOnlineDetector(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  var lockKey = 'community_online_detector';
  var lock = tryAcquireCampaignLock(nk, logger, lockKey);
  if (!lock) {
    return;
  }

  try {
    var alertsEnabledRaw = getDbConfig(nk, logger, 'community_alerts_enabled', true as any);
    var alertsEnabled = parsePgBoolean(alertsEnabledRaw);
    if (!alertsEnabled) {
      return;
    }

    var threshold = clampWhole(
      getDbConfig(nk, logger, 'community_online_threshold', 2 as any),
      2,
      1,
      1000000
    );
    var cooldownMinutes = clampWhole(
      getDbConfig(nk, logger, 'community_online_cooldown_minutes', 60 as any),
      60,
      1,
      1440
    );

    var onlineResult = nk.sqlQuery(
      `SELECT COUNT(*) as count
       FROM storage
       WHERE collection = 'presence'
         AND key = 'online'
         AND update_time > NOW() - INTERVAL '` + ONLINE_PRESENCE_WINDOW_SECONDS + ` seconds'`
    );
    var onlineRows = Array.isArray(onlineResult) ? onlineResult : [];
    var onlineCount = onlineRows.length > 0
      ? clampWhole(onlineRows[0].count, 0, 0, 1000000000)
      : 0;
    var aboveThreshold = onlineCount > threshold;

    var stateResult = nk.sqlQuery(
      `SELECT is_above_threshold, last_count, last_sent_at
       FROM community_alert_state
       WHERE state_key = $1`,
      [ONLINE_STATE_KEY]
    );
    var stateRows = Array.isArray(stateResult) ? stateResult : [];

    if (stateRows.length === 0) {
      nk.sqlExec(
        `INSERT INTO community_alert_state
          (state_key, is_above_threshold, last_count, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (state_key) DO UPDATE SET
           is_above_threshold = $2,
           last_count = $3,
           updated_at = NOW()`,
        [ONLINE_STATE_KEY, aboveThreshold, onlineCount]
      );
      return;
    }

    var state = stateRows[0] as OnlineStateRow;
    var wasAbove = parsePgBoolean(state.is_above_threshold);
    var lastSentAtMs = parseTimestampMs(state.last_sent_at);
    var nowMs = Date.now();
    var cooldownMs = cooldownMinutes * 60 * 1000;
    var cooldownReady = !lastSentAtMs || (nowMs - lastSentAtMs >= cooldownMs);
    var crossedUpward = aboveThreshold && !wasAbove;

    var sentCampaign = false;
    if (crossedUpward && cooldownReady) {
      var dedupeKey = 'online:' + new Date().toISOString();
      sentCampaign = createCampaign(
        nk,
        logger,
        'online_threshold',
        dedupeKey,
        'More Players Online',
        onlineCount + ' players are online right now. Join a match!',
        {
          onlineCount: onlineCount,
          threshold: threshold,
          triggeredAt: new Date().toISOString(),
        },
        '/'
      );
      if (sentCampaign) {
        logger.info('Queued online-threshold campaign at count=' + onlineCount + ' threshold=' + threshold);
      }
    }

    nk.sqlExec(
      `UPDATE community_alert_state
       SET is_above_threshold = $2,
           last_count = $3,
           last_sent_at = CASE WHEN $4 THEN NOW() ELSE last_sent_at END,
           updated_at = NOW()
       WHERE state_key = $1`,
      [ONLINE_STATE_KEY, aboveThreshold, onlineCount, sentCampaign]
    );
  } catch (error) {
    logger.warn('Community online detector failed: ' + error);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }
}

export function dispatchNotificationCampaigns(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  var lockKey = 'notification_campaign_dispatch';
  var lock = tryAcquireCampaignLock(nk, logger, lockKey);
  if (!lock) {
    return;
  }

  try {
    var batchSize = clampWhole(
      getDbConfig(nk, logger, 'community_dispatch_batch_size', 200 as any),
      200,
      10,
      2000
    );
    var telegramDispatchPerRun = clampWhole(
      getDbConfig(nk, logger, 'telegram_dispatch_per_run', 25 as any),
      25,
      0,
      500
    );

    var campaignResult = nk.sqlQuery(
      `SELECT id, campaign_type, title, body, payload_json, action_url, status, cursor_user_id
       FROM notification_campaigns
       WHERE status IN ('pending', 'in_progress')
       ORDER BY created_at ASC
       LIMIT 3`,
      []
    );
    var campaignRows = Array.isArray(campaignResult) ? campaignResult : [];
    if (campaignRows.length === 0) {
      return;
    }

    for (var ci = 0; ci < campaignRows.length; ci++) {
      var campaign = campaignRows[ci] as CampaignRow;

      // Staleness check: skip tournament_new campaigns whose tournament
      // is no longer in registration/upcoming (has started or completed).
      if (campaign.campaign_type === 'tournament_new') {
        var payload = parseJsonObject(campaign.payload_json);
        var campaignTournamentId = String(payload.tournamentId || '').trim();
        if (campaignTournamentId) {
          var tournamentStatusResult = nk.sqlQuery(
            `SELECT status FROM tournaments WHERE id = $1`,
            [campaignTournamentId]
          );
          var tsRows = Array.isArray(tournamentStatusResult) ? tournamentStatusResult : [];
          var tStatus = tsRows.length > 0 ? String(tsRows[0].status || '') : '';
          if (tStatus !== 'registration' && tStatus !== 'upcoming') {
            logger.info(
              'Skipping stale tournament_new campaign ' + campaign.id +
              ' — tournament ' + campaignTournamentId + ' is ' + tStatus
            );
            nk.sqlExec(
              `UPDATE notification_campaigns
               SET status = 'completed',
                   completed_at = NOW(),
                   updated_at = NOW()
               WHERE id = $1`,
              [campaign.id]
            );
            continue;
          }
        }
      }

    nk.sqlExec(
      `UPDATE notification_campaigns
       SET status = 'in_progress',
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [campaign.id]
    );

    var usersResult = nk.sqlQuery(
      `SELECT id
       FROM users
       WHERE id <> '00000000-0000-0000-0000-000000000000'::uuid
         AND (disable_time IS NULL OR disable_time <= '1970-01-02 00:00:00 UTC')
         AND ($1::uuid IS NULL OR id > $1::uuid)
       ORDER BY id ASC
       LIMIT $2`,
      [campaign.cursor_user_id || null, batchSize]
    );
    var userRows = Array.isArray(usersResult) ? usersResult : [];

    if (userRows.length === 0) {
      nk.sqlExec(
        `UPDATE notification_campaigns
         SET status = 'completed',
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [campaign.id]
      );
      continue;
    }

    var lastProcessedUserId: string | null = campaign.cursor_user_id || null;
    var totalInAppCreated = 0;
    var totalTelegramSent = 0;
    var totalErrors = 0;
    var telegramAttempts = 0;
    var pausedForTelegramBudget = false;

    for (var i = 0; i < userRows.length; i++) {
      var userId = String(userRows[i].id || '');
      if (!userId) {
        continue;
      }

      if (!shouldReceiveCampaignNotification(nk, userId, campaign.campaign_type)) {
        lastProcessedUserId = userId;
        continue;
      }

      var hasTelegramAccount = !!getUserTelegramId(nk, userId);
      var preferenceKey = getCampaignPreferenceKey(campaign.campaign_type);
      var canAttemptTelegram = hasTelegramAccount
        && telegramDispatchPerRun > 0
        && canSendPushNotification(nk, userId, preferenceKey);
      if (canAttemptTelegram && telegramAttempts >= telegramDispatchPerRun) {
        pausedForTelegramBudget = true;
        break;
      }

      var locale = getUserLocale(nk, userId);
      var dispatchResult = dispatchCampaignToUser(
        nk,
        logger,
        campaign,
        userId,
        locale,
        canAttemptTelegram,
        preferenceKey
      );

      if (dispatchResult.inAppCreated) {
        totalInAppCreated += 1;
      }
      if (dispatchResult.telegramSent) {
        totalTelegramSent += 1;
      }
      totalErrors += dispatchResult.errorCount;
      if (canAttemptTelegram) {
        telegramAttempts += 1;
      }
      lastProcessedUserId = userId;
    }

    var reachedEndOfBatch = !pausedForTelegramBudget && userRows.length < batchSize;
    var nextStatus: CampaignStatus = reachedEndOfBatch ? 'completed' : 'in_progress';

    nk.sqlExec(
      `UPDATE notification_campaigns
       SET status = $2::varchar,
           cursor_user_id = $3,
           sent_in_app_count = sent_in_app_count + $4,
           sent_telegram_count = sent_telegram_count + $5,
           error_count = error_count + $6,
           completed_at = CASE WHEN $2::varchar = 'completed' THEN NOW() ELSE completed_at END,
           updated_at = NOW(),
           last_error = CASE WHEN $6 > 0 THEN COALESCE(last_error, 'Some sends failed') ELSE last_error END
       WHERE id = $1`,
      [
        campaign.id,
        nextStatus,
        lastProcessedUserId,
        totalInAppCreated,
        totalTelegramSent,
        totalErrors,
      ]
    );
  } // end campaign loop
  } catch (error) {
    logger.warn('Notification campaign dispatcher failed: ' + error);
  } finally {
    releaseRuntimeLock(nk, logger, lock);
  }
}
