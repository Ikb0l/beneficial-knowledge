const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_TOURNAMENT_BOT_POLICY,
  fillTournamentWithBots,
  getTournamentBotDisplayName,
  normalizeTournamentBotPolicy,
  reconcileTournamentMatchBots,
  replaceParticipantInPendingOrReadyMatchWithBot,
} = require('../../build/main/tournament-bots.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function createPolicy(overrides = {}) {
  return {
    ...DEFAULT_TOURNAMENT_BOT_POLICY,
    ...overrides,
    difficulty: {
      ...DEFAULT_TOURNAMENT_BOT_POLICY.difficulty,
      ...(overrides.difficulty || {}),
    },
  };
}

class TournamentBotsMockNakama {
  constructor() {
    this.tournamentId = 't1';
    this.bracketSize = 4;
    this.botPolicy = {};
    this.botProfiles = [
      { id: 'bp1', bot_key: 'atlas', display_name: 'Atlas Bot', is_active: true },
      { id: 'bp2', bot_key: 'nova', display_name: 'Nova Bot', is_active: true },
    ];
    this.participants = [
      {
        id: 'p1',
        tournament_id: this.tournamentId,
        user_id: 'u1',
        seed_number: 1,
        status: 'registered',
        is_bot: false,
        bot_profile_id: null,
        bot_influenced: false,
      },
      {
        id: 'p2',
        tournament_id: this.tournamentId,
        user_id: 'u2',
        seed_number: 2,
        status: 'registered',
        is_bot: false,
        bot_profile_id: null,
        bot_influenced: false,
      },
    ];
    this.matches = [
      {
        id: 'm1',
        tournament_id: this.tournamentId,
        status: 'ready',
        player1_participant_id: 'p1',
        player2_participant_id: 'p2',
      },
    ];
    this.insertCounter = 0;
  }

  findParticipant(id) {
    return this.participants.find((p) => p.id === id) || null;
  }

  buildReconcileRow(matchId) {
    const match = this.matches.find((m) => m.id === matchId);
    if (!match) return null;
    const p1 = this.findParticipant(match.player1_participant_id);
    const p2 = this.findParticipant(match.player2_participant_id);
    return {
      id: match.id,
      tournament_id: match.tournament_id,
      status: match.status,
      player1_participant_id: match.player1_participant_id,
      player2_participant_id: match.player2_participant_id,
      player1_user_id: p1 ? p1.user_id : null,
      player2_user_id: p2 ? p2.user_id : null,
      player1_status: p1 ? p1.status : null,
      player2_status: p2 ? p2.status : null,
      player1_is_bot: p1 ? p1.is_bot : false,
      player2_is_bot: p2 ? p2.is_bot : false,
      player1_seed: p1 ? p1.seed_number : null,
      player2_seed: p2 ? p2.seed_number : null,
      bot_policy: this.botPolicy,
      bracket_size: this.bracketSize,
    };
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('SELECT COUNT(*) as total_count') && sql.includes('FROM tournament_participants')) {
      const tournamentId = params[0];
      const onlyRegistered = sql.includes("status = 'registered'");
      const count = this.participants.filter((p) => {
        if (p.tournament_id !== tournamentId) return false;
        if (!onlyRegistered) return true;
        return p.status === 'registered';
      }).length;
      return [{ total_count: String(count) }];
    }

    if (sql.includes('SELECT seed_number') && sql.includes('FROM tournament_participants')) {
      const tournamentId = params[0];
      return this.participants
        .filter((p) => p.tournament_id === tournamentId)
        .map((p) => ({ seed_number: p.seed_number }));
    }

    if (sql.includes('SELECT id, bot_key, display_name') && sql.includes('FROM tournament_bot_profiles')) {
      return this.botProfiles
        .filter((bp) => bp.is_active)
        .map((bp) => ({ id: bp.id, bot_key: bp.bot_key, display_name: bp.display_name }));
    }

    if (sql.includes('INSERT INTO tournament_participants') && sql.includes('is_bot, bot_profile_id, bot_influenced')) {
      const id = `botp${++this.insertCounter}`;
      const row = {
        id,
        tournament_id: params[0],
        user_id: null,
        seed_number: params[1],
        mmr_at_registration: params[2],
        status: params[3],
        is_bot: true,
        bot_profile_id: params[4],
        bot_influenced: false,
      };
      this.participants.push(row);
      return [{ id }];
    }

