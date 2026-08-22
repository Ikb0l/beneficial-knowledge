const test = require('node:test');
const assert = require('node:assert/strict');

const { distributeTournamentRewards } = require('../../build/main/tournament-advance.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class RewardBotPolicyMockNakama {
  constructor() {
    this.claimCounter = 0;
    this.coinTransactions = [];
    this.storageReadCalls = [];
    this.storageWrites = [];
    this.leaderboardWrites = [];
    this.participants = [
      { id: 'bot1', user_id: null, final_placement: 1, is_bot: true, bot_influenced: false },
      { id: 'p2', user_id: 'u2', final_placement: 2, is_bot: false, bot_influenced: true },
      { id: 'p3', user_id: 'u3', final_placement: 3, is_bot: false, bot_influenced: false },
    ];
    this.tournamentPolicy = {
      enabled: true,
      fillOnStart: true,
      replaceMissingBeforeMatch: true,
      botMmr: 1850,
      rewardCoinMultiplier: 0.5,
      skipMmrBonusWhenBotInfluenced: true,
    };
    this.globalPolicy = this.tournamentPolicy;
  }

  sqlQuery(sql, params = []) {
    if (sql.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      if (params[0] === 'bot_tournament_default_policy') {
        return [{ config_value: this.globalPolicy }];
      }
      if (params[0] === 'bot_tournament_difficulty_profile') {
        return [{ config_value: {} }];
      }
      return [];
    }

    if (sql.includes('SELECT bot_policy FROM tournaments WHERE id = $1')) {
      return [{ bot_policy: this.tournamentPolicy }];
    }

    if (sql.includes('SELECT id, user_id, final_placement, is_bot, bot_influenced') &&
        sql.includes('FROM tournament_participants')) {
      return this.participants.map((p) => ({ ...p }));
    }

    if (sql.includes('INSERT INTO tournament_reward_claims')) {
      this.claimCounter += 1;
      return [{ id: `claim_${this.claimCounter}` }];
    }

    if (sql.includes('SELECT id FROM badges WHERE badge_key = $1')) {
      return [];
    }

    return [];
  }

  sqlExec(sql, params = []) {
    if (sql.includes('INSERT INTO coin_transactions')) {
      this.coinTransactions.push({
        userId: params[0],
        amount: Number(params[1]),
      });
      return { rowsAffected: 1 };
    }
    return { rowsAffected: 1 };
  }

  storageRead(reads) {
    const userId = reads && reads[0] ? reads[0].userId : null;
    if (userId) this.storageReadCalls.push(userId);
    return [{
      key: 'global_mmr',
      user_id: userId,
      collection: 'player_data',
      value: {
        mmr: 1200,
        rd: 350,
        volatility: 0.06,
      },
    }];
  }

  storageWrite(writes) {
    this.storageWrites.push(writes);
    return [];
  }

  leaderboardRecordWrite(leaderboardId, userId, username, score) {
    this.leaderboardWrites.push({ leaderboardId, userId, username, score });
  }
}

test('distributeTournamentRewards skips bots, re-ranks humans, scales bot-influenced rewards, and skips their mmr bonus', () => {
  const nk = new RewardBotPolicyMockNakama();
  const logger = createLogger();

  distributeTournamentRewards(
    nk,
    logger,
    't1',
    {
      '1st': { coins: 1000, mmr_bonus: 40 },
      '2nd': { coins: 500, mmr_bonus: 20 },
    }
  );

  const u2Tx = nk.coinTransactions.find((t) => t.userId === 'u2');
  const u3Tx = nk.coinTransactions.find((t) => t.userId === 'u3');

  assert.ok(u2Tx);
  assert.ok(u3Tx);
  // u2 is bot-influenced and should receive first human placement reward at 50%.
  assert.equal(u2Tx.amount, 500);
  // u3 becomes second human placement reward with no multiplier.
  assert.equal(u3Tx.amount, 500);

  // MMR bonus should run only for u3 (u2 is skipped by policy).
  assert.equal(nk.storageReadCalls.includes('u2'), false);
  assert.equal(nk.storageReadCalls.includes('u3'), true);
});
