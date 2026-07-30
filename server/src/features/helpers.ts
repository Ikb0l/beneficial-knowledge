// Beneficial Knowledge - Feature RPCs
// Game Config, Wallets, Badges, Seasons, Tournaments, Notifications, Analytics, Donations

import {
  runTournamentMaintenanceCycle,
} from '../main/tournament-advance';
import { fillTournamentWithBots, getTournamentBotPolicy } from '../main/tournament-bots';
import { generateTournamentBracket } from './tournaments';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toByteArray(value: any): number[] | null {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  var arrayLike = value as {[key: string]: any; length?: any};
  var lengthNum = Number(arrayLike.length);
  if (Number.isInteger(lengthNum) && lengthNum > 0 && lengthNum <= 1024 * 1024) {
    var out: number[] = [];
    for (var i = 0; i < lengthNum; i++) {
      if (!Object.prototype.hasOwnProperty.call(arrayLike, String(i))) {
        return null;
      }
      out.push(arrayLike[String(i)]);
    }
    return out;
  }

  var keys = Object.keys(arrayLike);
  if (keys.length === 0) {
    return null;
  }
  for (var k = 0; k < keys.length; k++) {
    if (!/^\d+$/.test(keys[k])) {
      return null;
    }
  }

  keys.sort(function(a: string, b: string) {
    return parseInt(a, 10) - parseInt(b, 10);
  });
  if (parseInt(keys[0], 10) !== 0) {
    return null;
  }

  var decoded: number[] = [];
  for (var idx = 0; idx < keys.length; idx++) {
    if (parseInt(keys[idx], 10) !== idx) {
      return null;
    }
    decoded.push(arrayLike[keys[idx]]);
  }
  return decoded;
}

function coerceFiniteNumber(value: any): number | null {
  var num = Number(value);
  if (Number.isFinite(num)) {
    return num;
  }

  if (value && typeof value === 'object') {
    try {
      var primitive = typeof value.valueOf === 'function' ? value.valueOf() : value;
      num = Number(primitive);
      if (Number.isFinite(num)) {
        return num;
      }
    } catch (_e) {
      // Ignore and continue fallback coercions.
    }
    try {
      var str = String(value);
      if (/^-?\d+(\.\d+)?$/.test(str)) {
        num = Number(str);
        if (Number.isFinite(num)) {
          return num;
        }
      }
    } catch (_e2) {
      // Ignore and return null below.
    }
  }

  return null;
}

function tryNormalizeSerializable(value: any): any {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_e) {
    return null;
  }
}

function parseJsonFromByteArray(value: any): any {
  var bytes = toByteArray(value);
  if (!bytes || bytes.length === 0) {
    return null;
  }

  var text = '';
  for (var i = 0; i < bytes.length; i++) {
    var nextRaw = coerceFiniteNumber(bytes[i]);
    if (nextRaw === null || nextRaw < 0 || nextRaw > 255) {
      return null;
    }
    var next = nextRaw;
    text += String.fromCharCode(Math.floor(next));
  }

  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

// Helper function to safely parse JSONB values
// PostgreSQL JSONB columns may be returned as objects, strings, or byte arrays.
export function parseJsonb<T>(value: any, defaultValue: T): T {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  if (Array.isArray(value) || typeof value === 'object') {
    var fromBytes = parseJsonFromByteArray(value);
    if (fromBytes !== null) {
      return fromBytes as T;
    }

    // Some Nakama JSONB wrappers serialize cleanly even when direct Number() coercion fails.
    var normalized = tryNormalizeSerializable(value);
    if (normalized !== null && normalized !== undefined) {
      var fromNormalizedBytes = parseJsonFromByteArray(normalized);
      if (fromNormalizedBytes !== null) {
        return fromNormalizedBytes as T;
      }
      if (typeof normalized === 'string') {
        try {
          return JSON.parse(normalized) as T;
        } catch (_e2) {
          // Fall through to object/default handling.
        }
      }
      if (typeof normalized === 'object') {
        return normalized as T;
      }
    }
  }

  if (typeof value === 'object') {
    return value as T;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (_e) {
      return defaultValue;
    }
  }

  return defaultValue;
}

export var BEST_OF_ALLOWED = [1, 3, 5];

export function normalizeBestOfValue(value: any, fallbackValue: number): number {
  var num = Number(value);
  if (!Number.isFinite(num)) return fallbackValue;
  if (BEST_OF_ALLOWED.indexOf(num) === -1) return fallbackValue;
  return num;
}

export function normalizeBestOfArray(values: any, length: number, fallbackValue: number): number[] {
  function readRoundValue(raw: any, index: number): any {
    if (Array.isArray(raw)) {
      return raw[index];
    }
    if (raw && typeof raw === 'object') {
      var usesZeroBased = Object.prototype.hasOwnProperty.call(raw, '0');
      var key = usesZeroBased ? String(index) : String(index + 1);
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        return raw[key];
      }
    }
    return undefined;
  }

  var out: number[] = [];
  for (var i = 0; i < length; i++) {
    var raw = readRoundValue(values, i);
    out.push(normalizeBestOfValue(raw, fallbackValue));
  }
  return out;
}

