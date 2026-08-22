const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rpcAdminStartRankedReset,
  rpcAdminContinueRankedReset,
  rpcAdminGetRankedResetStatus,
} = require('../../build/main/admin.js');
const { CATEGORIES_CACHE_STORE, CONFIG_CACHE_STORE } = require('../../build/main/config.js');
const { GAME_CONFIG } = require('../../build/main/constants.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function resetCaches() {
  CONFIG_CACHE_STORE.cache = {};
  CATEGORIES_CACHE_STORE.cache = { value: null, expiresAt: 0 };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class RankedResetMockNakama {
  constructor(options = {}) {
    this.adminUserId = options.adminUserId || 'admin_user';
    this.adminTelegramId = Number(options.adminTelegramId || 1);
    this.adminLevels = Object.assign({}, options.adminLevels || {});
    this.activeMatchesCount = Number(options.activeMatchesCount || 0);
    this.matchHistoryRows = Number.isFinite(options.matchHistoryRows) ? Number(options.matchHistoryRows) : 0;
    this.uuidCounter = 0;

    this.playerGlobalMmr = new Map();
    this.playerCategoryMmr = new Map();
    this.telegramByUser = new Map();
    this.gameConfig = new Map();
    this.auditEntries = [];
    this.storageDeleteOps = [];
    this.leaderboardWrites = [];

    this.categories = Array.isArray(options.categories) ? options.categories.slice() : [];
    this.leaderboards = new Map();

    const adminProfile = Object.assign(
      {
        mmr: 1500,
        rd: 200,
        volatility: 0.06,
        gamesPlayed: 100,
        wins: 55,
        losses: 45,
        draws: 0,
        rankTier: 'gold',
        peakMmr: 1650,
        telegramId: this.adminTelegramId,
      },
      options.adminProfile || {}
    );
    this.adminGlobalMmr = clone(adminProfile);
    this.telegramByUser.set(this.adminUserId, {
      telegramId: this.adminTelegramId,
      firstName: 'Admin',
      lastName: 'User',
    });

    const players = Array.isArray(options.players) ? options.players : [];
    for (let i = 0; i < players.length; i += 1) {
      const player = players[i];
      const userId = String(player.userId || '');
      if (!userId) continue;
      this.playerGlobalMmr.set(userId, clone(Object.assign({
        mmr: 1200,
        rd: 230,
        volatility: 0.06,
        gamesPlayed: 80,
        wins: 40,
        losses: 40,
        draws: 0,
        rankTier: 'silver',
        peakMmr: 1300,
        telegramId: 1000 + i,
      }, player.globalMmr || {})));
      this.playerCategoryMmr.set(userId, clone(player.categoryMmr || { science: { mmr: 1250 } }));
      this.telegramByUser.set(userId, {
        telegramId: (player.globalMmr && player.globalMmr.telegramId) || 1000 + i,
        firstName: player.firstName || ('Player' + (i + 1)),
        lastName: player.lastName || '',
      });
    }

    const owners = Array.isArray(options.categoryLeaderboardOwners)
      ? options.categoryLeaderboardOwners
      : players.map((player) => String(player.userId || '')).filter(Boolean);
    const leaderboardIds = this.buildCategoryLeaderboardIds(this.categories);
    for (let i = 0; i < leaderboardIds.length; i += 1) {
      const board = new Map();
      for (let o = 0; o < owners.length; o += 1) {
        board.set(String(owners[o]), 1500);
      }
      this.leaderboards.set(leaderboardIds[i], board);
    }
  }

  buildCategoryLeaderboardIds(categoryKeys) {
    const ids = [];
    for (let i = 0; i < categoryKeys.length; i += 1) {
      const key = String(categoryKeys[i] || '').trim();
      if (!key) continue;
      ids.push('category_' + key);
      ids.push('category_' + key + '_daily');
      ids.push('category_' + key + '_weekly');
      ids.push('category_' + key + '_monthly');
    }
    return ids;
  }

  ensureLeaderboard(id) {
    const key = String(id || '');
    if (!this.leaderboards.has(key)) {
      this.leaderboards.set(key, new Map());
    }
    return this.leaderboards.get(key);
  }

  uuidv4() {
    this.uuidCounter += 1;
    return 'job-' + this.uuidCounter;
  }

  storageRead(reads) {
    if (!Array.isArray(reads) || reads.length === 0) {
      return [];
    }

    const results = [];
    for (let i = 0; i < reads.length; i += 1) {
      const req = reads[i] || {};
      const userId = String(req.userId || '');
      if (req.collection !== 'player_data' || !userId) {
        continue;
      }

      if (req.key === 'global_mmr') {
        if (userId === this.adminUserId) {
          results.push({ collection: req.collection, key: req.key, userId, value: clone(this.adminGlobalMmr) });
          continue;
        }
        if (this.playerGlobalMmr.has(userId)) {
          results.push({ collection: req.collection, key: req.key, userId, value: clone(this.playerGlobalMmr.get(userId)) });
        }
        continue;
      }

      if (req.key === 'category_mmr') {
        if (this.playerCategoryMmr.has(userId)) {
          results.push({ collection: req.collection, key: req.key, userId, value: clone(this.playerCategoryMmr.get(userId)) });
        }
        continue;
      }

      if (req.key === 'telegram') {
        if (this.telegramByUser.has(userId)) {
          results.push({ collection: req.collection, key: req.key, userId, value: clone(this.telegramByUser.get(userId)) });
        }
      }
    }

    return results;
  }

  storageWrite(writes) {
    if (!Array.isArray(writes)) {
      return [];
    }

    for (let i = 0; i < writes.length; i += 1) {
      const write = writes[i] || {};
      const userId = String(write.userId || '');
      if (!userId || write.collection !== 'player_data') {
        continue;
      }

      if (write.key === 'global_mmr') {
        this.playerGlobalMmr.set(userId, clone(write.value || {}));
      } else if (write.key === 'category_mmr') {
        this.playerCategoryMmr.set(userId, clone(write.value || {}));
      }
    }

    return [];
  }

  storageDelete(deletes) {
    if (!Array.isArray(deletes)) {
      return;
    }

    for (let i = 0; i < deletes.length; i += 1) {
      const entry = deletes[i] || {};
      this.storageDeleteOps.push(clone(entry));
    }
  }

  sqlQuery(sql, params = []) {
    const normalized = String(sql || '');

    if (normalized.includes('SELECT admin_level FROM admin_users')) {
      const key = String(params[0] || '');
      if (this.adminLevels[key]) {
        return [{ admin_level: this.adminLevels[key] }];
      }
      return [];
    }

    if (normalized.includes('FROM user_bans')) {
      return [];
    }

    if (normalized.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      const key = String(params[0] || '');
      if (!this.gameConfig.has(key)) {
        return [];
      }
      return [{ config_value: clone(this.gameConfig.get(key)) }];
    }

    if (
      normalized.includes('SELECT COUNT(DISTINCT user_id) as count')
      && normalized.includes("collection = 'player_data'")
      && normalized.includes("key = 'global_mmr'")
    ) {
      return [{ count: String(this.playerGlobalMmr.size) }];
    }

    if (
      normalized.includes('SELECT user_id')
      && normalized.includes('FROM storage')
      && normalized.includes("collection = 'player_data'")
      && normalized.includes("key = 'global_mmr'")
    ) {
      const limit = Math.max(0, parseInt(params[0], 10) || 0);
      const offset = Math.max(0, parseInt(params[1], 10) || 0);
      const sortedIds = Array.from(this.playerGlobalMmr.keys()).sort();
      return sortedIds.slice(offset, offset + limit).map((userId) => ({ user_id: userId }));
    }

    if (normalized.includes('SELECT * FROM categories WHERE is_active = true ORDER BY display_order ASC')) {
      return this.categories.map((categoryKey, index) => ({
        id: index + 1,
        category_key: categoryKey,
        name: categoryKey,
        description: '',
        icon: '',
        icon_url: '',
        parent_id: null,
        category_type: 'normal',
        is_active: true,
        min_questions_required: 10,
        questions_per_match: null,
        time_per_question: 15,
        display_order: index + 1,
      }));
    }

    return [];
  }

  sqlExec(sql, params = []) {
    const normalized = String(sql || '');

    if (normalized.includes('INSERT INTO game_config')) {
      const key = String(params[0] || '');
      let value = params[1];
      if (typeof value === 'string') {
        value = JSON.parse(value);
      }
      this.gameConfig.set(key, clone(value));
      return { rowsAffected: 1 };
    }

    if (normalized.includes('DELETE FROM match_history')) {
      const affected = this.matchHistoryRows;
      this.matchHistoryRows = 0;
      return { rowsAffected: affected };
    }

    if (normalized.includes('INSERT INTO admin_audit_log')) {
      this.auditEntries.push(clone(params));
      return { rowsAffected: 1 };
    }

    return { rowsAffected: 0 };
  }

  matchList() {
    const rows = [];
    for (let i = 0; i < this.activeMatchesCount; i += 1) {
      rows.push({ matchId: 'm' + i });
    }
    return rows;
  }

  leaderboardRecordWrite(leaderboardId, ownerId, _username, score) {
    const board = this.ensureLeaderboard(leaderboardId);
    board.set(String(ownerId), Number(score));
    this.leaderboardWrites.push({ leaderboardId: String(leaderboardId), ownerId: String(ownerId), score: Number(score) });
  }

  leaderboardRecordsList(leaderboardId, _ownerIds, limit) {
    const board = this.ensureLeaderboard(leaderboardId);
    const owners = Array.from(board.keys()).sort();
    const safeLimit = Math.max(1, Number(limit) || 1);
    const records = owners.slice(0, safeLimit).map((ownerId) => ({ ownerId }));
    return { records };
  }

  leaderboardRecordDelete(leaderboardId, ownerId) {
    const board = this.ensureLeaderboard(leaderboardId);
    board.delete(String(ownerId));
  }

  accountGetId(userId) {
    return {
      user: {
        displayName: 'User ' + String(userId || ''),
      },
    };
  }
}

function createStartPayload(overrides = {}) {
  return JSON.stringify(Object.assign({
    reason: 'Season reset after major ranking update',
    confirmText: 'RESET RANKED DATA',
    maintenanceConfirmed: true,
  }, overrides));
}

test('admin_start_ranked_reset requires super admin privileges', () => {
  resetCaches();

  const nk = new RankedResetMockNakama({
    adminTelegramId: 15,
    adminLevels: { 15: 'admin' },
    players: [{ userId: 'u1' }],
  });
  const logger = createLogger();
  const ctx = { userId: 'admin_user', env: {} };

  assert.throws(() => {
    rpcAdminStartRankedReset(ctx, logger, nk, createStartPayload());
  }, /Super admin access required/);
});

test('admin_start_ranked_reset blocks while active matches exist', () => {
  resetCaches();

  const nk = new RankedResetMockNakama({
    adminTelegramId: 1,
    activeMatchesCount: 2,
    players: [{ userId: 'u1' }, { userId: 'u2' }],
  });
  const logger = createLogger();
  const ctx = { userId: 'admin_user', env: { ADMIN_TELEGRAM_IDS: '1' } };

  assert.throws(() => {
    rpcAdminStartRankedReset(ctx, logger, nk, createStartPayload());
  }, /Cannot start reset while matches are active \(2\)/);
});

test('ranked reset lifecycle resets MMR, clears history and category leaderboards', () => {
  resetCaches();

  const nk = new RankedResetMockNakama({
    adminTelegramId: 1,
    matchHistoryRows: 7,
    categories: ['science'],
    players: [
      {
        userId: 'user_a',
        globalMmr: {
          mmr: 1820,
          rd: 120,
          volatility: 0.05,
          gamesPlayed: 340,
          wins: 190,
          losses: 145,
          draws: 5,
          rankTier: 'diamond',
          peakMmr: 1930,
          telegramId: 1001,
        },
        categoryMmr: { science: { mmr: 1750, gamesPlayed: 20 } },
        firstName: 'Alice',
      },
      {
        userId: 'user_b',
        globalMmr: {
          mmr: 1410,
          rd: 180,
          volatility: 0.06,
          gamesPlayed: 200,
          wins: 103,
          losses: 97,
          draws: 0,
          rankTier: 'gold',
          peakMmr: 1490,
          telegramId: 1002,
        },
        categoryMmr: { science: { mmr: 1480, gamesPlayed: 17 } },
        firstName: 'Bob',
      },
    ],
    categoryLeaderboardOwners: ['user_a', 'user_b'],
  });
  const logger = createLogger();
  const ctx = { userId: 'admin_user', env: { ADMIN_TELEGRAM_IDS: '1' } };

  const started = JSON.parse(rpcAdminStartRankedReset(ctx, logger, nk, createStartPayload()));
  assert.equal(started.status, 'in_progress');
  assert.equal(started.stage, 'reset_players');
  assert.equal(started.totals.players, 2);
  assert.equal(started.totals.categoryLeaderboards, 4);
  assert.ok(started.jobId);

  let status = started;
  for (let i = 0; i < 40 && status.status === 'in_progress'; i += 1) {
    status = JSON.parse(rpcAdminContinueRankedReset(ctx, logger, nk, JSON.stringify({ jobId: started.jobId })));
  }

  assert.equal(status.status, 'completed');
  assert.equal(status.stage, 'complete');
  assert.equal(status.progress.playersProcessed, 2);
  assert.equal(status.progress.playersTotal, 2);
  assert.equal(status.progress.matchHistoryRowsDeleted, 7);
  assert.equal(status.progress.categoryBoardsProcessed, 4);
  assert.ok(status.progress.categoryRecordsDeleted >= 8);

  const playerA = nk.playerGlobalMmr.get('user_a');
  const playerB = nk.playerGlobalMmr.get('user_b');
  assert.equal(playerA.mmr, GAME_CONFIG.STARTING_MMR);
  assert.equal(playerB.mmr, GAME_CONFIG.STARTING_MMR);
  assert.equal(playerA.gamesPlayed, 0);
  assert.equal(playerB.gamesPlayed, 0);
  assert.equal(playerA.wins, 0);
  assert.equal(playerB.losses, 0);
  assert.equal(playerA.rankTier, 'bronze');
  assert.equal(playerB.peakMmr, GAME_CONFIG.STARTING_MMR);

  assert.deepEqual(nk.playerCategoryMmr.get('user_a'), {});
  assert.deepEqual(nk.playerCategoryMmr.get('user_b'), {});

  const deletedHistoryUsers = nk.storageDeleteOps
    .filter((entry) => entry.collection === 'player_data' && entry.key === 'match_history')
    .map((entry) => entry.userId)
    .sort();
  assert.deepEqual(deletedHistoryUsers, ['user_a', 'user_b']);

  const categoryBoardIds = nk.buildCategoryLeaderboardIds(['science']);
  for (let i = 0; i < categoryBoardIds.length; i += 1) {
    const board = nk.leaderboards.get(categoryBoardIds[i]);
    assert.equal(board ? board.size : 0, 0);
  }

  const globalWrites = nk.leaderboardWrites.filter((entry) => entry.leaderboardId === 'global_mmr');
  assert.equal(globalWrites.length, 2);
  assert.ok(globalWrites.every((entry) => entry.score === GAME_CONFIG.STARTING_MMR));

  const persistedJob = nk.gameConfig.get('ranked_reset_job');
  assert.equal(persistedJob.status, 'completed');
  assert.equal(persistedJob.progress.playersProcessed, 2);
});

test('admin_get_ranked_reset_status returns latest job and enforces job id matching', () => {
  resetCaches();

  const nk = new RankedResetMockNakama({
    adminTelegramId: 1,
    players: [{ userId: 'user_a' }],
  });
  const logger = createLogger();
  const ctx = { userId: 'admin_user', env: { ADMIN_TELEGRAM_IDS: '1' } };

  const started = JSON.parse(rpcAdminStartRankedReset(ctx, logger, nk, createStartPayload()));

  const status = JSON.parse(rpcAdminGetRankedResetStatus(ctx, logger, nk, '{}'));
  assert.equal(status.jobId, started.jobId);
  assert.equal(status.status, 'in_progress');

  assert.throws(() => {
    rpcAdminGetRankedResetStatus(
      ctx,
      logger,
      nk,
      JSON.stringify({ jobId: 'another-job' })
    );
  }, /Job ID mismatch/);
});
