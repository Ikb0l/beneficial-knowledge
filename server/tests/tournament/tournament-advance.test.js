const test = require('node:test');
const assert = require('node:assert/strict');

const {
  autoReportTournamentResult,
  completeTournament,
  runInitialTournamentProgressionPass,
} = require('../../build/main/tournament-advance.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function maybeAcquireRuntimeLock(mock, sql, params = []) {
  if (!sql.includes('INSERT INTO runtime_locks')) return undefined;
  const key = String(params[0]);
  const owner = String(params[1]);
  if (mock.locks.has(key)) return [];
  mock.locks.add(key);
  return [{ owner }];
}

function maybeReleaseRuntimeLock(mock, sql, params = []) {
  if (!sql.includes('DELETE FROM runtime_locks')) return false;
  mock.locks.delete(String(params[0]));
  return true;
}

class RewardMockNakama {
  constructor() {
    this.tournament = {
      id: 't1',
      status: 'in_progress',
      winner_id: null,
      name: 'Championship',
      bot_policy: {},
    };
    this.participants = [
      {
        id: 'p1',
        user_id: 'u1',
        status: 'active',
        elimination_round: null,
        total_score: 200,
        final_placement: null,
        is_bot: false,
        bot_influenced: false,
      },
      {
        id: 'p2',
        user_id: 'u2',
        status: 'eliminated',
        elimination_round: 1,
        total_score: 100,
        final_placement: null,
        is_bot: false,
        bot_influenced: false,
      },
    ];
    this.rewardClaims = new Set();
    this.walletCredits = new Map();
    this.coinTransactions = [];
    this.notifications = [];
    this.notificationKeys = new Set();
    this.statusTransitionCount = 0;
    this.locks = new Set();
  }