    if (sql.includes('FROM tournament_matches tm') && sql.includes('t.bot_policy, t.bracket_size')) {
      const row = this.buildReconcileRow(params[0]);
      return row ? [row] : [];
    }

    if (sql.includes('FROM tournament_matches') && sql.includes("AND status IN ('pending', 'ready', 'in_progress')")) {
      const tournamentId = params[0];
      const participantId = params[1];
      const match = this.matches.find(
        (m) =>
          m.tournament_id === tournamentId &&
          ['pending', 'ready', 'in_progress'].includes(m.status) &&
          (m.player1_participant_id === participantId || m.player2_participant_id === participantId)
      );
      return match ? [{ id: match.id, status: match.status }] : [];
    }

    if (sql.includes('SELECT player1_participant_id, player2_participant_id, p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot')) {
      const match = this.matches.find((m) => m.id === params[0]);
      if (!match) return [];
      const p1 = this.findParticipant(match.player1_participant_id);
      const p2 = this.findParticipant(match.player2_participant_id);
      return [{
        player1_participant_id: match.player1_participant_id,
        player2_participant_id: match.player2_participant_id,
        player1_is_bot: p1 ? p1.is_bot : false,
        player2_is_bot: p2 ? p2.is_bot : false,
      }];
    }

    return [];
  }

  sqlExec(sql, params = []) {
    if (sql.includes('INSERT INTO tournament_bot_profiles')) {
      return { rowsAffected: 1 };
    }

    if (sql.includes('UPDATE tournament_matches') && sql.includes('SET player1_participant_id = $1')) {
      const match = this.matches.find((m) => m.id === params[3]);
      if (!match) return { rowsAffected: 0 };
      if (!['pending', 'ready'].includes(match.status)) return { rowsAffected: 0 };
      match.player1_participant_id = params[0];
      match.player2_participant_id = params[1];
      match.status = params[2];
      return { rowsAffected: 1 };
    }

    if (sql.includes('UPDATE tournament_participants') && sql.includes('SET seed_number = NULL')) {
      const participant = this.findParticipant(params[0]);
      if (participant) participant.seed_number = null;
      return { rowsAffected: participant ? 1 : 0 };
    }

    return { rowsAffected: 0 };
  }
}

test('normalizeTournamentBotPolicy clamps invalid values and keeps coherent ranges', () => {
  const normalized = normalizeTournamentBotPolicy({
    botMmr: -100,
    rewardCoinMultiplier: 2,
    difficulty: {
      minAccuracy: 0.99,
      maxAccuracy: 0.4,
      baseAccuracy: 2,
      minDelayMs: 5000,
      maxDelayMs: 200,
    },
  });

  assert.equal(normalized.botMmr, 0);
  assert.equal(normalized.rewardCoinMultiplier, 1);
  assert.ok(normalized.difficulty.minAccuracy <= normalized.difficulty.maxAccuracy);
  assert.ok(normalized.difficulty.baseAccuracy >= normalized.difficulty.minAccuracy);
  assert.ok(normalized.difficulty.baseAccuracy <= normalized.difficulty.maxAccuracy);
  assert.ok(normalized.difficulty.maxDelayMs >= normalized.difficulty.minDelayMs);
});

test('getTournamentBotDisplayName is deterministic and human-like', () => {
  const first = getTournamentBotDisplayName('atlas', 'participant-42', 'Atlas Bot');
  const second = getTournamentBotDisplayName('atlas', 'participant-42', 'Atlas Bot');

  assert.equal(first, second);
  assert.match(first, /^[A-Za-z]+(?: [A-Z]\.)? [A-Za-z]+$/);
  assert.equal(/bot/i.test(first), false);
});

test('getTournamentBotDisplayName supports large brackets with low collision names', () => {
  const names = new Set();

  for (let i = 1; i <= 128; i++) {
    const name = getTournamentBotDisplayName('atlas', `participant-${i}`, 'Atlas Bot');
    names.add(name);
  }

  assert.ok(names.size >= 120, `Expected at least 120 unique aliases, got ${names.size}`);
});

