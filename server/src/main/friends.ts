import { TelegramBot } from '../telegram-bot';
import { getDefaultCategoryKey, isValidCategoryFromDb } from './config';
import { GAME_CONFIG } from './constants';
import { buildActivityDescription } from './mmr';
import { shouldSendRealtimeNotification, shouldStoreNotification } from '../features/notifications';

// FRIENDS SYSTEM RPCs
// ============================================================================

// Helper function to check if a user is blocked (either direction)
export function isUserBlocked(nk: nkruntime.Nakama, userId: string, targetUserId: string): boolean {
  try {
    var result = nk.sqlQuery(
      `SELECT 1 FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2`,
      [userId, targetUserId]
    );
    var rows = Array.isArray(result) ? result : [];
    return rows.length > 0;
  } catch (error) {
    // Table may not exist yet, treat as not blocked
    return false;
  }
}

// Helper function to get player's current game state (for challenge safety checks)
export function getPlayerGameState(nk: nkruntime.Nakama, userId: string): string | null {
  try {
    var result = nk.storageRead([
      { collection: 'player_state', key: 'game_state', userId: userId }
    ]);
    if (result.length > 0 && result[0].value) {
      // Check if state is stale (older than 5 minutes = probably crashed)
      var updatedAt = result[0].value.updatedAt || 0;
      if (Date.now() - updatedAt > 5 * 60 * 1000) {
        return null; // Treat stale state as idle
      }
      return result[0].value.phase || null;
    }
  } catch (e) {
    // No state stored
  }
  return null;
}

// Helper function to cleanup expired challenges (called lazily when checking challenges)
export function cleanupExpiredChallenges(nk: nkruntime.Nakama, logger: nkruntime.Logger): void {
  try {
    // Update expired pending challenges to 'expired' status and notify challengers
    var expiredResult = nk.sqlQuery(
      `UPDATE pending_challenges
       SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()
       RETURNING id, challenger_id, challenged_id`
    );
    var expiredRows = Array.isArray(expiredResult) ? expiredResult : [];
    for (var i = 0; i < expiredRows.length; i++) {
      var row = expiredRows[i];
      var challengeId = row.id;
      var challengerId = row.challenger_id;
      if (challengerId) {
        try {
          if (shouldSendRealtimeNotification(nk, challengerId, 'challenge_expired')) {
            nk.notificationSend(
              challengerId,
              'Challenge Expired',
              {
                type: 'challenge_expired',
                title: 'Challenge Expired',
                body: 'Your challenge expired with no response.',
                challengeId: challengeId,
                inbox: false,
              },
              103,
              undefined,
              true
            );
          }
        } catch (notifyError) {
          logger.warn('Failed to send challenge expired notification: ' + notifyError);
        }
      }
    }

    // Delete very old challenges (older than 1 day) to keep table size reasonable
    nk.sqlExec(
      `DELETE FROM pending_challenges
       WHERE created_at < NOW() - INTERVAL '1 day'`
    );
  } catch (error) {
    logger.warn('Error cleaning up expired challenges: ' + error);
  }
}

// Helper function to set player's current game state
export function setPlayerGameState(nk: nkruntime.Nakama, userId: string, phase: string): void {
  try {
    nk.storageWrite([{
      collection: 'player_state',
      key: 'game_state',
      userId: userId,
      value: { phase: phase, updatedAt: Date.now() },
      permissionRead: 0,
      permissionWrite: 0,
    }]);
  } catch (e) {
    // Ignore write errors - non-critical
  }
}

// Helper function to clear player's game state (set to idle)
export function clearPlayerGameState(nk: nkruntime.Nakama, userId: string): void {
  setPlayerGameState(nk, userId, 'idle');
}

export function getFriendsCursor(result: any): string {
  var resultAny = result as any;
  return resultAny?.cursor || resultAny?.Cursor || resultAny?.nextCursor || resultAny?.NextCursor || '';
}

