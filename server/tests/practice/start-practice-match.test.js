const test = require('node:test');
const assert = require('node:assert/strict');

const { rpcStartBotMatch, rpcStartPracticeMatch } = require('../../build/main/rpc-core.js');
const { CATEGORIES_CACHE_STORE, CONFIG_CACHE_STORE } = require('../../build/main/config.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class PracticeMatchMockNakama {
  constructor(options = {}) {
    this.lastModuleName = null;
    this.lastMatchCreateParams = null;
    this.categories = options.categories || [
      {
        id: 'cat_parent_science',
        category_key: 'science',
        name: 'Science',
        description: '',
        icon: '',
        icon_url: '',
        parent_id: null,
        category_type: 'normal',
        is_active: true,
        min_questions_required: 10,
        questions_per_match: 10,
        time_per_question: 15,
        display_order: 1,
      },
      {
        id: 'cat_child_astronomy',
        category_key: 'astronomy',
        name: 'Astronomy',
        description: '',
        icon: '',
        icon_url: '',
        parent_id: 'cat_parent_science',
        category_type: 'normal',
        is_active: true,
        min_questions_required: 10,
        questions_per_match: 10,
        time_per_question: 15,
        display_order: 2,
      },
    ];
    this.questionCounts = options.questionCounts || { astronomy: 10 };
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('SELECT * FROM categories WHERE is_active = true')) {
      return this.categories;
    }
    if (sql.includes('COUNT(*)::int AS question_count')) {
      return (params[0] || [])
        .filter((category) => this.questionCounts[category] > 0)
        .map((category) => ({ category, question_count: this.questionCounts[category] }));
    }
    return [];
  }

  matchCreate(moduleName, params) {
    this.lastModuleName = moduleName;
    this.lastMatchCreateParams = params || null;
    return 'm_practice_1';
  }
}

function resetCategoryCache() {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;
  CONFIG_CACHE_STORE.cache = {};
}

test('rpcStartPracticeMatch creates solo practice match with required flags', () => {
  resetCategoryCache();
  const nk = new PracticeMatchMockNakama();
  const logger = createLogger();
  const ctx = { userId: 'user_1' };

  const raw = rpcStartPracticeMatch(
    ctx,
    logger,
    nk,
    JSON.stringify({
      parentCategory: 'science',
      subcategories: ['astronomy'],
      allInCategory: false,
    })
  );
  const payload = JSON.parse(raw);

  assert.equal(payload.matchId, 'm_practice_1');
  assert.equal(nk.lastModuleName, 'quiz_match');
  assert.ok(nk.lastMatchCreateParams);
  assert.equal(nk.lastMatchCreateParams.parentCategory, 'science');
  assert.equal(nk.lastMatchCreateParams.category, 'astronomy');
  assert.equal(nk.lastMatchCreateParams.practice, 'true');
  assert.equal(nk.lastMatchCreateParams.player1, 'user_1');
  assert.equal(nk.lastMatchCreateParams.allowSpectators, 'false');
});

test('rpcStartPracticeMatch picks child category when allInCategory is true', () => {
  resetCategoryCache();
  const nk = new PracticeMatchMockNakama();
  const logger = createLogger();
  const ctx = { userId: 'user_2' };

  rpcStartPracticeMatch(
    ctx,
    logger,
    nk,
    JSON.stringify({
      parentCategory: 'science',
      allInCategory: true,
    })
  );

  assert.ok(nk.lastMatchCreateParams);
  assert.equal(nk.lastMatchCreateParams.parentCategory, 'science');
  assert.equal(nk.lastMatchCreateParams.category, 'astronomy');
});

test('rpcStartPracticeMatch requires an authenticated user', () => {
  resetCategoryCache();
  const nk = new PracticeMatchMockNakama();
  const logger = createLogger();

  assert.throws(() => {
    rpcStartPracticeMatch(
      {},
      logger,
      nk,
      JSON.stringify({
        parentCategory: 'science',
        allInCategory: true,
      })
    );
  }, /User ID required/);
});

test('all-subcategory practice and bot matches skip underfilled categories', () => {
  resetCategoryCache();
  const categories = [
    {
      id: 'cat_parent_science', category_key: 'science', name: 'Science', parent_id: null,
      category_type: 'normal', is_active: true, questions_per_match: 10, display_order: 1,
    },
    {
      id: 'cat_child_empty', category_key: 'empty', name: 'Empty', parent_id: 'cat_parent_science',
      category_type: 'normal', is_active: true, questions_per_match: 10, display_order: 2,
    },
    {
      id: 'cat_child_full', category_key: 'full', name: 'Full', parent_id: 'cat_parent_science',
      category_type: 'normal', is_active: true, questions_per_match: 10, display_order: 3,
    },
  ];
  const nk = new PracticeMatchMockNakama({ categories, questionCounts: { empty: 0, full: 10 } });
  const logger = createLogger();

  rpcStartPracticeMatch(
    { userId: 'user_practice' },
    logger,
    nk,
    JSON.stringify({ parentCategory: 'science', allInCategory: true })
  );
  assert.equal(nk.lastMatchCreateParams.category, 'full');

  rpcStartBotMatch(
    { userId: 'user_bot' },
    logger,
    nk,
    JSON.stringify({ parentCategory: 'science', allInCategory: true })
  );
  assert.equal(nk.lastMatchCreateParams.category, 'full');
  assert.equal(nk.lastMatchCreateParams.bot, 'true');
});

test('explicit underfilled subcategory is rejected before match creation', () => {
  resetCategoryCache();
  const nk = new PracticeMatchMockNakama({ questionCounts: { astronomy: 0 } });
  const logger = createLogger();

  assert.throws(() => {
    rpcStartPracticeMatch(
      { userId: 'user_empty' },
      logger,
      nk,
      JSON.stringify({
        parentCategory: 'science',
        subcategories: ['astronomy'],
        allInCategory: false,
      })
    );
  }, /No playable subcategories/);
  assert.equal(nk.lastMatchCreateParams, null);
});
