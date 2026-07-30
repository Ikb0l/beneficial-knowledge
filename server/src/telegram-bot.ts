// Telegram Bot API Helper for Push Notifications
// Used to send messages to users via Telegram

import { TELEGRAM_BOT_TOKEN } from './main/constants';

interface TelegramMessage {
  chat_id: number | string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_notification?: boolean;
  disable_web_page_preview?: boolean;
  reply_markup?: {
    inline_keyboard: Array<Array<{
      text: string;
      url: string;
    }>>;
  };
}

interface TelegramApiResponse {
  ok: boolean;
  result?: any;
  description?: string;
  error_code?: number;
}

function parseJsonValue(raw: any): any {
  if (Array.isArray(raw)) {
    var str = '';
    for (var i = 0; i < raw.length; i++) {
      str += String.fromCharCode(raw[i]);
    }
    try {
      return JSON.parse(str);
    } catch (_e) {
      return str;
    }
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (_e2) {
      return raw;
    }
  }
  return raw;
}

function parseLocale(value: any): string {
  var locale = String(value || '').toLowerCase();
  if (locale.indexOf('uz') === 0) {
    return 'uz';
  }
  return 'en';
}

// Send a push notification to a user via Telegram Bot API
export function sendTelegramMessage(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  botToken: string,
  message: TelegramMessage
): boolean {
  if (!botToken) {
    logger.warn('Telegram bot token not configured');
    return false;
  }

  try {
    const apiUrl = 'https://api.telegram.org/bot' + botToken + '/sendMessage';
    const response = nk.httpRequest(apiUrl, 'post', {
      'Content-Type': 'application/json',
    }, JSON.stringify(message), 10000);

    if (response.code === 200) {
      const responseBody: TelegramApiResponse = JSON.parse(response.body);
      if (responseBody.ok) {
        logger.debug('Telegram message sent to ' + message.chat_id);
        return true;
      } else {
        logger.warn('Telegram API error: ' + responseBody.description);
      }
    } else {
      logger.warn('Telegram API HTTP error: ' + response.code);
    }
  } catch (error) {
    logger.error('Error sending Telegram message: ' + error);
  }

  return false;
}

// Get bot token from game config
export function getBotToken(nk: nkruntime.Nakama, logger: nkruntime.Logger): string {
  try {
    const result = nk.sqlQuery(
      `SELECT config_value FROM game_config WHERE config_key = 'telegram_bot_token'`
    );
    const rows = Array.isArray(result) ? result : [];
    if (rows.length > 0) {
      const parsed = parseJsonValue(rows[0].config_value);
      if (typeof parsed === 'string') {
        return parsed.trim();
      }
      if (parsed !== null && parsed !== undefined) {
        return String(parsed).trim();
      }
    }
  } catch (e) {
    logger.warn('Could not read bot token from config: ' + e);
  }
  return String(TELEGRAM_BOT_TOKEN || '').trim();
}

// Optional Mini App deep-link base. Examples:
// - https://t.me/your_bot/quizup?startapp=
// - https://t.me/your_bot/quizup?startapp={payload}
export function getMiniAppDeepLinkBase(nk: nkruntime.Nakama, logger: nkruntime.Logger): string {
  try {
    const result = nk.sqlQuery(
      `SELECT config_value FROM game_config WHERE config_key = 'telegram_miniapp_deeplink_base'`
    );
    const rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) return '';
    const parsed = parseJsonValue(rows[0].config_value);
    if (typeof parsed === 'string') {
      return parsed.trim();
    }
    if (parsed !== null && parsed !== undefined) {
      return String(parsed).trim();
    }
  } catch (e) {
    logger.warn('Could not read Mini App deep-link base from config: ' + e);
  }
  return '';
}

export function buildMiniAppDeepLink(baseUrl: string, payload: string): string {
  var base = String(baseUrl || '').trim();
  var payloadEncoded = encodeURIComponent(String(payload || '').trim());
  if (!base || !payloadEncoded) {
    return '';
  }

  if (base.indexOf('{payload}') !== -1) {
    return base.replace('{payload}', payloadEncoded);
  }

  if (base.indexOf('startapp=') !== -1) {
    if (/(startapp=)$/.test(base)) {
      return base + payloadEncoded;
    }
    return base;
  }

  var separator = base.indexOf('?') === -1 ? '?' : '&';
  return base + separator + 'startapp=' + payloadEncoded;
}

// Get user's Telegram ID from storage
export function getUserTelegramId(nk: nkruntime.Nakama, userId: string): number | null {
  try {
    const storageRead: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'telegram', userId: userId },
    ];
    const results = nk.storageRead(storageRead);
    if (results[0]?.value?.telegramId) {
      return parseInt(results[0].value.telegramId, 10);
    }
    if (results[0]?.value?.id) {
      return parseInt(results[0].value.id, 10);
    }
  } catch (e) {
    // User may not have Telegram data
  }
  return null;
}

export function getUserLocale(nk: nkruntime.Nakama, userId: string): string {
  try {
    const storageRead: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'telegram', userId: userId },
    ];
    const results = nk.storageRead(storageRead);
    const value = results[0]?.value;
    const language = value?.languageCode || value?.language_code || '';
    return parseLocale(language);
  } catch (_e) {
    return 'en';
  }
}