export function listFriendsPaged(
  nk: nkruntime.Nakama,
  userId: string,
  state: number | undefined
): any[] {
  var allFriends: any[] = [];
  var cursor = '';
  var guard = 0;

  while (guard < 1000) {
    var result = nk.friendsList(userId, 100, state, cursor || '');
    var resultAny = result as any;
    var pageFriends = resultAny?.friends || resultAny?.Friends || [];
    if (pageFriends.length > 0) {
      allFriends = allFriends.concat(pageFriends);
    }

    var nextCursor = getFriendsCursor(result);
    if (!nextCursor || nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
    guard++;
  }

  return allFriends;
}

export function isMutualFriend(
  nk: nkruntime.Nakama,
  userId: string,
  targetUserId: string
): boolean {
  var cursor = '';
  var guard = 0;

  while (guard < 1000) {
    var result = nk.friendsList(userId, 100, 0, cursor || '');
    var resultAny = result as any;
    var pageFriends = resultAny?.friends || resultAny?.Friends || [];
    for (var i = 0; i < pageFriends.length; i++) {
      var friend = pageFriends[i] as any;
      var friendUserId = friend.user?.userId || friend.user?.id || friend.user?.Id;
      if (friendUserId === targetUserId) {
        return true;
      }
    }

    var nextCursor = getFriendsCursor(result);
    if (!nextCursor || nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
    guard++;
  }

  return false;
}

// RPC: Get friends list with online status
export function rpcGetFriends(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    // Get friends with state 0 (mutual friends)
    // Note: Nakama limits friendsList to max 100 per call
    var friendsResult = listFriendsPaged(nk, ctx.userId, 0);
    var friends: any[] = [];

    // Collect all friend user IDs first for batch storage read
    var friendUserIds: string[] = [];
    var friendsMap: { [key: string]: any } = {};

    if (friendsResult && friendsResult.length > 0) {
      for (var i = 0; i < friendsResult.length; i++) {
        var friend = friendsResult[i] as any;
        var friendState = friend.state !== undefined ? friend.state : friend.State;
        var friendUser = friend.user || friend.User;
        // Handle both userId/id and case variants from Nakama runtime.
        var friendUserId = friendUser?.userId || friendUser?.id || friendUser?.Id || '';
        if (friendState === 0 && friendUserId) { // Mutual friend
          friendUserIds.push(friendUserId);
          friendsMap[friendUserId] = friend;
        }
      }
    }

    // Batch read MMR data and telegram data for all friends
    var storageReads: nkruntime.StorageReadRequest[] = [];
    for (var j = 0; j < friendUserIds.length; j++) {
      storageReads.push({ collection: 'player_data', key: 'global_mmr', userId: friendUserIds[j] });
      storageReads.push({ collection: 'player_data', key: 'telegram', userId: friendUserIds[j] });
    }

    var storageResults: nkruntime.StorageObject[] = [];
    if (storageReads.length > 0) {
      storageResults = nk.storageRead(storageReads);
    }

    // Build lookup maps from storage results
    var mmrByUserId: { [key: string]: any } = {};
    var telegramByUserId: { [key: string]: any } = {};
    for (var k = 0; k < storageResults.length; k++) {
      var result = storageResults[k];
      if (result && result.userId && result.value) {
        if (result.key === 'global_mmr') {
          mmrByUserId[result.userId] = result.value;
        } else if (result.key === 'telegram') {
          telegramByUserId[result.userId] = result.value;
        }
      }
    }

    // Build friends list with avatar URLs from telegram data
    for (var l = 0; l < friendUserIds.length; l++) {
      var fUserId = friendUserIds[l];
      var friendObj = friendsMap[fUserId];
      var friendUserObj = friendObj?.user || friendObj?.User || {};
      var mmrData = mmrByUserId[fUserId] || { mmr: GAME_CONFIG.STARTING_MMR, rankTier: 'bronze' };
      var telegramData = telegramByUserId[fUserId];

      // Get online status from user object (Nakama provides this)
      var isOnline = friendUserObj.online === true;

      // Resolve avatar URL from telegram data first, then fall back to user object
      var avatarUrl = '';
      if (telegramData && telegramData.photoUrl) {
        avatarUrl = telegramData.photoUrl;
      } else if (friendUserObj.avatarUrl || friendUserObj.avatar_url || friendUserObj.AvatarUrl) {
        avatarUrl = friendUserObj.avatarUrl || friendUserObj.avatar_url || friendUserObj.AvatarUrl;
      }

      // Resolve display name from telegram data or user object
      var displayName = friendUserObj.displayName || friendUserObj.display_name || friendUserObj.DisplayName || friendUserObj.username;
      if (telegramData) {
        if (telegramData.firstName) {
          displayName = telegramData.firstName + (telegramData.lastName ? ' ' + telegramData.lastName : '');
        } else if (telegramData.username) {
          displayName = telegramData.username;
        }
      }

      friends.push({
        userId: fUserId,
        username: friendUserObj.username || friendUserObj.Username || '',
        displayName: displayName,
        avatarUrl: avatarUrl,
        online: isOnline,
        lastActiveAt: (friendUserObj.updateTime || friendUserObj.update_time || friendUserObj.UpdateTime)
          ? new Date(friendUserObj.updateTime || friendUserObj.update_time || friendUserObj.UpdateTime).getTime()
          : 0,
        mmr: mmrData.mmr,
        rankTier: mmrData.rankTier,
      });
    }

    // Sort: online first, then by MMR
    friends.sort(function(a: any, b: any) {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return b.mmr - a.mmr;
    });

    return JSON.stringify({ friends: friends });
  } catch (error) {
    logger.error('Error getting friends: ' + error);
    throw error;
  }
}

// RPC: Get friend requests (incoming and outgoing)
export function rpcGetFriendRequests(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    var friendsResult = listFriendsPaged(nk, ctx.userId, undefined);
    var incoming: any[] = [];
    var outgoing: any[] = [];

    // Handle both camelCase and snake_case property names from Nakama runtime
    var friendsList = friendsResult || [];

    // Collect all user IDs for batch telegram data lookup
    var requestUserIds: string[] = [];
    var requestDataMap: { [key: string]: { friend: any; state: number } } = {};

    if (friendsList && friendsList.length > 0) {
      for (var i = 0; i < friendsList.length; i++) {
        var friend = friendsList[i] as any;
        var friendUser = friend.user || friend.User;
        var friendUserId = friendUser?.userId || friendUser?.id || friendUser?.Id || friendUser?.user_id;
        var friendState = friend.state !== undefined ? friend.state : friend.State;

        if (friendUserId && (friendState === 1 || friendState === 2)) {
          requestUserIds.push(friendUserId);
          requestDataMap[friendUserId] = { friend: friend, state: friendState };
        }
      }
    }

    // Batch read telegram data for all request users
    var telegramByUserId: { [key: string]: any } = {};
    if (requestUserIds.length > 0) {
      var telegramReads: nkruntime.StorageReadRequest[] = [];
      for (var j = 0; j < requestUserIds.length; j++) {
        telegramReads.push({ collection: 'player_data', key: 'telegram', userId: requestUserIds[j] });
      }
      var telegramResults = nk.storageRead(telegramReads);
      for (var k = 0; k < telegramResults.length; k++) {
        var result = telegramResults[k];
        if (result && result.userId && result.value) {
          telegramByUserId[result.userId] = result.value;
        }
      }
    }

    // Build request lists with avatar URLs from telegram data
    for (var l = 0; l < requestUserIds.length; l++) {
      var reqUserId = requestUserIds[l];
      var reqData = requestDataMap[reqUserId];
      var friendObj = reqData.friend;
      var friendUser = friendObj.user || friendObj.User;
      var telegramData = telegramByUserId[reqUserId];

      var friendUsername = friendUser?.username || friendUser?.Username;
      var friendUpdateTime = friendObj.updateTime || friendObj.update_time || friendObj.UpdateTime;

      // Resolve avatar URL from telegram data first
      var avatarUrl = '';
      if (telegramData && telegramData.photoUrl) {
        avatarUrl = telegramData.photoUrl;
      } else if (friendUser?.avatarUrl || friendUser?.avatar_url || friendUser?.AvatarUrl) {
        avatarUrl = friendUser.avatarUrl || friendUser.avatar_url || friendUser.AvatarUrl;
      }

      // Resolve display name from telegram data or user object
      var displayName = friendUser?.displayName || friendUser?.display_name || friendUser?.DisplayName || friendUsername;
      if (telegramData) {
        if (telegramData.firstName) {
          displayName = telegramData.firstName + (telegramData.lastName ? ' ' + telegramData.lastName : '');
        } else if (telegramData.username) {
          displayName = telegramData.username;
        }
      }

      var friendData = {
        userId: reqUserId,
        username: friendUsername,
        displayName: displayName || friendUsername,
        avatarUrl: avatarUrl,
        sentAt: friendUpdateTime ? new Date(friendUpdateTime).getTime() : Date.now(),
      };

      if (reqData.state === 1) { // Invite sent (outgoing)
        outgoing.push(friendData);
      } else if (reqData.state === 2) { // Invite received (incoming)
        incoming.push(friendData);
      }
    }

    return JSON.stringify({ incoming: incoming, outgoing: outgoing });
  } catch (error) {
    logger.error('Error getting friend requests: ' + error);
    throw error;
  }
}