  sqlQuery(sql, params = []) {
    const runtimeLockRows = maybeAcquireRuntimeLock(this, sql, params);
    if (runtimeLockRows !== undefined) return runtimeLockRows;
    if (sql.includes('pg_try_advisory_lock')) {
      const key = String(params[0]);
      if (this.locks.has(key)) return [{ acquired: false }];
      this.locks.add(key);
      return [{ acquired: true }];
    }
    if (sql.includes('pg_advisory_unlock')) {
      const key = String(params[0]);
      this.locks.delete(key);
      return [{ pg_advisory_unlock: true }];
    }
    if (sql.includes('SELECT status, winner_id FROM tournaments')) {
      return [{ status: this.tournament.status, winner_id: this.tournament.winner_id }];
    }
    if (sql.includes('SELECT bot_policy FROM tournaments WHERE id = $1')) {
      return [{ bot_policy: this.tournament.bot_policy }];
    }
    if (sql.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      return [];
    }
    if (sql.includes('SELECT user_id FROM tournament_participants WHERE id = $1')) {
      const participant = this.participants.find((p) => p.id === params[0]);
      return participant ? [{ user_id: participant.user_id }] : [];
    }
    if (sql.includes("UPDATE tournaments SET") && sql.includes("status = 'completed'") && sql.includes('RETURNING id')) {
      if (this.tournament.status === 'in_progress' || this.tournament.status === 'paused') {
        this.tournament.status = 'completed';
        if (params[0]) this.tournament.winner_id = params[0];
        this.statusTransitionCount += 1;
        return [{ id: this.tournament.id }];
      }
      return [];
    }
    if (sql.includes('SELECT id, user_id, status, elimination_round, total_score')) {
      const sorted = [...this.participants].sort((a, b) => {
        const aWinner = a.status === 'winner' ? 0 : 1;
        const bWinner = b.status === 'winner' ? 0 : 1;
        if (aWinner !== bWinner) return aWinner - bWinner;
        const aRound = a.elimination_round === null ? -Infinity : a.elimination_round;
        const bRound = b.elimination_round === null ? -Infinity : b.elimination_round;
        if (aRound !== bRound) return bRound - aRound;
        return b.total_score - a.total_score;
      });
      return sorted.map((p) => ({
        id: p.id,
        user_id: p.user_id,
        status: p.status,
        elimination_round: p.elimination_round,
        total_score: p.total_score,
      }));
    }
    if (sql.includes('SELECT id, user_id, final_placement, is_bot, bot_influenced') &&
        sql.includes('FROM tournament_participants')) {
      return this.participants
        .filter((p) => p.final_placement !== null)
        .sort((a, b) => a.final_placement - b.final_placement)
        .map((p) => ({
          id: p.id,
          user_id: p.user_id,
          final_placement: p.final_placement,
          is_bot: p.is_bot,
          bot_influenced: p.bot_influenced,
        }));
    }
    if (sql.includes('INSERT INTO tournament_reward_claims')) {
      const key = params.join('|');
      if (this.rewardClaims.has(key)) return [];
      this.rewardClaims.add(key);
      return [{ id: `claim_${this.rewardClaims.size}` }];
    }
    if (sql.includes('SELECT tp.user_id, tp.final_placement, tp.is_bot, t.name as tournament_name') &&
        sql.includes('FROM tournament_participants tp')) {
      return this.participants
        .filter((p) => p.final_placement !== null)
        .map((p) => ({
          user_id: p.user_id,
          final_placement: p.final_placement,
          is_bot: p.is_bot,
          tournament_name: this.tournament.name,
        }));
    }
    if (sql.includes('INSERT INTO notifications')) {
      const userId = String(params[0]);
      const type = String(params[1]);
      const payload = JSON.parse(params[4] || '{}');
      const tournamentId = payload.tournamentId || '';
      const matchId = payload.matchId || '#';
      const key = [userId, type, tournamentId, matchId].join('|');
      if (this.notificationKeys.has(key)) return [];
      this.notificationKeys.add(key);
      this.notifications.push({ userId, type, tournamentId, matchId });
      return [{ id: `notif_${this.notifications.length}` }];
    }
    if (sql.includes('SELECT id FROM badges WHERE badge_key = $1')) {
      return [];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    if (maybeReleaseRuntimeLock(this, sql, params)) return;
    if (sql.includes("UPDATE tournament_participants SET") && sql.includes("status = 'winner'")) {
      const participant = this.participants.find((p) => p.id === params[0]);
      if (participant) {
        participant.status = 'winner';
        participant.final_placement = 1;
      }
      return;
    }
    if (sql.includes('UPDATE tournament_participants SET final_placement = $1 WHERE id = $2')) {
      const placement = Number(params[0]);
      const participant = this.participants.find((p) => p.id === params[1]);
      if (participant) {
        participant.final_placement = placement;
      }
      return;
    }
    if (sql.includes('SET winner_id = COALESCE(winner_id, $1)')) {
      if (!this.tournament.winner_id && params[0]) {
        this.tournament.winner_id = params[0];
      }
      return;
    }
    if (sql.includes('INSERT INTO user_wallets')) {
      const userId = String(params[0]);
      const amount = Number(params[1]);
      const current = this.walletCredits.get(userId) || 0;
      this.walletCredits.set(userId, current + amount);
      return;
    }
    if (sql.includes('INSERT INTO coin_transactions')) {
      this.coinTransactions.push({
        userId: String(params[0]),
        amount: Number(params[1]),
        tournamentId: String(params[2]),
        description: String(params[3]),
      });
    }
  }

  storageRead() {
    return [];
  }

  storageWrite() {}

  leaderboardRecordWrite() {}

  notificationSend() {}
}

class StatusGuardMockNakama {
  constructor(tournamentStatus) {
    this.tournamentStatus = tournamentStatus;
    this.execCalls = [];
  }

  sqlQuery(sql, params = []) {
    const runtimeLockRows = maybeAcquireRuntimeLock(this, sql, params);
    if (runtimeLockRows !== undefined) return runtimeLockRows;
    if (sql.includes('FROM tournament_matches tm')) {
      return [{
        id: 'tm1',
        tournament_id: 't1',
        round_number: 1,
        match_number: 1,
        player1_participant_id: 'p1',
        player2_participant_id: 'p2',
        bracket_type: 'winners',
        status: 'ready',
        best_of: 1,
        series_wins_player1: 0,
        series_wins_player2: 0,
        series_game_count: 0,
        player1_id: 'u1',
        player2_id: 'u2',
        player1_seed: 1,
        player2_seed: 2,
        player1_losses: 0,
        player2_losses: 0,
        total_rounds: 1,
        current_round: 1,
        format: 'single_elimination',
        rewards: {},
        bracket_size: 8,
        tournament_status: this.tournamentStatus,
        grand_final_reset: false,
      }];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    if (maybeReleaseRuntimeLock(this, sql, params)) return;
    this.execCalls.push(sql);
  }
}

class BotWinnerSelectionMockNakama {
  constructor() {
    this.match = {
      id: 'tm_bot',
      tournament_id: 't_bot',
      round_number: 1,
      match_number: 1,
      player1_participant_id: 'p1',
      player2_participant_id: 'p2',
      bracket_type: 'winners',
      status: 'ready',
      best_of: 1,
      series_wins_player1: 0,
      series_wins_player2: 0,
      series_game_count: 0,
      player1_id: null,
      player2_id: null,
      player1_is_bot: true,
      player2_is_bot: true,
      player1_seed: 16,
      player2_seed: 3,
      player1_losses: 0,
      player2_losses: 0,
      total_rounds: 4,
      current_round: 1,
      format: 'single_elimination',
      rewards: {},
      bracket_size: 16,
      tournament_status: 'in_progress',
      grand_final_reset: false,
      bot_policy: {},
      winner_participant_id: null,
      player1_score: null,
      player2_score: null,
    };
    this.locks = new Set();
  }