// Check if user has push notifications enabled and not in quiet hours
export function canSendPushNotification(nk: nkruntime.Nakama, userId: string, preferenceKey?: string): boolean {
  try {
    const storageRead: nkruntime.StorageReadRequest[] = [
      { collection: 'settings', key: 'preferences', userId: userId },
    ];
    const results = nk.storageRead(storageRead);
    if (results[0]?.value) {
      const prefs = results[0].value;

      // Check if push notifications are enabled
      if (prefs.pushNotifications === false || prefs.push_enabled === false) {
        return false;
      }

      if (preferenceKey && prefs[preferenceKey] === false) {
        return false;
      }

      // Check quiet hours
      if (prefs.quietHoursEnabled
        && prefs.quietHoursStart !== undefined
        && prefs.quietHoursStart !== null
        && prefs.quietHoursEnd !== undefined
        && prefs.quietHoursEnd !== null) {
        const now = new Date();
        const currentHour = now.getUTCHours();
        const start = parseInt(prefs.quietHoursStart, 10);
        const end = parseInt(prefs.quietHoursEnd, 10);
        if (Number.isNaN(start) || Number.isNaN(end)) {
          return true;
        }

        // Handle cases where quiet hours span midnight
        if (start <= end) {
          // Simple case: 22:00 - 08:00 doesn't span midnight (start < end is wrong for this)
          // Actually for 22-08, start=22, end=8, so start > end
          if (currentHour >= start && currentHour < end) {
            return false;
          }
        } else {
          // Spans midnight: e.g., start=22, end=8
          if (currentHour >= start || currentHour < end) {
            return false;
          }
        }
      }
    }
  } catch (e) {
    // Default to allowing notifications
  }
  return true;
}

// Send push notification to a user
export function sendPushNotification(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  title: string,
  body: string,
  silent: boolean = false,
  preferenceKey?: string,
  deepLinkPayload?: string,
  localeOverride?: string
): boolean {
  // Check if user can receive notifications
  if (!canSendPushNotification(nk, userId, preferenceKey)) {
    logger.debug('Push notification blocked for user ' + userId + ' (disabled or quiet hours)');
    return false;
  }

  // Get Telegram ID
  const telegramId = getUserTelegramId(nk, userId);
  if (!telegramId) {
    logger.debug('No Telegram ID found for user ' + userId);
    return false;
  }

  // Get bot token
  const botToken = getBotToken(nk, logger);
  if (!botToken) {
    return false;
  }

  // Format message
  const locale = parseLocale(localeOverride || getUserLocale(nk, userId));
  const deeplinkBase = getMiniAppDeepLinkBase(nk, logger);
  const deepLink = deepLinkPayload ? buildMiniAppDeepLink(deeplinkBase, deepLinkPayload) : '';
  const openLabel = 'QuizUp\'ni ochish';
  const message: TelegramMessage = {
    chat_id: telegramId,
    text: '<b>' + escapeHtml(title) + '</b>\n\n' + escapeHtml(body),
    parse_mode: 'HTML',
    disable_notification: silent,
    disable_web_page_preview: true,
  };
  if (deepLink) {
    message.reply_markup = {
      inline_keyboard: [[{ text: openLabel, url: deepLink }]],
    };
  }

  return sendTelegramMessage(nk, logger, botToken, message);
}

// Escape HTML special characters
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getTournamentBotCopy(
  type: string,
  _locale: string,
  data: any,
  fallbackTitle: string,
  fallbackBody: string
): { title: string; body: string } {
  var tournamentName = String(data?.tournamentName || 'Turnir');
  var opponentName = String(data?.opponentName || 'Raqib');
  var roundNumber = Number(data?.roundNumber || 0);
  var bracketType = String(data?.bracketType || '');
  var roundText = bracketType === 'grand_final'
    ? 'Katta final'
    : (roundNumber > 0
      ? ((bracketType === 'losers' ? 'Yutqazganlar ' : '') + roundNumber + '-raund')
      : 'Turnir o\'yini');
  var placement = Number(data?.placement || 0);
  var winner = data?.winner === true;
  switch (type) {
    case 'tournament_match_ready':
      return {
        title: 'Turnir o\'yiningiz tayyor',
        body: tournamentName + ' turnirida ' + roundText + ': ' + opponentName
          + ' ga qarshi o\'yin tayyor. Ilovaga kirib o\'yinni darhol boshlang.',
      };
    case 'tournament_reminder_15m':
      return {
        title: 'Turnir 15 daqiqada boshlanadi',
        body: tournamentName
          + ' turniri 15 daqiqadan so\'ng boshlanadi. Kechikmaslik uchun hozir kirib tayyor holatga o\'ting.',
      };
    case 'tournament_eliminated':
      return {
        title: 'Turnir natijasi',
        body: tournamentName + ' turnirini #' + placement
          + ' o\'rinda yakunladingiz. Keyingi turnirlarda yuqori natija uchun davom eting.',
      };
    case 'tournament_victory':
      return {
        title: 'Tabriklaymiz, g\'olibsiz!',
        body: tournamentName
          + ' turnirida g\'alaba qozondingiz. Mukofot va yakuniy natijalarni ilovada tekshiring.',
      };
    case 'tournament_complete':
      return {
        title: winner ? 'Tabriklaymiz, chempionsiz!' : 'Turnir yakunlandi',
        body: winner
          ? (tournamentName + ' turnirida chempion bo\'ldingiz. Mukofotlarni olish uchun ilovani oching.')
          : (tournamentName + ' turnirini #' + placement + ' o\'rinda tugatdingiz. Yakuniy jadvalni ilovada ko\'ring.'),
      };
    default:
      break;
  }

  return {
    title: fallbackTitle || 'Turnir yangilanishi',
    body: fallbackBody || 'Turnir bo\'yicha yangi ma\'lumot mavjud. Tafsilotlar uchun ilovani oching.',
  };
}