// RPC: Get friend activity feed
export function rpcGetFriendActivity(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    // Get friends list first
    var friendsResult = listFriendsPaged(nk, ctx.userId, 0);
    var friendIds: string[] = [];

    if (friendsResult && friendsResult.length > 0) {
      for (var i = 0; i < friendsResult.length; i++) {
        var friend = friendsResult[i] as any;
        var friendState = friend.state !== undefined ? friend.state : friend.State;
        var friendUser = friend.user || friend.User;
        // Handle both userId/id and case variants.
        var friendUserId = friendUser?.userId || friendUser?.id || friendUser?.Id || '';
        if (friendState === 0 && friendUserId) {
          friendIds.push(friendUserId);
        }
      }
    }

    // Read activity feed from storage
    var activities: any[] = [];
    if (friendIds.length > 0) {
      var storageReads: nkruntime.StorageReadRequest[] = [];
      for (var j = 0; j < Math.min(friendIds.length, 20); j++) {
        storageReads.push({
          collection: 'player_data',
          key: 'recent_activity',
          userId: friendIds[j],
        });
      }

      var results = nk.storageRead(storageReads);
      for (var k = 0; k < results.length; k++) {
        var result = results[k];
        if (result && result.value && result.value.activities) {
          var userActivities = result.value.activities;
          for (var l = 0; l < userActivities.length; l++) {
            var activity = userActivities[l];
            if (!activity.username && activity.displayName) {
              activity.username = activity.displayName;
            }
            if (!activity.description) {
              activity.description = buildActivityDescription(activity.type, activity.data);
            }
            activities.push(activity);
          }
        }
      }

      // Sort by timestamp (most recent first)
      activities.sort(function(a: any, b: any) {
        return b.timestamp - a.timestamp;
      });

      // Limit to 20 activities
      activities = activities.slice(0, 20);
    }

    return JSON.stringify({ activities: activities });
  } catch (error) {
    logger.error('Error getting friend activity: ' + error);
    return JSON.stringify({ activities: [] });
  }
}

