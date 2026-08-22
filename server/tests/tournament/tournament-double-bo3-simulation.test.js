const test = require('node:test');
const assert = require('node:assert/strict');

const { generateTournamentBracket } = require('../../build/features/tournaments.js');
const {
  autoReportTournamentResult,
  runTournamentMaintenanceCycle,
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

function maybeRefreshRuntimeLock(mock, sql, params = []) {
  if (!sql.includes('UPDATE runtime_locks')) return undefined;
  const key = String(params[0]);
  return mock.locks.has(key) ? [{ lock_key: key }] : [];
}

function maybeReleaseRuntimeLock(mock, sql, params = []) {
  if (!sql.includes('DELETE FROM runtime_locks')) return false;
  mock.locks.delete(String(params[0]));
  return true;
}

function bracketSortValue(type) {
  if (type === 'winners') return 1;
  if (type === 'losers') return 2;
  if (type === 'grand_final') return 3;
  return 4;
}

class FullDoubleEliminationMockNakama {
  constructor(options = {}) {
    const size = Number(options.size || 32);
    const participantCount = Number(options.participantCount || size);
    const bestOf = Number(options.bestOf || 3);
    const totalRounds = Math.ceil(Math.log2(size));
    const padWidth = Math.max(2, String(size).length);
    const format = options.format || 'double_elimination';
    const botIds = new Set(options.botIds || []);
    this.tournament = {
      id: options.id || `t${size}`,
      name: options.name || `BO${bestOf} Double Elimination`,
      status: 'in_progress',
      bracket_size: size,
      total_rounds: totalRounds,
      current_round: 1,
      format,
      rewards: {},
      winner_id: null,
      grand_final_reset: true,
      bot_policy: {},
      question_count: 10,
    };
    this.participants = [];
    this.matches = [];
    this.nextMatchId = 1;
    this.locks = new Set();
    this.notifications = [];
    this.bestOfByRound = null;

    for (let i = 1; i <= participantCount; i += 1) {
      const suffix = String(i).padStart(padWidth, '0');
      const id = `p${suffix}`;
      this.participants.push({
        id,
        user_id: `u${suffix}`,
        status: 'registered',
        elimination_round: null,
        total_score: 0,
        final_placement: null,
        is_bot: botIds.has(id),
        bot_influenced: false,
        seed_number: null,
        mmr_at_registration: 3000 - i,
        losses_count: 0,
        matches_played: 0,
        matches_won: 0,
        bracket_position: 'winners',
      });
    }
  }

  participant(id) {
    return this.participants.find((p) => p.id === id) || null;
  }

  addMatch(input) {
    const match = {
      id: input.id || `tm${this.nextMatchId++}`,
      tournament_id: this.tournament.id,
      round_number: Number(input.round_number),
      match_number: Number(input.match_number),
      bracket_type: input.bracket_type,
      player1_participant_id: input.player1_participant_id || null,
      player2_participant_id: input.player2_participant_id || null,
      status: input.status || 'pending',
      winner_participant_id: input.winner_participant_id || null,
      completed_at: input.completed_at || null,
      best_of: Number(input.best_of || 1),
      series_wins_player1: 0,
      series_wins_player2: 0,
      series_game_count: 0,
      player1_score: null,
      player2_score: null,
      ready_player1: false,
      ready_player2: false,
      ready_at: (input.status || 'pending') === 'ready' ? new Date().toISOString() : null,
      nakama_match_id: null,
      started_at: null,
      spectator_count: 0,
    };
    this.matches.push(match);
    return match;
  }

  joinedMatchRow(match) {
    const p1 = this.participant(match.player1_participant_id);
    const p2 = this.participant(match.player2_participant_id);
    return {
      id: match.id,
      tournament_id: match.tournament_id,
      round_number: match.round_number,
      match_number: match.match_number,
      player1_participant_id: match.player1_participant_id,
      player2_participant_id: match.player2_participant_id,
      bracket_type: match.bracket_type,
      status: match.status,
      best_of: match.best_of,
      series_wins_player1: match.series_wins_player1,
      series_wins_player2: match.series_wins_player2,
      series_game_count: match.series_game_count,
      player1_id: p1 ? p1.user_id : null,
      player2_id: p2 ? p2.user_id : null,
      player1_is_bot: p1 ? p1.is_bot : false,
      player2_is_bot: p2 ? p2.is_bot : false,
      player1_seed: p1 ? p1.seed_number : null,
      player2_seed: p2 ? p2.seed_number : null,
      player1_losses: p1 ? p1.losses_count : 0,
      player2_losses: p2 ? p2.losses_count : 0,
      total_rounds: this.tournament.total_rounds,
      current_round: this.tournament.current_round,
      format: this.tournament.format,
      rewards: this.tournament.rewards,
      bracket_size: this.tournament.bracket_size,
      tournament_status: this.tournament.status,
      grand_final_reset: this.tournament.grand_final_reset,
      bot_policy: this.tournament.bot_policy,
    };
  }

  countPendingAssigned(tournamentId, roundNumber, bracketType) {
    return this.matches.filter((match) => (
      match.tournament_id === tournamentId &&
      match.round_number === Number(roundNumber) &&
      match.bracket_type === bracketType &&
      match.status !== 'completed' &&
      match.status !== 'bye' &&
      (match.winner_participant_id || match.player1_participant_id || match.player2_participant_id)
    )).length;
  }

  getRoundWinners(tournamentId, roundNumber, bracketType) {
    return this.matches
      .filter((match) => (
        match.tournament_id === tournamentId &&
        match.round_number === Number(roundNumber) &&
        match.bracket_type === bracketType &&
        (match.status === 'completed' || match.status === 'bye')
      ))
      .sort((a, b) => a.match_number - b.match_number)
      .map((match) => ({
        match_number: match.match_number,
        winner_participant_id: match.winner_participant_id,
      }));
  }

  updateProgressMatch(params) {
    const match = this.matches.find((m) => m.id === params[5]);
    if (!match || match.status === 'completed' || match.status === 'bye') return [];
    if (match.series_game_count !== Number(params[6])) return [];
    match.player1_score = Number(params[0]);
    match.player2_score = Number(params[1]);
    match.series_wins_player1 = Number(params[2]);
    match.series_wins_player2 = Number(params[3]);
    match.series_game_count = Number(params[4]);
    match.status = 'ready';
    match.ready_player1 = false;
    match.ready_player2 = false;
    match.ready_at = new Date().toISOString();
    match.nakama_match_id = null;
    match.started_at = null;
    match.spectator_count = 0;
    match.winner_participant_id = null;
    match.completed_at = null;
    return [{ id: match.id }];
  }

  completeMatch(params) {
    const match = this.matches.find((m) => m.id === params[6]);
    if (!match || match.status === 'completed' || match.status === 'bye') return [];
    if (match.series_game_count !== Number(params[7])) return [];
    match.status = 'completed';
    match.winner_participant_id = params[0];
    match.player1_score = Number(params[1]);
    match.player2_score = Number(params[2]);
    match.series_wins_player1 = Number(params[3]);
    match.series_wins_player2 = Number(params[4]);
    match.series_game_count = Number(params[5]);
    match.nakama_match_id = null;
    match.spectator_count = 0;
    match.completed_at = new Date().toISOString();
    return [{ id: match.id }];
  }

  sqlQuery(sql, params = []) {
    const runtimeLockRows = maybeAcquireRuntimeLock(this, sql, params);
    if (runtimeLockRows !== undefined) return runtimeLockRows;
    const refreshedLockRows = maybeRefreshRuntimeLock(this, sql, params);
    if (refreshedLockRows !== undefined) return refreshedLockRows;
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
    if (sql.includes('SELECT pg_sleep')) {
      return [];
    }
    if (sql.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      return [];
    }
    if (sql.includes('best_of_by_round') && sql.includes('seeding_mode') && sql.includes('FROM tournaments')) {
      return [{ seeding_mode: 'mmr', best_of_by_round: this.bestOfByRound }];
    }
    if (sql.includes('SELECT bot_policy FROM tournaments WHERE id = $1')) {
      return [{ bot_policy: this.tournament.bot_policy }];
    }
    if (sql.includes('SELECT id, status, format, bracket_size, total_rounds, rewards') &&
        sql.includes('FROM tournaments')) {
      return [{
        id: this.tournament.id,
        status: this.tournament.status,
        format: this.tournament.format,
        bracket_size: this.tournament.bracket_size,
        total_rounds: this.tournament.total_rounds,
        rewards: this.tournament.rewards,
      }];
    }
    if (sql.includes('SELECT bracket_type, status, COUNT(*)::int as count') &&
        sql.includes('FROM tournament_matches')) {
      const grouped = new Map();
      this.matches
        .filter((match) => match.tournament_id === params[0])
        .forEach((match) => {
          const key = `${match.bracket_type}:${match.status}`;
          const current = grouped.get(key) || {
            bracket_type: match.bracket_type,
            status: match.status,
            count: 0,
          };
          current.count += 1;
          grouped.set(key, current);
        });
      return [...grouped.values()];
    }
    if (sql.includes('SELECT id, user_id, mmr_at_registration, seed_number') &&
        sql.includes('FROM tournament_participants')) {
      return this.participants
        .filter((p) => p.status === 'registered')
        .map((p) => ({
          id: p.id,
          user_id: p.user_id,
          mmr_at_registration: p.mmr_at_registration,
          seed_number: p.seed_number,
        }));
    }
    if (sql.includes('p1.is_bot = true') &&
        sql.includes('p2.is_bot = true') &&
        sql.includes("tm.status = 'ready'")) {
      const excluded = new Set(params.slice(1).map(String));
      const match = this.matches
        .filter((candidate) => {
          const p1 = this.participant(candidate.player1_participant_id);
          const p2 = this.participant(candidate.player2_participant_id);
          return candidate.tournament_id === params[0] &&
            candidate.status === 'ready' &&
            !excluded.has(candidate.id) &&
            p1 && p2 &&
            p1.is_bot === true &&
            p2.is_bot === true &&
            this.tournament.status === 'in_progress';
        })
        .sort((a, b) => (
          bracketSortValue(a.bracket_type) - bracketSortValue(b.bracket_type) ||
          a.round_number - b.round_number ||
          a.match_number - b.match_number
        ))[0];
      if (!match) return [];
      const p1 = this.participant(match.player1_participant_id);
      const p2 = this.participant(match.player2_participant_id);
      return [{
        id: match.id,
        player1_participant_id: match.player1_participant_id,
        player2_participant_id: match.player2_participant_id,
        player1_seed: p1 ? p1.seed_number : null,
        player2_seed: p2 ? p2.seed_number : null,
        question_count: this.tournament.question_count,
      }];
    }
    if (sql.includes('FROM tournament_matches tm') &&
        sql.includes('JOIN tournaments t ON t.id = tm.tournament_id') &&
        sql.includes('WHERE tm.id = $1')) {
      const match = this.matches.find((m) => m.id === params[0]);
      return match ? [this.joinedMatchRow(match)] : [];
    }
    if (sql.includes('UPDATE tournament_matches SET') && sql.includes("status = 'ready'")) {
      return this.updateProgressMatch(params);
    }
    if (sql.includes('UPDATE tournament_matches SET') && sql.includes("status = 'completed'")) {
      return this.completeMatch(params);
    }
    if (sql.includes('SELECT status, total_rounds, rewards FROM tournaments')) {
      return [{
        status: this.tournament.status,
        total_rounds: this.tournament.total_rounds,
        rewards: this.tournament.rewards,
      }];
    }
    if (sql.includes('SELECT status, winner_id FROM tournaments')) {
      return [{ status: this.tournament.status, winner_id: this.tournament.winner_id }];
    }
    if (sql.includes('SELECT status FROM tournaments WHERE id = $1')) {
      return [{ status: this.tournament.status }];
    }
    if (sql.includes('SELECT status FROM tournament_matches WHERE id = $1')) {
      const match = this.matches.find((m) => m.id === params[0]);
      return match ? [{ status: match.status }] : [];
    }
    if (sql.includes('SELECT 1 FROM tournament_matches') &&
        sql.includes("status IN ('in_progress', 'ready')")) {
      const match = this.matches.find((m) => (
        m.tournament_id === params[0] &&
        (m.status === 'in_progress' || m.status === 'ready')
      ));
      return match ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes('SELECT 1 FROM tournament_matches') &&
        sql.includes("bracket_type = 'losers'") &&
        sql.includes("status IN ('ready', 'in_progress', 'pending')")) {
      const match = this.matches.find((m) => (
        m.tournament_id === params[0] &&
        m.bracket_type === 'losers' &&
        (m.status === 'ready' || m.status === 'in_progress' || m.status === 'pending') &&
        (m.player1_participant_id || m.player2_participant_id || m.winner_participant_id)
      ));
      return match ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes('SELECT id FROM tournament_matches') &&
        sql.includes("bracket_type = 'grand_final'") &&
        sql.includes('match_number >= 2')) {
      const match = this.matches.find((m) => (
        m.tournament_id === params[0] &&
        m.bracket_type === 'grand_final' &&
        m.match_number >= 2 &&
        (m.status === 'pending' || m.status === 'ready' || m.status === 'in_progress')
      ));
      return match ? [{ id: match.id }] : [];
    }
    if (sql.includes('SELECT winner_participant_id') &&
        sql.includes("bracket_type = 'grand_final'") &&
        sql.includes("status = 'completed'") &&
        sql.includes('ORDER BY match_number DESC')) {
      const match = this.matches
        .filter((m) => (
          m.tournament_id === params[0] &&
          m.bracket_type === 'grand_final' &&
          m.status === 'completed' &&
          m.winner_participant_id
        ))
        .sort((a, b) => (b.match_number - a.match_number) || (b.round_number - a.round_number))[0];
      return match ? [{ winner_participant_id: match.winner_participant_id }] : [];
    }
    if (sql.includes('SELECT user_id FROM tournament_participants WHERE id = $1')) {
      const participant = this.participant(params[0]);
      return participant ? [{ user_id: participant.user_id }] : [];
    }
    if (sql.includes('UPDATE tournaments SET') && sql.includes("status = 'completed'") && sql.includes('RETURNING id')) {
      if (this.tournament.status === 'in_progress' || this.tournament.status === 'paused') {
        this.tournament.status = 'completed';
        this.tournament.winner_id = params[0] || this.tournament.winner_id;
        return [{ id: this.tournament.id }];
      }
      return [];
    }
    if (sql.includes('SELECT COUNT(*) as pending FROM tournament_matches') ||
        (sql.includes('SELECT COUNT(*) as total') && sql.includes('SUM(CASE WHEN status NOT IN'))) {
      var total = this.matches.filter((m) => (
        m.tournament_id === params[0] &&
        m.round_number === Number(params[1]) &&
        m.bracket_type === params[2]
      )).length;
      var pending = this.matches.filter((m) => (
        m.tournament_id === params[0] &&
        m.round_number === Number(params[1]) &&
        m.bracket_type === params[2] &&
        m.status !== 'completed' &&
        m.status !== 'bye'
      )).length;
      if (sql.includes('SELECT COUNT(*) as total')) {
        return [{ total: String(total), pending: String(pending) }];
      }
      return [{ pending: String(pending) }];
    }
    if (sql.includes('SELECT tm.match_number, tm.winner_participant_id') &&
        sql.includes('FROM tournament_matches tm')) {
      return this.getRoundWinners(params[0], params[1], params[2]);
    }
    if (sql.includes('SELECT match_number, winner_participant_id') &&
        sql.includes('FROM tournament_matches')) {
      return this.getRoundWinners(params[0], params[1], params[2]);
    }
    if (sql.includes('SELECT match_number, player1_participant_id, player2_participant_id, winner_participant_id, status') &&
        sql.includes("bracket_type = 'winners'")) {
      return this.matches
        .filter((match) => (
          match.tournament_id === params[0] &&
          match.round_number === Number(params[1]) &&
          match.bracket_type === 'winners' &&
          (match.status === 'completed' || match.status === 'bye')
        ))
        .sort((a, b) => a.match_number - b.match_number)
        .map((match) => ({
          match_number: match.match_number,
          player1_participant_id: match.player1_participant_id,
          player2_participant_id: match.player2_participant_id,
          winner_participant_id: match.winner_participant_id,
          status: match.status,
        }));
    }
    if (sql.includes('SELECT id, status, player1_participant_id, player2_participant_id, winner_participant_id') &&
        sql.includes('round_number = $2') &&
        sql.includes('match_number = $3')) {
      const bracketType = sql.includes("bracket_type = 'losers'") ? 'losers' : params[3];
      const match = this.matches.find((m) => (
        m.tournament_id === params[0] &&
        m.round_number === Number(params[1]) &&
        m.match_number === Number(params[2]) &&
        m.bracket_type === bracketType
      ));
      return match ? [{
        id: match.id,
        status: match.status,
        player1_participant_id: match.player1_participant_id,
        player2_participant_id: match.player2_participant_id,
        winner_participant_id: match.winner_participant_id,
      }] : [];
    }
    if (sql.includes('SELECT winner_participant_id FROM tournament_matches') &&
        sql.includes("bracket_type = 'winners'")) {
      const rows = this.getRoundWinners(params[0], params[1], 'winners');
      return rows.length > 0 ? [{ winner_participant_id: rows[0].winner_participant_id }] : [];
    }
    if (sql.includes('SELECT winner_participant_id FROM tournament_matches') &&
        sql.includes("bracket_type = 'losers'")) {
      const rows = this.getRoundWinners(params[0], params[1], 'losers');
      return rows.length > 0 ? [{ winner_participant_id: rows[0].winner_participant_id }] : [];
    }
    if (sql.includes('WHERE tournament_id = $1 AND bracket_type = ') &&
        sql.includes("'grand_final'") &&
        sql.includes('match_number = 2')) {
      const match = this.matches.find((m) => (
        m.tournament_id === params[0] &&
        m.bracket_type === 'grand_final' &&
        m.match_number === 2
      ));
      return match ? [{
        id: match.id,
        status: match.status,
        player1_participant_id: match.player1_participant_id,
        player2_participant_id: match.player2_participant_id,
      }] : [];
    }
    if (sql.includes('WHERE tournament_id = $1 AND bracket_type = ') &&
        sql.includes("'grand_final'") &&
        sql.includes('ORDER BY round_number ASC')) {
      const rows = this.matches
        .filter((m) => m.tournament_id === params[0] && m.bracket_type === 'grand_final')
        .sort((a, b) => (a.round_number - b.round_number) || (a.match_number - b.match_number));
      const match = rows[0];
      return match ? [{
        id: match.id,
        status: match.status,
        player1_participant_id: match.player1_participant_id,
        player2_participant_id: match.player2_participant_id,
      }] : [];
    }
    if (sql.includes('SELECT tm.id as match_id, t.name as tournament_name')) {
      const match = this.matches
        .filter((m) => (
          m.tournament_id === params[0] &&
          ((m.player1_participant_id === params[1] && m.player2_participant_id === params[2]) ||
           (m.player1_participant_id === params[2] && m.player2_participant_id === params[1]))
        ))
        .sort((a, b) => (b.round_number - a.round_number) || (b.match_number - a.match_number))[0];
      if (!match) return [];
      const p1 = this.participant(match.player1_participant_id);
      const p2 = this.participant(match.player2_participant_id);
      return [{
        match_id: match.id,
        tournament_name: this.tournament.name,
        player1_participant_id: p1 ? p1.id : null,
        player2_participant_id: p2 ? p2.id : null,
        player1_user_id: p1 ? p1.user_id : null,
        player2_user_id: p2 ? p2.user_id : null,
        player1_is_bot: false,
        player2_is_bot: false,
        player1_name: p1 ? p1.user_id : 'Player',
        player2_name: p2 ? p2.user_id : 'Player',
      }];
    }
    if (sql.includes('SELECT id, user_id, status, elimination_round, total_score')) {
      return this.participants
        .slice()
        .sort((a, b) => {
          const aw = a.status === 'winner' ? 0 : 1;
          const bw = b.status === 'winner' ? 0 : 1;
          if (aw !== bw) return aw - bw;
          const ar = a.elimination_round === null ? -Infinity : a.elimination_round;
          const br = b.elimination_round === null ? -Infinity : b.elimination_round;
          if (ar !== br) return br - ar;
          return b.total_score - a.total_score;
        })
        .map((p) => ({
          id: p.id,
          user_id: p.user_id,
          status: p.status,
          elimination_round: p.elimination_round,
          total_score: p.total_score,
        }));
    }
    if (sql.includes('SELECT id, user_id, final_placement, is_bot, bot_influenced')) {
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
    if (sql.includes('SELECT tp.user_id, tp.final_placement, tp.is_bot, t.name as tournament_name')) {
      return this.participants
        .filter((p) => p.user_id)
        .map((p) => ({
          user_id: p.user_id,
          final_placement: p.final_placement,
          is_bot: p.is_bot,
          tournament_name: this.tournament.name,
        }));
    }
    if (sql.includes('INSERT INTO notifications')) {
      this.notifications.push({
        userId: params[0],
        type: params[1],
        payload: JSON.parse(params[4] || '{}'),
      });
      return [{ id: `n${this.notifications.length}` }];
    }
    if (sql.includes('SELECT id FROM badges WHERE badge_key = $1')) {
      return [];
    }
    if (sql.includes('INSERT INTO tournament_reward_claims')) {
      return [{ id: 'claim' }];
    }
    return [];
  }

  sqlExec(sql, params = []) {
    if (maybeReleaseRuntimeLock(this, sql, params)) return;
    if (sql.includes('UPDATE tournament_participants SET seed_number = $1')) {
      const participant = this.participant(params[1]);
      if (participant) {
        participant.seed_number = Number(params[0]);
        participant.status = 'active';
      }
      return;
    }
    if (sql.includes("VALUES ($1, 1, $2, 'winners'")) {
      this.addMatch({
        round_number: 1,
        match_number: params[1],
        bracket_type: 'winners',
        player1_participant_id: params[2],
        player2_participant_id: params[3],
        status: params[4],
        winner_participant_id: params[5],
        completed_at: params[6],
        best_of: params[7],
      });
      return;
    }
    if (sql.includes("VALUES ($1, $2, $3, 'winners', 'pending', $4)")) {
      this.addMatch({
        round_number: params[1],
        match_number: params[2],
        bracket_type: 'winners',
        status: 'pending',
        best_of: params[3],
      });
      return;
    }
    if (sql.includes("VALUES ($1, $2, $3, 'losers', 'pending', $4)")) {
      this.addMatch({
        round_number: params[1],
        match_number: params[2],
        bracket_type: 'losers',
        status: 'pending',
        best_of: params[3],
      });
      return;
    }
    if (sql.includes("VALUES ($1, $2, 1, 'grand_final', 'pending', $3)")) {
      this.addMatch({
        round_number: params[1],
        match_number: 1,
        bracket_type: 'grand_final',
        status: 'pending',
        best_of: params[2],
      });
      return;
    }
    if (sql.includes('UPDATE tournaments') && sql.includes('current_round')) {
      this.tournament.current_round = Math.max(this.tournament.current_round, Number(params[0]));
      return;
    }
    if (sql.includes('UPDATE tournament_matches SET') &&
        sql.includes('WHERE tournament_id = $5 AND round_number = $6')) {
      const match = this.matches.find((m) => (
        m.tournament_id === params[4] &&
        m.round_number === Number(params[5]) &&
        m.match_number === Number(params[6]) &&
        m.bracket_type === params[7]
      ));
      if (match) {
        match.player1_participant_id = params[0] || null;
        match.player2_participant_id = params[1] || null;
        match.status = params[2];
        match.winner_participant_id = params[3] || null;
        match.completed_at = params[2] === 'bye' ? new Date().toISOString() : null;
        match.ready_player1 = false;
        match.ready_player2 = false;
        match.ready_at = params[2] === 'ready' ? new Date().toISOString() : null;
        match.nakama_match_id = null;
        match.started_at = null;
        match.spectator_count = 0;
      }
      return;
    }
    if (sql.includes('UPDATE tournament_matches SET') &&
        sql.includes("WHERE id = $5")) {
      const match = this.matches.find((m) => m.id === params[4]);
      if (match) {
        match.player1_participant_id = params[0] || null;
        match.player2_participant_id = params[1] || null;
        match.status = params[2];
        match.winner_participant_id = params[3] || null;
        match.completed_at = params[2] === 'bye' ? new Date().toISOString() : null;
        match.ready_at = params[2] === 'ready' ? new Date().toISOString() : null;
      }
      return;
    }
    if (sql.includes('UPDATE tournament_matches SET') &&
        sql.includes("WHERE id = $3")) {
      const match = this.matches.find((m) => m.id === params[2]);
      if (match) {
        match.player1_participant_id = params[0] || null;
        match.player2_participant_id = params[1] || null;
        match.status = 'ready';
        match.ready_player1 = false;
        match.ready_player2 = false;
        match.ready_at = new Date().toISOString();
        match.nakama_match_id = null;
        match.started_at = null;
        match.spectator_count = 0;
      }
      return;
    }
    if (sql.includes("VALUES ($1, $2, 2, 'grand_final'")) {
      this.addMatch({
        round_number: params[1],
        match_number: 2,
        bracket_type: 'grand_final',
        player1_participant_id: params[2],
        player2_participant_id: params[3],
        status: 'ready',
        best_of: params[4],
      });
      return;
    }
    if (sql.includes('UPDATE tournament_participants SET total_score = total_score + $1')) {
      const participant = this.participant(params[1]);
      if (participant) participant.total_score += Number(params[0]);
      return;
    }
    if (sql.includes('matches_won = matches_won + 1')) {
      const participant = this.participant(params[0]);
      if (participant) {
        participant.matches_won += 1;
        participant.matches_played += 1;
      }
      return;
    }
    if (sql.includes('losses_count = losses_count + 1') && sql.includes('bracket_position = $1')) {
      const participant = this.participant(params[1]);
      if (participant) {
        participant.matches_played += 1;
        participant.losses_count += 1;
        participant.bracket_position = params[0];
      }
      return;
    }
    if (sql.includes('losses_count = losses_count + 1') && sql.includes("status = 'eliminated'")) {
      const participant = this.participant(params[1]);
      if (participant) {
        participant.matches_played += 1;
        participant.losses_count += 1;
        participant.status = 'eliminated';
        participant.elimination_round = Number(params[0]);
      }
      return;
    }
    if (sql.includes("status = 'eliminated'") &&
        sql.includes('matches_played = matches_played + 1') &&
        !sql.includes('losses_count = losses_count + 1')) {
      const participant = this.participant(params[1]);
      if (participant) {
        participant.matches_played += 1;
        participant.status = 'eliminated';
        participant.elimination_round = Number(params[0]);
      }
      return;
    }
    if (sql.includes("UPDATE tournament_participants SET") && sql.includes("status = 'winner'")) {
      const participant = this.participant(params[0]);
      if (participant) {
        participant.status = 'winner';
        participant.final_placement = 1;
      }
      return;
    }
    if (sql.includes('UPDATE tournaments') && sql.includes('winner_id = COALESCE(winner_id, $1)')) {
      if (!this.tournament.winner_id && params[0]) {
        this.tournament.winner_id = params[0];
      }
      return;
    }
    if (sql.includes('UPDATE tournament_participants SET final_placement = $1 WHERE id = $2')) {
      const participant = this.participant(params[1]);
      if (participant) participant.final_placement = Number(params[0]);
    }
  }

  storageRead() {
    return [];
  }

  storageWrite() {}

  leaderboardRecordWrite() {}

  notificationSend() {}
}

function chooseWinnerParticipantId(nk, match) {
  if (match.bracket_type === 'grand_final' && match.match_number === 1) {
    return match.player2_participant_id;
  }
  if (match.bracket_type === 'grand_final' && match.match_number === 2) {
    return match.player1_participant_id;
  }
  const p1 = nk.participant(match.player1_participant_id);
  const p2 = nk.participant(match.player2_participant_id);
  if (!p1 || !p2) return match.player1_participant_id || match.player2_participant_id;
  return Number(p1.seed_number) <= Number(p2.seed_number) ? p1.id : p2.id;
}

function reportOneGame(nk, logger, match, winnerParticipantId) {
  const winner = nk.participant(winnerParticipantId);
  const winnerIsP1 = winnerParticipantId === match.player1_participant_id;
  autoReportTournamentResult(
    nk,
    logger,
    match.id,
    winner ? winner.user_id : null,
    winnerIsP1 ? 10 : 8,
    winnerIsP1 ? 8 : 10,
    true,
    false,
    true
  );
}

function playBestOfMatch(nk, logger, match, expectedBestOf) {
  const bestOf = Number(expectedBestOf || match.best_of || 1);
  const requiredWins = Math.ceil(bestOf / 2);
  const winnerParticipantId = chooseWinnerParticipantId(nk, match);
  const completedBefore = nk.matches.filter((m) => m.status === 'completed').length;

  for (let game = 1; game <= requiredWins; game += 1) {
    reportOneGame(nk, logger, match, winnerParticipantId);
    if (game < requiredWins) {
      assert.equal(match.status, 'ready', `match ${match.id} should not advance after game ${game} of BO${bestOf}`);
      assert.equal(match.series_game_count, game);
      assert.equal(nk.matches.filter((m) => m.status === 'completed').length, completedBefore);
    }
  }

  assert.equal(match.status, 'completed');
  assert.equal(match.winner_participant_id, winnerParticipantId);
  assert.equal(match.series_game_count, requiredWins);
}

function playAllReadyHumanMatches(nk, logger, expectedBestOf) {
  const readyMatches = nk.matches
    .filter((match) => (
      match.status === 'ready' &&
      match.player1_participant_id &&
      match.player2_participant_id
    ))
    .sort((a, b) => (
      bracketSortValue(a.bracket_type) - bracketSortValue(b.bracket_type) ||
      a.round_number - b.round_number ||
      a.match_number - b.match_number
    ));

  assert.ok(readyMatches.length > 0, 'expected at least one ready match before tournament completion');

  let played = 0;
  for (const ready of readyMatches) {
    if (nk.tournament.status === 'completed') break;
    const match = nk.matches.find((m) => m.id === ready.id);
    if (!match || match.status !== 'ready') continue;
    playBestOfMatch(nk, logger, match, expectedBestOf);
    played += 1;
  }
  return played;
}

function buildBestOfEverywhere(size, bestOf) {
  const totalRounds = Math.ceil(Math.log2(size));
  return {
    opening: bestOf,
    winners: Array.from({ length: totalRounds }, () => bestOf),
    losers: Array.from({ length: Math.max(0, (totalRounds - 1) * 2) }, () => bestOf),
    grand_final: bestOf,
    default: bestOf,
  };
}

test('32-player BO3 double-elimination bracket advances through losers bracket, grand-final reset, and completion', () => {
  const nk = new FullDoubleEliminationMockNakama();
  const logger = createLogger();
  const bo3Everywhere = {
    opening: 3,
    winners: [3, 3, 3, 3, 3],
    losers: [3, 3, 3, 3, 3, 3, 3, 3],
    grand_final: 3,
    default: 3,
  };
  nk.bestOfByRound = bo3Everywhere;

  generateTournamentBracket(nk, logger, nk.tournament.id, 32, 'double_elimination', 'mmr', bo3Everywhere);

  assert.equal(nk.matches.filter((m) => m.bracket_type === 'winners').length, 31);
  assert.equal(nk.matches.filter((m) => m.bracket_type === 'losers').length, 30);
  assert.equal(nk.matches.filter((m) => m.bracket_type === 'grand_final').length, 1);
  assert.equal(nk.matches.every((m) => m.best_of === 3), true);

  let safety = 0;
  while (nk.tournament.status !== 'completed' && safety < 80) {
    playAllReadyHumanMatches(nk, logger, 3);
    safety += 1;
  }

  assert.equal(nk.tournament.status, 'completed');
  assert.ok(safety < 80);

  const grandFinals = nk.matches
    .filter((m) => m.bracket_type === 'grand_final')
    .sort((a, b) => a.match_number - b.match_number);
  assert.equal(grandFinals.length, 2);
  assert.equal(grandFinals[0].status, 'completed');
  assert.equal(grandFinals[1].status, 'completed');
  assert.equal(grandFinals[0].winner_participant_id, grandFinals[0].player2_participant_id);
  assert.equal(grandFinals[1].winner_participant_id, grandFinals[1].player1_participant_id);

  const completed = nk.matches.filter((m) => m.status === 'completed');
  assert.equal(completed.length, 63);
  assert.equal(completed.every((m) => m.best_of === 3 && m.series_game_count === 2), true);
  assert.equal(nk.matches.some((m) => m.status === 'ready' || m.status === 'pending'), false);

  const champion = nk.participant(grandFinals[1].winner_participant_id);
  assert.ok(champion);
  assert.equal(champion.status, 'winner');
  assert.equal(nk.tournament.winner_id, champion.user_id);
  assert.equal(nk.participants.filter((p) => p.status === 'eliminated').length, 31);
  assert.equal(nk.participants.every((p) => p.final_placement !== null), true);
});

test('128-player BO5 double-elimination bracket completes with grand-final reset', () => {
  const size = 128;
  const bestOf = 5;
  const nk = new FullDoubleEliminationMockNakama({
    size,
    bestOf,
    id: 't128_bo5',
    name: 'BO5 128 Double Elimination',
  });
  const logger = createLogger();
  const bo5Everywhere = buildBestOfEverywhere(size, bestOf);
  nk.bestOfByRound = bo5Everywhere;

  generateTournamentBracket(nk, logger, nk.tournament.id, size, 'double_elimination', 'mmr', bo5Everywhere);

  assert.equal(nk.matches.filter((m) => m.bracket_type === 'winners').length, 127);
  assert.equal(nk.matches.filter((m) => m.bracket_type === 'losers').length, 126);
  assert.equal(nk.matches.filter((m) => m.bracket_type === 'grand_final').length, 1);
  assert.equal(nk.matches.every((m) => m.best_of === bestOf), true);

  let safety = 0;
  while (nk.tournament.status !== 'completed' && safety < 300) {
    playAllReadyHumanMatches(nk, logger, bestOf);
    safety += 1;
  }

  assert.equal(nk.tournament.status, 'completed');
  assert.ok(safety < 300);

  const grandFinals = nk.matches
    .filter((m) => m.bracket_type === 'grand_final')
    .sort((a, b) => a.match_number - b.match_number);
  assert.equal(grandFinals.length, 2);
  assert.equal(grandFinals[0].winner_participant_id, grandFinals[0].player2_participant_id);
  assert.equal(grandFinals[1].winner_participant_id, grandFinals[1].player1_participant_id);

  const completed = nk.matches.filter((m) => m.status === 'completed');
  assert.equal(completed.length, 255);
  assert.equal(completed.every((m) => m.best_of === bestOf && m.series_game_count === 3), true);
  assert.equal(nk.matches.some((m) => m.status === 'ready' || m.status === 'pending'), false);
  assert.equal(nk.participants.filter((p) => p.status === 'eliminated').length, 127);
  assert.equal(nk.participants.every((p) => p.final_placement !== null), true);
});

test('mixed human and bot BO5 bracket auto-advances bot lanes and waits for human matches', () => {
  const size = 32;
  const bestOf = 5;
  const botIds = [];
  for (let i = 9; i <= size; i += 1) {
    botIds.push(`p${String(i).padStart(2, '0')}`);
  }
  const nk = new FullDoubleEliminationMockNakama({
    size,
    bestOf,
    id: 't32_mixed_bo5',
    name: 'BO5 Mixed Double Elimination',
    botIds,
  });
  const logger = createLogger();
  const bo5Everywhere = buildBestOfEverywhere(size, bestOf);
  nk.bestOfByRound = bo5Everywhere;

  generateTournamentBracket(nk, logger, nk.tournament.id, size, 'double_elimination', 'mmr', bo5Everywhere);

  const resolvedBeforeHumans = runTournamentMaintenanceCycle(nk, logger, nk.tournament.id, 32);
  assert.ok(resolvedBeforeHumans > 0, 'expected bot-only matches to resolve automatically');
  assert.equal(nk.tournament.status, 'in_progress');
  assert.equal(
    nk.matches.some((match) => {
      const p1 = nk.participant(match.player1_participant_id);
      const p2 = nk.participant(match.player2_participant_id);
      return match.status === 'ready' && p1 && p2 && p1.is_bot && p2.is_bot;
    }),
    false,
    'bot-only ready matches should not block the bracket'
  );
  assert.equal(
    nk.matches.some((match) => {
      const p1 = nk.participant(match.player1_participant_id);
      const p2 = nk.participant(match.player2_participant_id);
      return match.status === 'ready' && p1 && p2 && (!p1.is_bot || !p2.is_bot);
    }),
    true,
    'human-involved ready matches should remain for real players'
  );

  let safety = 0;
  while (nk.tournament.status !== 'completed' && safety < 160) {
    runTournamentMaintenanceCycle(nk, logger, nk.tournament.id, 32);
    if (nk.tournament.status === 'completed') break;
    playAllReadyHumanMatches(nk, logger, bestOf);
    safety += 1;
  }

  assert.equal(nk.tournament.status, 'completed');
  assert.ok(safety < 160);
  assert.equal(nk.participants.filter((p) => p.status === 'winner').length, 1);
  assert.equal(nk.participants.filter((p) => p.status === 'eliminated').length, 31);
  assert.equal(nk.participants.every((p) => p.final_placement !== null), true);
});

test('bots-disabled underfilled single-elimination bracket advances humans through byes', () => {
  const size = 32;
  const nk = new FullDoubleEliminationMockNakama({
    size,
    participantCount: 2,
    bestOf: 1,
    format: 'single_elimination',
    id: 't32_human_only_single',
    name: 'Human Only Single Elimination',
  });
  const logger = createLogger();
  const bo1Everywhere = buildBestOfEverywhere(size, 1);
  nk.bestOfByRound = bo1Everywhere;

  generateTournamentBracket(nk, logger, nk.tournament.id, size, 'single_elimination', 'mmr', bo1Everywhere);
  runTournamentMaintenanceCycle(nk, logger, nk.tournament.id, 32);

  const readyMatches = nk.matches.filter((m) => m.status === 'ready');
  assert.equal(readyMatches.length, 1);
  assert.ok(readyMatches[0].player1_participant_id);
  assert.ok(readyMatches[0].player2_participant_id);
  assert.equal(
    new Set([readyMatches[0].player1_participant_id, readyMatches[0].player2_participant_id]).size,
    2
  );

  let safety = 0;
  while (nk.tournament.status !== 'completed' && safety < 40) {
    playAllReadyHumanMatches(nk, logger, 1);
    runTournamentMaintenanceCycle(nk, logger, nk.tournament.id, 32);
    safety += 1;
  }

  assert.equal(nk.tournament.status, 'completed');
  assert.ok(safety < 40);
  assert.equal(nk.matches.filter((m) => m.status === 'completed').length, 1);
  assert.equal(nk.participants.filter((p) => p.status === 'winner').length, 1);
  assert.equal(nk.participants.filter((p) => p.status === 'eliminated').length, 1);
  assert.equal(nk.participants.every((p) => p.final_placement !== null), true);
});

test('bots-disabled underfilled double-elimination bracket advances humans through byes', () => {
  const size = 32;
  const nk = new FullDoubleEliminationMockNakama({
    size,
    participantCount: 2,
    bestOf: 1,
    format: 'double_elimination',
    id: 't32_human_only_double',
    name: 'Human Only Double Elimination',
  });
  const logger = createLogger();
  const bo1Everywhere = buildBestOfEverywhere(size, 1);
  nk.bestOfByRound = bo1Everywhere;

  generateTournamentBracket(nk, logger, nk.tournament.id, size, 'double_elimination', 'mmr', bo1Everywhere);
  runTournamentMaintenanceCycle(nk, logger, nk.tournament.id, 32);

  let safety = 0;
  while (nk.tournament.status !== 'completed' && safety < 80) {
    const readyMatches = nk.matches.filter((m) => m.status === 'ready');
    assert.ok(readyMatches.length > 0, 'expected human-only double-elim bracket to expose a ready match');
    playAllReadyHumanMatches(nk, logger, 1);
    runTournamentMaintenanceCycle(nk, logger, nk.tournament.id, 32);
    safety += 1;
  }

  assert.equal(nk.tournament.status, 'completed');
  assert.ok(safety < 80);
  assert.equal(nk.matches.filter((m) => m.status === 'completed').length, 3);
  assert.equal(nk.participants.filter((p) => p.status === 'winner').length, 1);
  assert.equal(nk.participants.filter((p) => p.status === 'eliminated').length, 1);
  assert.equal(nk.participants.every((p) => p.final_placement !== null), true);
});