function shouldSendTournamentTypeToBot(type: string): boolean {
  return type === 'tournament_match_ready'
    || type === 'tournament_reminder_15m'
    || type === 'tournament_eliminated'
    || type === 'tournament_victory'
    || type === 'tournament_complete';
}

export function sendTournamentEventNotification(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  type: string,
  data: any,
  fallbackTitle: string,
  fallbackBody: string
): boolean {
  if (!shouldSendTournamentTypeToBot(type)) {
    return false;
  }
  var locale = getUserLocale(nk, userId);
  var copy = getTournamentBotCopy(type, locale, data || {}, fallbackTitle, fallbackBody);
  var tournamentId = data && data.tournamentId ? String(data.tournamentId) : '';
  var deepLinkPayload = tournamentId ? ('t_' + tournamentId) : '';
  return sendPushNotification(
    nk,
    logger,
    userId,
    copy.title,
    copy.body,
    false,
    'tournamentNotification',
    deepLinkPayload,
    locale
  );
}

// Notification type handlers
export const NotificationHandlers = {
  // Friend request notification
  sendFriendRequestNotification(
    nk: nkruntime.Nakama,
    logger: nkruntime.Logger,
    toUserId: string,
    fromUsername: string
  ): void {
    sendPushNotification(
      nk,
      logger,
      toUserId,
      'New Friend Request',
      fromUsername + ' wants to be your friend! Open the app to accept or decline.',
      false,
      'friendRequestNotification'
    );
  },

  // Friend challenge notification
  sendChallengeNotification(
    nk: nkruntime.Nakama,
    logger: nkruntime.Logger,
    toUserId: string,
    fromUsername: string,
    category?: string
  ): void {
    const categoryText = category ? ' in ' + category : '';
    sendPushNotification(
      nk,
      logger,
      toUserId,
      'Battle Challenge!',
      fromUsername + ' has challenged you to a quiz battle' + categoryText + '! Open the app to accept.',
      false,
      'challengeNotification'
    );
  },

  // Tournament reminder
  sendTournamentReminder(
    nk: nkruntime.Nakama,
    logger: nkruntime.Logger,
    userId: string,
    tournamentName: string,
    minutesUntilStart: number
  ): void {
    sendPushNotification(
      nk,
      logger,
      userId,
      'Tournament Starting Soon!',
      tournamentName + ' starts in ' + minutesUntilStart + ' minutes. Don\'t miss it!',
      false
    );
  },

  // Match ready notification (for tournament matches)
  sendMatchReadyNotification(
    nk: nkruntime.Nakama,
    logger: nkruntime.Logger,
    userId: string,
    opponentName: string,
    tournamentName: string
  ): void {
    sendPushNotification(
      nk,
      logger,
      userId,
      'Your Match is Ready!',
      'Your tournament match against ' + opponentName + ' in ' + tournamentName + ' is ready to play!',
      false
    );
  },

  // Streak reminder
  sendStreakReminder(
    nk: nkruntime.Nakama,
    logger: nkruntime.Logger,
    userId: string,
    currentStreak: number
  ): void {
    sendPushNotification(
      nk,
      logger,
      userId,
      'Keep Your Streak!',
      'Don\'t lose your ' + currentStreak + '-day streak! Play a match today to keep it going.',
      true // Silent for streak reminders
    );
  },
};

// Export functions for use in other modules
export var TelegramBot = {
  sendPushNotification: sendPushNotification,
  sendFriendRequestNotification: NotificationHandlers.sendFriendRequestNotification,
  sendChallengeNotification: NotificationHandlers.sendChallengeNotification,
  sendTournamentReminder: NotificationHandlers.sendTournamentReminder,
  sendMatchReadyNotification: NotificationHandlers.sendMatchReadyNotification,
  sendTournamentEventNotification: sendTournamentEventNotification,
  sendStreakReminder: NotificationHandlers.sendStreakReminder,
  getBotToken: getBotToken,
  getMiniAppDeepLinkBase: getMiniAppDeepLinkBase,
  buildMiniAppDeepLink: buildMiniAppDeepLink,
  getUserTelegramId: getUserTelegramId,
  getUserLocale: getUserLocale,
};
