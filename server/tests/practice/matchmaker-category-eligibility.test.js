const test = require('node:test');
const assert = require('node:assert/strict');

const { onMatchmakerMatched } = require('../../build/main/matchmaker.js');
const { CATEGORIES_CACHE_STORE, CONFIG_CACHE_STORE } = require('../../build/main/config.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class MatchmakerMockNakama {
  constructor() {
    this.lastMatchCreateParams = null;
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('SELECT * FROM categories WHERE is_active = true')) {
      return [
        {
          id: 'parent_els', category_key: 'els', name: 'ELS', parent_id: null,
          category_type: 'vocabulary', is_active: true, questions_per_match: 100, display_order: 1,
        },
        {
          id: 'child_empty', category_key: 'elspage60', name: 'ELS 60', parent_id: 'parent_els',
          category_type: 'vocabulary', is_active: true, questions_per_match: 100, display_order: 2,
        },
        {
          id: 'child_full', category_key: 'elspage100', name: 'ELS 100', parent_id: 'parent_els',
          category_type: 'vocabulary', is_active: true, questions_per_match: 100, display_order: 3,
        },
      ];
    }
    if (sql.includes('COUNT(*)::int AS question_count')) {
      return (params[0] || []).includes('elspage100')
        ? [{ category: 'elspage100', question_count: 300 }]
        : [];
    }
    if (sql.includes('SELECT config_value FROM game_config')) {
      if (params[0] === 'question_counts') {
        return [{ config_value: {
          default: 30,
          default_normal: 30,
          default_vocabulary: 100,
          max_normal: 300,
          max_vocabulary: 300,
        } }];
      }
      return [];
    }
    return [];
  }

  storageRead() {
    return [];
  }

  storageWrite() {
    return [];
  }

  matchCreate(_moduleName, params) {
    this.lastMatchCreateParams = params;
    return 'match_eligible.nakama';
  }
}

function allCategoryUser(userId) {
  return {
    presence: { userId, sessionId: 'session_' + userId, username: userId },
    properties: {
      string_properties: { category: 'els', all_in_category: '1' },
      numeric_properties: { mmr: 1000 },
    },
  };
}

test('all-subcategory human matchmaking excludes categories without enough questions', () => {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;
  CONFIG_CACHE_STORE.cache = {};
  const nk = new MatchmakerMockNakama();
  const matchId = onMatchmakerMatched(
    {},
    createLogger(),
    nk,
    [{ users: [allCategoryUser('user_1'), allCategoryUser('user_2')] }]
  );

  assert.equal(matchId, 'match_eligible.nakama');
  assert.ok(nk.lastMatchCreateParams);
  assert.equal(nk.lastMatchCreateParams.parentCategory, 'els');
  assert.equal(nk.lastMatchCreateParams.category, 'elspage100');
});
