const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentExperience = require('../../build/features/tournament-experience.js');
const tournamentMatchStart = require('../../build/main/tournament-match-start.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class ReadyCheckMockNakama {
  constructor() {
    this.match = {
      id: 'm1',
      tournament_id: 't1',
      status: 'ready',
      nakama_match_id: null,
      started_at: null,
      ready_player1: true,
      ready_player2: false,
      player1_id: 'u1',
      player2_id: 'u2',
      p1_is_bot: false,
      p2_is_bot: false,
      p1_status: 'active',
      p2_status: 'active',
      p1_name: 'Ada',
      p2_name: 'Ben',
      tournament_status: 'in_progress',
    };
    this.notifications = [];
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('FROM tournament_matches tm') && sql.includes('tm.tournament_id = $2')) {
      return [{ ...this.match }];
    }
    if (sql.includes('SELECT ready_player1, ready_player2 FROM tournament_matches')) {
      return [{
        ready_player1: this.match.ready_player1,
        ready_player2: this.match.ready_player2,
      }];
    }
    if (sql.includes('INSERT INTO notifications')) {
      const payload = JSON.parse(params[4] || '{}');
      this.notifications.push({
        userId: params[0],
        type: params[1],
        title: params[2],
        body: params[3],
        payload,
      });
      return [{ id: `n${this.notifications.length}` }];
    }
    return [];
  }

  sqlExec(sql) {
    if (sql.includes('SET ready_player1 = true')) {
      this.match.ready_player1 = true;
      return { rowsAffected: 1 };
    }
    if (sql.includes('SET ready_player2 = true')) {
      this.match.ready_player2 = true;
      return { rowsAffected: 1 };
    }
    if (sql.includes('SET ready_player1 = false')) {
      this.match.ready_player1 = false;
      return { rowsAffected: 1 };
    }
    if (sql.includes('SET ready_player2 = false')) {
      this.match.ready_player2 = false;
      return { rowsAffected: 1 };
    }
    return { rowsAffected: 0 };
  }

  storageRead() {
    return [];
  }

  notificationSend() {}
}

test('rpcTournamentReadyCheck starts runtime match when second player readies', () => {
  const nk = new ReadyCheckMockNakama();
  const logger = createLogger();
  const originalStart = tournamentMatchStart.startTournamentRuntimeMatch;
  const startCalls = [];
  tournamentMatchStart.startTournamentRuntimeMatch = (_nk, _logger, matchId, options) => {
    startCalls.push({ matchId, options });
    return {
      matchId: 'nakama_live_1',
      tournamentMatchId: matchId,
      startedAt: '2026-06-13T00:00:00.000Z',
      alreadyInProgress: false,
    };
  };

  try {
    const raw = tournamentExperience.rpcTournamentReadyCheck(
      { userId: 'u2' },
      logger,
      nk,
      JSON.stringify({ tournamentId: 't1', matchId: 'm1', ready: true })
    );
    const payload = JSON.parse(raw);

    assert.equal(payload.success, true);
    assert.equal(payload.ready, true);
    assert.equal(payload.bothReady, true);
    assert.equal(payload.nakamaMatchId, 'nakama_live_1');
    assert.equal(startCalls.length, 1);
    assert.equal(startCalls[0].matchId, 'm1');
    assert.equal(startCalls[0].options.actorUserId, 'u2');
    assert.equal(startCalls[0].options.requireParticipantUser, true);
    assert.equal(nk.notifications.length, 1);
    assert.equal(nk.notifications[0].userId, 'u1');
    assert.equal(nk.notifications[0].payload.nakamaMatchId, 'nakama_live_1');
  } finally {
    tournamentMatchStart.startTournamentRuntimeMatch = originalStart;
  }
});

test('rpcTournamentReadyCheck cancel clears only cancelling player ready flag', () => {
  const nk = new ReadyCheckMockNakama();
  nk.match.ready_player1 = true;
  nk.match.ready_player2 = true;
  const logger = createLogger();

  const raw = tournamentExperience.rpcTournamentReadyCheck(
    { userId: 'u2' },
    logger,
    nk,
    JSON.stringify({ tournamentId: 't1', matchId: 'm1', ready: false })
  );
  const payload = JSON.parse(raw);

  assert.equal(payload.success, true);
  assert.equal(payload.ready, false);
  assert.equal(payload.cancelled, true);
  assert.equal(nk.match.ready_player1, true);
  assert.equal(nk.match.ready_player2, false);
});

test('rpcTournamentReadyCheck refuses forfeited player before bot-opponent start path', () => {
  const nk = new ReadyCheckMockNakama();
  nk.match.player2_id = null;
  nk.match.p2_is_bot = true;
  nk.match.p1_status = 'forfeited';
  const logger = createLogger();
  const originalStart = tournamentMatchStart.startTournamentRuntimeMatch;
  let startCalled = false;
  tournamentMatchStart.startTournamentRuntimeMatch = () => {
    startCalled = true;
    throw new Error('should not start');
  };

  try {
    assert.throws(() => {
      tournamentExperience.rpcTournamentReadyCheck(
        { userId: 'u1' },
        logger,
        nk,
        JSON.stringify({ tournamentId: 't1', matchId: 'm1', ready: true })
      );
    }, /status is: forfeited/);
    assert.equal(startCalled, false);
  } finally {
    tournamentMatchStart.startTournamentRuntimeMatch = originalStart;
  }
});

test('createTournamentNotification updates deduped ready-check event with runtime match id', () => {
  const logger = createLogger();
  const notificationSends = [];
  let insertCalls = 0;
  let updateParams = null;
  const nk = {
    storageRead: () => [],
    sqlQuery: (sql, params = []) => {
      if (sql.includes('INSERT INTO notifications')) {
        insertCalls += 1;
        return [];
      }
      if (sql.includes('UPDATE notifications')) {
        updateParams = params;
        return [{ id: 'n1' }];
      }
      return [];
    },
    notificationSend: (...args) => {
      notificationSends.push(args);
    },
  };

  tournamentExperience.createTournamentNotification(
    nk,
    logger,
    'u1',
    'tournament_ready_check',
    'Tournament Match Starting',
    'Both players are ready. Join the match now.',
    {
      tournamentId: 't1',
      matchId: 'm1',
      nakamaMatchId: 'nakama_live_1',
    },
    '/tournaments/t1'
  );

  assert.equal(insertCalls, 1);
  assert.ok(updateParams);
  assert.equal(updateParams[0], 'u1');
  assert.equal(updateParams[1], 'tournament_ready_check');
  assert.equal(updateParams[6], 't1');
  assert.equal(updateParams[7], 'm1');
  assert.equal(notificationSends.length, 1);
  assert.equal(notificationSends[0][2].nakamaMatchId, 'nakama_live_1');
});
