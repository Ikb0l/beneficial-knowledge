import { requireAdmin, logAdminAction } from './admin';
import {
  getDbConfig,
  getFlowPacingProfiles,
  getFlowPacingResolved,
  getQuestionCountDefaults,
  getQuestionCountCaps,
  getQuestionsPerMatch,
  getQuestionsPerMatchByCategoryType,
  normalizeFlowPacingProfiles,
  getTimePerQuestionMs,
  invalidateConfigCache,
  type FlowPacingProfiles,
} from './config';
import {
  normalizeTournamentBotPolicy,
  getGlobalTournamentBotPolicy,
  sanitizeTournamentBotPolicyOverride,
  TournamentBotPolicy,
} from './tournament-bots';

// GAME SETTINGS RPCs
// ============================================================================

function parseBoolean(value: any, fallback: boolean): boolean {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 't') return true;
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'f') return false;
  return fallback;
}

function parseNumber(value: any, fallback: number, minValue: number, maxValue: number): number {
  var parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(parsed)) parsed = fallback;
  if (parsed < minValue) parsed = minValue;
  if (parsed > maxValue) parsed = maxValue;
  return parsed;
}

function parseIntNumber(value: any, fallback: number, minValue: number, maxValue: number): number {
  var parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) parsed = fallback;
  parsed = Math.floor(parsed);
  if (parsed < minValue) parsed = minValue;
  if (parsed > maxValue) parsed = maxValue;
  return parsed;
}

function readQuestionCountsConfig(nk: nkruntime.Nakama, logger: nkruntime.Logger): any {
  var normalDefault = getQuestionsPerMatchByCategoryType(nk, logger, 'normal');
  var vocabularyDefault = getQuestionsPerMatchByCategoryType(nk, logger, 'vocabulary');
  return getDbConfig(nk, logger, 'question_counts', {
    default: normalDefault,
    default_normal: normalDefault,
    default_vocabulary: vocabularyDefault,
  });
}

function hasTournamentBotSettingsInput(request: any): boolean {
  if (!request || typeof request !== 'object') return false;
  var keys = [
    'tournamentBotPolicy',
    'tournament_bot_policy',
    'tournamentBotEnabled',
    'tournamentBotFillOnStart',
    'tournamentBotReplaceMissingBeforeMatch',
    'tournamentBotMmr',
    'tournamentBotSkipMmrBonusWhenBotInfluenced',
    'tournamentBotBaseAccuracy',
    'tournamentBotMinAccuracy',
    'tournamentBotMaxAccuracy',
    'tournamentBotRoundAccuracyBonus',
    'tournamentBotMinDelayMs',
    'tournamentBotMaxDelayMs',
    'tournamentBotRoundDelayReductionMs',
    'tournamentBotNearMissChance',
  ];
  for (var i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(request, keys[i])) {
      return true;
    }
  }
  return false;
}

function hasFlowPacingSettingsInput(request: any): boolean {
  if (!request || typeof request !== 'object') return false;
  return (
    Object.prototype.hasOwnProperty.call(request, 'flowPacingProfiles')
    || Object.prototype.hasOwnProperty.call(request, 'flow_pacing_profiles')
  );
}

function readFlowPacingPayload(request: any): any {
  return request.flowPacingProfiles !== undefined
    ? request.flowPacingProfiles
    : request.flow_pacing_profiles;
}

function validateFlowPacingPayload(payload: any): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Flow pacing profiles must be an object');
  }

  var hasRankedPreset = Object.prototype.hasOwnProperty.call(payload, 'rankedPreset');
  var hasPracticePreset = Object.prototype.hasOwnProperty.call(payload, 'practicePreset');
  var hasTournamentPreset = Object.prototype.hasOwnProperty.call(payload, 'tournamentPreset');
  var rankedPreset = hasRankedPreset ? String((payload as any).rankedPreset || '').trim().toLowerCase() : '';
  var practicePreset = hasPracticePreset ? String((payload as any).practicePreset || '').trim().toLowerCase() : '';
  var tournamentPreset = hasTournamentPreset ? String((payload as any).tournamentPreset || '').trim().toLowerCase() : '';

  if (hasRankedPreset && !(rankedPreset === 'classic' || rankedPreset === 'balanced' || rankedPreset === 'turbo')) {
    throw new Error('Ranked flow preset must be one of: classic, balanced, turbo');
  }
  if (hasPracticePreset && !(practicePreset === 'classic' || practicePreset === 'fast' || practicePreset === 'turbo')) {
    throw new Error('Practice flow preset must be one of: classic, fast, turbo');
  }
  if (
    hasTournamentPreset &&
    !(tournamentPreset === 'classic' || tournamentPreset === 'balanced' || tournamentPreset === 'fast' || tournamentPreset === 'turbo')
  ) {
    throw new Error('Tournament flow preset must be one of: classic, balanced, fast, turbo');
  }
}

