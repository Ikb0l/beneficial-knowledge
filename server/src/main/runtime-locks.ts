export interface RuntimeLeaseLock {
  key: string;
  owner: string;
}

function makeLockOwner(lockKey: string): string {
  return [
    'nakama',
    lockKey,
    Date.now().toString(36),
    Math.floor(Math.random() * 1000000000).toString(36),
  ].join(':');
}

export function ensureRuntimeLocksTable(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  try {
    nk.sqlExec(`
      CREATE TABLE IF NOT EXISTS runtime_locks (
        lock_key TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    nk.sqlExec(
      `CREATE INDEX IF NOT EXISTS idx_runtime_locks_expires_at
       ON runtime_locks(expires_at)`
    );
  } catch (error) {
    logger.warn('Failed to ensure runtime_locks table: ' + error);
  }
}

export function tryAcquireRuntimeLock(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  lockKey: string,
  leaseMs: number
): RuntimeLeaseLock | null {
  var safeLeaseMs = Math.max(1000, Math.floor(Number(leaseMs) || 30000));
  var owner = makeLockOwner(lockKey);
  var params = [lockKey, owner, safeLeaseMs];
  var sql = `
    INSERT INTO runtime_locks (lock_key, owner, acquired_at, heartbeat_at, expires_at)
    VALUES ($1, $2, NOW(), NOW(), NOW() + (($3::double precision / 1000.0) * INTERVAL '1 second'))
    ON CONFLICT (lock_key) DO UPDATE
    SET owner = EXCLUDED.owner,
        acquired_at = NOW(),
        heartbeat_at = NOW(),
        expires_at = EXCLUDED.expires_at
    WHERE runtime_locks.expires_at <= NOW()
    RETURNING owner
  `;

  try {
    var result = nk.sqlQuery(sql, params);
    var rows = Array.isArray(result) ? result : [];
    if (rows.length > 0 && rows[0].owner === owner) {
      return { key: lockKey, owner: owner };
    }
    return null;
  } catch (error) {
    var message = '' + error;
    if (message.indexOf('runtime_locks') !== -1 || message.indexOf('does not exist') !== -1) {
      ensureRuntimeLocksTable(nk, logger);
      try {
        var retryResult = nk.sqlQuery(sql, params);
        var retryRows = Array.isArray(retryResult) ? retryResult : [];
        if (retryRows.length > 0 && retryRows[0].owner === owner) {
          return { key: lockKey, owner: owner };
        }
      } catch (retryError) {
        logger.warn('Failed to acquire runtime lock [' + lockKey + '] after table retry: ' + retryError);
      }
      return null;
    }
    logger.warn('Failed to acquire runtime lock [' + lockKey + ']: ' + error);
    return null;
  }
}

export function tryAcquireRuntimeLockWithRetry(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  lockKey: string,
  leaseMs: number,
  maxAttempts: number,
  retryDelayMs: number
): RuntimeLeaseLock | null {
  var attempts = Math.max(1, Math.floor(maxAttempts || 1));
  var delaySeconds = Math.max(0, Number(retryDelayMs) || 0) / 1000;
  for (var attempt = 1; attempt <= attempts; attempt++) {
    var lock = tryAcquireRuntimeLock(nk, logger, lockKey, leaseMs);
    if (lock) {
      if (attempt > 1) {
        logger.debug(
          'Acquired runtime lock after retry: ' +
          lockKey +
          ' attempt=' +
          attempt +
          '/' +
          attempts
        );
      }
      return lock;
    }
    if (attempt < attempts && delaySeconds > 0) {
      try {
        nk.sqlQuery(`SELECT pg_sleep($1::double precision)`, [delaySeconds]);
      } catch (_sleepError) {
        // Best effort only. If sleep fails, continue immediate retry.
      }
    }
  }
  return null;
}

export function releaseRuntimeLock(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  lock: RuntimeLeaseLock | null
): void {
  if (!lock) return;
  try {
    nk.sqlExec(
      `DELETE FROM runtime_locks
       WHERE lock_key = $1
         AND owner = $2`,
      [lock.key, lock.owner]
    );
  } catch (error) {
    logger.warn('Failed to release runtime lock [' + lock.key + ']: ' + error);
  }
}

export function refreshRuntimeLock(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  lock: RuntimeLeaseLock | null,
  leaseMs: number
): boolean {
  if (!lock) return false;
  var safeLeaseMs = Math.max(1000, Math.floor(Number(leaseMs) || 30000));
  try {
    var result = nk.sqlQuery(
      `UPDATE runtime_locks
       SET heartbeat_at = NOW(),
           expires_at = NOW() + (($3::double precision / 1000.0) * INTERVAL '1 second')
       WHERE lock_key = $1
         AND owner = $2
       RETURNING lock_key`,
      [lock.key, lock.owner, safeLeaseMs]
    );
    var rows = Array.isArray(result) ? result : [];
    return rows.length > 0;
  } catch (error) {
    logger.warn('Failed to refresh runtime lock [' + lock.key + ']: ' + error);
    return false;
  }
}
