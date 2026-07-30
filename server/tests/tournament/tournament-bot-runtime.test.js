const test = require('node:test');
const assert = require('node:assert/strict');

const { scheduleBotAnswer } = require('../../build/main/match-helpers.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function withMockedRandom(values, fn) {
  const original = Math.random;
  let index = 0;
  Math.random = () => {
    const value = index < values.length ? values[index] : values[values.length - 1];
    index += 1;
    return value;
  };
  try {
    fn();
  } finally {
    Math.random = original;
  }
}

test('scheduleBotAnswer uses tournament difficulty profile for strong bot accuracy', () => {
  const state = {
    botMatch: true,
    botId: 'bot_1',
    tickRate: 10,
    timePerQuestionMs: 15000,
    tournamentRound: 4,
    botDifficultyProfile: {
      baseAccuracy: 0.92,
      minAccuracy: 0.7,
      maxAccuracy: 0.99,
      roundAccuracyBonus: 0.02,
      minDelayMs: 1000,
      maxDelayMs: 1200,
      roundDelayReductionMs: 50,
      nearMissChance: 1,
    },
    players: {
      bot_1: {
        oderId: 'bot_1',
        answeredCurrent: false,
      },
    },
    currentQuestionIndex: 0,
    questions: [
      {
        correctIndex: 1,
        options: ['A', 'B', 'C', 'D'],
        difficulty: 'medium',
      },
    ],
  };

  withMockedRandom([0, 0.3], () => {
    scheduleBotAnswer(state, 100, createLogger());
  });

  assert.equal(state.players.bot_1.botAnswerIndex, 1);
  assert.ok(state.players.bot_1.botAnswerTick > 100);
});

test('scheduleBotAnswer produces near-miss wrong answers for tournament bots', () => {
  const state = {
    botMatch: true,
    botId: 'bot_2',
    tickRate: 10,
    timePerQuestionMs: 15000,
    tournamentRound: 1,
    botDifficultyProfile: {
      baseAccuracy: 0.2,
      minAccuracy: 0.2,
      maxAccuracy: 0.2,
      roundAccuracyBonus: 0,
      minDelayMs: 1000,
      maxDelayMs: 1000,
      roundDelayReductionMs: 0,
      nearMissChance: 1,
    },
    players: {
      bot_2: {
        oderId: 'bot_2',
        answeredCurrent: false,
      },
    },
    currentQuestionIndex: 0,
    questions: [
      {
        correctIndex: 2,
        options: ['A', 'B', 'C', 'D'],
        difficulty: 'hard',
      },
    ],
  };

  // delay roll, wrong-answer roll (> accuracy), near-miss roll, near-miss candidate roll
  withMockedRandom([0, 0.95, 0, 0], () => {
    scheduleBotAnswer(state, 200, createLogger());
  });

  assert.notEqual(state.players.bot_2.botAnswerIndex, 2);
  assert.equal(Math.abs(state.players.bot_2.botAnswerIndex - 2), 1);
  assert.ok(state.players.bot_2.botAnswerTick > 200);
});