  sqlQuery(sql, params = []) {
    const runtimeLockRows = maybeAcquireRuntimeLock(this, sql, params);
    if (runtimeLockRows !== undefined) return runtimeLockRows;
    if (sql.includes('FROM tournament_matches tm')) {
      return [this.match];
    }
    if (sql.includes('UPDATE tournament_matches SET') && sql.includes('winner_participant_id = $1')) {
      this.match.status = 'completed';
      this.match.winner_participant_id = params[0];
      this.match.player1_score = params[1];
      this.match.player2_score = params[2];
      this.match.series_wins_player1 = params[3];
      this.match.series_wins_player2 = params[4];
      this.match.series_game_count = params[5];
      return [{ id: this.match.id }];
    }
    if (sql.includes('pg_try_advisory_lock')) {
      var key = String(params[0]);
      if (this.locks.has(key)) return [{ acquired: false }];
      this.locks.add(key);
      return [{ acquired: true }];
    }
    if (sql.includes('pg_advisory_unlock')) {
      this.locks.delete(String(params[0]));
      return [{ pg_advisory_unlock: true }];
    }
    if (sql.includes('SELECT status, total_rounds, rewards FROM tournaments')) {
      return [{ status: 'in_progress', total_rounds: this.match.total_rounds, rewards: {} }];
    }
    if (sql.includes('SELECT COUNT(*) as pending FROM tournament_matches') ||
        (sql.includes('SELECT COUNT(*) as total') && sql.includes('SUM(CASE WHEN status NOT IN'))) {
      // Keep at least one pending match so round advancement is not triggered in this unit test.
      return [{ total: '1', pending: '1' }];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    if (maybeReleaseRuntimeLock(this, sql, params)) return;
  }
}

class DoubleEliminationReconcileMockNakama {
  constructor() {
    this.tournament = {
      id: 't_recon',
      status: 'in_progress',
      format: 'double_elimination',
      bracket_size: 16,
      total_rounds: 4,
      rewards: {},
      winner_id: null,
    };
    this.locks = new Set();
    this.winnerSet = false;
    this.completedTransitionCount = 0;
  }

