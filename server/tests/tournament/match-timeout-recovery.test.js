const test = require('node:test');
const assert = require('node:assert/strict');

const { matchLoop } = require('../../build/main/match-handlers.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class MatchDispatcherMock {
  constructor() {
    this.messages = [];
  }

  broadcastMessage(opCode, payload) {
    let parsed = null;
    try {
      parsed = JSON.parse(payload);
    } catch {
      parsed = payload;
    }
    this.messages.push({ opCode, payload: parsed });
  }
}

function createQuestionState(overrides = {}) {
  return {
    phase: 'question',
    tickRate: 10,
    phaseStartTick: 0,
    questionStartTick: 0,
    timePerQuestionMs: 5000,
    currentQuestionIndex: 0,
    questions: [
      {
        id: 'q1',
        questionText: 'Q1',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 1,
        explanation: 'test',
        difficulty: 'medium',
      },
    ],
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
      bot_1: {
        oderId: 'bot_1',
        username: 'Bot',
        score: 0,
        streak: 0,
        answers: [],
        connected: true,
        answeredCurrent: false,
        isBot: true,
      },
    },
    botMatch: true,
    botId: 'bot_1',
    isChallenge: false,
    isTournament: false,
    allowSpectators: false,
    spectators: {},
    playerSessions: {},
    spectatorSessions: {},
    pendingSpectators: {},
    ...overrides,
  };
}

test('matchLoop recovers missing questionStartTick and still reveals on timeout', () => {
  const logger = createLogger();
  const dispatcher = new MatchDispatcherMock();
  const nk = {};
  const state = createQuestionState({
    questionStartTick: undefined,
    phaseStartTick: 0,
    timePerQuestionMs: 5000,
  });

  matchLoop({}, logger, nk, dispatcher, 80, state, []);

  assert.equal(state.phase, 'reveal');
  assert.ok(state.lastReveal);
  assert.ok(state.players.u1.answeredCurrent);
  assert.ok(state.players.bot_1.answeredCurrent);
  assert.ok(
    dispatcher.messages.some((message) => message.opCode === 21),
    'Expected reveal payload broadcast'
  );
});
