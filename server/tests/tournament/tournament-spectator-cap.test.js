const test = require('node:test');
const assert = require('node:assert/strict');

const { matchJoinAttempt } = require('../../build/main/match-handlers.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function createSpectators(count) {
  const out = {};
  for (let i = 0; i < count; i += 1) {
    out[`viewer_${i}`] = {
      userId: `viewer_${i}`,
      connected: true,
    };
  }
  return out;
}

test('matchJoinAttempt rejects new spectator when spectator cap is reached', () => {
  const logger = createLogger();
  const state = {
    phase: 'question',
    isChallenge: false,
    isTournament: true,
    allowSpectators: true,
    spectators: createSpectators(500),
    pendingSpectators: {},
    players: {},
    expectedPlayers: [],
    botMatch: false,
  };

  const result = matchJoinAttempt(
    {},
    logger,
    {},
    {},
    0,
    state,
    { userId: 'new_viewer', username: 'new_viewer' },
    { role: 'spectator' }
  );

  assert.equal(result.accept, false);
  assert.equal(result.rejectMessage, 'Spectator limit reached');
  assert.equal(state.pendingSpectators.new_viewer, undefined);
});

test('matchJoinAttempt still allows spectator rejoin when over cap', () => {
  const logger = createLogger();
  const state = {
    phase: 'question',
    isChallenge: false,
    isTournament: true,
    allowSpectators: true,
    spectators: {
      ...createSpectators(500),
      rejoin_viewer: {
        userId: 'rejoin_viewer',
        connected: false,
      },
    },
    pendingSpectators: {},
    players: {},
    expectedPlayers: [],
    botMatch: false,
  };

  const result = matchJoinAttempt(
    {},
    logger,
    {},
    {},
    0,
    state,
    { userId: 'rejoin_viewer', username: 'rejoin_viewer' },
    { role: 'spectator' }
  );

  assert.equal(result.accept, true);
});

test('matchJoinAttempt accepts spectator when below cap and marks pending spectator', () => {
  const logger = createLogger();
  const state = {
    phase: 'question',
    isChallenge: false,
    isTournament: true,
    allowSpectators: true,
    spectators: {},
    pendingSpectators: {},
    players: {},
    expectedPlayers: [],
    botMatch: false,
  };

  const result = matchJoinAttempt(
    {},
    logger,
    {},
    {},
    0,
    state,
    { userId: 'viewer_ok', username: 'viewer_ok' },
    { role: 'spectator' }
  );

  assert.equal(result.accept, true);
  assert.equal(state.pendingSpectators.viewer_ok, true);
});

test('matchJoinAttempt does not mark an expected tournament player as spectator', () => {
  const logger = createLogger();
  const state = {
    phase: 'waiting',
    isChallenge: false,
    isTournament: true,
    allowSpectators: true,
    spectators: {},
    pendingSpectators: {},
    players: {},
    expectedPlayers: ['player_1'],
    botMatch: true,
  };

  const result = matchJoinAttempt(
    {},
    logger,
    {},
    {},
    0,
    state,
    { userId: 'player_1', username: 'player_1' },
    { role: 'spectator' }
  );

  assert.equal(result.accept, true);
  assert.equal(state.pendingSpectators.player_1, undefined);
});

test('matchJoinAttempt converts an expected tournament player out of spectator rejoin state', () => {
  const logger = createLogger();
  const state = {
    phase: 'question',
    isChallenge: false,
    isTournament: true,
    allowSpectators: true,
    spectators: {
      player_1: {
        userId: 'player_1',
        connected: false,
      },
    },
    spectatorSessions: {
      player_1: {
        old_session: true,
      },
    },
    pendingSpectators: {},
    players: {},
    expectedPlayers: ['player_1'],
    botMatch: true,
  };

  const result = matchJoinAttempt(
    {},
    logger,
    {},
    {},
    0,
    state,
    { userId: 'player_1', username: 'player_1' },
    { role: 'spectator' }
  );

  assert.equal(result.accept, true);
  assert.equal(state.spectators.player_1, undefined);
  assert.equal(state.spectatorSessions.player_1, undefined);
  assert.equal(state.pendingSpectators.player_1, undefined);
});
