const test = require('node:test');
const assert = require('node:assert/strict');

const { endMatch } = require('../../build/main/match-helpers.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class InMemoryNakamaMock {
  constructor() {
    this.storage = new Map();
    this.versionCounter = 1;
  }

  _key(collection, key, userId) {
    return `${collection}:${userId || ''}:${key}`;
  }

  storageRead(reads) {
    return (reads || []).map((req) => {
      const id = this._key(req.collection, req.key, req.userId);
      const existing = this.storage.get(id);
      if (!existing) {
        return {
          collection: req.collection,
          key: req.key,
          userId: req.userId,
          value: null,
          version: '',
        };
      }
      return {
        collection: existing.collection,
        key: existing.key,
        userId: existing.userId,
        value: existing.value,
        version: existing.version,
      };
    });
  }

  storageWrite(writes) {
    for (const write of writes || []) {
      const id = this._key(write.collection, write.key, write.userId);
      this.storage.set(id, {
        collection: write.collection,
        key: write.key,
        userId: write.userId,
        value: write.value,
        version: `v${this.versionCounter++}`,
      });
    }
    return [];
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      const configKey = params[0];
      if (configKey === 'mmr_floor') {
        return [{ config_value: 100 }];
      }
      if (configKey === 'mmr_ceiling') {
        return [{ config_value: 10000 }];
      }
      return [];
    }

    if (sql.includes('SELECT * FROM rank_tiers WHERE is_active = true ORDER BY display_order ASC')) {
      return [];
    }

    return [];
  }

  sqlExec() {
    return { rowsAffected: 1 };
  }

  leaderboardRecordWrite() {}

  accountGetId(userId) {
    return {
      user: {
        displayName: `User ${userId}`,
        username: userId,
      },
    };
  }
}

class DispatcherMock {
  constructor() {
    this.messages = [];
  }

  broadcastMessage(opCode, payload) {
    this.messages.push({ opCode, payload });
  }
}

function buildRankedState() {
  return {
    phase: 'question',
    category: 'science',
    practiceMode: false,
    isChallenge: false,
    isTournament: false,
    matchId: 'match-fixed-mmr-1',
    tickRate: 10,
    questionStartTick: 0,
    matchStartTick: 0,
    timePerQuestionMs: 15000,
    currentQuestionIndex: 0,
    questionsAsked: 1,
    questions: [
      {
        id: 'q1',
        questionText: 'What is 2+2?',
        options: ['1', '2', '3', '4'],
        correctIndex: 3,
        explanation: '2+2=4',
      },
    ],
    players: {
      u1: {
        oderId: 'u1',
        username: 'Alice',
        score: 7,
        mmr: 1200,
        rd: 60,
        volatility: 0.06,
        globalMmr: 1400,
        globalRd: 55,
        globalVolatility: 0.05,
        answers: [{ questionIndex: 0, answerIndex: 3, timeMs: 1200, correct: true }],
        streak: 1,
        answeredCurrent: true,
        connected: true,
      },
      u2: {
        oderId: 'u2',
        username: 'Bob',
        score: 5,
        mmr: 1100,
        rd: 65,
        volatility: 0.06,
        globalMmr: 1300,
        globalRd: 50,
        globalVolatility: 0.05,
        answers: [{ questionIndex: 0, answerIndex: 2, timeMs: 1400, correct: false }],
        streak: 0,
        answeredCurrent: true,
        connected: true,
      },
    },
  };
}

test('endMatch applies fixed ranked MMR +30/-30 and returns same global/category deltas', () => {
  const nk = new InMemoryNakamaMock();
  const logger = createLogger();
  const dispatcher = new DispatcherMock();
  const state = buildRankedState();

  endMatch(state, 150, dispatcher, nk, logger);

  const user1 = state.lastMatchEnd.mmrChanges.u1;
  const user2 = state.lastMatchEnd.mmrChanges.u2;

  assert.equal(user1.change, 30);
  assert.equal(user2.change, -30);
  assert.equal(user1.globalChange, 30);
  assert.equal(user2.globalChange, -30);
  assert.equal(user1.newMmr, 1230);
  assert.equal(user2.newMmr, 1070);
  assert.equal(user1.globalNewMmr, 1430);
  assert.equal(user2.globalNewMmr, 1270);

  const endMessage = dispatcher.messages.find((m) => m.opCode === 30);
  assert.ok(endMessage);
  const payload = JSON.parse(endMessage.payload);

  assert.equal(payload.winnerId, 'u1');
  assert.equal(payload.mmrChanges.u1.change, 30);
  assert.equal(payload.mmrChanges.u2.change, -30);
  assert.equal(payload.mmrChanges.u1.globalChange, 30);
  assert.equal(payload.mmrChanges.u2.globalChange, -30);
});