function applyFlowPacingProfilesFromRequest(request: any, currentProfiles: FlowPacingProfiles): FlowPacingProfiles {
  var pacingPayload = readFlowPacingPayload(request);
  if (pacingPayload === undefined) {
    return currentProfiles;
  }
  validateFlowPacingPayload(pacingPayload);
  return normalizeFlowPacingProfiles(pacingPayload, currentProfiles);
}

function applyTournamentBotSettingsFromRequest(request: any, currentPolicy: TournamentBotPolicy): TournamentBotPolicy {
  var nextPolicy = normalizeTournamentBotPolicy(currentPolicy, currentPolicy);

  var policyPayload = request.tournamentBotPolicy !== undefined
    ? request.tournamentBotPolicy
    : request.tournament_bot_policy;
  if (policyPayload !== undefined) {
    var sanitizedOverride = sanitizeTournamentBotPolicyOverride(policyPayload);
    nextPolicy = normalizeTournamentBotPolicy(sanitizedOverride, nextPolicy);
  }

  if (request.tournamentBotEnabled !== undefined) {
    nextPolicy.enabled = parseBoolean(request.tournamentBotEnabled, nextPolicy.enabled);
  }
  if (request.tournamentBotFillOnStart !== undefined) {
    nextPolicy.fillOnStart = parseBoolean(request.tournamentBotFillOnStart, nextPolicy.fillOnStart);
  }
  if (request.tournamentBotReplaceMissingBeforeMatch !== undefined) {
    nextPolicy.replaceMissingBeforeMatch = parseBoolean(
      request.tournamentBotReplaceMissingBeforeMatch,
      nextPolicy.replaceMissingBeforeMatch
    );
  }
  if (request.tournamentBotMmr !== undefined) {
    nextPolicy.botMmr = parseIntNumber(request.tournamentBotMmr, nextPolicy.botMmr, 0, 10000);
  }
  if (request.tournamentBotSkipMmrBonusWhenBotInfluenced !== undefined) {
    nextPolicy.skipMmrBonusWhenBotInfluenced = parseBoolean(
      request.tournamentBotSkipMmrBonusWhenBotInfluenced,
      nextPolicy.skipMmrBonusWhenBotInfluenced
    );
  }

  if (request.tournamentBotBaseAccuracy !== undefined) {
    nextPolicy.difficulty.baseAccuracy = parseNumber(request.tournamentBotBaseAccuracy, nextPolicy.difficulty.baseAccuracy, 0.1, 0.999);
  }
  if (request.tournamentBotMinAccuracy !== undefined) {
    nextPolicy.difficulty.minAccuracy = parseNumber(request.tournamentBotMinAccuracy, nextPolicy.difficulty.minAccuracy, 0.05, 0.995);
  }
  if (request.tournamentBotMaxAccuracy !== undefined) {
    nextPolicy.difficulty.maxAccuracy = parseNumber(request.tournamentBotMaxAccuracy, nextPolicy.difficulty.maxAccuracy, 0.1, 0.999);
  }
  if (request.tournamentBotRoundAccuracyBonus !== undefined) {
    nextPolicy.difficulty.roundAccuracyBonus = parseNumber(
      request.tournamentBotRoundAccuracyBonus,
      nextPolicy.difficulty.roundAccuracyBonus,
      0,
      0.1
    );
  }
  if (request.tournamentBotMinDelayMs !== undefined) {
    nextPolicy.difficulty.minDelayMs = parseIntNumber(request.tournamentBotMinDelayMs, nextPolicy.difficulty.minDelayMs, 250, 30000);
  }
  if (request.tournamentBotMaxDelayMs !== undefined) {
    nextPolicy.difficulty.maxDelayMs = parseIntNumber(request.tournamentBotMaxDelayMs, nextPolicy.difficulty.maxDelayMs, 300, 60000);
  }
  if (request.tournamentBotRoundDelayReductionMs !== undefined) {
    nextPolicy.difficulty.roundDelayReductionMs = parseIntNumber(
      request.tournamentBotRoundDelayReductionMs,
      nextPolicy.difficulty.roundDelayReductionMs,
      0,
      5000
    );
  }
  if (request.tournamentBotNearMissChance !== undefined) {
    nextPolicy.difficulty.nearMissChance = parseNumber(
      request.tournamentBotNearMissChance,
      nextPolicy.difficulty.nearMissChance,
      0,
      1
    );
  }

  return normalizeTournamentBotPolicy(nextPolicy, currentPolicy);
}

