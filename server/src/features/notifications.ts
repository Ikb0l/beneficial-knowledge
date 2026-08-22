// ============================================================================
// NOTIFICATIONS RPCs
// ============================================================================

export function parseRpcPayload(payload: string): any {
  if (!payload || payload === '<nil>') {
    return {};
  }
  try {
    return JSON.parse(payload);
  } catch (_e) {
    return {};
  }
}

export function normalizeLimit(value: any, defaultValue: number, maxValue: number): number {
  var num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return defaultValue;
  }
  return Math.min(Math.floor(num), maxValue);
}

export function rpcGetNotifications(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    var request: any = parseRpcPayload(payload);
    var unreadOnly = request.unreadOnly === true;
    var limit = normalizeLimit(request.limit, 20, 50);

    if (Math.random() < 0.02) {
      cleanupOldNotifications(nk, logger);
    }

    var query = `SELECT id, type, title, body, data, action_url, is_read, created_at
                 FROM notifications
                 WHERE user_id = $1`;

    if (unreadOnly) {
      query += ` AND is_read = false`;
    }

    query += ` AND (expires_at IS NULL OR expires_at > NOW())
               ORDER BY created_at DESC LIMIT $2`;

    var result = nk.sqlQuery(query, [ctx.userId, limit]);
    var rows = Array.isArray(result) ? result : [];

    var notifications = rows.map(function(row: any) {
      var parsedData = null;
      if (row.data) {
        if (typeof row.data === 'string') {
          if (row.data !== '<nil>' && row.data.trim().length > 0) {
            try {
              parsedData = JSON.parse(row.data);
            } catch (dataError) {
              logger.warn('Invalid notification data JSON for ' + row.id + ': ' + dataError);
            }
          }
        } else {
          parsedData = row.data;
        }
      }
      return {
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        data: parsedData,
        actionUrl: row.action_url,
        isRead: row.is_read,
        createdAt: row.created_at,
      };
    });

    // Get unread count
    var countResult = nk.sqlQuery(
      `SELECT COUNT(*) as count FROM notifications
       WHERE user_id = $1 AND is_read = false
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [ctx.userId]
    );
    var countRows = Array.isArray(countResult) ? countResult : [];
    var unreadCount = countRows.length > 0 ? parseInt(countRows[0].count) : 0;

    return JSON.stringify({
      notifications: notifications,
      unreadCount: unreadCount,
    });
  } catch (error) {
    logger.error('Error getting notifications: ' + error);
    throw error;
  }
}

export function rpcMarkNotificationRead(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    var request = parseRpcPayload(payload || '{}');

    if (request.all === true) {
      nk.sqlExec(
        `UPDATE notifications SET is_read = true, read_at = NOW()
         WHERE user_id = $1 AND is_read = false`,
        [ctx.userId]
      );
    } else if (typeof request.notificationId === 'string' && request.notificationId.length > 0) {
      nk.sqlExec(
        `UPDATE notifications SET is_read = true, read_at = NOW()
         WHERE user_id = $1 AND id = $2`,
        [ctx.userId, request.notificationId]
      );
    } else {
      throw new Error('notificationId or all:true is required');
    }

    return JSON.stringify({
      success: true,
    });
  } catch (error) {
    logger.error('Error marking notification read: ' + error);
    throw error;
  }
}

// Helper function to clean up old notifications
// Call this periodically (e.g., from rate limiter cleanup or daily job)
export function cleanupOldNotifications(nk: nkruntime.Nakama, logger: nkruntime.Logger): void {
  try {
    // Delete expired notifications older than 1 day
    nk.sqlExec(
      `DELETE FROM notifications
       WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 day'`
    );

    // Delete read notifications older than 30 days
    nk.sqlExec(
      `DELETE FROM notifications
       WHERE is_read = true AND created_at < NOW() - INTERVAL '30 days'`
    );

    // Delete unread notifications older than 90 days (prevent unbounded growth)
    nk.sqlExec(
      `DELETE FROM notifications
       WHERE created_at < NOW() - INTERVAL '90 days'`
    );

    logger.debug('Notification cleanup completed');
  } catch (error) {
    logger.warn('Error cleaning up old notifications: ' + error);
  }
}

export function rpcRegisterPushToken(
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

    if (!request.token || !request.platform) {
      throw new Error('token and platform are required');
    }

    var platform = String(request.platform).toLowerCase();
    var validPlatforms = ['ios', 'android', 'web', 'telegram'];
    if (validPlatforms.indexOf(platform) === -1) {
      throw new Error('Invalid platform');
    }

    nk.sqlExec(
      `INSERT INTO push_tokens (user_id, token, platform, device_info, last_used_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, token) DO UPDATE SET
       is_active = true, last_used_at = NOW(), device_info = $4`,
      [ctx.userId, request.token, platform, JSON.stringify(request.deviceInfo || {})]
    );

    return JSON.stringify({
      success: true,
    });
  } catch (error) {
    logger.error('Error registering push token: ' + error);
    throw error;
  }
}

