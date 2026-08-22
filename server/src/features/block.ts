// BLOCK SYSTEM RPCs
// ============================================================================

export function rpcGetBlockedUsers(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    var result = nk.sqlQuery(
      `SELECT b.blocked_user_id, b.blocked_at,
              u.username,
              s.value->>'firstName' as first_name,
              s.value->>'lastName' as last_name,
              s.value->>'photoUrl' as photo_url
       FROM blocked_users b
       LEFT JOIN users u ON u.id = b.blocked_user_id
       LEFT JOIN storage s ON s.user_id = b.blocked_user_id
         AND s.collection = 'player_data' AND s.key = 'telegram'
       WHERE b.user_id = $1
       ORDER BY b.blocked_at DESC`,
      [ctx.userId]
    );
    var rows = Array.isArray(result) ? result : [];

    var blockedUsers = rows.map(function(row: any) {
      // Build display name from first and last name
      var displayName = row.username || 'Unknown';
      if (row.first_name) {
        displayName = row.first_name + (row.last_name ? ' ' + row.last_name : '');
      }

      return {
        userId: row.blocked_user_id,
        username: row.username || 'Unknown',
        displayName: displayName,
        avatarUrl: row.photo_url || '',
        blockedAt: new Date(row.blocked_at).getTime(),
      };
    });

    return JSON.stringify({
      blockedUsers: blockedUsers,
    });
  } catch (error) {
    // Handle case where blocked_users table doesn't exist yet
    var errorStr = String(error);
    if (errorStr.includes('does not exist') || errorStr.includes('relation')) {
      logger.warn('Blocked users table may not exist yet: ' + error);
      return JSON.stringify({ blockedUsers: [] });
    }
    logger.error('Error getting blocked users: ' + error);
    throw error;
  }
}

export function rpcBlockUser(
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
    var targetUserId = request.userId;

    if (!targetUserId) {
      throw new Error('userId is required');
    }

    if (targetUserId === ctx.userId) {
      throw new Error('Cannot block yourself');
    }

    // Add to blocked list
    nk.sqlExec(
      `INSERT INTO blocked_users (user_id, blocked_user_id, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, blocked_user_id) DO NOTHING`,
      [ctx.userId, targetUserId, request.reason || null]
    );

    // Remove any existing friendship
    nk.friendsDelete(ctx.userId, ctx.username || '', [targetUserId], []);

    // Cancel any pending challenges between these users
    try {
      nk.sqlExec(
        `UPDATE pending_challenges
         SET status = 'auto_declined'
         WHERE status = 'pending'
         AND ((challenger_id = $1 AND challenged_id = $2)
              OR (challenger_id = $2 AND challenged_id = $1))`,
        [ctx.userId, targetUserId]
      );
    } catch (e) {
      logger.warn('Error canceling pending challenges on block: ' + e);
    }

    logger.info('User ' + ctx.userId + ' blocked ' + targetUserId);

    return JSON.stringify({
      success: true,
      blockedUserId: targetUserId,
    });
  } catch (error) {
    logger.error('Error blocking user: ' + error);
    throw error;
  }
}

export function rpcUnblockUser(
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
    var targetUserId = request.userId;

    if (!targetUserId) {
      throw new Error('userId is required');
    }

    nk.sqlExec(
      `DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2`,
      [ctx.userId, targetUserId]
    );

    logger.info('User ' + ctx.userId + ' unblocked ' + targetUserId);

    return JSON.stringify({
      success: true,
      unblockedUserId: targetUserId,
    });
  } catch (error) {
    logger.error('Error unblocking user: ' + error);
    throw error;
  }
}

// Note: isUserBlocked function is defined in main.ts and available via bundling

// ============================================================================
