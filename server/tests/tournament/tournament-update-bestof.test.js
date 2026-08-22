const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rpcAdminUpdateTournament,
  rpcAdminRepairTournamentBestOf,
} = require('../../build/features/tournaments.js');
const {
  parseJsonb,
  buildBestOfByRound,
} = require('../../build/features/helpers.js');
const {
  parseBestOfConfig,
} = require('../../build/main/tournament-advance.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function toByteArray(text) {
  return Array.from(text).map((ch) => ch.charCodeAt(0));
}

function toWrappedByteArray(text) {
  return Array.from(text).map((ch) => ({
    toJSON() { return ch.charCodeAt(0); },
  }));
}

test('parseJsonb decodes JSONB byte arrays', () => {
  const input = toByteArray('{"opening":3,"winners":[3,3,3,3],"losers":[3,3,3,3,3,3],"grand_final":5,"default":1}');
  const parsed = parseJsonb(input, {});
  assert.equal(parsed.opening, 3);
  assert.equal(parsed.winners[0], 3);
  assert.equal(parsed.grand_final, 5);
});

test('parseJsonb decodes wrapped JSONB byte arrays', () => {
  const input = toWrappedByteArray('{"opening":3,"winners":[3,3,3,3],"losers":[3,3,3,3,3,3],"grand_final":5,"default":1}');
  const parsed = parseJsonb(input, {});
  assert.equal(parsed.opening, 3);
  assert.equal(parsed.winners[0], 3);
  assert.equal(parsed.grand_final, 5);
});

test('parseJsonb decodes JSONB byte maps', () => {
  const bytes = toByteArray('{"opening":3,"winners":[3,3,3,3],"losers":[3,3,3,3,3,3],"grand_final":5,"default":1}');
  const map = {};
  for (let i = 0; i < bytes.length; i += 1) {
    map[String(i)] = bytes[i];
  }
  const parsed = parseJsonb(map, {});
  assert.equal(parsed.opening, 3);
  assert.equal(parsed.winners[2], 3);
  assert.equal(parsed.grand_final, 5);
});

test('parseBestOfConfig decodes JSONB byte arrays', () => {
  const input = toByteArray('{"opening":3,"winners":[3,3,3,3],"losers":[3,3,3,3,3,3],"grand_final":5,"default":1}');
  const parsed = parseBestOfConfig(input);
  assert.equal(parsed.opening, 3);
  assert.equal(parsed.winners[1], 3);
  assert.equal(parsed.grand_final, 5);
});

test('parseBestOfConfig decodes wrapped JSONB byte arrays', () => {
  const input = toWrappedByteArray('{"opening":3,"winners":[3,3,3,3],"losers":[3,3,3,3,3,3],"grand_final":5,"default":1}');
  const parsed = parseBestOfConfig(input);
  assert.equal(parsed.opening, 3);
  assert.equal(parsed.winners[1], 3);
  assert.equal(parsed.grand_final, 5);
});

test('parseBestOfConfig decodes JSONB byte maps', () => {
  const bytes = toByteArray('{"opening":3,"winners":[3,3,3,3],"losers":[3,3,3,3,3,3],"grand_final":5,"default":1}');
  const map = {};
  for (let i = 0; i < bytes.length; i += 1) {
    map[String(i)] = bytes[i];
  }
  const parsed = parseBestOfConfig(map);
  assert.equal(parsed.opening, 3);
  assert.equal(parsed.winners[3], 3);
  assert.equal(parsed.grand_final, 5);
});

test('buildBestOfByRound supports legacy object round maps and default fallback', () => {
  const config = buildBestOfByRound(16, 'double_elimination', 'random_opening_round', {
    opening: 3,
    winners: { '1': 3, '2': 5, '4': 3 },
    losers: { '1': 3, '2': 5 },
    grandFinal: 5,
    default: 3,
  });

  assert.deepEqual(config.winners, [3, 5, 3, 3]);
  assert.deepEqual(config.losers, [3, 5, 3, 3, 3, 3]);
  assert.equal(config.opening, 3);
  assert.equal(config.grand_final, 5);
  assert.equal(config.default, 3);
});