// RPC: Search users by username (improved SQL-based search)
export function rpcSearchUsers(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    var request = JSON.parse(payload || '{}');
    var query = (request.query || '').trim();

    if (query.length < 2) {
      return JSON.stringify({ users: [] });
    }

    var users: any[] = [];
    var queryLower = query.toLowerCase();
    var queryPattern = '%' + queryLower + '%';

    // Search users directly from users table and join with telegram data
    // This is much more efficient than iterating through storage objects
    // Excludes blocked users (both directions) from search results
    var rows: any[] = [];
    try {
      var result = nk.sqlQuery(
        `SELECT u.id, u.username, u.display_name,
                s.value->>'firstName' as telegram_first_name,
                s.value->>'lastName' as telegram_last_name,
                s.value->>'username' as telegram_username,
                s.value->>'photoUrl' as telegram_photo_url
         FROM users u
         LEFT JOIN storage s ON s.user_id = u.id
           AND s.collection = 'player_data' AND s.key = 'telegram'
         WHERE u.id != $1
           AND (u.disable_time IS NULL OR u.disable_time <= '1970-01-02 00:00:00 UTC')
           AND NOT EXISTS (
             SELECT 1 FROM blocked_users b
             WHERE (b.user_id = $1 AND b.blocked_user_id = u.id)
                OR (b.user_id = u.id AND b.blocked_user_id = $1)
           )
           AND (LOWER(u.username) LIKE $2
                OR LOWER(COALESCE(u.display_name, '')) LIKE $2
                OR LOWER(COALESCE(s.value->>'firstName', '')) LIKE $2
                OR LOWER(COALESCE(s.value->>'lastName', '')) LIKE $2
                OR LOWER(COALESCE(s.value->>'username', '')) LIKE $2)
         ORDER BY u.username
         LIMIT 15`,
        [ctx.userId, queryPattern]
      );
      rows = Array.isArray(result) ? result : [];
    } catch (blockTableError) {
      // Fallback if blocked_users table doesn't exist yet - search without block filter
      logger.warn('Blocked users table may not exist, searching without block filter: ' + blockTableError);
      var fallbackResult = nk.sqlQuery(
        `SELECT u.id, u.username, u.display_name,
                s.value->>'firstName' as telegram_first_name,
                s.value->>'lastName' as telegram_last_name,
                s.value->>'username' as telegram_username,
                s.value->>'photoUrl' as telegram_photo_url
         FROM users u
         LEFT JOIN storage s ON s.user_id = u.id
           AND s.collection = 'player_data' AND s.key = 'telegram'
         WHERE u.id != $1
           AND (u.disable_time IS NULL OR u.disable_time <= '1970-01-02 00:00:00 UTC')
           AND (LOWER(u.username) LIKE $2
                OR LOWER(COALESCE(u.display_name, '')) LIKE $2
                OR LOWER(COALESCE(s.value->>'firstName', '')) LIKE $2
                OR LOWER(COALESCE(s.value->>'lastName', '')) LIKE $2
                OR LOWER(COALESCE(s.value->>'username', '')) LIKE $2)
         ORDER BY u.username
         LIMIT 15`,
        [ctx.userId, queryPattern]
      );
      rows = Array.isArray(fallbackResult) ? fallbackResult : [];
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];

      // Get MMR data for each user
      var mmrRead: nkruntime.StorageReadRequest[] = [
        { collection: 'player_data', key: 'global_mmr', userId: row.id },
      ];
      var mmrResults = nk.storageRead(mmrRead);
      var mmrData = mmrResults[0]?.value || { mmr: GAME_CONFIG.STARTING_MMR, rankTier: 'bronze' };

      // Build display name from best available source
      var displayName = row.telegram_first_name || row.display_name || row.username;
      if (row.telegram_first_name && row.telegram_last_name) {
        displayName = row.telegram_first_name + ' ' + row.telegram_last_name;
      }

      users.push({
        userId: row.id,
        id: row.id,
        username: row.username,
        displayName: displayName,
        avatarUrl: row.telegram_photo_url || '',
        mmr: mmrData.mmr,
        rankTier: mmrData.rankTier,
      });
    }

    logger.info('Search for "' + query + '" found ' + users.length + ' users');
    return JSON.stringify({ users: users.slice(0, 10) });
  } catch (error) {
    logger.error('Error searching users: ' + error);
    return JSON.stringify({ users: [] });
  }
}

