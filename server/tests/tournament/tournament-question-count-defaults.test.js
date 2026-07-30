const test = require('node:test');
const assert = require('node:assert/strict');

const { rpcAdminCreateTournament } = require('../../build/features/tournaments.js');
const { CATEGORIES_CACHE_STORE, CONFIG_CACHE_STORE } = require('../../build/main/config.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class TournamentDefaultsMockNakama {
  constructor({ categories, config }) {
    this.categories = categories || [];
    this.config = config || new Map();
    this.insertTournamentParams = null;
  }

  storageRead(reads) {
    if (!Array.isArray(reads) || reads.length === 0) return [];
    return [{ key: reads[0].key, value: { telegramId: 777 } }];
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('SELECT admin_level FROM admin_users')) {
      return [{ admin_level: 'admin' }];
    }
    if (sql.includes('SELECT * FROM categories WHERE is_active = true')) {
      return this.categories;
    }
    if (sql.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      const key = params[0];
      if (!this.config.has(key)) return [];
      return [{ config_value: this.config.get(key) }];
    }
    if (sql.includes('INSERT INTO tournaments')) {
      this.insertTournamentParams = params;
      return [
        {
          id: 'tour_1',
          name: params[0],
          registration_start: params[9],
          registration_end: params[10],
          tournament_start: params[11],
        },
      ];
    }
    return [];
  }

  sqlExec() {
    return { rowsAffected: 1 };
  }
}

function resetCaches() {
  CONFIG_CACHE_STORE.cache = {};
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;
}

function createBasePayload(category) {
  return {
    name: 'Vocabulary Cup',
    description: 'Test tournament',
    format: 'single_elimination',
    bracketSize: 16,
    category,
    registrationStart: '2026-01-01T10:00:00.000Z',
    registrationEnd: '2026-01-01T11:00:00.000Z',
    tournamentStart: '2026-01-01T12:00:00.000Z',
  };
}

test('admin_create_tournament defaults questionCount from selected category effective setting', () => {
  resetCaches();
  const nk = new TournamentDefaultsMockNakama({
    categories: [
      {
        id: 'cat_vocab',
        category_key: 'vocab_elite',
        name: 'Vocabulary Elite',
        description: '',
        icon: '',
        icon_url: '',
        parent_id: null,
        category_type: 'vocabulary',
        is_active: true,
        min_questions_required: 10,
        questions_per_match: null,
        time_per_question: 15,
        display_order: 1,
      },
    ],
    config: new Map([
      ['question_counts', { default: 7, default_normal: 7, default_vocabulary: 88, max_normal: 50, max_vocabulary: 300 }],
    ]),
  });
  const logger = createLogger();
  const ctx = { userId: 'admin_1', env: {} };

  const raw = rpcAdminCreateTournament(ctx, logger, nk, JSON.stringify(createBasePayload('vocab_elite')));
  const payload = JSON.parse(raw);

  assert.equal(payload.success, true);
  assert.ok(Array.isArray(nk.insertTournamentParams));
  assert.equal(nk.insertTournamentParams[7], 88);
});

test('admin_create_tournament uses category override when present', () => {
  resetCaches();
  const nk = new TournamentDefaultsMockNakama({
    categories: [
      {
        id: 'cat_vocab',
        category_key: 'vocab_override',
        name: 'Vocabulary Override',
        description: '',
        icon: '',
        icon_url: '',
        parent_id: null,
        category_type: 'vocabulary',
        is_active: true,
        min_questions_required: 10,
        questions_per_match: 42,
        time_per_question: 15,
        display_order: 1,
      },
    ],
    config: new Map([
      ['question_counts', { default: 7, default_normal: 7, default_vocabulary: 88, max_normal: 50, max_vocabulary: 300 }],
    ]),
  });
  const logger = createLogger();
  const ctx = { userId: 'admin_1', env: {} };

  const raw = rpcAdminCreateTournament(ctx, logger, nk, JSON.stringify(createBasePayload('vocab_override')));
  const payload = JSON.parse(raw);

  assert.equal(payload.success, true);
  assert.ok(Array.isArray(nk.insertTournamentParams));
  assert.equal(nk.insertTournamentParams[7], 42);
});