// RPC: Get game settings (public - for client to display)
export function rpcGetGameSettings(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var questionCountDefaults = getQuestionCountDefaults(nk, logger);
    var questionsPerMatch = getQuestionsPerMatch(nk, logger);
    var questionsPerMatchNormal = questionCountDefaults.normalDefault;
    var questionsPerMatchVocabulary = questionCountDefaults.vocabularyDefault;
    var questionCountCaps = getQuestionCountCaps(nk, logger);
    var timePerQuestionMs = getTimePerQuestionMs(nk, logger);
    var timePerQuestion = Math.round(timePerQuestionMs / 1000); // Convert to seconds for UI
    var flowPacingProfiles = getFlowPacingProfiles(nk, logger);
    var flowPacingResolved = getFlowPacingResolved(nk, logger);
    var tournamentBotPolicy = getGlobalTournamentBotPolicy(nk, logger);
    var communityAlertsEnabled = parseBoolean(
      getDbConfig(nk, logger, 'community_alerts_enabled', true as any),
      true
    );
    var communityOnlineThreshold = parseIntNumber(
      getDbConfig(nk, logger, 'community_online_threshold', 2 as any),
      2,
      1,
      1000000
    );
    var communityOnlineCooldownMinutes = parseIntNumber(
      getDbConfig(nk, logger, 'community_online_cooldown_minutes', 60 as any),
      60,
      1,
      1440
    );
    var communityDispatchBatchSize = parseIntNumber(
      getDbConfig(nk, logger, 'community_dispatch_batch_size', 200 as any),
      200,
      10,
      2000
    );
    var telegramDispatchPerRun = parseIntNumber(
      getDbConfig(nk, logger, 'telegram_dispatch_per_run', 25 as any),
      25,
      0,
      500
    );
    var telegramMiniappDeeplinkBase = String(
      getDbConfig(nk, logger, 'telegram_miniapp_deeplink_base', '' as any) || ''
    ).trim();

    logger.info(
      'get_game_settings: questionsPerMatchNormal='
      + questionsPerMatchNormal
      + ', questionsPerMatchVocabulary='
      + questionsPerMatchVocabulary
      + ', timePerQuestion='
      + timePerQuestion
    );

    return JSON.stringify({
      questionsPerMatch: questionsPerMatch,
      questionsPerMatchNormal: questionsPerMatchNormal,
      questionsPerMatchVocabulary: questionsPerMatchVocabulary,
      maxQuestionsPerMatchNormal: questionCountCaps.normalMax,
      maxQuestionsPerMatchVocabulary: questionCountCaps.vocabularyMax,
      timePerQuestion: timePerQuestion,
      flowPacingProfiles: flowPacingProfiles,
      flowPacingResolved: flowPacingResolved,
      tournamentBotPolicy: tournamentBotPolicy,
      tournamentBotEnabled: tournamentBotPolicy.enabled,
      tournamentBotFillOnStart: tournamentBotPolicy.fillOnStart,
      tournamentBotReplaceMissingBeforeMatch: tournamentBotPolicy.replaceMissingBeforeMatch,
      tournamentBotMmr: tournamentBotPolicy.botMmr,
      tournamentBotSkipMmrBonusWhenBotInfluenced: tournamentBotPolicy.skipMmrBonusWhenBotInfluenced,
      tournamentBotBaseAccuracy: tournamentBotPolicy.difficulty.baseAccuracy,
      tournamentBotMinAccuracy: tournamentBotPolicy.difficulty.minAccuracy,
      tournamentBotMaxAccuracy: tournamentBotPolicy.difficulty.maxAccuracy,
      tournamentBotRoundAccuracyBonus: tournamentBotPolicy.difficulty.roundAccuracyBonus,
      tournamentBotMinDelayMs: tournamentBotPolicy.difficulty.minDelayMs,
      tournamentBotMaxDelayMs: tournamentBotPolicy.difficulty.maxDelayMs,
      tournamentBotRoundDelayReductionMs: tournamentBotPolicy.difficulty.roundDelayReductionMs,
      tournamentBotNearMissChance: tournamentBotPolicy.difficulty.nearMissChance,
      communityAlertsEnabled: communityAlertsEnabled,
      communityOnlineThreshold: communityOnlineThreshold,
      communityOnlineCooldownMinutes: communityOnlineCooldownMinutes,
      communityDispatchBatchSize: communityDispatchBatchSize,
      telegramDispatchPerRun: telegramDispatchPerRun,
      telegramMiniappDeeplinkBase: telegramMiniappDeeplinkBase,
    });
  } catch (error) {
    logger.error('Get game settings error: ' + error);
    throw error;
  }
}

