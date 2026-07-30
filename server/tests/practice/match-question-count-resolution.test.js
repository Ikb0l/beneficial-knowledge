const test = require('node:test');
const assert = require('node:assert/strict');

const { matchInit } = require('../../build/main/match-handlers.js');
const { CATEGORIES_CACHE_STORE, CONFIG_CACHE_STORE } = require('../../build/main/config.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class MatchInitMockNakama {
  constructor({ categories, config }) {
    this.categories = categories || [];
    this.config = config || new Map();
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('SELECT * FROM categories WHERE is_active = true')) {
      return this.categories;
    }
    if (sql.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      const key = params[0];
      if (!this.config.has(key)) return [];
      return [{ config_value: this.config.get(key) }];
    }
    return [];
  }
}

function resetCaches() {
  CONFIG_CACHE_STORE.cache = {};
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;
}

test('matchInit prefers per-category questions_per_match override when present', () => {
  resetCaches();
  const nk = new MatchInitMockNakama({
    categories: [
      {
        id: 'cat_vocab',
        category_key: 'vocab_master',
        name: 'Vocabulary Master',
        description: '',
        icon: '',
        icon_url: '',
        parent_id: null,
        category_type: 'vocabulary',
        is_active: true,
        min_questions_required: 10,
        questions_per_match: 120,
        time_per_question: 15,
        display_order: 1,
      },
    ],
    config: new Map([
      ['question_counts', { default: 7, default_normal: 7, default_vocabulary: 80, max_normal: 50, max_vocabulary: 300 }],
      ['time_per_question_ms', 15000],
    ]),
  });
  const logger = createLogger();

  const initResult = matchInit({ matchId: 'm1' }, logger, nk, { category: 'vocab_master' });

  assert.equal(initResult.state.category, 'vocab_master');
  assert.equal(initResult.state.questionsPerMatch, 120);
});

test('matchInit falls back to category-type global default when override is null', () => {
  resetCaches();
  const nk = new MatchInitMockNakama({
    categories: [
      {
        id: 'cat_vocab',
        category_key: 'vocab_speed',
        name: 'Vocabulary Speed',
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
      ['question_counts', { default: 7, default_normal: 7, default_vocabulary: 64, max_normal: 50, max_vocabulary: 300 }],
      ['time_per_question_ms', 15000],
    ]),
  });
  const logger = createLogger();

  const initResult = matchInit({ matchId: 'm2' }, logger, nk, { category: 'vocab_speed' });

  assert.equal(initResult.state.category, 'vocab_speed');
  assert.equal(initResult.state.questionsPerMatch, 64);
});