// RPC: Send friend request
export function rpcSendFriendRequest(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    var request = JSON.parse(payload || '{}');
    var targetUserId = request.userId;

    if (!targetUserId) {
      throw new Error('Target user ID required');
    }

    if (targetUserId === ctx.userId) {
      throw new Error('Cannot add yourself as friend');
    }

    if (isUserBlocked(nk, ctx.userId, targetUserId) || isUserBlocked(nk, targetUserId, ctx.userId)) {
      throw new Error('Cannot send friend request to this user');
    }

    // Verify target user exists before sending request
    try {
      var targetUsers = nk.usersGetId([targetUserId]);
      if (!targetUsers || targetUsers.length === 0) {
        throw new Error('User not found');
      }
    } catch (e) {
      throw new Error('User not found');
    }

    // Add friend (this sends an invite)
    // friendsAdd signature: (userId, username, ids[], usernames[])
    var targetId = String(targetUserId);
    nk.friendsAdd(ctx.userId, ctx.username || '', [targetId], []);

    logger.info('Friend request sent from ' + ctx.userId + ' to ' + targetUserId);
    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Error sending friend request: ' + error);
    throw error;
  }
}

// RPC: Accept friend request
export function rpcAcceptFriendRequest(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    var request = JSON.parse(payload || '{}');
    var targetUserId = request.userId;

    if (!targetUserId) {
      throw new Error('Target user ID required');
    }

    if (isUserBlocked(nk, ctx.userId, targetUserId) || isUserBlocked(nk, targetUserId, ctx.userId)) {
      nk.friendsDelete(ctx.userId, ctx.username || '', [targetUserId], []);
      throw new Error('Cannot accept friend request from this user');
    }

    // Verify there's actually a pending request from this user (state 2 = incoming)
    var friendsCheck = listFriendsPaged(nk, ctx.userId, undefined);
    var hasPendingRequest = false;
    if (friendsCheck && friendsCheck.length > 0) {
      for (var i = 0; i < friendsCheck.length; i++) {
        var friend = friendsCheck[i] as any;
        var friendUser = friend.user || friend.User;
        // Handle both userId/id and case variants.
        var friendUserId = friendUser?.userId || friendUser?.id || friendUser?.Id || '';
        var friendState = friend.state !== undefined ? friend.state : friend.State;
        if (friendUserId === targetUserId && friendState === 2) {
          hasPendingRequest = true;
          break;
        }
      }
    }
    if (!hasPendingRequest) {
      throw new Error('No pending friend request from this user');
    }

    // Accept by adding them as friend (mutual friendship)
    // friendsAdd signature: (userId, username, ids[], usernames[])
    var targetId = String(targetUserId);
    nk.friendsAdd(ctx.userId, ctx.username || '', [targetId], []);

    logger.info('Friend request accepted: ' + ctx.userId + ' and ' + targetUserId);
    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Error accepting friend request: ' + error);
    throw error;
  }
}

