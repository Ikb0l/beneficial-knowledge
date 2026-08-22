const test = require('node:test');
const assert = require('node:assert/strict');

const { rpcStartTournamentMatch } = require('../../build/features/tournament-matches.js');
const { CATEGORIES_CACHE_STORE } = require('../../build/main/config.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function maybeAcquireRuntimeLock(mock, sql, params = []) {
  if (!sql.includes('INSERT INTO runtime_locks')) return undefined;
  const key = String(params[0]);
  const owner = String(params[1]);
  if (mock.locks.has(key)) return [];
  mock.locks.add(key);
  return [{ owner }];
}

function maybeReleaseRuntimeLock(mock, sql, params = []) {
  if (!sql.includes('DELETE FROM runtime_locks')) return false;
  mock.locks.delete(String(params[0]));
  return true;
}

class MatchStartMockNakama {
  constructor(options = {}) {
    this.throwOnMatchCreate = !!options.throwOnMatchCreate;
    this.locks = new Set();
    this.createdMatchCounter = 0;
    this.lastMatchCreateParams = null;
    this.row = {
      id: 'tm1',
      tournament_id: 't1',
      round_number: options.roundNumber || 1,
      status: options.status || 'ready',
      nakama_match_id: options.nakamaMatchId || null,
      started_at: options.startedAt || null,
      match_idle_seconds: options.matchIdleSeconds !== undefined ? options.matchIdleSeconds : 0,
      ready_player1: options.readyPlayer1 !== undefined ? options.readyPlayer1 : true,
      ready_player2: options.readyPlayer2 !== undefined ? options.readyPlayer2 : true,
      player1_participant_id: 'p1',
      player2_participant_id: 'p2',
      match_category: null,
      player1_id: options.player1Id !== undefined ? options.player1Id : 'u1',
      player2_id: options.player2Id !== undefined ? options.player2Id : 'u2',
      player1_status: options.player1Status || 'active',
      player2_status: options.player2Status || 'active',
      player1_is_bot: options.player1IsBot === true,
      player2_is_bot: options.player2IsBot === true,
      player1_bot_key: options.player1BotKey || null,
      player2_bot_key: options.player2BotKey || null,
      player1_bot_name: options.player1BotName || null,
      player2_bot_name: options.player2BotName || null,
      tournament_category: 'science',
      question_count: 10,
      tournament_status: 'in_progress',
      allow_spectators: true,
      bot_policy: options.botPolicy || {},
      spectator_count: Number.isFinite(options.spectatorCount) ? Number(options.spectatorCount) : 0,
    };
  }