test('fillTournamentWithBots fills missing slots using bottom seeds', () => {
  const nk = new TournamentBotsMockNakama();
  const logger = createLogger();
  const policy = createPolicy({ enabled: true, fillOnStart: true, botMmr: 2000 });

  const inserted = fillTournamentWithBots(nk, logger, 't1', 4, policy);

  assert.equal(inserted, 2);
  const botParticipants = nk.participants.filter((p) => p.is_bot);
  assert.equal(botParticipants.length, 2);
  assert.deepEqual(
    botParticipants.map((p) => p.seed_number).sort((a, b) => a - b),
    [3, 4]
  );
  assert.ok(botParticipants.every((p) => p.user_id === null));
});

test('fillTournamentWithBots respects disabled policy', () => {
  const nk = new TournamentBotsMockNakama();
  const logger = createLogger();
  const policy = createPolicy({ enabled: false, fillOnStart: true });

  const inserted = fillTournamentWithBots(nk, logger, 't1', 4, policy);

  assert.equal(inserted, 0);
  assert.equal(nk.participants.filter((p) => p.is_bot).length, 0);
});

test('fillTournamentWithBots ignores non-registered stale participants when calculating missing slots', () => {
  const nk = new TournamentBotsMockNakama();
  const logger = createLogger();
  nk.participants.push({
    id: 'stale1',
    tournament_id: nk.tournamentId,
    user_id: null,
    seed_number: 4,
    mmr_at_registration: 1800,
    status: 'active',
    is_bot: true,
    bot_profile_id: 'bp1',
    bot_influenced: false,
  });
  const policy = createPolicy({ enabled: true, fillOnStart: true });

  const inserted = fillTournamentWithBots(nk, logger, 't1', 4, policy);

  assert.equal(inserted, 2);
  const registeredBots = nk.participants.filter((p) => p.is_bot && p.status === 'registered');
  assert.equal(registeredBots.length, 2);
});

test('reconcileTournamentMatchBots replaces missing participant with bot and keeps match ready', () => {
  const nk = new TournamentBotsMockNakama();
  const logger = createLogger();
  nk.findParticipant('p2').user_id = null;
  nk.findParticipant('p2').status = 'forfeited';

  const result = reconcileTournamentMatchBots(
    nk,
    logger,
    'm1',
    createPolicy({ enabled: true, replaceMissingBeforeMatch: true })
  );

  assert.equal(result.replacedCount, 1);
  assert.equal(result.matchStatus, 'ready');
  assert.equal(result.player2IsBot, true);
  const updatedMatch = nk.matches.find((m) => m.id === 'm1');
  assert.ok(updatedMatch.player2_participant_id.startsWith('botp'));
  assert.equal(nk.findParticipant('p2').seed_number, null);
});

test('reconcileTournamentMatchBots skips replacement when bracket is already full', () => {
  const nk = new TournamentBotsMockNakama();
  const logger = createLogger();
  nk.bracketSize = 2;
  nk.findParticipant('p2').user_id = null;
  nk.findParticipant('p2').status = 'forfeited';

  const result = reconcileTournamentMatchBots(
    nk,
    logger,
    'm1',
    createPolicy({ enabled: true, replaceMissingBeforeMatch: true })
  );

  assert.equal(result.replacedCount, 0);
  assert.equal(nk.participants.filter((p) => p.is_bot).length, 0);
  assert.equal(nk.matches[0].player2_participant_id, 'p2');
});

test('replaceParticipantInPendingOrReadyMatchWithBot returns in-progress guard without replacement', () => {
  const nk = new TournamentBotsMockNakama();
  const logger = createLogger();
  nk.matches[0].status = 'in_progress';

  const result = replaceParticipantInPendingOrReadyMatchWithBot(
    nk,
    logger,
    't1',
    'p2',
    createPolicy({ enabled: true, replaceMissingBeforeMatch: true })
  );

  assert.equal(result.replaced, false);
  assert.equal(result.wasInProgress, true);
  assert.equal(result.matchId, 'm1');
});

test('replaceParticipantInPendingOrReadyMatchWithBot replaces participant and returns bot slot id', () => {
  const nk = new TournamentBotsMockNakama();
  const logger = createLogger();
  nk.findParticipant('p2').user_id = null;
  nk.findParticipant('p2').status = 'forfeited';

  const result = replaceParticipantInPendingOrReadyMatchWithBot(
    nk,
    logger,
    't1',
    'p2',
    createPolicy({ enabled: true, replaceMissingBeforeMatch: true })
  );

  assert.equal(result.replaced, true);
  assert.equal(result.wasInProgress, false);
  assert.equal(result.matchId, 'm1');
  assert.ok(result.botParticipantId && result.botParticipantId.startsWith('botp'));
});
