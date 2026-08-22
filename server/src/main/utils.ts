// UTILITY FUNCTIONS
// ============================================================================

// Decode Uint8Array to string (TextDecoder is not available in Nakama JS runtime)
export function decodeData(data: ArrayBuffer | Uint8Array | string): string {
  if (typeof data === 'string') {
    return data;
  }
  var bytes = new Uint8Array(data);
  var result = '';
  for (var i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

export function getStorageValueByKey(
  results: nkruntime.StorageObject[] | null | undefined,
  key: string
): any {
  if (!results || results.length === 0) {
    return null;
  }
  for (var i = 0; i < results.length; i++) {
    if (results[i] && results[i].key === key) {
      return results[i].value;
    }
  }
  return null;
}

export function readProfileOverrides(
  nk: nkruntime.Nakama,
  userId: string,
  logger?: nkruntime.Logger
): { displayName?: string; avatarUrl?: string } {
  try {
    var results = nk.storageRead([{ collection: 'player_data', key: 'profile_overrides', userId: userId }]);
    var value = results[0]?.value;
    if (value && typeof value === 'object') {
      return {
        displayName: typeof value.displayName === 'string' ? value.displayName : undefined,
        avatarUrl: (typeof value.avatarUrl === 'string' && value.avatarUrl.trim())
          ? value.avatarUrl.trim()
          : undefined,
      };
    }
  } catch (e) {
    if (logger) {
      logger.warn('Could not read profile overrides: ' + e);
    }
  }
  return {};
}

export function resolveDisplayName(
  accountUser: nkruntime.User | null | undefined,
  telegramData: any,
  overrides: { displayName?: string }
): string {
  if (overrides && typeof overrides.displayName === 'string' && overrides.displayName.trim()) {
    return overrides.displayName.trim();
  }
  if (accountUser && accountUser.displayName && accountUser.displayName.trim()) {
    return accountUser.displayName.trim();
  }
  if (telegramData && telegramData.firstName) {
    var name = telegramData.firstName;
    if (telegramData.lastName) {
      name += ' ' + telegramData.lastName;
    }
    if (name.trim()) return name;
  }
  return accountUser?.username || 'Player';
}

export function resolveAvatarUrl(
  accountUser: nkruntime.User | null | undefined,
  telegramData: any,
  overrides: { avatarUrl?: string }
): string {
  if (overrides && typeof overrides.avatarUrl === 'string' && overrides.avatarUrl.trim()) {
    return overrides.avatarUrl.trim();
  }
  if (accountUser && accountUser.avatarUrl) {
    return accountUser.avatarUrl;
  }
  if (telegramData) {
    if (telegramData.photoUrl) return telegramData.photoUrl;
    if (telegramData.photo_url) return telegramData.photo_url;
  }
  return '';
}

export function getOwnerRecordFromList(
  list: nkruntime.LeaderboardRecordList | null,
  ownerId: string
): nkruntime.LeaderboardRecord | null {
  if (!list) {
    return null;
  }

  var ownerRecords = (list as any).ownerRecords || (list as any).oderRecords || [];
  if (ownerRecords && ownerRecords.length > 0) {
    return ownerRecords[0];
  }

  var records = list.records || [];
  for (var i = 0; i < records.length; i++) {
    if (records[i].ownerId === ownerId) {
      return records[i];
    }
  }

  return null;
}

// ============================================================================