export function buildBestOfByRound(
  bracketSize: number,
  format: string,
  seedingMode: string,
  inputConfig?: any
): any {
  var totalRounds = Math.ceil(Math.log2(bracketSize));
  var isDouble = format === 'double_elimination';
  var totalLosersRounds = isDouble ? Math.max(0, (totalRounds - 1) * 2) : 0;
  var defaultConfig = {
    opening: 1,
    winners: normalizeBestOfArray([], totalRounds, 1),
    losers: normalizeBestOfArray([], totalLosersRounds, 1),
    grand_final: isDouble ? 5 : 1,
    default: 1,
  };

  if (!inputConfig || typeof inputConfig !== 'object') {
    return defaultConfig;
  }

  var normalizedDefault = normalizeBestOfValue(inputConfig.default, defaultConfig.default);
  var config = {
    opening: normalizeBestOfValue(inputConfig.opening !== undefined ? inputConfig.opening : inputConfig.opening_round, defaultConfig.opening),
    winners: normalizeBestOfArray(inputConfig.winners, totalRounds, normalizedDefault),
    losers: normalizeBestOfArray(inputConfig.losers, totalLosersRounds, normalizedDefault),
    grand_final: normalizeBestOfValue(
      inputConfig.grand_final !== undefined ? inputConfig.grand_final : inputConfig.grandFinal,
      defaultConfig.grand_final
    ),
    default: normalizedDefault,
  };

  // If no opening round (not random), keep opening equal to winners round 1 for safety
  if (seedingMode !== 'random_opening_round') {
    config.opening = config.winners[0] || config.default;
  }

  return config;
}

export function getBestOfForMatch(
  config: any,
  bracketType: string,
  roundNumber: number,
  isOpeningRound: boolean
): number {
  if (!config || typeof config !== 'object') {
    return 1;
  }
  if (isOpeningRound && config.opening !== undefined) {
    return normalizeBestOfValue(config.opening, 1);
  }
  if (bracketType === 'grand_final') {
    return normalizeBestOfValue(config.grand_final, 1);
  }
  var bracketConfig = config[bracketType];
  if (Array.isArray(bracketConfig)) {
    var idx = Math.max(0, roundNumber - 1);
    if (idx < bracketConfig.length) {
      return normalizeBestOfValue(bracketConfig[idx], 1);
    }
  } else if (bracketConfig && typeof bracketConfig === 'object') {
    var key = String(roundNumber);
    if (Object.prototype.hasOwnProperty.call(bracketConfig, key)) {
      return normalizeBestOfValue(bracketConfig[key], 1);
    }
  }
  if (config.default !== undefined) {
    return normalizeBestOfValue(config.default, 1);
  }
  return 1;
}

