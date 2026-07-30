import { readProfileOverrides } from './utils';

// PROFILE UPDATE RPC
// ============================================================================

// RPC: Update user profile
export function rpcUpdateProfile(
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
    var hasDisplayName = Object.prototype.hasOwnProperty.call(request, 'displayName');
    var hasAvatarUrl = Object.prototype.hasOwnProperty.call(request, 'avatarUrl');
    var displayName = hasDisplayName ? String(request.displayName || '').trim() : undefined;
    var avatarUrl = hasAvatarUrl ? String(request.avatarUrl || '').trim() : undefined;

    // Validate display name
    if (hasDisplayName) {
      if (!displayName) {
        throw new Error('Display name must be between 2 and 50 characters');
      }
      if (displayName.length < 2 || displayName.length > 50) {
        throw new Error('Display name must be between 2 and 50 characters');
      }
    }

    if (hasAvatarUrl && avatarUrl) {
      if (avatarUrl.length > 2048) {
        throw new Error('Avatar URL is too long');
      }
      if (!/^https?:\/\//i.test(avatarUrl)) {
        throw new Error('Avatar URL must start with http:// or https://');
      }
    }

    // Update account
    nk.accountUpdateId(
      ctx.userId,
      undefined,         // username (not changing)
      hasDisplayName ? displayName : undefined,
      hasAvatarUrl ? avatarUrl : undefined,
      undefined,         // langTag
      undefined,         // location
      undefined          // timezone
    );

    // Persist overrides for consistent profile display
    try {
      var currentOverrides = readProfileOverrides(nk, ctx.userId, logger);
      var nextOverrides: { displayName?: string; avatarUrl?: string } = {};
      if (currentOverrides.displayName) {
        nextOverrides.displayName = currentOverrides.displayName;
      }
      if (currentOverrides.avatarUrl) {
        nextOverrides.avatarUrl = currentOverrides.avatarUrl;
      }
      if (hasDisplayName) {
        nextOverrides.displayName = displayName;
      }
      if (hasAvatarUrl) {
        if (avatarUrl) {
          nextOverrides.avatarUrl = avatarUrl;
        } else {
          delete nextOverrides.avatarUrl;
        }
      }
      nk.storageWrite([{
        collection: 'player_data',
        key: 'profile_overrides',
        userId: ctx.userId,
        value: nextOverrides,
        permissionRead: 2,
        permissionWrite: 0,
      }]);
    } catch (overrideError) {
      logger.warn('Failed to persist profile overrides: ' + overrideError);
    }

    logger.info('Profile updated for user ' + ctx.userId);
    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Error updating profile: ' + error);
    throw error;
  }
}

// Helper function to record activity for friends feed
export function recordUserActivity(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  username: string,
  avatarUrl: string,
  activityType: string,
  description: string,
  metadata?: any
): void {
  try {
    // Read current activities
    var storageRead: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'recent_activity', userId: userId },
    ];
    var results = nk.storageRead(storageRead);
    var activities = results[0]?.value?.activities || [];

    // Add new activity
    var newActivity = {
      id: nk.uuidv4(),
      userId: userId,
      username: username,
      avatarUrl: avatarUrl,
      type: activityType,
      description: description,
      timestamp: Date.now(),
      metadata: metadata,
    };

    activities.unshift(newActivity);

    // Keep only last 10 activities
    activities = activities.slice(0, 10);

    // Save
    var writes: nkruntime.StorageWriteRequest[] = [
      {
        collection: 'player_data',
        key: 'recent_activity',
        userId: userId,
        value: { activities: activities },
        permissionRead: 2,
        permissionWrite: 0,
      },
    ];
    nk.storageWrite(writes);
  } catch (error) {
    logger.error('Error recording activity: ' + error);
  }
}

// ============================================================================
