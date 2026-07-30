// Rate Limiter Utility for Nakama Server
// Provides rate limiting for RPC calls to prevent abuse
//
// Uses Nakama storage for distributed rate limiting, which works correctly
// in clustered/multi-node deployments. Each rate limit entry is stored
// per-user per-RPC, with automatic window expiration.
//
// Storage collection: 'rate_limits'
// Key format: 'rate_limit_<rpcId>'
// Value: { count: number, windowStart: timestamp }

export var CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup interval for old rate limit entries
export var RATE_LIMIT_IDLE_TTL_MS = 24 * 60 * 60 * 1000; // Delete entries idle for 24 hours
export var CLEANUP_SAMPLE_RATE = 0.02; // 2% of requests trigger cleanup for this user

// Default rate limit configuration
export var DEFAULT_RATE_LIMIT = {
  windowMs: 60000,     // 1 minute window
  maxRequests: 60,     // 60 requests per minute (1/second average)
};

// RPC-specific rate limits (stricter for expensive operations)
export var RPC_RATE_LIMITS: {[key: string]: { windowMs: number; maxRequests: number }} = {
  // Matchmaking
  'find_match': { windowMs: 10000, maxRequests: 3 },          // 3 per 10 seconds
  'cancel_matchmaking': { windowMs: 5000, maxRequests: 5 },   // 5 per 5 seconds

  // Friends/Social
  'send_friend_request': { windowMs: 60000, maxRequests: 10 }, // 10 per minute
  'challenge_friend': { windowMs: 30000, maxRequests: 5 },     // 5 per 30 seconds
  'block_user': { windowMs: 60000, maxRequests: 10 },          // 10 per minute

  // Donations
  'create_stars_invoice': { windowMs: 60000, maxRequests: 3 }, // 3 per minute
  'confirm_stars_payment': { windowMs: 60000, maxRequests: 3 }, // 3 per minute

  // Tournaments
  'register_for_tournament': { windowMs: 30000, maxRequests: 3 }, // 3 per 30 seconds
  // This RPC is additionally keyed by user+match (see main.ts wrapper),
  // so it can tolerate brief reconnect/retry bursts without blocking bracket progress.
  'start_tournament_match': { windowMs: 10000, maxRequests: 12 }, // 12 per 10 seconds (per user+match)

  // Search
  'search_users': { windowMs: 10000, maxRequests: 10 },        // 10 per 10 seconds

  // Web authentication
  'validate_referral_code': { windowMs: 60000, maxRequests: 20 }, // 20 per minute
  'web_register': { windowMs: 60000, maxRequests: 5 },            // 5 per minute
  'web_login': { windowMs: 60000, maxRequests: 10 },              // 10 per minute
  'telegram_web_login': { windowMs: 60000, maxRequests: 10 },     // 10 per minute

  // Admin operations (stricter to prevent abuse)
  'admin_bulk_import_questions': { windowMs: 60000, maxRequests: 50 }, // 50 per minute for dev
  'admin_export_questions': { windowMs: 30000, maxRequests: 5 },      // 5 per 30 seconds
};

// Storage owner for keyed/anonymous rate-limit buckets.
// Must be a valid UUID because Nakama storage enforces user_id format.
export var KEYED_RATE_LIMIT_OWNER_ID = '00000000-0000-0000-0000-000000000000';

function getRateLimitConfig(rpcId: string): { windowMs: number; maxRequests: number } {
  var directConfig = RPC_RATE_LIMITS[rpcId];
  if (directConfig) {
    return directConfig;
  }

  // Support derived/bucketed RPC ids like "start_tournament_match:<bucket>".
  var separatorIndex = rpcId.indexOf(':');
  if (separatorIndex > 0) {
    var baseRpcId = rpcId.substring(0, separatorIndex);
    var baseConfig = RPC_RATE_LIMITS[baseRpcId];
    if (baseConfig) {
      return baseConfig;
    }
  }

  return DEFAULT_RATE_LIMIT;
}