  sqlQuery(sql, params = []) {
    const runtimeLockRows = maybeAcquireRuntimeLock(this, sql, params);
    if (runtimeLockRows !== undefined) return runtimeLockRows;
    if (sql.includes('FROM categories') && sql.includes('WHERE is_active = true')) {
      return [{
        id: 'cat1',
        category_key: 'science',
        name: 'Science',
        parent_id: null,
        is_active: true,
      }];
    }
    if (sql.includes('pg_try_advisory_lock')) {
      const key = String(params[0]);
      if (this.locks.has(key)) return [{ acquired: false }];
      this.locks.add(key);
      return [{ acquired: true }];
    }
    if (sql.includes('pg_advisory_unlock')) {
      this.locks.delete(String(params[0]));
      return [{ pg_advisory_unlock: true }];
    }
    if (sql.includes('FROM tournament_matches tm') && sql.includes('JOIN tournaments t')) {
      return [{
        id: this.row.id,
        tournament_id: this.row.tournament_id,
        status: this.row.status,
        nakama_match_id: this.row.nakama_match_id,
        ready_player1: this.row.ready_player1,
        ready_player2: this.row.ready_player2,
          match_idle_seconds: this.row.match_idle_seconds,
          started_at: this.row.started_at,
          round_number: this.row.round_number,
          player1_participant_id: this.row.player1_participant_id,
          player2_participant_id: this.row.player2_participant_id,
          match_category: this.row.match_category,
          player1_id: this.row.player1_id,
          player2_id: this.row.player2_id,
          player1_status: this.row.player1_status,
          player2_status: this.row.player2_status,
          player1_is_bot: this.row.player1_is_bot,
          player2_is_bot: this.row.player2_is_bot,
          player1_bot_key: this.row.player1_bot_key,
          player2_bot_key: this.row.player2_bot_key,
          player1_bot_name: this.row.player1_bot_name,
          player2_bot_name: this.row.player2_bot_name,
          tournament_category: this.row.tournament_category,
          question_count: this.row.question_count,
          tournament_status: this.row.tournament_status,
          allow_spectators: this.row.allow_spectators,
          bot_policy: this.row.bot_policy,
        }];
    }
    if (sql.includes('SELECT status, nakama_match_id, started_at FROM tournament_matches WHERE id = $1')) {
      return [{
        status: this.row.status,
        nakama_match_id: this.row.nakama_match_id,
        started_at: this.row.started_at,
      }];
    }
    if (sql.includes('SELECT status, nakama_match_id, ready_player1, ready_player2, started_at')) {
      return [{
        status: this.row.status,
        nakama_match_id: this.row.nakama_match_id,
        ready_player1: this.row.ready_player1,
        ready_player2: this.row.ready_player2,
        started_at: this.row.started_at,
      }];
    }
    if (sql.includes('SELECT status, nakama_match_id, ready_player1, ready_player2') &&
        sql.includes('FROM tournament_matches WHERE id = $1')) {
      return [{
        status: this.row.status,
        nakama_match_id: this.row.nakama_match_id,
        ready_player1: this.row.ready_player1,
        ready_player2: this.row.ready_player2,
      }];
    }
    if (sql.includes('SELECT nakama_match_id FROM tournament_matches WHERE id = $1')) {
      return [{ nakama_match_id: this.row.nakama_match_id }];
    }
    if (sql.includes('SELECT status, nakama_match_id FROM tournament_matches WHERE id = $1')) {
      return [{ status: this.row.status, nakama_match_id: this.row.nakama_match_id }];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    if (maybeReleaseRuntimeLock(this, sql, params)) return { rowsAffected: 1 };
    if (/status\s*=\s*'in_progress'/i.test(sql) &&
        /nakama_match_id\s*=\s*\$1/i.test(sql) &&
        /nakama_match_id IS NULL/i.test(sql)) {
      if (this.row.nakama_match_id !== null) return { rowsAffected: 0 };
      this.row.status = 'in_progress';
      this.row.nakama_match_id = params[0];
      this.row.started_at = new Date().toISOString();
      this.row.spectator_count = 0;
      return { rowsAffected: 1 };
    }
    if (/status\s*=\s*'ready'/i.test(sql) && /nakama_match_id\s*=\s*NULL/i.test(sql)) {
      if (this.row.nakama_match_id !== params[1]) return { rowsAffected: 0 };
      this.row.status = 'ready';
      this.row.nakama_match_id = null;
      this.row.started_at = null;
      this.row.spectator_count = 0;
      return { rowsAffected: 1 };
    }
    if (/SET\s+nakama_match_id\s*=\s*\$1/i.test(sql) && /WHERE id = \$2 AND nakama_match_id = \$3/i.test(sql.replace(/\s+/g, ' '))) {
      if (this.row.nakama_match_id !== params[2]) return { rowsAffected: 0 };
      this.row.nakama_match_id = params[0];
      this.row.status = 'in_progress';
      return { rowsAffected: 1 };
    }
    if (sql.includes('UPDATE tournament_matches SET category = $1 WHERE id = $2 AND category IS NULL')) {
      if (!this.row.match_category) this.row.match_category = params[0];
      return { rowsAffected: 1 };
    }
    return { rowsAffected: 0 };
  }

  matchCreate(_moduleName, params) {
    if (this.throwOnMatchCreate) {
      throw new Error('matchCreate failed');
    }
    this.createdMatchCounter += 1;
    this.lastMatchCreateParams = params || null;
    return `nm_${this.createdMatchCounter}`;
  }

  storageWrite() {}
}

test('rpcStartTournamentMatch rolls back pre-claim when matchCreate fails', () => {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;

  const nk = new MatchStartMockNakama({ throwOnMatchCreate: true, spectatorCount: 7 });
  const logger = createLogger();
  const ctx = { userId: 'u1' };

  assert.throws(() => {
    rpcStartTournamentMatch(ctx, logger, nk, JSON.stringify({ matchId: 'tm1' }));
  }, /matchCreate failed/);

  assert.equal(nk.row.status, 'ready');
  assert.equal(nk.row.nakama_match_id, null);
  assert.equal(nk.row.started_at, null);
  assert.equal(nk.row.spectator_count, 0);
});

test('rpcStartTournamentMatch recovers stale in-progress start token and launches match', () => {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;

  const staleStartedAt = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const nk = new MatchStartMockNakama({
    status: 'in_progress',
    nakamaMatchId: '__starting__:tm1:stale',
    startedAt: staleStartedAt,
    spectatorCount: 9,
  });
  const logger = createLogger();
  const ctx = { userId: 'u1' };

  const raw = rpcStartTournamentMatch(ctx, logger, nk, JSON.stringify({ matchId: 'tm1' }));
  const payload = JSON.parse(raw);

  assert.equal(payload.alreadyInProgress, false);
  assert.equal(payload.matchId, 'nm_1');
  assert.equal(nk.row.status, 'in_progress');
  assert.equal(nk.row.nakama_match_id, 'nm_1');
  assert.equal(nk.row.spectator_count, 0);
});

test('rpcStartTournamentMatch returns existing live match without recreating', () => {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;

  const nk = new MatchStartMockNakama({
    status: 'in_progress',
    nakamaMatchId: 'nm_existing',
    startedAt: new Date().toISOString(),
  });
  const logger = createLogger();
  const ctx = { userId: 'u1' };

  const raw = rpcStartTournamentMatch(ctx, logger, nk, JSON.stringify({ matchId: 'tm1' }));
  const payload = JSON.parse(raw);

  assert.equal(payload.alreadyInProgress, true);
  assert.equal(payload.matchId, 'nm_existing');
  assert.equal(nk.createdMatchCounter, 0);
});

test('rpcStartTournamentMatch requires both players ready for human-vs-human matches', () => {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;

  const nk = new MatchStartMockNakama({
    readyPlayer1: false,
    readyPlayer2: false,
    player1Id: 'u1',
    player2Id: 'u2',
    player1IsBot: false,
    player2IsBot: false,
  });
  const logger = createLogger();
  const ctx = { userId: 'u1' };

  assert.throws(() => {
    rpcStartTournamentMatch(ctx, logger, nk, JSON.stringify({ matchId: 'tm1' }));
  }, /Both players must be ready before starting the match/);
  assert.equal(nk.createdMatchCounter, 0);
  assert.equal(nk.row.status, 'ready');
});

test('rpcStartTournamentMatch refuses inactive tournament participants', () => {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;

  const nk = new MatchStartMockNakama({
    player1Status: 'forfeited',
    player1Id: 'u1',
    player2Id: null,
    player2IsBot: true,
  });
  const logger = createLogger();
  const ctx = { userId: 'u1' };

  assert.throws(() => {
    rpcStartTournamentMatch(ctx, logger, nk, JSON.stringify({ matchId: 'tm1' }));
  }, /inactive tournament participant/);
  assert.equal(nk.createdMatchCounter, 0);
  assert.equal(nk.row.status, 'ready');
});

test('rpcStartTournamentMatch starts bot-vs-human match without requiring both ready flags', () => {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;

  const nk = new MatchStartMockNakama({
    readyPlayer1: true,
    readyPlayer2: false,
    player1Id: 'u1',
    player2Id: null,
    player1IsBot: false,
    player2IsBot: true,
    player2BotKey: 'atlas',
    player2BotName: 'Atlas Bot',
  });
  const logger = createLogger();
  const ctx = { userId: 'u1' };

  const raw = rpcStartTournamentMatch(ctx, logger, nk, JSON.stringify({ matchId: 'tm1' }));
  const payload = JSON.parse(raw);

  assert.equal(payload.alreadyInProgress, false);
  assert.equal(payload.matchId, 'nm_1');
  assert.ok(nk.lastMatchCreateParams);
  assert.equal(nk.lastMatchCreateParams.bot, 'true');
  assert.equal(nk.lastMatchCreateParams.tournamentPlayer2IsBot, 'true');
  assert.equal(nk.lastMatchCreateParams.player2, '');
  assert.match(nk.lastMatchCreateParams.botDisplayName, /^[A-Za-z]+(?: [A-Z]\.)? [A-Za-z]+$/);
  assert.equal(/bot/i.test(nk.lastMatchCreateParams.botDisplayName), false);
});