// Notification preferences RPCs
export var DEFAULT_NOTIFICATION_PREFERENCES = {
  pushNotifications: true,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  matchFoundNotification: true,
  tournamentNotification: true,
  friendRequestNotification: true,
  challengeNotification: true,
  categoryNotification: true,
  onlineThresholdNotification: true,
};

function getNotificationPreferenceKey(type: string): string | null {
  if (!type) return null;
  switch (type) {
    case 'tournament_reminder':
    case 'tournament_start':
    case 'tournament_starting':
    case 'tournament_match_ready':
    case 'tournament_result':
    case 'match_result':
    case 'tournament_reminder_1h':
    case 'tournament_reminder_15m':
    case 'tournament_ready_check':
    case 'tournament_match_forfeit_win':
    case 'tournament_match_forfeit_loss':
    case 'tournament_eliminated':
    case 'tournament_victory':
    case 'tournament_complete':
    case 'tournament_new':
      return 'tournamentNotification';
    case 'friend_request':
    case 'friend_accepted':
      return 'friendRequestNotification';
    case 'friend_challenge':
    case 'challenge_accepted':
    case 'challenge_declined':
    case 'challenge_expired':
      return 'challengeNotification';
    case 'rank_up':
    case 'rank_down':
      return null;
    case 'category_new':
      return 'categoryNotification';
    case 'online_threshold':
      return 'onlineThresholdNotification';
    default:
      return null;
  }
}