export function autoStartTournament(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  bracketSize: number,
  format: string
): void {
  try {
    nk.sqlExec(`BEGIN`, []);

    var lockResult = nk.sqlQuery(
      `SELECT status, seeding_mode, best_of_by_round, bot_policy FROM tournaments WHERE id = $1 FOR UPDATE`,
      [tournamentId]
    );
    var lockRows = Array.isArray(lockResult) ? lockResult : [];
    if (lockRows.length === 0) {
      nk.sqlExec(`ROLLBACK`, []);
      return;
    }

    if (lockRows[0].status !== 'registration' && lockRows[0].status !== 'upcoming') {
      nk.sqlExec(`COMMIT`, []);
      return;
    }

    var tournamentBotPolicy = getTournamentBotPolicy(nk, logger, tournamentId, lockRows[0].bot_policy);
    fillTournamentWithBots(nk, logger, tournamentId, bracketSize, tournamentBotPolicy);

    // Lock registered participants so start decision cannot race with registration updates.
    var lockedParticipantsResult = nk.sqlQuery(
      `SELECT id
       FROM tournament_participants
       WHERE tournament_id = $1
         AND status = 'registered'
       FOR UPDATE`,
      [tournamentId]
    );
    var lockedParticipantsRows = Array.isArray(lockedParticipantsResult) ? lockedParticipantsResult : [];
    var participantCount = lockedParticipantsRows.length;

    // Keep denormalized counter aligned at start boundary.
    nk.sqlExec(
      `UPDATE tournaments SET registered_count = $1 WHERE id = $2`,
      [participantCount, tournamentId]
    );

    if (tournamentBotPolicy.enabled && tournamentBotPolicy.fillOnStart && participantCount < bracketSize) {
      throw new Error(
        'Tournament bot fill incomplete for ' +
        tournamentId +
        ': expected ' +
        bracketSize +
        ' registered participants but found ' +
        participantCount
      );
    }

    if (participantCount < 2) {
      nk.sqlExec(
        `UPDATE tournaments SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1 AND status IN ('registration', 'upcoming')`,
        [tournamentId]
      );
      nk.sqlExec(`COMMIT`, []);
      logger.warn('Auto-cancelled tournament ' + tournamentId + ' (not enough participants)');
      return;
    }

    var matchesResult = nk.sqlQuery(
      `SELECT 1 FROM tournament_matches WHERE tournament_id = $1 LIMIT 1`,
      [tournamentId]
    );
    var matchesRows = Array.isArray(matchesResult) ? matchesResult : [];

    if (matchesRows.length === 0) {
    var seedingMode = lockRows[0].seeding_mode || 'mmr';
    var bestOfByRound = parseJsonb(lockRows[0].best_of_by_round, null);
    generateTournamentBracket(nk, logger, tournamentId, bracketSize, format, seedingMode, bestOfByRound);
    }

    nk.sqlExec(
      `UPDATE tournaments SET status = 'in_progress', current_round = 1,
       last_progression_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('registration', 'upcoming')`,
      [tournamentId]
    );

    nk.sqlExec(`COMMIT`, []);
    runTournamentMaintenanceCycle(nk, logger, tournamentId);
  } catch (error) {
    try {
      nk.sqlExec(`ROLLBACK`, []);
    } catch (rollbackError) {
      logger.error('Failed to rollback auto-start transaction: ' + rollbackError);
    }
    logger.warn('Failed to auto-start tournament ' + tournamentId + ': ' + error);
  }
}

export function syncTournamentStatuses(nk: nkruntime.Nakama, logger: nkruntime.Logger): void {
  try {
    nk.sqlExec(
      `UPDATE tournaments SET status = 'registration', updated_at = NOW()
       WHERE status = 'upcoming' AND registration_start <= NOW() AND registration_end > NOW()`
    );
    nk.sqlExec(
      `UPDATE tournaments SET status = 'upcoming', updated_at = NOW()
       WHERE status = 'registration' AND registration_end <= NOW() AND tournament_start > NOW()`
    );

    var dueResult = nk.sqlQuery(
      `SELECT id, bracket_size, format
       FROM tournaments
       WHERE status IN ('registration', 'upcoming') AND tournament_start <= NOW()`
    );
    var dueRows = Array.isArray(dueResult) ? dueResult : [];

    for (var i = 0; i < dueRows.length; i++) {
      var row = dueRows[i];
      autoStartTournament(nk, logger, row.id, parseInt(row.bracket_size), row.format);
    }

    // Self-heal in-progress brackets so missed advancement events (e.g. transient
    // lock contention) cannot leave tournaments stuck indefinitely.
    // Uses last_progression_at to skip tournaments that were recently progressed,
    // and caps at 25 to keep RPC latency bounded.  The cron job handles the rest.
    var activeResult = nk.sqlQuery(
      `SELECT id
       FROM tournaments
       WHERE status = 'in_progress'
         AND (last_progression_at IS NULL
              OR last_progression_at < NOW() - INTERVAL '30 seconds')
       ORDER BY last_progression_at ASC NULLS FIRST
       LIMIT 25`
    );
    var activeRows = Array.isArray(activeResult) ? activeResult : [];
    for (var a = 0; a < activeRows.length; a++) {
      var tournamentId = activeRows[a].id;
      if (!tournamentId) continue;
      runTournamentMaintenanceCycle(nk, logger, tournamentId);
      nk.sqlExec(
        `UPDATE tournaments SET last_progression_at = NOW() WHERE id = $1`,
        [tournamentId]
      );
    }
  } catch (error) {
    logger.warn('Failed to sync tournament statuses: ' + error);
  }
}