class TournamentBestOfMockNakama {
  constructor() {
    this.tournament = {
      id: 't1',
      status: 'paused',
      bracket_size: 16,
      format: 'double_elimination',
      seeding_mode: 'random_opening_round',
      category: null,
      best_of_by_round: {
        opening: 1,
        winners: [1, 1, 1, 1],
        losers: [1, 1, 1, 1, 1, 1],
        grand_final: 1,
        default: 1,
      },
    };

    this.matches = [
      { id: 'm_w_r1', bracket_type: 'winners', round_number: 1, match_number: 1, status: 'pending', best_of: 1 },
      { id: 'm_w_r2', bracket_type: 'winners', round_number: 2, match_number: 1, status: 'ready', best_of: 1 },
      { id: 'm_l_r1', bracket_type: 'losers', round_number: 1, match_number: 1, status: 'pending', best_of: 1 },
      { id: 'm_l_r2', bracket_type: 'losers', round_number: 2, match_number: 1, status: 'ready', best_of: 1 },
      { id: 'm_gf', bracket_type: 'grand_final', round_number: 11, match_number: 1, status: 'pending', best_of: 1 },
      { id: 'm_w_live', bracket_type: 'winners', round_number: 3, match_number: 1, status: 'in_progress', best_of: 1 },
      { id: 'm_l_done', bracket_type: 'losers', round_number: 3, match_number: 1, status: 'completed', best_of: 1 },
    ];

    this.auditLogs = [];
    this.txOps = [];
  }

  storageRead(reads) {
    if (!Array.isArray(reads) || reads.length === 0) return [];
    const key = reads[0].key;
    if (key === 'global_mmr' || key === 'telegram') {
      return [{ key, value: { telegramId: 1 } }];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    const normalized = String(sql || '').trim();

    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      this.txOps.push(normalized);
      return { rowsAffected: 0 };
    }

    if (normalized.includes('UPDATE tournaments') && normalized.includes('best_of_by_round = $1')) {
      this.tournament.best_of_by_round = JSON.parse(params[0]);
      return { rowsAffected: 1 };
    }

    if (normalized.includes('INSERT INTO admin_audit_log')) {
      this.auditLogs.push({ sql: normalized, params });
      return { rowsAffected: 1 };
    }

    return { rowsAffected: 0 };
  }

  sqlQuery(sql, params = []) {
    const normalized = String(sql || '');

    if (
      normalized.includes('SELECT status, bracket_size, format, seeding_mode, category') &&
      normalized.includes('FOR UPDATE')
    ) {
      return [{ ...this.tournament }];
    }

    if (
      normalized.includes('SELECT id, status, bracket_size, format, seeding_mode, best_of_by_round') &&
      normalized.includes('FOR UPDATE')
    ) {
      return [{ ...this.tournament }];
    }

    if (normalized.includes('UPDATE tournaments') && normalized.includes('RETURNING id')) {
      // In these tests we only patch best_of_by_round through admin_update_tournament.
      if (params.length >= 2 && typeof params[0] === 'string') {
        this.tournament.best_of_by_round = JSON.parse(params[0]);
      }
      return [{ id: this.tournament.id }];
    }

    if (
      normalized.includes('SELECT id, bracket_type, round_number, status, best_of') &&
      normalized.includes('FROM tournament_matches')
    ) {
      return this.matches
        .slice()
        .sort((a, b) => {
          if (a.round_number !== b.round_number) return a.round_number - b.round_number;
          return a.match_number - b.match_number;
        })
        .map((row) => ({ ...row }));
    }

    if (normalized.includes('UPDATE tournament_matches') && normalized.includes('SET best_of = $1')) {
      const nextBestOf = Number(params[0]) || 1;
      const matchId = String(params[1]);
      const row = this.matches.find((m) => m.id === matchId);
      if (!row) return [];
      if (row.status !== 'pending' && row.status !== 'ready') return [];
      row.best_of = nextBestOf;
      return [{ id: row.id }];
    }

    if (normalized.includes('SELECT admin_level FROM admin_users')) {
      return [];
    }

    return [];
  }
}

function byId(matches, id) {
  const row = matches.find((m) => m.id === id);
  assert.ok(row, `expected match ${id}`);
  return row;
}