export function getUserNotificationPreferences(
  nk: nkruntime.Nakama,
  userId: string
): any {
  try {
    var read = nk.storageRead([
      { collection: 'settings', key: 'preferences', userId: userId },
    ]);
    var stored = read.length > 0 && read[0].value ? read[0].value : {};
    var tournamentPreference = stored.tournamentNotification;
    if (tournamentPreference === undefined) {
      if (stored.matchFoundNotification !== undefined) {
        tournamentPreference = stored.matchFoundNotification;
      } else {
        tournamentPreference = DEFAULT_NOTIFICATION_PREFERENCES.tournamentNotification;
      }
    }
    return {
      pushNotifications: stored.pushNotifications !== undefined ? stored.pushNotifications : DEFAULT_NOTIFICATION_PREFERENCES.pushNotifications,
      quietHoursEnabled: stored.quietHoursEnabled !== undefined ? stored.quietHoursEnabled : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnabled,
      quietHoursStart: stored.quietHoursStart !== undefined ? stored.quietHoursStart : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursStart,
      quietHoursEnd: stored.quietHoursEnd !== undefined ? stored.quietHoursEnd : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnd,
      matchFoundNotification: stored.matchFoundNotification !== undefined ? stored.matchFoundNotification : DEFAULT_NOTIFICATION_PREFERENCES.matchFoundNotification,
      tournamentNotification: tournamentPreference,
      friendRequestNotification: stored.friendRequestNotification !== undefined ? stored.friendRequestNotification : DEFAULT_NOTIFICATION_PREFERENCES.friendRequestNotification,
      challengeNotification: stored.challengeNotification !== undefined ? stored.challengeNotification : DEFAULT_NOTIFICATION_PREFERENCES.challengeNotification,
      categoryNotification: stored.categoryNotification !== undefined ? stored.categoryNotification : DEFAULT_NOTIFICATION_PREFERENCES.categoryNotification,
      onlineThresholdNotification: stored.onlineThresholdNotification !== undefined ? stored.onlineThresholdNotification : DEFAULT_NOTIFICATION_PREFERENCES.onlineThresholdNotification,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function shouldStoreNotification(
  nk: nkruntime.Nakama,
  userId: string,
  type: string
): boolean {
  var prefs = getUserNotificationPreferences(nk, userId);
  var preferenceKey = getNotificationPreferenceKey(type);
  if (preferenceKey && prefs[preferenceKey] === false) {
    return false;
  }
  return true;
}

export function shouldSendRealtimeNotification(
  nk: nkruntime.Nakama,
  userId: string,
  type: string
): boolean {
  var prefs = getUserNotificationPreferences(nk, userId);

  if (prefs.pushNotifications === false) {
    return false;
  }

  var preferenceKey = getNotificationPreferenceKey(type);
  if (preferenceKey && prefs[preferenceKey] === false) {
    return false;
  }

  if (prefs.quietHoursEnabled === true) {
    var quietStart = normalizeQuietHour(prefs.quietHoursStart);
    var quietEnd = normalizeQuietHour(prefs.quietHoursEnd);
    if (quietStart !== null && quietEnd !== null) {
      var nowHourUtc = new Date().getUTCHours();
      if (quietStart === quietEnd) {
        return false;
      }
      if (quietStart < quietEnd) {
        if (nowHourUtc >= quietStart && nowHourUtc < quietEnd) {
          return false;
        }
      } else if (nowHourUtc >= quietStart || nowHourUtc < quietEnd) {
        return false;
      }
    }
  }

  return true;
}

export function normalizeQuietHour(value: any): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  var num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  var hour = Math.floor(num);
  if (hour < 0 || hour > 23) {
    return null;
  }
  return hour;
}

export function rpcGetNotificationPreferences(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    var read = nk.storageRead([
      { collection: 'settings', key: 'preferences', userId: ctx.userId },
    ]);
    var hasStored = read.length > 0 && read[0].value;
    var stored = hasStored ? read[0].value : {};
    var tournamentPreference = stored.tournamentNotification;
    if (tournamentPreference === undefined) {
      if (stored.matchFoundNotification !== undefined) {
        tournamentPreference = stored.matchFoundNotification;
      } else {
        tournamentPreference = DEFAULT_NOTIFICATION_PREFERENCES.tournamentNotification;
      }
    }
    var prefs = {
      pushNotifications: stored.pushNotifications !== undefined ? stored.pushNotifications : DEFAULT_NOTIFICATION_PREFERENCES.pushNotifications,
      quietHoursEnabled: stored.quietHoursEnabled !== undefined ? stored.quietHoursEnabled : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnabled,
      quietHoursStart: stored.quietHoursStart !== undefined ? stored.quietHoursStart : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursStart,
      quietHoursEnd: stored.quietHoursEnd !== undefined ? stored.quietHoursEnd : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnd,
      matchFoundNotification: stored.matchFoundNotification !== undefined ? stored.matchFoundNotification : DEFAULT_NOTIFICATION_PREFERENCES.matchFoundNotification,
      tournamentNotification: tournamentPreference,
      friendRequestNotification: stored.friendRequestNotification !== undefined ? stored.friendRequestNotification : DEFAULT_NOTIFICATION_PREFERENCES.friendRequestNotification,
      challengeNotification: stored.challengeNotification !== undefined ? stored.challengeNotification : DEFAULT_NOTIFICATION_PREFERENCES.challengeNotification,
      categoryNotification: stored.categoryNotification !== undefined ? stored.categoryNotification : DEFAULT_NOTIFICATION_PREFERENCES.categoryNotification,
      onlineThresholdNotification: stored.onlineThresholdNotification !== undefined ? stored.onlineThresholdNotification : DEFAULT_NOTIFICATION_PREFERENCES.onlineThresholdNotification,
    };

    return JSON.stringify({ preferences: prefs, stored: !!hasStored });
  } catch (error) {
    logger.error('Error getting notification preferences: ' + error);
    throw error;
  }
}

export function rpcUpdateNotificationPreferences(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    var request = parseRpcPayload(payload || '{}');

    var read = nk.storageRead([
      { collection: 'settings', key: 'preferences', userId: ctx.userId },
    ]);
    var stored = read.length > 0 && read[0].value ? read[0].value : {};

    var prefs: any = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...stored,
    };
    if (stored.tournamentNotification === undefined) {
      if (stored.matchFoundNotification !== undefined) {
        prefs.tournamentNotification = stored.matchFoundNotification;
      }
    }

    var boolKeys = [
      'pushNotifications',
      'quietHoursEnabled',
      'matchFoundNotification',
      'tournamentNotification',
      'friendRequestNotification',
      'challengeNotification',
      'categoryNotification',
      'onlineThresholdNotification',
    ];

    for (var i = 0; i < boolKeys.length; i++) {
      var key = boolKeys[i];
      if (typeof request[key] === 'boolean') {
        prefs[key] = request[key];
      }
    }

    if (request.quietHoursStart !== undefined) {
      prefs.quietHoursStart = normalizeQuietHour(request.quietHoursStart);
    }
    if (request.quietHoursEnd !== undefined) {
      prefs.quietHoursEnd = normalizeQuietHour(request.quietHoursEnd);
    }

    nk.storageWrite([{
      collection: 'settings',
      key: 'preferences',
      userId: ctx.userId,
      value: prefs,
      permissionRead: 1,
      permissionWrite: 0,
    }]);

    return JSON.stringify({ success: true, preferences: prefs });
  } catch (error) {
    logger.error('Error updating notification preferences: ' + error);
    throw error;
  }
}