// Helper function to get player's current game state (for challenge safety checks)
export function getPlayerGameStateFeatures(nk: nkruntime.Nakama, userId: string): string | null {
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

// Helper function to get admin telegram IDs from environment
export function getAdminTelegramIdsFeatures(ctx: nkruntime.Context): number[] {
  var adminIdsStr = ctx.env['ADMIN_TELEGRAM_IDS'] || '';
  if (!adminIdsStr) return [];
  return adminIdsStr.split(',').map(function(id: string) {
    return parseInt(id.trim(), 10);
  }).filter(function(id: number) {
    return !isNaN(id);
  });
}

// Helper to get admin info for audit logging
export function getAdminInfoForFeatures(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): { adminId: string; telegramId: number } {
  var telegramId: number = 0;

  // Try reading from global_mmr first
  try {
    var storageRead: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'global_mmr', userId: ctx.userId! },
    ];
    var results = nk.storageRead(storageRead);
    if (results[0]?.value?.telegramId) {
      telegramId = parseInt(results[0].value.telegramId.toString(), 10);
    }
  } catch (e) {
    logger.warn('Error reading global_mmr data: ' + e);
  }

  // Fallback to telegram storage if not found
  if (!telegramId) {
    try {
      var telegramRead: nkruntime.StorageReadRequest[] = [
        { collection: 'player_data', key: 'telegram', userId: ctx.userId! },
      ];
      var telegramResults = nk.storageRead(telegramRead);
      if (telegramResults[0]?.value?.telegramId) {
        telegramId = parseInt(telegramResults[0].value.telegramId.toString(), 10);
      }
    } catch (e) {
      logger.warn('Error reading telegram data: ' + e);
    }
  }

  return { adminId: ctx.userId || '', telegramId: telegramId };
}

// Audit logging for admin actions in features.ts
export function logAdminActionFeatures(
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

export function requireAdminForFeatures(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  var telegramId: number = 0;

  // Try reading from global_mmr first (consistent with main.ts requireAdmin)
  try {
    var storageRead: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'global_mmr', userId: ctx.userId },
    ];
    var results = nk.storageRead(storageRead);
    if (results[0]?.value?.telegramId) {
      telegramId = parseInt(results[0].value.telegramId.toString(), 10);
    }
  } catch (e) {
    logger.warn('Error reading global_mmr data: ' + e);
  }

  // Fallback to telegram storage if not found
  if (!telegramId) {
    try {
      var telegramRead: nkruntime.StorageReadRequest[] = [
        { collection: 'player_data', key: 'telegram', userId: ctx.userId },
      ];
      var telegramResults = nk.storageRead(telegramRead);
      if (telegramResults[0]?.value?.telegramId) {
        telegramId = parseInt(telegramResults[0].value.telegramId.toString(), 10);
      }
    } catch (e) {
      logger.warn('Error reading telegram data: ' + e);
    }
  }

  if (!telegramId) {
    throw new Error('Admin authentication required: Telegram ID not found');
  }

  // First check environment variable for bootstrap admins (like main.ts)
  var envAdminIds = getAdminTelegramIdsFeatures(ctx);
  if (envAdminIds.indexOf(telegramId) !== -1) {
    return; // User is a super admin from env var
  }

  // Check database for admin users
  try {
    var adminCheck = nk.sqlQuery(
      `SELECT admin_level FROM admin_users WHERE telegram_id = $1 AND is_active = true`,
      [telegramId]
    );
    var rows = Array.isArray(adminCheck) ? adminCheck : [];
    if (rows.length === 0) {
      throw new Error('Unauthorized: Not an admin');
    }
  } catch (e) {
    throw new Error('Unauthorized: Admin check failed - ' + e);
  }
}

export function requireSuperAdminForFeatures(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  requireAdminForFeatures(ctx, nk, logger);
  var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
  var telegramId = adminInfo.telegramId;
  if (!telegramId) {
    throw new Error('Super admin authentication required');
  }

  var envAdminIds = getAdminTelegramIdsFeatures(ctx);
  if (envAdminIds.indexOf(telegramId) !== -1) {
    return;
  }

  try {
    var result = nk.sqlQuery(
      `SELECT admin_level FROM admin_users WHERE telegram_id = $1 AND is_active = true`,
      [telegramId]
    );
    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0 || rows[0].admin_level !== 'super_admin') {
      throw new Error('Super admin access required');
    }
  } catch (e) {
    throw new Error('Super admin access required');
  }
}
