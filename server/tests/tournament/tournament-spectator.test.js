const test = require('node:test');
const assert = require('node:assert/strict');

const { rpcGetSpectatorMatches } = require('../../build/features/spectator.js');
const { getTournamentBotDisplayName } = require('../../build/main/tournament-bots.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class SpectatorMockNakama {
  constructor(rows, matchGetImpl) {
    this.rows = rows;
    this.matchGetImpl = matchGetImpl || (() => null);
    this.queries = [];
    this.matchGets = [];
  }

  sqlQuery(sql, params = []) {
    this.queries.push(sql);
    this.lastParams = params;
    if (sql.includes('FROM tournament_matches tm')) {
      return this.rows;
    }
    return [];
  }

  matchGet(matchId) {
    this.matchGets.push(matchId);
    return this.matchGetImpl(matchId);
  }
}

test('rpcGetSpectatorMatches requires authentication', () => {
  const logger = createLogger();
  const nk = new SpectatorMockNakama([], () => ({}));

  assert.throws(() => {
    rpcGetSpectatorMatches({}, logger, nk, '{}');
  }, /Authentication required/);
});

test('rpcGetSpectatorMatches filters placeholder and stale runtime matches', () => {
  const logger = createLogger();
  const nk = new SpectatorMockNakama(
    [
      {
        id: 'tm_live_1',
        nakama_match_id: 'nm_live_1',
        round_number: 2,
        spectator_count: '9',
        tournament_id: 't1',
        tournament_name: 'Championship',
        player1_id: 'u1',
        player2_id: 'u2',
        p1_name: 'Alice',
        p2_name: 'Bob',
      },
      {
        id: 'tm_starting',
        nakama_match_id: '__starting__:tm_starting:token',
        round_number: 2,
        spectator_count: '50',
        tournament_id: 't1',
        tournament_name: 'Championship',
        player1_id: 'u3',
        player2_id: 'u4',
        p1_name: 'Carol',
        p2_name: 'Dave',
      },
      {
        id: 'tm_dead',
        nakama_match_id: 'nm_dead',
        round_number: 2,
        spectator_count: '4',
        tournament_id: 't1',
        tournament_name: 'Championship',
        player1_id: 'u5',
        player2_id: 'u6',
        p1_name: 'Eve',
        p2_name: 'Frank',
      },
      {
        id: 'tm_live_2',
        nakama_match_id: 'nm_live_2',
        round_number: 3,
        spectator_count: '3',
        tournament_id: 't2',
        tournament_name: 'Finals',
        player1_id: 'u7',
        player2_id: 'u8',
        p1_name: 'Grace',
        p2_name: 'Heidi',
      },
    ],
    (matchId) => {
      if (matchId === 'nm_live_1' || matchId === 'nm_live_2') {
        return { matchId, size: 2 };
      }
      return null;
    }
  );

  const raw = rpcGetSpectatorMatches({ userId: 'viewer-1' }, logger, nk, '{}');
  const payload = JSON.parse(raw);

  assert.equal(payload.matches.length, 2);
  assert.deepEqual(
    payload.matches.map((m) => m.nakamaMatchId),
    ['nm_live_1', 'nm_live_2']
  );
  assert.deepEqual(nk.matchGets, ['nm_live_1', 'nm_dead', 'nm_live_2']);
  assert.ok(nk.queries[0].includes("tm.nakama_match_id NOT LIKE '__starting__:%'"));
  assert.ok(nk.queries[0].includes("t.status = 'in_progress'"));
});

test('rpcGetSpectatorMatches skips runtime verification errors and continues', () => {
  const logger = createLogger();
  const nk = new SpectatorMockNakama(
    [
      {
        id: 'tm_error',
        nakama_match_id: 'nm_error',
        round_number: 1,
        spectator_count: '2',
        tournament_id: 't1',
        tournament_name: 'Cup',
        player1_id: 'u1',
        player2_id: 'u2',
        p1_name: 'P1',
        p2_name: 'P2',
      },
      {
        id: 'tm_ok',
        nakama_match_id: 'nm_ok',
        round_number: 1,
        spectator_count: '1',
        tournament_id: 't1',
        tournament_name: 'Cup',
        player1_id: 'u3',
        player2_id: 'u4',
        p1_name: 'P3',
        p2_name: 'P4',
      },
    ],
    (matchId) => {
      if (matchId === 'nm_error') {
        throw new Error('runtime unavailable');
      }
      return { matchId, size: 1 };
    }
  );

  const raw = rpcGetSpectatorMatches({ userId: 'viewer-2' }, logger, nk, '{}');
  const payload = JSON.parse(raw);

  assert.equal(payload.matches.length, 1);
  assert.equal(payload.matches[0].nakamaMatchId, 'nm_ok');
});

test('rpcGetSpectatorMatches resolves realistic deterministic bot names for live watch cards', () => {
  const logger = createLogger();
  const nk = new SpectatorMockNakama(
    [
      {
        id: 'tm_bot',
        nakama_match_id: 'nm_bot',
        round_number: 4,
        spectator_count: '12',
        tournament_id: 't3',
        tournament_name: 'Bot Clash',
        player1_participant_id: 'p-human',
        player2_participant_id: 'p-bot-1',
        player1_id: 'u10',
        player2_id: null,
        player1_is_bot: false,
        player2_is_bot: true,
        player2_bot_key: 'atlas',
        p1_name: 'Human One',
        p2_name: 'Atlas Bot',
      },
    ],
    () => ({ matchId: 'nm_bot', size: 2 })
  );

  const raw = rpcGetSpectatorMatches({ userId: 'viewer-3' }, logger, nk, '{}');
  const payload = JSON.parse(raw);

  assert.equal(payload.matches.length, 1);
  assert.equal(payload.matches[0].player1.name, 'Human One');
  assert.equal(payload.matches[0].player2.id, null);
  assert.equal(
    payload.matches[0].player2.name,
    getTournamentBotDisplayName('atlas', 'p-bot-1', 'Atlas Bot')
  );
  assert.match(payload.matches[0].player2.name, /^[A-Za-z]+(?: [A-Z]\.)? [A-Za-z]+$/);
  assert.equal(/bot/i.test(payload.matches[0].player2.name), false);
});

test('rpcGetSpectatorMatches excludes matches where the viewer is a participant', () => {
  const logger = createLogger();
  const nk = new SpectatorMockNakama(
    [
      {
        id: 'tm_own',
        nakama_match_id: 'nm_own',
        round_number: 2,
        spectator_count: '5',
        tournament_id: 't1',
        tournament_name: 'Own Match Cup',
        player1_id: 'viewer_user',
        player2_id: null,
        player1_is_bot: false,
        player2_is_bot: true,
        player2_bot_key: 'atlas',
        p1_name: 'Viewer',
        p2_name: 'Atlas Bot',
      },
      {
        id: 'tm_other',
        nakama_match_id: 'nm_other',
        round_number: 2,
        spectator_count: '4',
        tournament_id: 't1',
        tournament_name: 'Other Match Cup',
        player1_id: 'u1',
        player2_id: 'u2',
        player1_is_bot: false,
        player2_is_bot: false,
        p1_name: 'Alice',
        p2_name: 'Bob',
      },
    ],
    (matchId) => ({ matchId, size: 2 })
  );

  const raw = rpcGetSpectatorMatches({ userId: 'viewer_user' }, logger, nk, '{}');
  const payload = JSON.parse(raw);

  assert.deepEqual(
    payload.matches.map((m) => m.matchId),
    ['tm_other']
  );
  assert.deepEqual(nk.lastParams, ['viewer_user']);
});
