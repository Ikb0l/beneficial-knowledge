const test = require('node:test');
const assert = require('node:assert/strict');

const { rpcGetGameSettings, rpcAdminUpdateGameSettings } = require('../../build/main/game-settings.js');
const { CONFIG_CACHE_STORE } = require('../../build/main/config.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

class GameSettingsMockNakama {
  constructor() {
    this.config = new Map();
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
    if (sql.includes('SELECT config_value FROM game_config WHERE config_key = $1')) {
      const key = params[0];
      if (!this.config.has(key)) return [];
      return [{ config_value: this.config.get(key) }];
    }

    if (sql.includes('FROM user_bans')) {
      return [];
    }

    return [];
  }

  sqlExec(sql, params = []) {
    if (sql.includes('INSERT INTO game_config')) {
      let key = '';
      if (sql.includes("'question_counts'")) {
        key = 'question_counts';
      } else if (sql.includes("'time_per_question_ms'")) {
        key = 'time_per_question_ms';
      } else if (sql.includes("'flow_pacing_profiles'")) {
        key = 'flow_pacing_profiles';
      } else if (sql.includes("'bot_tournament_default_policy'")) {
        key = 'bot_tournament_default_policy';
      } else if (sql.includes("'bot_tournament_difficulty_profile'")) {
        key = 'bot_tournament_difficulty_profile';
      }

      if (key) {
        const raw = params[0];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        this.config.set(key, parsed);
      }
      return { rowsAffected: 1 };
    }

    if (sql.includes('INSERT INTO admin_audit_log')) {
      return { rowsAffected: 1 };
    }

    return { rowsAffected: 0 };
  }
}

test('admin tournament bot policy update is persisted and returned by get_game_settings', () => {
  CONFIG_CACHE_STORE.cache = {};

  const nk = new GameSettingsMockNakama();
  const logger = createLogger();
  const ctx = {
    userId: 'admin1',
    env: {
      ADMIN_TELEGRAM_IDS: '1',
    },
  };

  const newPolicy = {
    enabled: true,
    fillOnStart: true,
    replaceMissingBeforeMatch: true,
    botMmr: 1925,
    rewardCoinMultiplier: 0.45,
    skipMmrBonusWhenBotInfluenced: true,
    difficulty: {
      baseAccuracy: 0.91,
      minAccuracy: 0.74,
      maxAccuracy: 0.99,
      roundAccuracyBonus: 0.015,
      minDelayMs: 850,
      maxDelayMs: 2400,
      roundDelayReductionMs: 130,
      nearMissChance: 0.66,
    },
  };

  const updateRaw = rpcAdminUpdateGameSettings(
    ctx,
    logger,
    nk,
    JSON.stringify({
      questionsPerMatch: 11,
      questionsPerMatchVocabulary: 45,
      timePerQuestion: 19,
      flowPacingProfiles: {
        rankedPreset: 'turbo',
        practicePreset: 'fast',
      },
      tournamentBotPolicy: newPolicy,
    })
  );
  const updatePayload = JSON.parse(updateRaw);
  assert.equal(updatePayload.success, true);

  CONFIG_CACHE_STORE.cache = {};
  const getRaw = rpcGetGameSettings(ctx, logger, nk, '{}');
  const getPayload = JSON.parse(getRaw);

  assert.equal(getPayload.questionsPerMatch, 11);
  assert.equal(getPayload.questionsPerMatchNormal, 11);
  assert.equal(getPayload.questionsPerMatchVocabulary, 45);
  assert.equal(getPayload.timePerQuestion, 19);
  assert.equal(getPayload.flowPacingProfiles.rankedPreset, 'turbo');
  assert.equal(getPayload.flowPacingProfiles.practicePreset, 'fast');
  assert.equal(getPayload.flowPacingProfiles.vocabPreset, undefined);
  assert.equal(getPayload.flowPacingResolved.ranked.preset, 'turbo');
  assert.equal(getPayload.flowPacingResolved.practice.preset, 'fast');
  assert.equal(getPayload.flowPacingResolved.vocabUi, undefined);
  assert.equal(getPayload.tournamentBotPolicy.enabled, true);
  assert.equal(getPayload.tournamentBotPolicy.fillOnStart, true);
  assert.equal(getPayload.tournamentBotPolicy.replaceMissingBeforeMatch, true);
  assert.equal(getPayload.tournamentBotPolicy.botMmr, 1925);
  assert.equal(getPayload.tournamentBotPolicy.difficulty.baseAccuracy, 0.91);
  assert.equal(getPayload.tournamentBotPolicy.difficulty.nearMissChance, 0.66);
});

test('get_game_settings bypasses stale cache for strongly consistent keys', () => {
  const nk = new GameSettingsMockNakama();
  const logger = createLogger();
  const ctx = {
    userId: 'admin1',
    env: {
      ADMIN_TELEGRAM_IDS: '1',
    },
  };

  nk.config.set('question_counts', { default: 37 });
  nk.config.set('time_per_question_ms', 21000);
  nk.config.set('flow_pacing_profiles', {
    rankedPreset: 'balanced',
    practicePreset: 'turbo',
  });
  nk.config.set('bot_tournament_default_policy', {
    enabled: true,
    fillOnStart: true,
    replaceMissingBeforeMatch: true,
    botMmr: 2111,
    rewardCoinMultiplier: 0.41,
    skipMmrBonusWhenBotInfluenced: false,
  });
  nk.config.set('bot_tournament_difficulty_profile', {
    baseAccuracy: 0.83,
    minAccuracy: 0.65,
    maxAccuracy: 0.97,
    roundAccuracyBonus: 0.02,
    minDelayMs: 800,
    maxDelayMs: 2600,
    roundDelayReductionMs: 95,
    nearMissChance: 0.38,
  });

  const farFuture = Date.now() + 5 * 60 * 1000;
  CONFIG_CACHE_STORE.cache = {
    question_counts: { value: { default: 5 }, expiresAt: farFuture },
    time_per_question_ms: { value: 5000, expiresAt: farFuture },
    flow_pacing_profiles: {
      value: {
        rankedPreset: 'classic',
        practicePreset: 'classic',
      },
      expiresAt: farFuture,
    },
    bot_tournament_default_policy: {
      value: {
        enabled: false,
        fillOnStart: false,
        replaceMissingBeforeMatch: false,
        botMmr: 1000,
        rewardCoinMultiplier: 1,
        skipMmrBonusWhenBotInfluenced: true,
      },
      expiresAt: farFuture,
    },
    bot_tournament_difficulty_profile: {
      value: {
        baseAccuracy: 0.2,
        minAccuracy: 0.2,
        maxAccuracy: 0.2,
        roundAccuracyBonus: 0,
        minDelayMs: 100,
        maxDelayMs: 100,
        roundDelayReductionMs: 0,
        nearMissChance: 0,
      },
      expiresAt: farFuture,
    },
  };

  const getRaw = rpcGetGameSettings(ctx, logger, nk, '{}');
  const payload = JSON.parse(getRaw);

  assert.equal(payload.questionsPerMatch, 37);
  assert.equal(payload.questionsPerMatchNormal, 37);
  assert.equal(payload.questionsPerMatchVocabulary, 300);
  assert.equal(payload.timePerQuestion, 21);
  assert.equal(payload.flowPacingProfiles.rankedPreset, 'balanced');
  assert.equal(payload.flowPacingProfiles.practicePreset, 'turbo');
  assert.equal(payload.flowPacingProfiles.vocabPreset, undefined);
  assert.equal(payload.flowPacingResolved.ranked.preset, 'balanced');
  assert.equal(payload.flowPacingResolved.practice.preset, 'turbo');
  assert.equal(payload.flowPacingResolved.vocabUi, undefined);
  assert.equal(payload.tournamentBotPolicy.botMmr, 2111);
  assert.equal(payload.tournamentBotPolicy.skipMmrBonusWhenBotInfluenced, false);
  assert.equal(payload.tournamentBotPolicy.difficulty.baseAccuracy, 0.83);
  assert.equal(payload.tournamentBotPolicy.difficulty.nearMissChance, 0.38);
});

test('admin update rejects invalid flow pacing presets', () => {
  CONFIG_CACHE_STORE.cache = {};

  const nk = new GameSettingsMockNakama();
  const logger = createLogger();
  const ctx = {
    userId: 'admin1',
    env: {
      ADMIN_TELEGRAM_IDS: '1',
    },
  };

  assert.throws(() => {
    rpcAdminUpdateGameSettings(
      ctx,
      logger,
      nk,
      JSON.stringify({
        flowPacingProfiles: {
          rankedPreset: 'warp',
          practicePreset: 'turbo',
        },
      })
    );
  }, /Ranked flow preset must be one of: classic, balanced, turbo/);
});