  sqlQuery(sql, params = []) {
    const runtimeLockRows = maybeAcquireRuntimeLock(this, sql, params);
    if (runtimeLockRows !== undefined) return runtimeLockRows;
    if (sql.includes('pg_try_advisory_lock')) {
      const key = String(params[0]);
      if (this.locks.has(key)) return [{ acquired: false }];
      this.locks.add(key);
      return [{ acquired: true }];
    }
    if (sql.includes('pg_advisory_unlock')) {
      this.locks.delete(String(params[0]));
      return [{ pg_advisory_unlock: true }];
    }
    if (sql.includes('SELECT id, status, format, bracket_size, total_rounds, rewards')) {
      return [{
        id: this.tournament.id,
        status: this.tournament.status,
        format: this.tournament.format,
        bracket_size: this.tournament.bracket_size,
        total_rounds: this.tournament.total_rounds,
        rewards: this.tournament.rewards,
      }];
    }
    if (sql.includes('SELECT bracket_type, status, COUNT(*)::int as count')) {
      return [{ bracket_type: 'grand_final', status: 'completed', count: 1 }];
    }
    if (sql.includes('SELECT COUNT(*) as pending FROM tournament_matches') ||
        (sql.includes('SELECT COUNT(*) as total') && sql.includes('SUM(CASE WHEN status NOT IN'))) {
      // Keep rounds "not complete" so reconciliation path is the one that finalizes.
      return [{ total: '1', pending: '1' }];
    }
    if (sql.includes('SELECT winner_participant_id') &&
        sql.includes("bracket_type = 'grand_final'") &&
        sql.includes("status = 'completed'")) {
      return [{ winner_participant_id: 'p1' }];
    }
    if (sql.includes('SELECT status, winner_id FROM tournaments')) {
      return [{ status: this.tournament.status, winner_id: this.tournament.winner_id }];
    }
    if (sql.includes('SELECT user_id FROM tournament_participants WHERE id = $1')) {
      return [{ user_id: 'u1' }];
    }
    if (sql.includes("UPDATE tournaments SET") &&
        sql.includes("status = 'completed'") &&
        sql.includes('RETURNING id')) {
      if (this.tournament.status === 'in_progress' || this.tournament.status === 'paused') {
        this.tournament.status = 'completed';
        this.tournament.winner_id = params[0] || this.tournament.winner_id;
        this.completedTransitionCount += 1;
        return [{ id: this.tournament.id }];
      }
      return [];
    }
    if (sql.includes('SELECT id, user_id, status, elimination_round, total_score')) {
      return [];
    }
    if (sql.includes('SELECT id, user_id, final_placement, is_bot, bot_influenced')) {
      return [];
    }
    if (sql.includes('SELECT tp.user_id, tp.final_placement, tp.is_bot, t.name as tournament_name')) {
      return [];
    }
    if (sql.includes('SELECT id FROM badges WHERE badge_key = $1')) {
      return [];
    }
    if (sql.includes('INSERT INTO notifications')) {
      return [];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    if (maybeReleaseRuntimeLock(this, sql, params)) return;
    if (sql.includes("UPDATE tournament_participants SET") && sql.includes("status = 'winner'")) {
      this.winnerSet = true;
    }
  }
}

test('completeTournament is idempotent and reward grants are deduped', () => {
  const nk = new RewardMockNakama();
  const logger = createLogger();
  const rewards = {
    '1st': { coins: 1000 },
    '2nd': { coins: 500 },
  };

  completeTournament(nk, logger, 't1', 'p1', rewards);
  completeTournament(nk, logger, 't1', 'p1', rewards);

  assert.equal(nk.tournament.status, 'completed');
  assert.equal(nk.statusTransitionCount, 1);
  assert.equal(nk.coinTransactions.length, 2);
  assert.equal(nk.coinTransactions.filter((t) => t.userId === 'u1').length, 1);
  assert.equal(nk.coinTransactions.filter((t) => t.userId === 'u2').length, 1);
  assert.equal(nk.notifications.length, 2);
});

test('completeTournament skips invalid tournament statuses', () => {
  const nk = new RewardMockNakama();
  const logger = createLogger();
  nk.tournament.status = 'cancelled';

  completeTournament(nk, logger, 't1', 'p1', { '1st': { coins: 1000 } });

  assert.equal(nk.statusTransitionCount, 0);
  assert.equal(nk.coinTransactions.length, 0);
  assert.equal(nk.notifications.length, 0);
});

test('autoReportTournamentResult ignores non-active tournaments in non-strict mode', () => {
  const nk = new StatusGuardMockNakama('cancelled');
  const logger = createLogger();

  autoReportTournamentResult(nk, logger, 'tm1', 'u1', 10, 2, false, false);

  assert.equal(nk.execCalls.length, 0);
});

test('autoReportTournamentResult throws for non-active tournaments in strict mode', () => {
  const nk = new StatusGuardMockNakama('cancelled');
  const logger = createLogger();

  assert.throws(() => {
    autoReportTournamentResult(nk, logger, 'tm1', 'u1', 10, 2, true, false);
  }, /Tournament is not in progress/);
});

test('autoReportTournamentResult blocks paused tournaments until resumed', () => {
  const nk = new StatusGuardMockNakama('paused');
  const logger = createLogger();

  autoReportTournamentResult(nk, logger, 'tm1', 'u1', 10, 2, false, false);

  assert.equal(nk.execCalls.length, 0);
});

test('autoReportTournamentResult chooses score winner for bot-only matches without winner user id', () => {
  const nk = new BotWinnerSelectionMockNakama();
  const logger = createLogger();

  autoReportTournamentResult(nk, logger, 'tm_bot', null, 4, 5, true, true, true);

  assert.equal(nk.match.winner_participant_id, 'p2');
  assert.equal(nk.match.player1_score, 4);
  assert.equal(nk.match.player2_score, 5);
});

test('runInitialTournamentProgressionPass reconciles double-elimination tournaments with completed grand final', () => {
  const nk = new DoubleEliminationReconcileMockNakama();
  const logger = createLogger();

  runInitialTournamentProgressionPass(nk, logger, 't_recon');

  assert.equal(nk.tournament.status, 'completed');
  assert.equal(nk.completedTransitionCount, 1);
  assert.equal(nk.winnerSet, true);
});