// Check if a request should be rate limited
// Uses Nakama storage for distributed rate limiting across cluster nodes
export function isRateLimited(
  nk: nkruntime.Nakama,
  userId: string,
  rpcId: string,
  logger: nkruntime.Logger
): { limited: boolean; retryAfterMs?: number } {
  var limits = getRateLimitConfig(rpcId);
  var storageKey = 'rate_limit_' + rpcId;
  var now = Date.now();

  try {
    if (Math.random() < CLEANUP_SAMPLE_RATE) {
      cleanupRateLimitsForUser(nk, userId, logger);
    }

    // Read current rate limit state from storage
    var objects = nk.storageRead([{
      collection: 'rate_limits',
      key: storageKey,
      userId: userId,
    }]);

    var state = { count: 0, windowStart: now };

    if (objects && objects.length > 0 && objects[0].value) {
      var storedValue = objects[0].value as { count: number; windowStart: number };
      if (typeof storedValue.count === 'number' && typeof storedValue.windowStart === 'number') {
        state = storedValue;
      }
    }

    // Check if window has expired - reset if so
    if (now - state.windowStart >= limits.windowMs) {
      state = { count: 1, windowStart: now };
    } else if (state.count >= limits.maxRequests) {
      // Rate limit exceeded
      var retryAfterMs = limits.windowMs - (now - state.windowStart);
      logger.debug('Rate limited user ' + userId + ' for RPC ' + rpcId + ', retry after ' + retryAfterMs + 'ms');
      return {
        limited: true,
        retryAfterMs: retryAfterMs,
      };
    } else {
      // Increment counter
      state.count++;
    }

    // Write updated state back to storage
    nk.storageWrite([{
      collection: 'rate_limits',
      key: storageKey,
      userId: userId,
      value: state,
      permissionRead: 0,  // Only server can read
      permissionWrite: 0, // Only server can write
    }]);

    return { limited: false };
  } catch (err) {
    // On error, allow the request but log the issue
    logger.warn('Rate limiter storage error, allowing request: ' + err);
    return { limited: false };
  }
}

export function cleanupRateLimitsForUser(
  nk: nkruntime.Nakama,
  userId: string,
  logger: nkruntime.Logger
): void {
  try {
    var cursor = '';
    var deletes: nkruntime.StorageDeleteRequest[] = [];
    var now = Date.now();

    do {
      var list = nk.storageList(userId, 'rate_limits', 100, cursor);
      var objects = list?.objects || [];

      for (var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        var windowStart = obj.value?.windowStart || 0;
        if (now - windowStart > RATE_LIMIT_IDLE_TTL_MS) {
          deletes.push({
            collection: 'rate_limits',
            key: obj.key,
            userId: obj.userId,
          });
        }
      }

      cursor = list?.cursor || '';
    } while (cursor);

    if (deletes.length > 0) {
      nk.storageDelete(deletes);
      logger.debug('Cleaned up ' + deletes.length + ' stale rate limit entries for user ' + userId);
    }
  } catch (err) {
    logger.debug('Rate limit cleanup failed: ' + err);
  }
}

export function checkRateLimit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  rpcId: string
): void {
  if (ctx.userId) {
    var rateCheck = isRateLimited(nk, ctx.userId, rpcId, logger);
    if (rateCheck.limited) {
      throw new Error('Rate limit exceeded. Please try again in ' +
        Math.ceil((rateCheck.retryAfterMs || 0) / 1000) + ' seconds.');
    }
  }
}

export function checkRateLimitByKey(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  rpcId: string,
  key: string
): void {
  var ownerId = ctx.userId || KEYED_RATE_LIMIT_OWNER_ID;
  var normalizedKey = (key || '').trim() || 'anonymous';
  var keyHash = nk.sha256Hash(normalizedKey).substring(0, 32);
  var scopedRpcId = rpcId + ':' + keyHash;

  var rateCheck = isRateLimited(nk, ownerId, scopedRpcId, logger);
  if (rateCheck.limited) {
    throw new Error('Rate limit exceeded. Please try again in ' +
      Math.ceil((rateCheck.retryAfterMs || 0) / 1000) + ' seconds.');
  }
}

// Create a rate-limited RPC wrapper
// Enforces rate limits using Nakama storage before calling the handler
export function withRateLimit<T>(
  rpcId: string,
  handler: (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
  ) => string
): (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
) => string {
  return function(
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
  ): string {
    if (!ctx.userId) {
      throw new Error('Authentication required');
    }

    // Check rate limit before processing
    var rateLimitResult = isRateLimited(nk, ctx.userId, rpcId, logger);
    if (rateLimitResult.limited) {
      var retryAfterSec = Math.ceil((rateLimitResult.retryAfterMs || 1000) / 1000);
      throw new Error('Rate limit exceeded. Please try again in ' + retryAfterSec + ' seconds.');
    }

    return handler(ctx, logger, nk, payload);
  };
}

// Export rate limiter functions
export var RateLimiter = {
  isRateLimited: isRateLimited,
  withRateLimit: withRateLimit,
  checkRateLimit: checkRateLimit,
  checkRateLimitByKey: checkRateLimitByKey,
  cleanupRateLimits: function(
    nk: nkruntime.Nakama,
    userId: string,
    logger: nkruntime.Logger
  ): void {
    if (!nk || !userId || !logger) return;
    cleanupRateLimitsForUser(nk, userId, logger);
  },
  getRpcLimits: function(rpcId: string) {
    return RPC_RATE_LIMITS[rpcId] || DEFAULT_RATE_LIMIT;
  },
};
