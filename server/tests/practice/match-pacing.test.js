const test = require('node:test');
const assert = require('node:assert/strict');

const { matchInit, matchLoop } = require('../../build/main/match-handlers.js');
const { CATEGORIES_CACHE_STORE, CONFIG_CACHE_STORE } = require('../../build/main/config.js');

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
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;
}

class MatchPacingMockNakama {
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
    if (sql.includes('SELECT question_count, time_per_question_ms, question_pool_ids FROM tournaments')) {
      return [];
    }
    return [];
  }
}

class MatchDispatcherMock {
  constructor() {
    this.messages = [];
  }

  broadcastMessage(opCode, payload) {
    let parsed = payload;
    try {
      parsed = JSON.parse(payload);
    } catch (_error) {
      parsed = payload;
    }
    this.messages.push({ opCode, payload: parsed });
  }
}

function createLoopQuestion(id) {
  return {
    id,
    questionText: `Q ${id}`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 1,
    explanation: 'test',
    difficulty: 'medium',
    questionType: 'mcq',
  };
}

function createLoopState(overrides = {}) {
  return {
    phase: 'countdown',
    tickRate: 10,
    phaseStartTick: 0,
    questionStartTick: 0,
    countdownSeconds: 0,
    revealDelayMs: 200,
    timePerQuestionMs: 15000,
    currentQuestionIndex: 0,
    questionsAsked: 0,
    category: 'grammar',
    questions: [createLoopQuestion('q1'), createLoopQuestion('q2')],
    players: {
      u1: {
        oderId: 'u1',
        username: 'User One',
        score: 0,
        streak: 0,
        answers: [],
        connected: true,
        answeredCurrent: false,
        isBot: false,
      },
    },
    botMatch: false,
    practiceMode: false,
    isChallenge: false,
    isTournament: false,
    allowSpectators: false,
    spectators: {},
    playerSessions: {},
    spectatorSessions: {},
    pendingSpectators: {},
    matchPacing: {
      preset: 'turbo',
      countdownSeconds: 0,
      revealDelayMs: 200,
      revealSuspenseMs: 40,
      revealRevealMs: 90,
      revealEffectsMs: 130,
      revealScoresMs: 180,
      roundPulseEnabled: false,
      roundPulseStartDelayMs: 0,
      roundPulseCompleteDelayMs: 0,
    },
    ...overrides,
  };
}

test('matchInit resolves ranked/practice/tournament pacing profiles', () => {
  resetCaches();
  const categories = [
    {
      id: 'cat_grammar',
      category_key: 'grammar',
      name: 'Grammar',
      description: '',
      icon: '',
      icon_url: '',
      parent_id: null,
      category_type: 'normal',
      is_active: true,
      min_questions_required: 10,
      questions_per_match: null,
      time_per_question: 15,
      display_order: 1,
    },
  ];
  const config = new Map([
    ['question_counts', { default: 7, default_normal: 7, default_vocabulary: 80, max_normal: 50, max_vocabulary: 300 }],
    ['time_per_question_ms', 15000],
    ['flow_pacing_profiles', { rankedPreset: 'balanced', practicePreset: 'turbo' }],
  ]);
  const nk = new MatchPacingMockNakama({ categories, config });
  const logger = createLogger();

  const ranked = matchInit({ matchId: 'm_ranked' }, logger, nk, { category: 'grammar' });
  assert.equal(ranked.state.countdownSeconds, 2);
  assert.equal(ranked.state.revealDelayMs, 700);
  assert.equal(ranked.state.matchPacing.preset, 'balanced');

  const practice = matchInit({ matchId: 'm_practice' }, logger, nk, { category: 'grammar', practice: 'true' });
  assert.equal(practice.state.countdownSeconds, 0);
  assert.equal(practice.state.revealDelayMs, 120);
  assert.equal(practice.state.matchPacing.preset, 'turbo');

  const tournament = matchInit(
    { matchId: 'm_tournament' },
    logger,
    nk,
    { category: 'grammar', isTournament: 'true', tournamentId: 't1' }
  );
  assert.equal(tournament.state.countdownSeconds, 3);
  assert.equal(tournament.state.revealDelayMs, 5000);
  assert.equal(tournament.state.matchPacing.preset, 'classic');
});

test('matchLoop starts question immediately when countdownSeconds is zero', () => {
  const logger = createLogger();
  const dispatcher = new MatchDispatcherMock();
  const state = createLoopState({
    phase: 'countdown',
    countdownSeconds: 0,
    phaseStartTick: 0,
  });

  matchLoop({}, logger, {}, dispatcher, 0, state, []);

  assert.equal(state.phase, 'question');
  assert.equal(state.currentQuestionIndex, 0);
  assert.ok(
    dispatcher.messages.some((message) => message.opCode === 20),
    'Expected immediate question broadcast'
  );
});

test('matchLoop uses revealDelayMs from state before advancing', () => {
  const logger = createLogger();
  const dispatcher = new MatchDispatcherMock();
  const state = createLoopState({
    phase: 'reveal',
    phaseStartTick: 0,
    revealDelayMs: 200,
    currentQuestionIndex: 0,
  });

  matchLoop({}, logger, {}, dispatcher, 1, state, []);
  assert.equal(state.phase, 'reveal');
  assert.equal(state.currentQuestionIndex, 0);

  matchLoop({}, logger, {}, dispatcher, 2, state, []);
  assert.equal(state.phase, 'question');
  assert.equal(state.currentQuestionIndex, 1);
  assert.ok(
    dispatcher.messages.some((message) => message.opCode === 20),
    'Expected next question broadcast after reveal delay'
  );
});