// RPC: Admin update game settings
export function rpcAdminUpdateGameSettings(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdmin(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    var questionsPerMatch = request.questionsPerMatch;
    var questionsPerMatchNormal = request.questionsPerMatchNormal;
    if (questionsPerMatchNormal === undefined) {
      questionsPerMatchNormal = request.questions_per_match_normal;
    }
    var questionsPerMatchVocabulary = request.questionsPerMatchVocabulary;
    if (questionsPerMatchVocabulary === undefined) {
      questionsPerMatchVocabulary = request.questions_per_match_vocabulary;
    }
    var maxQuestionsPerMatchNormal = request.maxQuestionsPerMatchNormal;
    if (maxQuestionsPerMatchNormal === undefined) {
      maxQuestionsPerMatchNormal = request.max_questions_per_match_normal;
    }
    var maxQuestionsPerMatchVocabulary = request.maxQuestionsPerMatchVocabulary;
    if (maxQuestionsPerMatchVocabulary === undefined) {
      maxQuestionsPerMatchVocabulary = request.max_questions_per_match_vocabulary;
    }
    var timePerQuestion = request.timePerQuestion;
    var communityAlertsEnabled = request.communityAlertsEnabled;
    if (communityAlertsEnabled === undefined) {
      communityAlertsEnabled = request.community_alerts_enabled;
    }
    var communityOnlineThreshold = request.communityOnlineThreshold;
    if (communityOnlineThreshold === undefined) {
      communityOnlineThreshold = request.community_online_threshold;
    }
    var communityOnlineCooldownMinutes = request.communityOnlineCooldownMinutes;
    if (communityOnlineCooldownMinutes === undefined) {
      communityOnlineCooldownMinutes = request.community_online_cooldown_minutes;
    }
    var communityDispatchBatchSize = request.communityDispatchBatchSize;
    if (communityDispatchBatchSize === undefined) {
      communityDispatchBatchSize = request.community_dispatch_batch_size;
    }
    var telegramDispatchPerRun = request.telegramDispatchPerRun;
    if (telegramDispatchPerRun === undefined) {
      telegramDispatchPerRun = request.telegram_dispatch_per_run;
    }
    var telegramMiniappDeeplinkBase = request.telegramMiniappDeeplinkBase;
    if (telegramMiniappDeeplinkBase === undefined) {
      telegramMiniappDeeplinkBase = request.telegram_miniapp_deeplink_base;
    }
    var flowPacingProfiles = readFlowPacingPayload(request);
    var hasTournamentBotInput = hasTournamentBotSettingsInput(request);
    var hasFlowPacingInput = hasFlowPacingSettingsInput(request);
    var hasQuestionCountInput = questionsPerMatch !== undefined
      || questionsPerMatchNormal !== undefined
      || questionsPerMatchVocabulary !== undefined
      || maxQuestionsPerMatchNormal !== undefined
      || maxQuestionsPerMatchVocabulary !== undefined;
    var hasCommunitySettingsInput = communityAlertsEnabled !== undefined
      || communityOnlineThreshold !== undefined
      || communityOnlineCooldownMinutes !== undefined
      || communityDispatchBatchSize !== undefined
      || telegramDispatchPerRun !== undefined
      || telegramMiniappDeeplinkBase !== undefined;

    // Validate inputs
    if (questionsPerMatch !== undefined) {
      if (typeof questionsPerMatch !== 'number' || questionsPerMatch < 1 || questionsPerMatch > 1000) {
        throw new Error('Questions per match must be between 1 and 1000');
      }
    }

    if (questionsPerMatchNormal !== undefined) {
      if (typeof questionsPerMatchNormal !== 'number' || questionsPerMatchNormal < 1 || questionsPerMatchNormal > 1000) {
        throw new Error('Default questions per match for normal categories must be between 1 and 1000');
      }
    }

    if (questionsPerMatchVocabulary !== undefined) {
      if (typeof questionsPerMatchVocabulary !== 'number' || questionsPerMatchVocabulary < 1 || questionsPerMatchVocabulary > 1000) {
        throw new Error('Default questions per match for vocabulary categories must be between 1 and 1000');
      }
    }

    if (maxQuestionsPerMatchNormal !== undefined) {
      if (typeof maxQuestionsPerMatchNormal !== 'number' || maxQuestionsPerMatchNormal < 1 || maxQuestionsPerMatchNormal > 1000) {
        throw new Error('Normal category max questions must be between 1 and 1000');
      }
    }

    if (maxQuestionsPerMatchVocabulary !== undefined) {
      if (typeof maxQuestionsPerMatchVocabulary !== 'number'
        || maxQuestionsPerMatchVocabulary < 1
        || maxQuestionsPerMatchVocabulary > 1000) {
        throw new Error('Vocabulary category max questions must be between 1 and 1000');
      }
    }

    if (timePerQuestion !== undefined) {
      if (typeof timePerQuestion !== 'number' || timePerQuestion < 5 || timePerQuestion > 200) {
        throw new Error('Time per question must be between 5 and 200 seconds');
      }
    }

    if (communityOnlineThreshold !== undefined) {
      if (typeof communityOnlineThreshold !== 'number' || communityOnlineThreshold < 1 || communityOnlineThreshold > 1000000) {
        throw new Error('Community online threshold must be between 1 and 1,000,000');
      }
    }

    if (communityOnlineCooldownMinutes !== undefined) {
      if (typeof communityOnlineCooldownMinutes !== 'number'
        || communityOnlineCooldownMinutes < 1
        || communityOnlineCooldownMinutes > 1440) {
        throw new Error('Community cooldown must be between 1 and 1440 minutes');
      }
    }

    if (communityDispatchBatchSize !== undefined) {
      if (typeof communityDispatchBatchSize !== 'number'
        || communityDispatchBatchSize < 10
        || communityDispatchBatchSize > 2000) {
        throw new Error('Community dispatch batch size must be between 10 and 2000');
      }
    }

    if (telegramDispatchPerRun !== undefined) {
      if (typeof telegramDispatchPerRun !== 'number'
        || telegramDispatchPerRun < 0
        || telegramDispatchPerRun > 500) {
        throw new Error('Telegram dispatch per run must be between 0 and 500');
      }
    }

    if (telegramMiniappDeeplinkBase !== undefined) {
      if (typeof telegramMiniappDeeplinkBase !== 'string') {
        throw new Error('Telegram Mini App deeplink base must be a string');
      }
      if (telegramMiniappDeeplinkBase.length > 500) {
        throw new Error('Telegram Mini App deeplink base must be 500 chars or less');
      }
    }

    if (hasFlowPacingInput) {
      validateFlowPacingPayload(flowPacingProfiles);
    }

    // Get old values for audit
    var oldQuestionCounts = readQuestionCountsConfig(nk, logger);
    var oldQuestionCountDefaults = getQuestionCountDefaults(nk, logger);
    var oldQuestionsPerMatch = getQuestionsPerMatch(nk, logger);
    var oldQuestionsPerMatchNormal = oldQuestionCountDefaults.normalDefault;
    var oldQuestionsPerMatchVocabulary = oldQuestionCountDefaults.vocabularyDefault;
    var oldQuestionCountCaps = getQuestionCountCaps(nk, logger);
    var oldMaxQuestionsPerMatchNormal = oldQuestionCountCaps.normalMax;
    var oldMaxQuestionsPerMatchVocabulary = oldQuestionCountCaps.vocabularyMax;
    var oldTimePerQuestion = Math.round(getTimePerQuestionMs(nk, logger) / 1000);
    var oldFlowPacingProfiles = getFlowPacingProfiles(nk, logger);
    var oldTournamentBotPolicy = getGlobalTournamentBotPolicy(nk, logger);
    var oldCommunityAlertsEnabled = parseBoolean(
      getDbConfig(nk, logger, 'community_alerts_enabled', true as any),
      true
    );
    var oldCommunityOnlineThreshold = parseIntNumber(
      getDbConfig(nk, logger, 'community_online_threshold', 2 as any),
      2,
      1,
      1000000
    );
    var oldCommunityOnlineCooldownMinutes = parseIntNumber(
      getDbConfig(nk, logger, 'community_online_cooldown_minutes', 60 as any),
      60,
      1,
      1440
    );
    var oldCommunityDispatchBatchSize = parseIntNumber(
      getDbConfig(nk, logger, 'community_dispatch_batch_size', 200 as any),
      200,
      10,
      2000
    );
    var oldTelegramDispatchPerRun = parseIntNumber(
      getDbConfig(nk, logger, 'telegram_dispatch_per_run', 25 as any),
      25,
      0,
      500
    );
    var oldTelegramMiniappDeeplinkBase = String(
      getDbConfig(nk, logger, 'telegram_miniapp_deeplink_base', '' as any) || ''
    ).trim();

    // Update question count config
    var updatedQuestionsPerMatch = oldQuestionsPerMatch;
    var updatedQuestionsPerMatchNormal = oldQuestionsPerMatchNormal;
    var updatedQuestionsPerMatchVocabulary = oldQuestionsPerMatchVocabulary;
    var updatedMaxQuestionsPerMatchNormal = oldMaxQuestionsPerMatchNormal;
    var updatedMaxQuestionsPerMatchVocabulary = oldMaxQuestionsPerMatchVocabulary;
    if (hasQuestionCountInput) {
      updatedQuestionsPerMatchNormal = questionsPerMatchNormal !== undefined
        ? parseIntNumber(questionsPerMatchNormal, oldQuestionsPerMatchNormal, 1, 1000)
        : (questionsPerMatch !== undefined
          ? parseIntNumber(questionsPerMatch, oldQuestionsPerMatchNormal, 1, 1000)
          : parseIntNumber(
            oldQuestionCounts && oldQuestionCounts.default_normal,
            oldQuestionsPerMatchNormal,
            1,
            1000
          ));
      updatedQuestionsPerMatchVocabulary = questionsPerMatchVocabulary !== undefined
        ? parseIntNumber(questionsPerMatchVocabulary, oldQuestionsPerMatchVocabulary, 1, 1000)
        : parseIntNumber(
          oldQuestionCounts && oldQuestionCounts.default_vocabulary,
          oldQuestionsPerMatchVocabulary,
          1,
          1000
        );
      updatedQuestionsPerMatch = updatedQuestionsPerMatchNormal;
      updatedMaxQuestionsPerMatchNormal = maxQuestionsPerMatchNormal !== undefined
        ? parseIntNumber(maxQuestionsPerMatchNormal, oldMaxQuestionsPerMatchNormal, 1, 1000)
        : parseIntNumber(oldQuestionCounts && oldQuestionCounts.max_normal, oldMaxQuestionsPerMatchNormal, 1, 1000);
      updatedMaxQuestionsPerMatchVocabulary = maxQuestionsPerMatchVocabulary !== undefined
        ? parseIntNumber(maxQuestionsPerMatchVocabulary, oldMaxQuestionsPerMatchVocabulary, 1, 1000)
        : parseIntNumber(oldQuestionCounts && oldQuestionCounts.max_vocabulary, oldMaxQuestionsPerMatchVocabulary, 1, 1000);
      if (updatedQuestionsPerMatchNormal > updatedMaxQuestionsPerMatchNormal) {
        throw new Error('Default questions for normal categories cannot exceed max normal questions');
      }
      if (updatedQuestionsPerMatchVocabulary > updatedMaxQuestionsPerMatchVocabulary) {
        throw new Error('Default questions for vocabulary categories cannot exceed max vocabulary questions');
      }
      var mergedQuestionCounts = oldQuestionCounts && typeof oldQuestionCounts === 'object'
        ? JSON.parse(JSON.stringify(oldQuestionCounts))
        : {};
      mergedQuestionCounts.default = updatedQuestionsPerMatch;
      mergedQuestionCounts.default_normal = updatedQuestionsPerMatchNormal;
      mergedQuestionCounts.default_vocabulary = updatedQuestionsPerMatchVocabulary;
      mergedQuestionCounts.max_normal = updatedMaxQuestionsPerMatchNormal;
      mergedQuestionCounts.max_vocabulary = updatedMaxQuestionsPerMatchVocabulary;
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('question_counts', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(mergedQuestionCounts)]
      );
    }

    // Update time per question (store as milliseconds for consistency)
    if (timePerQuestion !== undefined) {
      var timePerQuestionMs = timePerQuestion * 1000;
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('time_per_question_ms', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(timePerQuestionMs)]
      );
    }

    var updatedFlowPacingProfiles = oldFlowPacingProfiles;
    if (hasFlowPacingInput) {
      updatedFlowPacingProfiles = applyFlowPacingProfilesFromRequest(request, oldFlowPacingProfiles);
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('flow_pacing_profiles', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(updatedFlowPacingProfiles)]
      );
    }

    var updatedTournamentBotPolicy = oldTournamentBotPolicy;
    if (hasTournamentBotInput) {
      updatedTournamentBotPolicy = applyTournamentBotSettingsFromRequest(request, oldTournamentBotPolicy);
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('bot_tournament_default_policy', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify({
          enabled: updatedTournamentBotPolicy.enabled,
          fillOnStart: updatedTournamentBotPolicy.fillOnStart,
          replaceMissingBeforeMatch: updatedTournamentBotPolicy.replaceMissingBeforeMatch,
          botMmr: updatedTournamentBotPolicy.botMmr,
          skipMmrBonusWhenBotInfluenced: updatedTournamentBotPolicy.skipMmrBonusWhenBotInfluenced,
        })]
      );
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('bot_tournament_difficulty_profile', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(updatedTournamentBotPolicy.difficulty)]
      );
    }

    var updatedCommunityAlertsEnabled = oldCommunityAlertsEnabled;
    var updatedCommunityOnlineThreshold = oldCommunityOnlineThreshold;
    var updatedCommunityOnlineCooldownMinutes = oldCommunityOnlineCooldownMinutes;
    var updatedCommunityDispatchBatchSize = oldCommunityDispatchBatchSize;
    var updatedTelegramDispatchPerRun = oldTelegramDispatchPerRun;
    var updatedTelegramMiniappDeeplinkBase = oldTelegramMiniappDeeplinkBase;

    if (communityAlertsEnabled !== undefined) {
      updatedCommunityAlertsEnabled = parseBoolean(communityAlertsEnabled, oldCommunityAlertsEnabled);
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('community_alerts_enabled', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(updatedCommunityAlertsEnabled)]
      );
    }
    if (communityOnlineThreshold !== undefined) {
      updatedCommunityOnlineThreshold = parseIntNumber(communityOnlineThreshold, oldCommunityOnlineThreshold, 1, 1000000);
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('community_online_threshold', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(updatedCommunityOnlineThreshold)]
      );
    }
    if (communityOnlineCooldownMinutes !== undefined) {
      updatedCommunityOnlineCooldownMinutes = parseIntNumber(
        communityOnlineCooldownMinutes,
        oldCommunityOnlineCooldownMinutes,
        1,
        1440
      );
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('community_online_cooldown_minutes', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(updatedCommunityOnlineCooldownMinutes)]
      );
    }
    if (communityDispatchBatchSize !== undefined) {
      updatedCommunityDispatchBatchSize = parseIntNumber(
        communityDispatchBatchSize,
        oldCommunityDispatchBatchSize,
        10,
        2000
      );
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('community_dispatch_batch_size', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(updatedCommunityDispatchBatchSize)]
      );
    }
    if (telegramDispatchPerRun !== undefined) {
      updatedTelegramDispatchPerRun = parseIntNumber(telegramDispatchPerRun, oldTelegramDispatchPerRun, 0, 500);
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('telegram_dispatch_per_run', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(updatedTelegramDispatchPerRun)]
      );
    }
    if (telegramMiniappDeeplinkBase !== undefined) {
      updatedTelegramMiniappDeeplinkBase = String(telegramMiniappDeeplinkBase || '').trim();
      nk.sqlExec(
        `INSERT INTO game_config (config_key, config_value, updated_at)
         VALUES ('telegram_miniapp_deeplink_base', $1::jsonb, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(updatedTelegramMiniappDeeplinkBase)]
      );
    }

    invalidateConfigCache();

    // Log audit
    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'game_settings_update',
      'game_config',
      'global',
      {
        questionsPerMatch: oldQuestionsPerMatch,
        questionsPerMatchNormal: oldQuestionsPerMatchNormal,
        questionsPerMatchVocabulary: oldQuestionsPerMatchVocabulary,
        maxQuestionsPerMatchNormal: oldMaxQuestionsPerMatchNormal,
        maxQuestionsPerMatchVocabulary: oldMaxQuestionsPerMatchVocabulary,
        timePerQuestion: oldTimePerQuestion,
        flowPacingProfiles: oldFlowPacingProfiles,
        tournamentBotPolicy: oldTournamentBotPolicy,
        communityAlertsEnabled: oldCommunityAlertsEnabled,
        communityOnlineThreshold: oldCommunityOnlineThreshold,
        communityOnlineCooldownMinutes: oldCommunityOnlineCooldownMinutes,
        communityDispatchBatchSize: oldCommunityDispatchBatchSize,
        telegramDispatchPerRun: oldTelegramDispatchPerRun,
        telegramMiniappDeeplinkBase: oldTelegramMiniappDeeplinkBase,
      },
      {
        questionsPerMatch: updatedQuestionsPerMatch,
        questionsPerMatchNormal: updatedQuestionsPerMatchNormal,
        questionsPerMatchVocabulary: updatedQuestionsPerMatchVocabulary,
        maxQuestionsPerMatchNormal: updatedMaxQuestionsPerMatchNormal,
        maxQuestionsPerMatchVocabulary: updatedMaxQuestionsPerMatchVocabulary,
        timePerQuestion: timePerQuestion !== undefined ? timePerQuestion : oldTimePerQuestion,
        flowPacingProfiles: updatedFlowPacingProfiles,
        tournamentBotPolicy: updatedTournamentBotPolicy,
        communityAlertsEnabled: updatedCommunityAlertsEnabled,
        communityOnlineThreshold: updatedCommunityOnlineThreshold,
        communityOnlineCooldownMinutes: updatedCommunityOnlineCooldownMinutes,
        communityDispatchBatchSize: updatedCommunityDispatchBatchSize,
        telegramDispatchPerRun: updatedTelegramDispatchPerRun,
        telegramMiniappDeeplinkBase: updatedTelegramMiniappDeeplinkBase,
      }
    );

    logger.info(
      'Game settings updated by admin ' +
      ctx.userId +
      ': questionsPerMatchNormal=' +
      updatedQuestionsPerMatchNormal +
      ', questionsPerMatchVocabulary=' +
      updatedQuestionsPerMatchVocabulary +
      ', maxQuestionsPerMatchNormal=' +
      updatedMaxQuestionsPerMatchNormal +
      ', maxQuestionsPerMatchVocabulary=' +
      updatedMaxQuestionsPerMatchVocabulary +
      ', timePerQuestion=' +
      timePerQuestion +
      ', flowPacingUpdated=' +
      hasFlowPacingInput +
      ', tournamentBotsUpdated=' +
      hasTournamentBotInput +
      ', questionCountSettingsUpdated=' +
      hasQuestionCountInput +
      ', communitySettingsUpdated=' +
      hasCommunitySettingsInput
    );

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Update game settings error: ' + error);
    throw error;
  }
}

// ============================================================================
