const test = require('node:test');
const assert = require('node:assert/strict');

const { rpcGetMatchHistory } = require('../../build/main/rpc-core.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class MatchHistoryMockNakama {
  constructor(options = {}) {
    this.historyByUserId = options.historyByUserId || {};
    this.friendMap = options.friendMap || {};
  }

  storageRead(reads) {
    const request = Array.isArray(reads) && reads.length > 0 ? reads[0] : null;
    if (!request || request.collection !== 'player_data' || request.key !== 'match_history') {
      return [];
    }

    const matches = this.historyByUserId[request.userId];
    if (!Array.isArray(matches)) {
      return [];
    }

    return [{
      collection: 'player_data',
      key: 'match_history',
      userId: request.userId,
      value: { matches },
      version: 'v1',
    }];
  }

  friendsList(userId) {
    const friends = this.friendMap[userId] || [];
    return {
      friends: friends.map((id) => ({ user: { id } })),
      cursor: '',
    };
  }
}

test('rpcGetMatchHistory normalizes legacy timestamps/results and keeps metadata', () => {
  const logger = createLogger();
  const nk = new MatchHistoryMockNakama({
    historyByUserId: {
      u1: [
        {
          matchId: 'iso-match',
          category: 'science_advanced',
          opponentId: 'opponent-1',
          opponentName: 'Player One',
          playerScore: '7',
          opponentScore: 6,
          result: 'WIN',
          mmrChange: '12',
          newMmr: '1450',
          correctAnswers: '7',
          totalQuestions: '10',
          timestamp: '2026-01-20T00:00:00.000Z',
          isFriendChallenge: true,
        },
        {
          matchId: 'seconds-match',
          category: 'history',
          opponentId: 'bot_hard_1',
          opponentName: 'Atlas Bot',
          playerScore: 5,
          opponentScore: 7,
          result: 'loss',
          mmrChange: -9,
          newMmr: 1441,
          correctAnswers: 5,
          totalQuestions: 10,
          timestamp: '1760000000',
        },
        {
          // Duplicate should be dropped by matchId.
          matchId: 'seconds-match',
          category: 'history',
          opponentId: 'bot_hard_1',
          opponentName: 'Atlas Bot',
          playerScore: 0,
          opponentScore: 0,
          result: 'draw',
          mmrChange: 0,
          newMmr: 1400,
          correctAnswers: 0,
          totalQuestions: 0,
          timestamp: 0,
        },
        {
          // Invalid entry should be ignored.
          matchId: '',
        },
      ],
    },
  });

  const raw = rpcGetMatchHistory(
    { userId: 'u1' },
    logger,
    nk,
    JSON.stringify({ userId: 'u1', limit: 20, offset: 0 })
  );
  const payload = JSON.parse(raw);

  assert.equal(payload.total, 2);
  assert.equal(payload.matches.length, 2);
  assert.equal(payload.matches[0].matchId, 'iso-match');
  assert.equal(payload.matches[0].timestamp, Date.parse('2026-01-20T00:00:00.000Z'));
  assert.equal(payload.matches[0].result, 'win');
  assert.equal(payload.matches[0].isFriendChallenge, true);
  assert.equal(payload.matches[1].matchId, 'seconds-match');
  assert.equal(payload.matches[1].timestamp, 1760000000000);
  assert.equal(payload.matches[1].isBotMatch, true);
});

test('rpcGetMatchHistory clamps pagination bounds', () => {
  const logger = createLogger();
  const manyMatches = [];
  for (let i = 0; i < 60; i += 1) {
    manyMatches.push({
      matchId: `m_${i}`,
      category: 'general',
      opponentId: `u_${i}`,
      opponentName: `User ${i}`,
      playerScore: i % 10,
      opponentScore: (i + 1) % 10,
      result: i % 2 === 0 ? 'win' : 'loss',
      mmrChange: i % 2 === 0 ? 5 : -5,
      newMmr: 1200 + i,
      correctAnswers: i % 10,
      totalQuestions: 10,
      timestamp: 1765000000000 - i * 1000,
    });
  }

  const nk = new MatchHistoryMockNakama({
    historyByUserId: { u1: manyMatches },
  });

  const firstRaw = rpcGetMatchHistory(
    { userId: 'u1' },
    logger,
    nk,
    JSON.stringify({ limit: 999, offset: -25 })
  );
  const first = JSON.parse(firstRaw);
  assert.equal(first.limit, 50);
  assert.equal(first.offset, 0);
  assert.equal(first.matches.length, 50);
  assert.equal(first.total, 60);

  const secondRaw = rpcGetMatchHistory(
    { userId: 'u1' },
    logger,
    nk,
    JSON.stringify({ limit: 999, offset: 50 })
  );
  const second = JSON.parse(secondRaw);
  assert.equal(second.limit, 50);
  assert.equal(second.offset, 50);
  assert.equal(second.matches.length, 10);
});

test('rpcGetMatchHistory enforces friendship for other-user reads', () => {
  const logger = createLogger();

  const deniedNakama = new MatchHistoryMockNakama({
    historyByUserId: {
      u2: [{ matchId: 'm1', timestamp: Date.now() }],
    },
    friendMap: {
      u1: [],
    },
  });

  assert.throws(() => {
    rpcGetMatchHistory(
      { userId: 'u1' },
      logger,
      deniedNakama,
      JSON.stringify({ userId: 'u2', limit: 10, offset: 0 })
    );
  }, /Forbidden/);

  const allowedNakama = new MatchHistoryMockNakama({
    historyByUserId: {
      u2: [{ matchId: 'm1', timestamp: Date.now() }],
    },
    friendMap: {
      u1: ['u2'],
    },
  });

  const raw = rpcGetMatchHistory(
    { userId: 'u1' },
    logger,
    allowedNakama,
    JSON.stringify({ userId: 'u2', limit: 10, offset: 0 })
  );
  const payload = JSON.parse(raw);

  assert.equal(payload.total, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(payload.matches[0].matchId, 'm1');
});
