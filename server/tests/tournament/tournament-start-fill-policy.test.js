const test = require('node:test');
const assert = require('node:assert/strict');

const { rpcAdminStartTournament } = require('../../build/features/tournaments.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class AdminStartFillPolicyMockNakama {
  constructor() {
    this.tournament = {
      id: 't1',
      status: 'registration',
      bracket_size: 32,
      format: 'single_elimination',
      seeding_mode: 'mmr',
      best_of_by_round: null,
      bot_policy: {},
    };
    this.participants = [
      {
        id: 'p1',
        tournament_id: 't1',
        user_id: 'u1',
        status: 'registered',
      },
      {
        id: 'p2',
        tournament_id: 't1',
        user_id: 'u2',
        status: 'registered',
      },
    ];
  }

  storageRead(reads) {
    if (!Array.isArray(reads) || reads.length === 0) return [];
    const key = reads[0].key;
    if (key === 'global_mmr' || key === 'telegram') {
      return [{ key, value: { telegramId: 1 } }];
    }
    return [];
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('SELECT id, bracket_size, format') && sql.includes('tournament_start <= NOW()')) {
      return [];
    }

    if (sql.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      return [];
    }

    if (sql.includes('SELECT status, bracket_size, format, seeding_mode, best_of_by_round, bot_policy') &&
        sql.includes('FOR UPDATE')) {
      return [this.tournament];
    }

    if (sql.includes('SELECT COUNT(*) as total_count') &&
        sql.includes('FROM tournament_participants') &&
        sql.includes("status = 'registered'")) {
      const tournamentId = params[0];
      const count = this.participants.filter((p) => p.tournament_id === tournamentId && p.status === 'registered').length;
      return [{ total_count: String(count) }];
    }

    if (sql.includes('SELECT id, bot_key, display_name') && sql.includes('FROM tournament_bot_profiles')) {
      return [];
    }

    if (sql.includes("COUNT(*) FILTER (WHERE status = 'registered') as registered_count")) {
      const tournamentId = params[0];
      const registeredCount = this.participants.filter((p) => p.tournament_id === tournamentId && p.status === 'registered').length;
      const totalCount = this.participants.filter((p) => p.tournament_id === tournamentId).length;
      return [{
        registered_count: String(registeredCount),
        total_count: String(totalCount),
      }];
    }

    return [];
  }

  sqlExec() {
    return { rowsAffected: 1 };
  }
}

test('rpcAdminStartTournament rejects underfilled bracket when bot fill policy is enabled', () => {
  const nk = new AdminStartFillPolicyMockNakama();
  const logger = createLogger();
  const ctx = {
    userId: 'admin1',
    env: {
      ADMIN_TELEGRAM_IDS: '1',
    },
  };

  assert.throws(() => {
    rpcAdminStartTournament(ctx, logger, nk, JSON.stringify({ tournamentId: 't1' }));
  }, /underfilled/i);
});