test('admin_update_tournament resyncs pending/ready match best-of values across opening, upper, lower and grand final', () => {
  const nk = new TournamentBestOfMockNakama();
  const logger = createLogger();
  const ctx = {
    userId: 'admin1',
    env: {
      ADMIN_TELEGRAM_IDS: '1',
    },
  };

  const nextConfig = {
    opening: 3,
    winners: [1, 3, 5, 5],
    losers: [3, 5, 5, 5, 5, 5],
    grand_final: 5,
    default: 1,
  };

  const raw = rpcAdminUpdateTournament(
    ctx,
    logger,
    nk,
    JSON.stringify({
      tournamentId: 't1',
      bestOfByRound: nextConfig,
    })
  );
  const payload = JSON.parse(raw);

  assert.equal(payload.success, true);
  assert.equal(payload.bestOfResync.updated, 5);
  assert.equal(payload.bestOfResync.wouldUpdate, 5);

  assert.equal(byId(nk.matches, 'm_w_r1').best_of, 3); // opening round
  assert.equal(byId(nk.matches, 'm_w_r2').best_of, 3); // upper bracket round 2
  assert.equal(byId(nk.matches, 'm_l_r1').best_of, 3); // lower bracket round 1
  assert.equal(byId(nk.matches, 'm_l_r2').best_of, 5); // lower bracket round 2
  assert.equal(byId(nk.matches, 'm_gf').best_of, 5);   // grand final

  // Must remain untouched.
  assert.equal(byId(nk.matches, 'm_w_live').best_of, 1);
  assert.equal(byId(nk.matches, 'm_l_done').best_of, 1);

  assert.deepEqual(nk.txOps, ['BEGIN', 'COMMIT']);
});

test('admin_repair_tournament_best_of dry-run reports deltas without mutating rows', () => {
  const nk = new TournamentBestOfMockNakama();
  const logger = createLogger();
  const ctx = {
    userId: 'admin1',
    env: {
      ADMIN_TELEGRAM_IDS: '1',
    },
  };

  nk.tournament.best_of_by_round = {
    opening: 5,
    winners: [1, 3, 5, 5],
    losers: [3, 5, 5, 5, 5, 5],
    grand_final: 5,
    default: 1,
  };

  const before = nk.matches.map((m) => m.best_of);

  const raw = rpcAdminRepairTournamentBestOf(
    ctx,
    logger,
    nk,
    JSON.stringify({
      tournamentId: 't1',
      dryRun: true,
    })
  );
  const payload = JSON.parse(raw);

  assert.equal(payload.success, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.bestOfResync.updated, 0);
  assert.equal(payload.bestOfResync.wouldUpdate, 5);
  assert.deepEqual(
    nk.matches.map((m) => m.best_of),
    before
  );
  assert.deepEqual(nk.txOps, ['BEGIN', 'COMMIT']);
});

test('admin_repair_tournament_best_of updates eligible rows and logs repair action', () => {
  const nk = new TournamentBestOfMockNakama();
  const logger = createLogger();
  const ctx = {
    userId: 'admin1',
    env: {
      ADMIN_TELEGRAM_IDS: '1',
    },
  };

  nk.tournament.best_of_by_round = {
    opening: 5,
    winners: [1, 3, 5, 5],
    losers: [3, 5, 5, 5, 5, 5],
    grand_final: 5,
    default: 1,
  };

  const raw = rpcAdminRepairTournamentBestOf(
    ctx,
    logger,
    nk,
    JSON.stringify({
      tournamentId: 't1',
      dryRun: false,
    })
  );
  const payload = JSON.parse(raw);

  assert.equal(payload.success, true);
  assert.equal(payload.dryRun, false);
  assert.equal(payload.bestOfResync.updated, 5);

  assert.equal(byId(nk.matches, 'm_w_r1').best_of, 5);
  assert.equal(byId(nk.matches, 'm_w_r2').best_of, 3);
  assert.equal(byId(nk.matches, 'm_l_r1').best_of, 3);
  assert.equal(byId(nk.matches, 'm_l_r2').best_of, 5);
  assert.equal(byId(nk.matches, 'm_gf').best_of, 5);

  assert.equal(nk.auditLogs.length, 1);
  assert.deepEqual(nk.txOps, ['BEGIN', 'COMMIT']);
});