// RPC: Reject friend request
export function rpcRejectFriendRequest(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    var request = JSON.parse(payload || '{}');
    var targetUserId = request.userId;

    if (!targetUserId) {
      throw new Error('Target user ID required');
    }

    // Delete the friend relationship (rejects the invite)
    nk.friendsDelete(ctx.userId, ctx.username || '', [targetUserId], []);

    logger.info('Friend request rejected by ' + ctx.userId + ' for ' + targetUserId);
    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Error rejecting friend request: ' + error);
    throw error;
  }
}

// RPC: Remove friend
export function rpcRemoveFriend(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    var request = JSON.parse(payload || '{}');
    var targetUserId = request.userId;

    if (!targetUserId) {
      throw new Error('Target user ID required');
    }

    nk.friendsDelete(ctx.userId, ctx.username || '', [targetUserId], []);

    logger.info('Friend removed: ' + ctx.userId + ' removed ' + targetUserId);
    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Error removing friend: ' + error);
    throw error;
  }
}

// RPC: Challenge friend to a match
export function rpcChallengeFriend(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('User ID required');
  }

  try {
    // Cleanup expired challenges before processing new ones
    cleanupExpiredChallenges(nk, logger);

    var request = JSON.parse(payload || '{}');
    var targetUserId = request.userId;
    var category = typeof request.category === 'string' ? request.category : '';

    if (!targetUserId) {
      throw new Error('Target user ID required');
    }

    if (!category || !isValidCategoryFromDb(nk, logger, category)) {
      var fallbackCategory = getDefaultCategoryKey(nk, logger);
      if (!fallbackCategory) {
        throw new Error('No valid categories available');
      }
      if (category && category !== fallbackCategory) {
        logger.warn('Invalid challenge category "' + category + '" - defaulting to "' + fallbackCategory + '"');
      }
      category = fallbackCategory;
    }

    if (isUserBlocked(nk, ctx.userId, targetUserId) || isUserBlocked(nk, targetUserId, ctx.userId)) {
      throw new Error('Cannot challenge this user');
    }

    // Ensure they are mutual friends
    if (!isMutualFriend(nk, ctx.userId, targetUserId)) {
      throw new Error('Can only challenge friends');
    }

    // Safety Check 1: Check if challenger already has a pending outgoing challenge
    var existingOutgoing = nk.sqlQuery(
      `SELECT id FROM pending_challenges
       WHERE challenger_id = $1 AND status = 'pending' AND expires_at > NOW()`,
      [ctx.userId]
    );
    var outgoingRows = Array.isArray(existingOutgoing) ? existingOutgoing : [];
    if (outgoingRows.length > 0) {
      throw new Error('You already have a pending challenge');
    }

    // Safety Check 2: Check if target already has a pending incoming challenge
    var existingIncoming = nk.sqlQuery(
      `SELECT id FROM pending_challenges
       WHERE challenged_id = $1 AND status = 'pending' AND expires_at > NOW()`,
      [targetUserId]
    );
    var incomingRows = Array.isArray(existingIncoming) ? existingIncoming : [];
    if (incomingRows.length > 0) {
      throw new Error('User already has a pending challenge');
    }

    // Safety Check 3: Check 30-second cooldown between same pair after accepted challenge
    var recentMatch = nk.sqlQuery(
      `SELECT id, EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_ago FROM pending_challenges
       WHERE ((challenger_id = $1 AND challenged_id = $2) OR (challenger_id = $2 AND challenged_id = $1))
       AND status = 'accepted' AND created_at > NOW() - INTERVAL '30 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [ctx.userId, targetUserId]
    );
    var recentRows = Array.isArray(recentMatch) ? recentMatch : [];
    if (recentRows.length > 0) {
      var secondsAgo = Math.floor(Number(recentRows[0].seconds_ago) || 0);
      var remainingSeconds = Math.max(0, 30 - secondsAgo);
      throw new Error('COOLDOWN:' + remainingSeconds);
    }

    // Safety Check 4: Check if target is in a match
    var targetGameState = getPlayerGameState(nk, targetUserId);
    if (targetGameState && targetGameState !== 'idle' && targetGameState !== 'selecting') {
      throw new Error('User is currently in a match');
    }

    // Safety Check 5: Check if challenger is in a match
    var challengerGameState = getPlayerGameState(nk, ctx.userId);
    if (challengerGameState && challengerGameState !== 'idle' && challengerGameState !== 'selecting') {
      throw new Error('You cannot challenge while in a match');
    }

    // Get challenger display name
    var challengerName = ctx.username || 'Unknown';
    var challengerAvatarUrl = '';
    try {
      var storageRead: nkruntime.StorageReadRequest[] = [
        { collection: 'player_data', key: 'telegram', userId: ctx.userId },
      ];
      var results = nk.storageRead(storageRead);
      if (results[0]?.value) {
        challengerName = results[0].value.firstName || results[0].value.username || challengerName;
        challengerAvatarUrl = results[0].value.photoUrl || '';
      }
    } catch (e) {
      // Use default
    }

    // Create challenge in pending_challenges table
    var expiresAt = new Date(Date.now() + 60000); // 60 seconds
    var challengeResult = nk.sqlQuery(
      `INSERT INTO pending_challenges (challenger_id, challenged_id, category, expires_at, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [ctx.userId, targetUserId, category, expiresAt.toISOString()]
    );
    var challengeRows = Array.isArray(challengeResult) ? challengeResult : [];
    var challengeId = challengeRows.length > 0 ? challengeRows[0].id : nk.uuidv4();

    var categoryText = category ? ' in ' + category : '';
    var notificationTitle = 'New Challenge!';
    var notificationBody = challengerName + ' challenged you to a quiz battle' + categoryText + '.';

    if (shouldStoreNotification(nk, targetUserId, 'friend_challenge')) {
      // Persist notification for inbox/list
      try {
        nk.sqlExec(
          `INSERT INTO notifications (user_id, type, title, body, data, expires_at)
           VALUES ($1, 'friend_challenge', $2, $3, $4, $5)`,
          [
            targetUserId,
            notificationTitle,
            notificationBody,
            JSON.stringify({
              inbox: true,
              type: 'friend_challenge',
              title: notificationTitle,
              body: notificationBody,
              challengeId: challengeId,
              fromUserId: ctx.userId,
              fromUsername: ctx.username || 'Unknown',
              fromDisplayName: challengerName,
              fromAvatarUrl: challengerAvatarUrl,
              category: category,
              expiresAt: expiresAt.getTime(),
            }),
            expiresAt.toISOString(),
          ]
        );
      } catch (notifyError) {
        logger.warn('Failed to persist friend challenge notification: ' + notifyError);
      }

      // Send Nakama notification for real-time delivery
      var notification: nkruntime.NotificationRequest = {
        userId: targetUserId,
        subject: 'Friend Challenge',
        content: {
          type: 'friend_challenge',
          inbox: true,
          title: notificationTitle,
          body: notificationBody,
          challengeId: challengeId,
          fromUserId: ctx.userId,
          fromUsername: ctx.username || 'Unknown',
          fromDisplayName: challengerName,
          fromAvatarUrl: challengerAvatarUrl,
          category: category,
          expiresAt: expiresAt.getTime(),
        },
        code: 100, // Custom code for challenges
        persistent: false, // Don't persist - has expiry
      };

      if (shouldSendRealtimeNotification(nk, targetUserId, 'friend_challenge')) {
        nk.notificationsSend([notification]);
      }

      // Send push notification via Telegram Bot
      try {
        TelegramBot.sendChallengeNotification(nk, logger, targetUserId, challengerName, category);
      } catch (pushError) {
        logger.warn('Failed to send push notification: ' + pushError);
      }
    }

    logger.info('Challenge sent from ' + ctx.userId + ' to ' + targetUserId + ' (id: ' + challengeId + ')');
    return JSON.stringify({ success: true, challengeId: challengeId });
  } catch (error) {
    logger.error('Error challenging friend: ' + error);
    throw error;
  }
}

// ============================================================================
