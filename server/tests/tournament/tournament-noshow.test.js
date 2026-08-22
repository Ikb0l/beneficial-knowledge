const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentExperience = require('../../build/features/tournament-experience.js');
const tournamentBots = require('../../build/main/tournament-bots.js');
const tournamentAdvance = require('../../build/main/tournament-advance.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class NoShowMockNakama {
  constructor(readyRows) {
    this.readyRows = readyRows || [];
    this.execCalls = [];
    this.notificationRows = [];
    this.noShowQuerySql = '';
  }

  sqlQuery(sql, _params = []) {
    // Only match the no-show forfeit query, not the dead-man's switch query.
    // The no-show query has the ready-window interval; keep the legacy
    // 180-second matcher so the regression assertion below can catch it.
    // The dead-man's switch has "INTERVAL '10 minutes'".
    if (sql.includes('FROM tournament_matches tm') && sql.includes("tm.status = 'ready'")
        && (sql.includes("INTERVAL '60 seconds'") || sql.includes("INTERVAL '180 seconds'"))) {
      this.noShowQuerySql = sql;
      return this.readyRows;
    }
    // Dead-man's switch query: always return empty in tests (not testing dead-man path)
    if (sql.includes('FROM tournament_matches tm') && sql.includes("tm.status = 'ready'")
        && sql.includes("INTERVAL '10 minutes'")) {
      return [];
    }
    if (sql.includes('FROM tournament_matches tm') && sql.includes("tm.status = 'in_progress'")) {
      return [];
    }
    if (sql.includes('INSERT INTO notifications')) {
      const id = `notif_${this.notificationRows.length + 1}`;
      this.notificationRows.push({ id: id });
      return [{ id: id }];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    this.execCalls.push({ sql: sql, params: params });
    return { rowsAffected: 1 };
  }

  storageRead() {
    return [];
  }

  notificationSend() {}
}

class InactiveParticipantMatchMockNakama {
  constructor() {
    this.execCalls = [];
  }

  sqlQuery(sql) {
    if (sql.includes('p1.status IN') && sql.includes("tm.status IN ('ready', 'in_progress')")) {
      return [{
        match_id: 'm_inactive',
        tournament_id: 't_inactive',
        match_status: 'in_progress',
        round_number: 2,
        match_number: 1,
        bracket_type: 'winners',
        player1_participant_id: 'p_forfeited',
        player2_participant_id: 'p_active',
        p1_user_id: 'u_forfeited',
        p2_user_id: 'u_active',
        p1_status: 'forfeited',
        p2_status: 'active',
        p1_seed: 1,
        p2_seed: 2,
      }];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    this.execCalls.push({ sql, params });
    return { rowsAffected: 1 };
  }
}

test('resolvePlayableTournamentMatchesWithInactiveParticipants awards active opponent', () => {
  const nk = new InactiveParticipantMatchMockNakama();
  const logger = createLogger();
  const originalAutoReport = tournamentAdvance.autoReportTournamentResult;
  const autoReports = [];

  tournamentAdvance.autoReportTournamentResult = (_nk, _logger, matchId, winnerId, p1Score, p2Score, strict, forceSeriesComplete) => {
    autoReports.push({ matchId, winnerId, p1Score, p2Score, strict, forceSeriesComplete });
  };

  try {
    const resolved = tournamentExperience.resolvePlayableTournamentMatchesWithInactiveParticipants(nk, logger);
    assert.equal(resolved, 1);
  } finally {
    tournamentAdvance.autoReportTournamentResult = originalAutoReport;
  }

  assert.deepEqual(autoReports, [{
    matchId: 'm_inactive',
    winnerId: 'u_active',
    p1Score: 0,
    p2Score: 1,
    strict: false,
    forceSeriesComplete: true,
  }]);
  const reasonUpdate = nk.execCalls.find((call) =>
    call.sql.includes('UPDATE tournament_matches') &&
    call.params[0] === 'inactive_participant'
  );
  assert.ok(reasonUpdate, 'Expected inactive_participant reason update');
});

test('autoForfeitNoShowMatches handles double no-show by replacing both sides with bots', () => {
  const nk = new NoShowMockNakama([
    {
      match_id: 'm1',
      tournament_id: 't1',
      ready_player1: false,
      ready_player2: false,
      player1_participant_id: 'p1',
      player2_participant_id: 'p2',
      player1_user_id: 'u1',
      player2_user_id: 'u2',
      player1_is_bot: false,
      player2_is_bot: false,
    },
  ]);
  const logger = createLogger();

  const originalReplace = tournamentBots.replaceParticipantInPendingOrReadyMatchWithBot;
  const originalAutoReport = tournamentAdvance.autoReportTournamentResult;

  const replaceCalls = [];
  let autoReportCalled = false;

  tournamentBots.replaceParticipantInPendingOrReadyMatchWithBot = (_nk, _logger, tournamentId, participantId) => {
    replaceCalls.push({ tournamentId, participantId });
    return {
      replaced: true,
      wasInProgress: false,
      matchId: 'm1',
      botParticipantId: `bot_${participantId}`,
    };
  };
  tournamentAdvance.autoReportTournamentResult = () => {
    autoReportCalled = true;
  };

  try {
    tournamentExperience.autoForfeitNoShowMatches(nk, logger);
  } finally {
    tournamentBots.replaceParticipantInPendingOrReadyMatchWithBot = originalReplace;
    tournamentAdvance.autoReportTournamentResult = originalAutoReport;
  }

  assert.equal(autoReportCalled, false);
  assert.equal(replaceCalls.length, 2);
  assert.deepEqual(
    replaceCalls.map((c) => c.participantId).sort(),
    ['p1', 'p2']
  );

  const forfeitUpdates = nk.execCalls.filter((call) =>
    call.sql.includes("UPDATE tournament_participants")
    && call.sql.includes("status = 'forfeited'")
  );
  assert.equal(forfeitUpdates.length, 2);

  const reasonUpdate = nk.execCalls.find((call) =>
    call.sql.includes("SET forfeit_reason = 'double_no_show_replaced'")
  );
  assert.ok(reasonUpdate, 'Expected double_no_show_replaced reason update');
});

test('autoForfeitNoShowMatches uses one-minute no-show windows that match the client ready check', () => {
  const nk = new NoShowMockNakama([]);
  const logger = createLogger();

  tournamentExperience.autoForfeitNoShowMatches(nk, logger);

  assert.equal(tournamentExperience.READY_CHECK_TIMEOUT_MS, 60000);
  assert.equal(tournamentExperience.MATCH_NOSHOW_TIMEOUT_MS, 60000);
  assert.equal(tournamentExperience.MATCH_NOSHOW_HVH_TIMEOUT_MS, 60000);
  assert.match(nk.noShowQuerySql, /INTERVAL '60 seconds'/);
  assert.doesNotMatch(nk.noShowQuerySql, /INTERVAL '180 seconds'/);
});

test('autoForfeitNoShowMatches falls back to auto-resolve when replacement is unavailable', () => {
  const nk = new NoShowMockNakama([
    {
      match_id: 'm2',
      tournament_id: 't2',
      ready_player1: false,
      ready_player2: false,
      player1_participant_id: 'p11',
      player2_participant_id: 'p22',
      player1_user_id: 'u11',
      player2_user_id: 'u22',
      player1_is_bot: false,
      player2_is_bot: false,
    },
  ]);
  const logger = createLogger();

  const originalReplace = tournamentBots.replaceParticipantInPendingOrReadyMatchWithBot;
  const originalAutoReport = tournamentAdvance.autoReportTournamentResult;

  const replaceCalls = [];
  const autoReports = [];

  tournamentBots.replaceParticipantInPendingOrReadyMatchWithBot = (_nk, _logger, tournamentId, participantId) => {
    replaceCalls.push({ tournamentId, participantId });
    return {
      replaced: false,
      wasInProgress: false,
      matchId: 'm2',
      botParticipantId: null,
    };
  };
  tournamentAdvance.autoReportTournamentResult = (_nk, _logger, matchId, winnerId, p1Score, p2Score) => {
    autoReports.push({ matchId, winnerId, p1Score, p2Score });
  };

  try {
    tournamentExperience.autoForfeitNoShowMatches(nk, logger);
  } finally {
    tournamentBots.replaceParticipantInPendingOrReadyMatchWithBot = originalReplace;
    tournamentAdvance.autoReportTournamentResult = originalAutoReport;
  }

  assert.equal(replaceCalls.length, 2);
  assert.equal(autoReports.length, 1);
  // Fallback path awards 1-0 to the higher seed (no seeds in mock → null winner, 1-0).
  assert.deepEqual(autoReports[0], {
    matchId: 'm2',
    winnerId: null,
    p1Score: 1,
    p2Score: 0,
  });

  const reasonUpdate = nk.execCalls.find((call) =>
    call.sql.includes("SET forfeit_reason = 'double_no_show'")
  );
  assert.ok(reasonUpdate, 'Expected double_no_show fallback reason update');
});
