const test = require('node:test');
const assert = require('node:assert/strict');

const { generateTournamentBracket } = require('../../build/features/tournaments.js');
const { isRoundComplete } = require('../../build/main/tournament-advance.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class BracketGenerationMockNakama {
  constructor(participantCount) {
    this.participants = [];
    this.matchRows = [];

    for (let i = 1; i <= participantCount; i++) {
      this.participants.push({
        id: `p${i}`,
        user_id: `u${i}`,
        mmr_at_registration: 2000 - i,
        seed_number: null,
      });
    }
  }

  sqlQuery(sql) {
    if (
      sql.includes('SELECT id, user_id, mmr_at_registration, seed_number') &&
      sql.includes("WHERE tournament_id = $1 AND status = 'registered'")
    ) {
      return this.participants;
    }
    return [];
  }

  sqlExec(sql, params = []) {
    if (
      sql.includes('INSERT INTO tournament_matches') &&
      sql.includes("'winners'")
    ) {
      if (params.length === 8) {
        this.matchRows.push({
          round_number: 1,
          match_number: Number(params[1]),
          best_of: Number(params[7]),
        });
      } else if (params.length === 4) {
        this.matchRows.push({
          round_number: Number(params[1]),
          match_number: Number(params[2]),
          best_of: Number(params[3]),
        });
      }
    }
  }
}

class RoundCompleteGuardMockNakama {
  constructor(includePendingPlaceholder = false) {
    this.lastRoundCheckSql = '';
    this.includePendingPlaceholder = includePendingPlaceholder;
  }

  sqlQuery(sql) {
    if (
      (
        sql.includes('SELECT COUNT(*) as pending FROM tournament_matches') ||
        sql.includes('SELECT COUNT(*) as total') && sql.includes('SUM(CASE WHEN status NOT IN')
      ) &&
      sql.includes('status NOT IN (\'completed\', \'bye\')')
    ) {
      this.lastRoundCheckSql = sql;
      if (sql.includes('SELECT COUNT(*) as total')) {
        return [{
          total: this.includePendingPlaceholder ? '3' : '2',
          pending: this.includePendingPlaceholder ? '1' : '0',
        }];
      }
      return [{ pending: this.includePendingPlaceholder ? '1' : '0' }];
    }
    return [];
  }
}

test('generateTournamentBracket uses shrinking winners rounds for non-power-of-two brackets', () => {
  const nk = new BracketGenerationMockNakama(12);
  const logger = createLogger();

  generateTournamentBracket(
    nk,
    logger,
    't_non_power_two',
    12,
    'single_elimination',
    'mmr',
    { winners: [1, 3, 5, 5] }
  );

  const countsByRound = nk.matchRows.reduce((acc, row) => {
    acc[row.round_number] = (acc[row.round_number] || 0) + 1;
    return acc;
  }, {});

  assert.deepEqual(countsByRound, {
    1: 6,
    2: 3,
    3: 2,
    4: 1,
  });

  const bestOfByRound = nk.matchRows.reduce((acc, row) => {
    if (!acc[row.round_number]) {
      acc[row.round_number] = row.best_of;
    }
    return acc;
  }, {});

  assert.equal(bestOfByRound[1], 1);
  assert.equal(bestOfByRound[2], 3);
  assert.equal(bestOfByRound[3], 5);
  assert.equal(bestOfByRound[4], 5);
});

test('isRoundComplete blocks pending unassigned placeholders until the round is populated', () => {
  const nk = new RoundCompleteGuardMockNakama(true);

  const complete = isRoundComplete(nk, 't1', 2, 'winners');

  assert.equal(complete, false);
  assert.match(nk.lastRoundCheckSql, /COUNT\(\*\) as total/);
  assert.match(nk.lastRoundCheckSql, /status NOT IN \('completed', 'bye'\)/);
});

test('isRoundComplete allows resolved empty bye slots', () => {
  const nk = new RoundCompleteGuardMockNakama();

  const complete = isRoundComplete(nk, 't1', 2, 'winners');

  assert.equal(complete, true);
  assert.match(nk.lastRoundCheckSql, /COUNT\(\*\) as total/);
  assert.doesNotMatch(nk.lastRoundCheckSql, /winner_participant_id IS NOT NULL/);
});
