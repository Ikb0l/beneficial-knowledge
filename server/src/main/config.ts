import { GAME_CONFIG, RANK_TIERS, TELEGRAM_BOT_TOKEN } from './constants';

// ============================================================================
// QUESTION CACHE - Reduces database load for high concurrency
// ============================================================================
// Note: Using a wrapper object to avoid Nakama's module-level object freezing

export var QUESTION_CACHE_STORE: {cache: {[category: string]: {questions: any[], lastRefresh: number}}} = {cache: {}};
export var QUESTION_CACHE_TTL_MS = 60000; // Refresh cache every 60 seconds
export var QUESTION_CACHE_MIN_SIZE = GAME_CONFIG.QUESTIONS_PER_MATCH; // Minimum questions per category in cache

// Helper to get cache (handles frozen object issue)
export function getQuestionCache(): {[category: string]: {questions: any[], lastRefresh: number}} {
  return QUESTION_CACHE_STORE.cache;
}

// ============================================================================
// GAME CONFIG FROM DATABASE
// Reads configuration from game_config table
// NOTE: Uses a small in-memory cache to reduce DB load
// ============================================================================

export var CONFIG_CACHE_STORE: {cache: {[key: string]: {value: any, expiresAt: number}}} = {cache: {}};
export var CONFIG_CACHE_TTL_MS = 30000; // Cache config for 30 seconds
// These keys are read on latency-sensitive user/admin flows where stale reads
// after a save cause visible regressions (e.g. settings appearing "reset").
// Keep them strongly consistent by bypassing per-runtime in-memory cache.
var STRONGLY_CONSISTENT_CONFIG_KEYS: {[key: string]: true} = {
  question_counts: true,
  time_per_question_ms: true,
  flow_pacing_profiles: true,
  bot_tournament_default_policy: true,
  bot_tournament_difficulty_profile: true,
  community_alerts_enabled: true,
  community_online_threshold: true,
  community_online_cooldown_minutes: true,
  community_dispatch_batch_size: true,
  telegram_dispatch_per_run: true,
  telegram_miniapp_deeplink_base: true,
};

export type CategoryType = 'normal' | 'vocabulary';

export interface QuestionCountCaps {
  normalMax: number;
  vocabularyMax: number;
  systemHardMax: number;
}

export interface QuestionCountDefaults {
  normalDefault: number;
  vocabularyDefault: number;
}

var DEFAULT_NORMAL_QUESTION_CAP = 50;
var DEFAULT_VOCABULARY_QUESTION_CAP = 300;
var SYSTEM_HARD_QUESTION_CAP = 1000;

export type RankedFlowPreset = 'classic' | 'balanced' | 'turbo';
export type PracticeFlowPreset = 'classic' | 'fast' | 'turbo';
export type TournamentFlowPreset = 'classic' | 'balanced' | 'fast' | 'turbo';

export interface FlowPacingProfiles {
  rankedPreset: RankedFlowPreset;
  practicePreset: PracticeFlowPreset;
  tournamentPreset: TournamentFlowPreset;
}

export interface MatchPacingProfile {
  preset: string;
  countdownSeconds: number;
  revealDelayMs: number;
  revealSuspenseMs: number;
  revealRevealMs: number;
  revealEffectsMs: number;
  revealScoresMs: number;
  roundPulseEnabled: boolean;
  roundPulseStartDelayMs: number;
  roundPulseCompleteDelayMs: number;
}

export interface FlowPacingResolved {
  ranked: MatchPacingProfile;
  practice: MatchPacingProfile;
  tournament: MatchPacingProfile;
}

export var DEFAULT_FLOW_PACING_PROFILES: FlowPacingProfiles = {
  rankedPreset: 'balanced',
  practicePreset: 'turbo',
  tournamentPreset: 'classic',
};

export function getConfigCache(): {[key: string]: {value: any, expiresAt: number}} {
  return CONFIG_CACHE_STORE.cache;
}

function shouldBypassConfigCache(key: string): boolean {
  return !!STRONGLY_CONSISTENT_CONFIG_KEYS[key];
}

export function invalidateConfigCache(): void {
  var cache = CONFIG_CACHE_STORE.cache;
  for (var key in cache) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      delete cache[key];
    }
  }
}

export function getDbConfig<T>(nk: nkruntime.Nakama, logger: nkruntime.Logger, key: string, defaultValue: T): T {
  var now = Date.now();
  var cache = getConfigCache();
  var bypassCache = shouldBypassConfigCache(key);

  if (!bypassCache) {
    var cached = cache[key];
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }
  }

  try {
    var result = nk.sqlQuery(`SELECT config_value FROM game_config WHERE config_key = $1`, [key]);
    var rows = Array.isArray(result) ? result : [];

    if (rows.length > 0) {
      var value = rows[0].config_value;
      var parsedValue: any = value;

      // Handle byte array from PostgreSQL JSONB (Nakama JS runtime quirk)
      if (Array.isArray(value)) {
        // Convert byte array to string
        var str = '';
        for (var i = 0; i < value.length; i++) {
          str += String.fromCharCode(value[i]);
        }
        try {
          parsedValue = JSON.parse(str);
        } catch (e) {
          parsedValue = str;
        }
      }

      // Parse JSONB value if it's a string
      if (typeof value === 'string') {
        try {
          parsedValue = JSON.parse(value);
        } catch (e) {
          parsedValue = value;
        }
      }
      cache[key] = { value: parsedValue, expiresAt: now + CONFIG_CACHE_TTL_MS };
      return parsedValue as T;
    }
  } catch (err) {
    logger.debug('Failed to load config key ' + key + ' from database: ' + err);
  }
  cache[key] = { value: defaultValue, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return defaultValue;
}

function clampWholeNumber(value: any, fallback: number, minValue: number, maxValue: number): number {
  var parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) {
    parsed = fallback;
  }
  parsed = Math.floor(parsed);
  if (parsed < minValue) parsed = minValue;
  if (parsed > maxValue) parsed = maxValue;
  return parsed;
}

export function normalizeCategoryType(value: any): CategoryType {
  if (String(value || '').trim().toLowerCase() === 'vocabulary') {
    return 'vocabulary';
  }
  return 'normal';
}

function getQuestionCountConfigValue(
  counts: any,
  key: 'default' | 'default_normal' | 'default_vocabulary' | 'max_normal' | 'max_vocabulary',
  fallback: number
): number {
  if (counts && typeof counts === 'object' && counts[key] !== undefined && counts[key] !== null) {
    return clampWholeNumber(counts[key], fallback, 1, SYSTEM_HARD_QUESTION_CAP);
  }
  if (key === 'default' && (typeof counts === 'number' || typeof counts === 'string')) {
    return clampWholeNumber(counts, fallback, 1, SYSTEM_HARD_QUESTION_CAP);
  }
  return fallback;
}

function normalizeRankedFlowPreset(value: any, fallback: RankedFlowPreset): RankedFlowPreset {
  var normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'classic' || normalized === 'balanced' || normalized === 'turbo') {
    return normalized as RankedFlowPreset;
  }
  return fallback;
}

function normalizePracticeFlowPreset(value: any, fallback: PracticeFlowPreset): PracticeFlowPreset {
  var normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'classic' || normalized === 'fast' || normalized === 'turbo') {
    return normalized as PracticeFlowPreset;
  }
  return fallback;
}

function normalizeTournamentFlowPreset(value: any, fallback: TournamentFlowPreset): TournamentFlowPreset {
  var normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'classic' || normalized === 'balanced' || normalized === 'fast' || normalized === 'turbo') {
    return normalized as TournamentFlowPreset;
  }
  return fallback;
}

function cloneFlowPacingProfiles(value: FlowPacingProfiles): FlowPacingProfiles {
  return {
    rankedPreset: value.rankedPreset,
    practicePreset: value.practicePreset,
    tournamentPreset: value.tournamentPreset,
  };
}

export function normalizeFlowPacingProfiles(value: any, fallback?: FlowPacingProfiles): FlowPacingProfiles {
  var base = cloneFlowPacingProfiles(fallback || DEFAULT_FLOW_PACING_PROFILES);
  var source = toConfigObject(value);
  return {
    rankedPreset: normalizeRankedFlowPreset(source.rankedPreset, base.rankedPreset),
    practicePreset: normalizePracticeFlowPreset(source.practicePreset, base.practicePreset),
    tournamentPreset: normalizeTournamentFlowPreset(source.tournamentPreset, base.tournamentPreset),
  };
}

function buildClassicMatchPacing(): MatchPacingProfile {
  return {
    preset: 'classic',
    countdownSeconds: 3,
    revealDelayMs: GAME_CONFIG.TIME_BETWEEN_QUESTIONS_MS,
    revealSuspenseMs: 500,
    revealRevealMs: 1300,
    revealEffectsMs: 2000,
    revealScoresMs: 2000,
    roundPulseEnabled: true,
    roundPulseStartDelayMs: 300,
    roundPulseCompleteDelayMs: 1200,
  };
}

function buildBalancedRankedMatchPacing(): MatchPacingProfile {
  return {
    preset: 'balanced',
    countdownSeconds: 2,
    revealDelayMs: 700,
    revealSuspenseMs: 120,
    revealRevealMs: 280,
    revealEffectsMs: 450,
    revealScoresMs: 650,
    roundPulseEnabled: false,
    roundPulseStartDelayMs: 0,
    roundPulseCompleteDelayMs: 0,
  };
}

function buildTurboRankedMatchPacing(): MatchPacingProfile {
  return {
    preset: 'turbo',
    countdownSeconds: 1,
    revealDelayMs: 250,
    revealSuspenseMs: 70,
    revealRevealMs: 140,
    revealEffectsMs: 220,
    revealScoresMs: 320,
    roundPulseEnabled: false,
    roundPulseStartDelayMs: 0,
    roundPulseCompleteDelayMs: 0,
  };
}

function buildFastPracticeMatchPacing(): MatchPacingProfile {
  return {
    preset: 'fast',
    countdownSeconds: 1,
    revealDelayMs: 320,
    revealSuspenseMs: 90,
    revealRevealMs: 170,
    revealEffectsMs: 240,
    revealScoresMs: 340,
    roundPulseEnabled: false,
    roundPulseStartDelayMs: 0,
    roundPulseCompleteDelayMs: 0,
  };
}

function buildTurboPracticeMatchPacing(): MatchPacingProfile {
  return {
    preset: 'turbo',
    countdownSeconds: 0,
    revealDelayMs: 120,
    revealSuspenseMs: 40,
    revealRevealMs: 90,
    revealEffectsMs: 130,
    revealScoresMs: 180,
    roundPulseEnabled: false,
    roundPulseStartDelayMs: 0,
    roundPulseCompleteDelayMs: 0,
  };
}

function cloneMatchPacingProfile(profile: MatchPacingProfile): MatchPacingProfile {
  return {
    preset: profile.preset,
    countdownSeconds: profile.countdownSeconds,
    revealDelayMs: profile.revealDelayMs,
    revealSuspenseMs: profile.revealSuspenseMs,
    revealRevealMs: profile.revealRevealMs,
    revealEffectsMs: profile.revealEffectsMs,
    revealScoresMs: profile.revealScoresMs,
    roundPulseEnabled: profile.roundPulseEnabled,
    roundPulseStartDelayMs: profile.roundPulseStartDelayMs,
    roundPulseCompleteDelayMs: profile.roundPulseCompleteDelayMs,
  };
}

function resolveRankedMatchPacing(preset: RankedFlowPreset): MatchPacingProfile {
  if (preset === 'classic') return buildClassicMatchPacing();
  if (preset === 'turbo') return buildTurboRankedMatchPacing();
  return buildBalancedRankedMatchPacing();
}

function resolvePracticeMatchPacing(preset: PracticeFlowPreset): MatchPacingProfile {
  if (preset === 'classic') return buildClassicMatchPacing();
  if (preset === 'fast') return buildFastPracticeMatchPacing();
  return buildTurboPracticeMatchPacing();
}

function resolveTournamentMatchPacing(preset: TournamentFlowPreset): MatchPacingProfile {
  if (preset === 'balanced') return buildBalancedRankedMatchPacing();
  if (preset === 'fast') return buildFastPracticeMatchPacing();
  if (preset === 'turbo') return buildTurboPracticeMatchPacing();
  return buildClassicMatchPacing();
}

export function getFlowPacingProfiles(nk: nkruntime.Nakama, logger: nkruntime.Logger): FlowPacingProfiles {
  var raw = getDbConfig<any>(nk, logger, 'flow_pacing_profiles', DEFAULT_FLOW_PACING_PROFILES);
  return normalizeFlowPacingProfiles(raw, DEFAULT_FLOW_PACING_PROFILES);
}

export function getResolvedMatchPacingForMode(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  mode: 'ranked' | 'practice' | 'tournament'
): MatchPacingProfile {
  var profiles = getFlowPacingProfiles(nk, logger);
  if (mode === 'tournament') {
    return resolveTournamentMatchPacing(profiles.tournamentPreset);
  }
  if (mode === 'practice') {
    return resolvePracticeMatchPacing(profiles.practicePreset);
  }
  return resolveRankedMatchPacing(profiles.rankedPreset);
}

export function getFlowPacingResolved(nk: nkruntime.Nakama, logger: nkruntime.Logger): FlowPacingResolved {
  return {
    ranked: cloneMatchPacingProfile(getResolvedMatchPacingForMode(nk, logger, 'ranked')),
    practice: cloneMatchPacingProfile(getResolvedMatchPacingForMode(nk, logger, 'practice')),
    tournament: cloneMatchPacingProfile(getResolvedMatchPacingForMode(nk, logger, 'tournament')),
  };
}

export type VocabGameMode = 'association' | 'agility' | 'context' | 'recall' | 'diction';

export interface VocabModeTimerTuning {
  defaultDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  minPersistedDurationSec: number;
  maxPersistedDurationSec: number;
  minRemainingBudgetMs: number;
  minTotalTimeDeltaMs: number;
  maxTotalTimeDeltaMs: number;
}

export interface VocabModeScoringTuning {
  correctBasePoints: number;
  wrongBasePenalty: number;
  wrongDifficultyPenaltyMultiplier: number;
  wrongStreakPenaltyPer: number;
  wrongStreakPenaltyCap: number;
  correctDifficultyBonusPerLevel: number;
  correctStreakBonusPer: number;
  correctStreakBonusCap: number;
  relationStrengthBonusScale: number;
  speedTier1MaxResponseMs: number;
  speedTier2MaxResponseMs: number;
  speedTier3MaxResponseMs: number;
  speedTier4MaxResponseMs: number;
  speedTier1Points: number;
  speedTier2Points: number;
  speedTier3Points: number;
  speedTier4Points: number;
  speedFallbackPoints: number;
}

export interface VocabModeTimeDeltaTuning {
  wrongPenaltyMs: number;
  correctBaseBonusMs: number;
  speedTier1MaxResponseMs: number;
  speedTier2MaxResponseMs: number;
  speedTier3MaxResponseMs: number;
  speedTier4MaxResponseMs: number;
  speedTier1BonusMs: number;
  speedTier2BonusMs: number;
  speedTier3BonusMs: number;
  speedTier4BonusMs: number;
  speedFallbackBonusMs: number;
  difficultyBonusPerLevelMs: number;
  streakBonusPerMs: number;
  streakBonusCapMs: number;
  relationStrengthBonusScaleMs: number;
  maxCorrectBonusMs: number;
}

export interface VocabModeAdaptiveTuning {
  correctStreakThreshold1: number;
  correctStreakBoost1: number;
  correctStreakThreshold2: number;
  correctStreakBoost2: number;
  correctFastResponseThresholdMs: number;
  correctFastResponseBoost: number;
  wrongBasePenalty: number;
  wrongLowAccuracyThreshold: number;
  wrongLowAccuracyPenalty: number;
  highAccuracyThreshold: number;
  highAccuracyBoost: number;
  lowAccuracyThreshold: number;
  lowAccuracyPenalty: number;
  modeFastResponseThresholdMs: number;
  modeFastResponseBoost: number;
  minTargetDifficulty: number;
  maxTargetDifficulty: number;
}

export interface VocabModeRecallGameplayTuning {
  initialLives: number;
  maxLives: number;
  initialSkips: number;
  maxSkips: number;
  letterBankSize: number;
  easyPrefixLength: number;
  mediumPrefixLength: number;
  hardPrefixLength: number;
}

export interface VocabModeTuning {
  timer: VocabModeTimerTuning;
  scoring: VocabModeScoringTuning;
  timeDelta: VocabModeTimeDeltaTuning;
  adaptive: VocabModeAdaptiveTuning;
  recallGameplay: VocabModeRecallGameplayTuning;
}

export interface VocabGameTuning {
  modes: {[key in VocabGameMode]: VocabModeTuning};
}

function toConfigObject(value: any): {[key: string]: any} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function toFiniteNumber(value: any, fallback: number): number {
  var parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clampNumber(value: any, minValue: number, maxValue: number, fallback: number): number {
  var parsed = toFiniteNumber(value, fallback);
  var minBound = minValue;
  var maxBound = maxValue;
  if (maxBound < minBound) {
    maxBound = minBound;
  }
  if (parsed < minBound) parsed = minBound;
  if (parsed > maxBound) parsed = maxBound;
  return parsed;
}

function clampWhole(value: any, minValue: number, maxValue: number, fallback: number): number {
  return Math.floor(clampNumber(value, minValue, maxValue, fallback));
}

function normalizeSpeedThresholds(
  source: {[key: string]: any},
  fallbackTier1: number,
  fallbackTier2: number,
  fallbackTier3: number,
  fallbackTier4: number
): { tier1: number; tier2: number; tier3: number; tier4: number } {
  var tier1 = clampWhole(source.speedTier1MaxResponseMs, 100, 600000, fallbackTier1);
  var tier2Min = Math.min(600000, tier1 + 1);
  var tier2 = clampWhole(source.speedTier2MaxResponseMs, tier2Min, 600000, Math.max(fallbackTier2, tier2Min));
  var tier3Min = Math.min(600000, tier2 + 1);
  var tier3 = clampWhole(source.speedTier3MaxResponseMs, tier3Min, 600000, Math.max(fallbackTier3, tier3Min));
  var tier4Min = Math.min(600000, tier3 + 1);
  var tier4 = clampWhole(source.speedTier4MaxResponseMs, tier4Min, 600000, Math.max(fallbackTier4, tier4Min));

  return {
    tier1,
    tier2,
    tier3,
    tier4,
  };
}

function normalizeModeTimerTuning(value: any, fallback: VocabModeTimerTuning): VocabModeTimerTuning {
  var source = toConfigObject(value);

  var minPersistedDurationSec = clampWhole(source.minPersistedDurationSec, 10, 3600, fallback.minPersistedDurationSec);
  var maxPersistedDurationSec = clampWhole(source.maxPersistedDurationSec, 10, 3600, fallback.maxPersistedDurationSec);
  if (maxPersistedDurationSec < minPersistedDurationSec) {
    maxPersistedDurationSec = minPersistedDurationSec;
  }

  var minDurationSec = clampWhole(source.minDurationSec, minPersistedDurationSec, maxPersistedDurationSec, fallback.minDurationSec);
  var maxDurationSec = clampWhole(source.maxDurationSec, minPersistedDurationSec, maxPersistedDurationSec, fallback.maxDurationSec);
  if (maxDurationSec < minDurationSec) {
    maxDurationSec = minDurationSec;
  }

  var defaultDurationSec = clampWhole(source.defaultDurationSec, minDurationSec, maxDurationSec, fallback.defaultDurationSec);

  var minTotalTimeDeltaMs = clampWhole(source.minTotalTimeDeltaMs, -3600000, 0, fallback.minTotalTimeDeltaMs);
  var maxTotalTimeDeltaMs = clampWhole(source.maxTotalTimeDeltaMs, 0, 3600000, fallback.maxTotalTimeDeltaMs);
  if (maxTotalTimeDeltaMs < minTotalTimeDeltaMs) {
    maxTotalTimeDeltaMs = minTotalTimeDeltaMs;
  }

  return {
    defaultDurationSec,
    minDurationSec,
    maxDurationSec,
    minPersistedDurationSec,
    maxPersistedDurationSec,
    minRemainingBudgetMs: clampWhole(source.minRemainingBudgetMs, 100, 120000, fallback.minRemainingBudgetMs),
    minTotalTimeDeltaMs,
    maxTotalTimeDeltaMs,
  };
}

function normalizeModeScoringTuning(value: any, fallback: VocabModeScoringTuning): VocabModeScoringTuning {
  var source = toConfigObject(value);
  var thresholds = normalizeSpeedThresholds(
    source,
    fallback.speedTier1MaxResponseMs,
    fallback.speedTier2MaxResponseMs,
    fallback.speedTier3MaxResponseMs,
    fallback.speedTier4MaxResponseMs
  );

  return {
    correctBasePoints: clampWhole(source.correctBasePoints, 0, 5000, fallback.correctBasePoints),
    wrongBasePenalty: clampWhole(source.wrongBasePenalty, 0, 5000, fallback.wrongBasePenalty),
    wrongDifficultyPenaltyMultiplier: clampNumber(
      source.wrongDifficultyPenaltyMultiplier,
      0,
      20,
      fallback.wrongDifficultyPenaltyMultiplier
    ),
    wrongStreakPenaltyPer: clampWhole(source.wrongStreakPenaltyPer, 0, 500, fallback.wrongStreakPenaltyPer),
    wrongStreakPenaltyCap: clampWhole(source.wrongStreakPenaltyCap, 0, 5000, fallback.wrongStreakPenaltyCap),
    correctDifficultyBonusPerLevel: clampWhole(
      source.correctDifficultyBonusPerLevel,
      0,
      500,
      fallback.correctDifficultyBonusPerLevel
    ),
    correctStreakBonusPer: clampWhole(source.correctStreakBonusPer, 0, 500, fallback.correctStreakBonusPer),
    correctStreakBonusCap: clampWhole(source.correctStreakBonusCap, 0, 5000, fallback.correctStreakBonusCap),
    relationStrengthBonusScale: clampWhole(
      source.relationStrengthBonusScale,
      0,
      1000,
      fallback.relationStrengthBonusScale
    ),
    speedTier1MaxResponseMs: thresholds.tier1,
    speedTier2MaxResponseMs: thresholds.tier2,
    speedTier3MaxResponseMs: thresholds.tier3,
    speedTier4MaxResponseMs: thresholds.tier4,
    speedTier1Points: clampWhole(source.speedTier1Points, -1000, 5000, fallback.speedTier1Points),
    speedTier2Points: clampWhole(source.speedTier2Points, -1000, 5000, fallback.speedTier2Points),
    speedTier3Points: clampWhole(source.speedTier3Points, -1000, 5000, fallback.speedTier3Points),
    speedTier4Points: clampWhole(source.speedTier4Points, -1000, 5000, fallback.speedTier4Points),
    speedFallbackPoints: clampWhole(source.speedFallbackPoints, -1000, 5000, fallback.speedFallbackPoints),
  };
}

function normalizeModeTimeDeltaTuning(value: any, fallback: VocabModeTimeDeltaTuning): VocabModeTimeDeltaTuning {
  var source = toConfigObject(value);
  var thresholds = normalizeSpeedThresholds(
    source,
    fallback.speedTier1MaxResponseMs,
    fallback.speedTier2MaxResponseMs,
    fallback.speedTier3MaxResponseMs,
    fallback.speedTier4MaxResponseMs
  );

  return {
    wrongPenaltyMs: clampWhole(source.wrongPenaltyMs, 0, 600000, fallback.wrongPenaltyMs),
    correctBaseBonusMs: clampWhole(source.correctBaseBonusMs, 0, 600000, fallback.correctBaseBonusMs),
    speedTier1MaxResponseMs: thresholds.tier1,
    speedTier2MaxResponseMs: thresholds.tier2,
    speedTier3MaxResponseMs: thresholds.tier3,
    speedTier4MaxResponseMs: thresholds.tier4,
    speedTier1BonusMs: clampWhole(source.speedTier1BonusMs, -120000, 600000, fallback.speedTier1BonusMs),
    speedTier2BonusMs: clampWhole(source.speedTier2BonusMs, -120000, 600000, fallback.speedTier2BonusMs),
    speedTier3BonusMs: clampWhole(source.speedTier3BonusMs, -120000, 600000, fallback.speedTier3BonusMs),
    speedTier4BonusMs: clampWhole(source.speedTier4BonusMs, -120000, 600000, fallback.speedTier4BonusMs),
    speedFallbackBonusMs: clampWhole(
      source.speedFallbackBonusMs,
      -120000,
      600000,
      fallback.speedFallbackBonusMs
    ),
    difficultyBonusPerLevelMs: clampWhole(
      source.difficultyBonusPerLevelMs,
      -10000,
      120000,
      fallback.difficultyBonusPerLevelMs
    ),
    streakBonusPerMs: clampWhole(source.streakBonusPerMs, -10000, 120000, fallback.streakBonusPerMs),
    streakBonusCapMs: clampWhole(source.streakBonusCapMs, 0, 600000, fallback.streakBonusCapMs),
    relationStrengthBonusScaleMs: clampWhole(
      source.relationStrengthBonusScaleMs,
      0,
      120000,
      fallback.relationStrengthBonusScaleMs
    ),
    maxCorrectBonusMs: clampWhole(source.maxCorrectBonusMs, 0, 600000, fallback.maxCorrectBonusMs),
  };
}

function normalizeModeAdaptiveTuning(value: any, fallback: VocabModeAdaptiveTuning): VocabModeAdaptiveTuning {
  var source = toConfigObject(value);

  var lowAccuracyThreshold = clampNumber(source.lowAccuracyThreshold, 0, 1, fallback.lowAccuracyThreshold);
  var highAccuracyThreshold = clampNumber(source.highAccuracyThreshold, 0, 1, fallback.highAccuracyThreshold);
  if (highAccuracyThreshold < lowAccuracyThreshold) {
    highAccuracyThreshold = lowAccuracyThreshold;
  }

  var minTargetDifficulty = clampWhole(source.minTargetDifficulty, 1, 10, fallback.minTargetDifficulty);
  var maxTargetDifficulty = clampWhole(source.maxTargetDifficulty, 1, 10, fallback.maxTargetDifficulty);
  if (maxTargetDifficulty < minTargetDifficulty) {
    maxTargetDifficulty = minTargetDifficulty;
  }

  return {
    correctStreakThreshold1: clampWhole(source.correctStreakThreshold1, 0, 100, fallback.correctStreakThreshold1),
    correctStreakBoost1: clampWhole(source.correctStreakBoost1, -10, 10, fallback.correctStreakBoost1),
    correctStreakThreshold2: clampWhole(source.correctStreakThreshold2, 0, 100, fallback.correctStreakThreshold2),
    correctStreakBoost2: clampWhole(source.correctStreakBoost2, -10, 10, fallback.correctStreakBoost2),
    correctFastResponseThresholdMs: clampWhole(
      source.correctFastResponseThresholdMs,
      0,
      600000,
      fallback.correctFastResponseThresholdMs
    ),
    correctFastResponseBoost: clampWhole(source.correctFastResponseBoost, -10, 10, fallback.correctFastResponseBoost),
    wrongBasePenalty: clampWhole(source.wrongBasePenalty, -10, 10, fallback.wrongBasePenalty),
    wrongLowAccuracyThreshold: clampNumber(
      source.wrongLowAccuracyThreshold,
      0,
      1,
      fallback.wrongLowAccuracyThreshold
    ),
    wrongLowAccuracyPenalty: clampWhole(source.wrongLowAccuracyPenalty, -10, 10, fallback.wrongLowAccuracyPenalty),
    highAccuracyThreshold,
    highAccuracyBoost: clampWhole(source.highAccuracyBoost, -10, 10, fallback.highAccuracyBoost),
    lowAccuracyThreshold,
    lowAccuracyPenalty: clampWhole(source.lowAccuracyPenalty, -10, 10, fallback.lowAccuracyPenalty),
    modeFastResponseThresholdMs: clampWhole(
      source.modeFastResponseThresholdMs,
      0,
      600000,
      fallback.modeFastResponseThresholdMs
    ),
    modeFastResponseBoost: clampWhole(source.modeFastResponseBoost, -10, 10, fallback.modeFastResponseBoost),
    minTargetDifficulty,
    maxTargetDifficulty,
  };
}

function normalizeModeRecallGameplayTuning(
  value: any,
  fallback: VocabModeRecallGameplayTuning
): VocabModeRecallGameplayTuning {
  var source = toConfigObject(value);
  var maxLives = clampWhole(source.maxLives, 1, 20, fallback.maxLives);
  var initialLives = clampWhole(source.initialLives, 1, maxLives, fallback.initialLives);
  var maxSkips = clampWhole(source.maxSkips, 0, 20, fallback.maxSkips);
  var initialSkips = clampWhole(source.initialSkips, 0, maxSkips, fallback.initialSkips);
  var hardPrefixLength = clampWhole(source.hardPrefixLength, 0, 10, fallback.hardPrefixLength);
  var mediumPrefixLength = clampWhole(source.mediumPrefixLength, hardPrefixLength, 10, fallback.mediumPrefixLength);
  var easyPrefixLength = clampWhole(source.easyPrefixLength, mediumPrefixLength, 10, fallback.easyPrefixLength);

  return {
    initialLives,
    maxLives,
    initialSkips,
    maxSkips,
    letterBankSize: clampWhole(source.letterBankSize, 4, 16, fallback.letterBankSize),
    easyPrefixLength,
    mediumPrefixLength,
    hardPrefixLength,
  };
}

function createDefaultRecallGameplayTuning(): VocabModeRecallGameplayTuning {
  return {
    initialLives: 5,
    maxLives: 5,
    initialSkips: 3,
    maxSkips: 3,
    letterBankSize: 10,
    easyPrefixLength: 3,
    mediumPrefixLength: 2,
    hardPrefixLength: 1,
  };
}

function createDefaultModeTuning(mode: VocabGameMode): VocabModeTuning {
  if (mode === 'agility') {
    return {
      timer: {
        defaultDurationSec: 90,
        minDurationSec: 30,
        maxDurationSec: 180,
        minPersistedDurationSec: 10,
        maxPersistedDurationSec: 3600,
        minRemainingBudgetMs: 1000,
        minTotalTimeDeltaMs: -240000,
        maxTotalTimeDeltaMs: 720000,
      },
      scoring: {
        correctBasePoints: 96,
        wrongBasePenalty: 56,
        wrongDifficultyPenaltyMultiplier: 2.4,
        wrongStreakPenaltyPer: 3,
        wrongStreakPenaltyCap: 45,
        correctDifficultyBonusPerLevel: 9,
        correctStreakBonusPer: 14,
        correctStreakBonusCap: 180,
        relationStrengthBonusScale: 22,
        speedTier1MaxResponseMs: 850,
        speedTier2MaxResponseMs: 1400,
        speedTier3MaxResponseMs: 2100,
        speedTier4MaxResponseMs: 3000,
        speedTier1Points: 74,
        speedTier2Points: 54,
        speedTier3Points: 34,
        speedTier4Points: 16,
        speedFallbackPoints: 0,
      },
      timeDelta: {
        wrongPenaltyMs: 3200,
        correctBaseBonusMs: 520,
        speedTier1MaxResponseMs: 900,
        speedTier2MaxResponseMs: 1500,
        speedTier3MaxResponseMs: 2300,
        speedTier4MaxResponseMs: 3200,
        speedTier1BonusMs: 860,
        speedTier2BonusMs: 600,
        speedTier3BonusMs: 390,
        speedTier4BonusMs: 180,
        speedFallbackBonusMs: 40,
        difficultyBonusPerLevelMs: 44,
        streakBonusPerMs: 44,
        streakBonusCapMs: 560,
        relationStrengthBonusScaleMs: 180,
        maxCorrectBonusMs: 3200,
      },
      adaptive: {
        correctStreakThreshold1: 3,
        correctStreakBoost1: 1,
        correctStreakThreshold2: 7,
        correctStreakBoost2: 1,
        correctFastResponseThresholdMs: 1400,
        correctFastResponseBoost: 1,
        wrongBasePenalty: -1,
        wrongLowAccuracyThreshold: 0.5,
        wrongLowAccuracyPenalty: -1,
        highAccuracyThreshold: 0.84,
        highAccuracyBoost: 1,
        lowAccuracyThreshold: 0.4,
        lowAccuracyPenalty: -1,
        modeFastResponseThresholdMs: 950,
        modeFastResponseBoost: 1,
        minTargetDifficulty: 1,
        maxTargetDifficulty: 10,
      },
      recallGameplay: createDefaultRecallGameplayTuning(),
    };
  }

  if (mode === 'context') {
    return {
      timer: {
        defaultDurationSec: 90,
        minDurationSec: 30,
        maxDurationSec: 180,
        minPersistedDurationSec: 10,
        maxPersistedDurationSec: 3600,
        minRemainingBudgetMs: 1000,
        minTotalTimeDeltaMs: -240000,
        maxTotalTimeDeltaMs: 720000,
      },
      scoring: {
        correctBasePoints: 92,
        wrongBasePenalty: 49,
        wrongDifficultyPenaltyMultiplier: 2.4,
        wrongStreakPenaltyPer: 3,
        wrongStreakPenaltyCap: 45,
        correctDifficultyBonusPerLevel: 9,
        correctStreakBonusPer: 14,
        correctStreakBonusCap: 180,
        relationStrengthBonusScale: 0,
        speedTier1MaxResponseMs: 850,
        speedTier2MaxResponseMs: 1400,
        speedTier3MaxResponseMs: 2100,
        speedTier4MaxResponseMs: 3000,
        speedTier1Points: 64,
        speedTier2Points: 45,
        speedTier3Points: 28,
        speedTier4Points: 12,
        speedFallbackPoints: 0,
      },
      timeDelta: {
        wrongPenaltyMs: 2800,
        correctBaseBonusMs: 400,
        speedTier1MaxResponseMs: 900,
        speedTier2MaxResponseMs: 1500,
        speedTier3MaxResponseMs: 2300,
        speedTier4MaxResponseMs: 3200,
        speedTier1BonusMs: 860,
        speedTier2BonusMs: 600,
        speedTier3BonusMs: 390,
        speedTier4BonusMs: 180,
        speedFallbackBonusMs: 40,
        difficultyBonusPerLevelMs: 35,
        streakBonusPerMs: 34,
        streakBonusCapMs: 560,
        relationStrengthBonusScaleMs: 0,
        maxCorrectBonusMs: 3200,
      },
      adaptive: {
        correctStreakThreshold1: 3,
        correctStreakBoost1: 1,
        correctStreakThreshold2: 7,
        correctStreakBoost2: 1,
        correctFastResponseThresholdMs: 1400,
        correctFastResponseBoost: 1,
        wrongBasePenalty: -1,
        wrongLowAccuracyThreshold: 0.5,
        wrongLowAccuracyPenalty: -1,
        highAccuracyThreshold: 0.84,
        highAccuracyBoost: 1,
        lowAccuracyThreshold: 0.4,
        lowAccuracyPenalty: -1,
        modeFastResponseThresholdMs: 1100,
        modeFastResponseBoost: 1,
        minTargetDifficulty: 1,
        maxTargetDifficulty: 10,
      },
      recallGameplay: createDefaultRecallGameplayTuning(),
    };
  }

  if (mode === 'recall') {
    return {
      timer: {
        defaultDurationSec: 90,
        minDurationSec: 30,
        maxDurationSec: 180,
        minPersistedDurationSec: 10,
        maxPersistedDurationSec: 3600,
        minRemainingBudgetMs: 1000,
        minTotalTimeDeltaMs: -240000,
        maxTotalTimeDeltaMs: 720000,
      },
      scoring: {
        correctBasePoints: 98,
        wrongBasePenalty: 52,
        wrongDifficultyPenaltyMultiplier: 2.2,
        wrongStreakPenaltyPer: 3,
        wrongStreakPenaltyCap: 45,
        correctDifficultyBonusPerLevel: 9,
        correctStreakBonusPer: 13,
        correctStreakBonusCap: 180,
        relationStrengthBonusScale: 0,
        speedTier1MaxResponseMs: 850,
        speedTier2MaxResponseMs: 1400,
        speedTier3MaxResponseMs: 2100,
        speedTier4MaxResponseMs: 3000,
        speedTier1Points: 68,
        speedTier2Points: 49,
        speedTier3Points: 31,
        speedTier4Points: 14,
        speedFallbackPoints: 0,
      },
      timeDelta: {
        wrongPenaltyMs: 3000,
        correctBaseBonusMs: 450,
        speedTier1MaxResponseMs: 900,
        speedTier2MaxResponseMs: 1500,
        speedTier3MaxResponseMs: 2300,
        speedTier4MaxResponseMs: 3200,
        speedTier1BonusMs: 860,
        speedTier2BonusMs: 600,
        speedTier3BonusMs: 390,
        speedTier4BonusMs: 180,
        speedFallbackBonusMs: 40,
        difficultyBonusPerLevelMs: 38,
        streakBonusPerMs: 36,
        streakBonusCapMs: 560,
        relationStrengthBonusScaleMs: 0,
        maxCorrectBonusMs: 3200,
      },
      adaptive: {
        correctStreakThreshold1: 3,
        correctStreakBoost1: 1,
        correctStreakThreshold2: 7,
        correctStreakBoost2: 1,
        correctFastResponseThresholdMs: 1400,
        correctFastResponseBoost: 1,
        wrongBasePenalty: -1,
        wrongLowAccuracyThreshold: 0.5,
        wrongLowAccuracyPenalty: -1,
        highAccuracyThreshold: 0.84,
        highAccuracyBoost: 1,
        lowAccuracyThreshold: 0.4,
        lowAccuracyPenalty: -1,
        modeFastResponseThresholdMs: 900,
        modeFastResponseBoost: 1,
        minTargetDifficulty: 1,
        maxTargetDifficulty: 10,
      },
      recallGameplay: createDefaultRecallGameplayTuning(),
    };
  }

  if (mode === 'diction') {
    return {
      timer: {
        defaultDurationSec: 90,
        minDurationSec: 30,
        maxDurationSec: 180,
        minPersistedDurationSec: 10,
        maxPersistedDurationSec: 3600,
        minRemainingBudgetMs: 1000,
        minTotalTimeDeltaMs: -240000,
        maxTotalTimeDeltaMs: 720000,
      },
      scoring: {
        correctBasePoints: 94,
        wrongBasePenalty: 48,
        wrongDifficultyPenaltyMultiplier: 2.2,
        wrongStreakPenaltyPer: 3,
        wrongStreakPenaltyCap: 45,
        correctDifficultyBonusPerLevel: 8,
        correctStreakBonusPer: 13,
        correctStreakBonusCap: 180,
        relationStrengthBonusScale: 0,
        speedTier1MaxResponseMs: 850,
        speedTier2MaxResponseMs: 1400,
        speedTier3MaxResponseMs: 2100,
        speedTier4MaxResponseMs: 3000,
        speedTier1Points: 66,
        speedTier2Points: 47,
        speedTier3Points: 29,
        speedTier4Points: 12,
        speedFallbackPoints: 0,
      },
      timeDelta: {
        wrongPenaltyMs: 2800,
        correctBaseBonusMs: 420,
        speedTier1MaxResponseMs: 900,
        speedTier2MaxResponseMs: 1500,
        speedTier3MaxResponseMs: 2300,
        speedTier4MaxResponseMs: 3200,
        speedTier1BonusMs: 860,
        speedTier2BonusMs: 600,
        speedTier3BonusMs: 390,
        speedTier4BonusMs: 180,
        speedFallbackBonusMs: 40,
        difficultyBonusPerLevelMs: 34,
        streakBonusPerMs: 34,
        streakBonusCapMs: 560,
        relationStrengthBonusScaleMs: 0,
        maxCorrectBonusMs: 3200,
      },
      adaptive: {
        correctStreakThreshold1: 3,
        correctStreakBoost1: 1,
        correctStreakThreshold2: 7,
        correctStreakBoost2: 1,
        correctFastResponseThresholdMs: 1400,
        correctFastResponseBoost: 1,
        wrongBasePenalty: -1,
        wrongLowAccuracyThreshold: 0.5,
        wrongLowAccuracyPenalty: -1,
        highAccuracyThreshold: 0.84,
        highAccuracyBoost: 1,
        lowAccuracyThreshold: 0.4,
        lowAccuracyPenalty: -1,
        modeFastResponseThresholdMs: 1100,
        modeFastResponseBoost: 1,
        minTargetDifficulty: 1,
        maxTargetDifficulty: 10,
      },
      recallGameplay: createDefaultRecallGameplayTuning(),
    };
  }

  return {
    timer: {
      defaultDurationSec: 90,
      minDurationSec: 30,
      maxDurationSec: 180,
      minPersistedDurationSec: 10,
      maxPersistedDurationSec: 3600,
      minRemainingBudgetMs: 1000,
      minTotalTimeDeltaMs: -240000,
      maxTotalTimeDeltaMs: 720000,
    },
    scoring: {
      correctBasePoints: 88,
      wrongBasePenalty: 44,
      wrongDifficultyPenaltyMultiplier: 2.4,
      wrongStreakPenaltyPer: 3,
      wrongStreakPenaltyCap: 45,
      correctDifficultyBonusPerLevel: 9,
      correctStreakBonusPer: 14,
      correctStreakBonusCap: 180,
      relationStrengthBonusScale: 0,
      speedTier1MaxResponseMs: 850,
      speedTier2MaxResponseMs: 1400,
      speedTier3MaxResponseMs: 2100,
      speedTier4MaxResponseMs: 3000,
      speedTier1Points: 58,
      speedTier2Points: 41,
      speedTier3Points: 25,
      speedTier4Points: 10,
      speedFallbackPoints: 0,
    },
    timeDelta: {
      wrongPenaltyMs: 2600,
      correctBaseBonusMs: 340,
      speedTier1MaxResponseMs: 900,
      speedTier2MaxResponseMs: 1500,
      speedTier3MaxResponseMs: 2300,
      speedTier4MaxResponseMs: 3200,
      speedTier1BonusMs: 860,
      speedTier2BonusMs: 600,
      speedTier3BonusMs: 390,
      speedTier4BonusMs: 180,
      speedFallbackBonusMs: 40,
      difficultyBonusPerLevelMs: 29,
      streakBonusPerMs: 30,
      streakBonusCapMs: 560,
      relationStrengthBonusScaleMs: 0,
      maxCorrectBonusMs: 3200,
    },
    adaptive: {
      correctStreakThreshold1: 3,
      correctStreakBoost1: 1,
      correctStreakThreshold2: 7,
      correctStreakBoost2: 1,
      correctFastResponseThresholdMs: 1400,
      correctFastResponseBoost: 1,
      wrongBasePenalty: -1,
      wrongLowAccuracyThreshold: 0.5,
      wrongLowAccuracyPenalty: -1,
      highAccuracyThreshold: 0.84,
      highAccuracyBoost: 1,
      lowAccuracyThreshold: 0.4,
      lowAccuracyPenalty: -1,
      modeFastResponseThresholdMs: 900,
      modeFastResponseBoost: 0,
      minTargetDifficulty: 1,
      maxTargetDifficulty: 10,
    },
    recallGameplay: createDefaultRecallGameplayTuning(),
  };
}

export var DEFAULT_VOCAB_GAME_TUNING: VocabGameTuning = {
  modes: {
    association: createDefaultModeTuning('association'),
    agility: createDefaultModeTuning('agility'),
    context: createDefaultModeTuning('context'),
    recall: createDefaultModeTuning('recall'),
    diction: createDefaultModeTuning('diction'),
  },
};

function cloneVocabGameTuning(value: VocabGameTuning): VocabGameTuning {
  return JSON.parse(JSON.stringify(value));
}

function normalizeModeTuning(value: any, fallback: VocabModeTuning): VocabModeTuning {
  var source = toConfigObject(value);
  return {
    timer: normalizeModeTimerTuning(source.timer, fallback.timer),
    scoring: normalizeModeScoringTuning(source.scoring, fallback.scoring),
    timeDelta: normalizeModeTimeDeltaTuning(source.timeDelta, fallback.timeDelta),
    adaptive: normalizeModeAdaptiveTuning(source.adaptive, fallback.adaptive),
    recallGameplay: normalizeModeRecallGameplayTuning(source.recallGameplay, fallback.recallGameplay),
  };
}

export function normalizeVocabGameTuning(value: any, fallback?: VocabGameTuning): VocabGameTuning {
  var fallbackValue = cloneVocabGameTuning(fallback || DEFAULT_VOCAB_GAME_TUNING);
  var source = toConfigObject(value);
  var directModes = toConfigObject(source.modes);
  var modeRoot = Object.keys(directModes).length > 0 ? directModes : source;

  return {
    modes: {
      association: normalizeModeTuning(modeRoot.association, fallbackValue.modes.association),
      agility: normalizeModeTuning(modeRoot.agility, fallbackValue.modes.agility),
      context: normalizeModeTuning(modeRoot.context, fallbackValue.modes.context),
      recall: normalizeModeTuning(modeRoot.recall, fallbackValue.modes.recall),
      diction: normalizeModeTuning(modeRoot.diction, fallbackValue.modes.diction),
    },
  };
}

export function getVocabGameTuning(nk: nkruntime.Nakama, logger: nkruntime.Logger): VocabGameTuning {
  var raw = getDbConfig<any>(nk, logger, 'vocab_game_tuning', DEFAULT_VOCAB_GAME_TUNING);
  return normalizeVocabGameTuning(raw, DEFAULT_VOCAB_GAME_TUNING);
}

export function getVocabModeTuning(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  mode: VocabGameMode
): VocabModeTuning {
  var tuning = getVocabGameTuning(nk, logger);
  return tuning.modes[mode];
}

export function getMmrFloor(nk: nkruntime.Nakama, logger: nkruntime.Logger): number {
  var value = getDbConfig(nk, logger, 'mmr_floor', 0);
  var parsed = typeof value === 'number' ? value : parseInt(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function getMmrCeiling(nk: nkruntime.Nakama, logger: nkruntime.Logger): number {
  var value = getDbConfig(nk, logger, 'mmr_ceiling', 10000);
  var parsed = typeof value === 'number' ? value : parseInt(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
}

export function clampMmr(nk: nkruntime.Nakama, logger: nkruntime.Logger, mmr: number): number {
  var floor = getMmrFloor(nk, logger);
  var ceiling = getMmrCeiling(nk, logger);
  if (!Number.isFinite(mmr)) {
    return floor;
  }
  if (ceiling < floor) {
    ceiling = floor;
  }
  return Math.min(ceiling, Math.max(floor, mmr));
}

export function getDefaultCategoryKey(nk: nkruntime.Nakama, logger: nkruntime.Logger): string {
  var categories = getCategoriesFromDb(nk, logger);
  for (var key in categories) {
    return key;
  }
  return '';
}

// ============================================================================
// CATEGORIES - Load categories from database
// NOTE: Uses a small in-memory cache to reduce DB load
// ============================================================================

export var CATEGORIES_CACHE_STORE: {cache: {value: {[key: string]: any} | null, expiresAt: number}} = {
  cache: { value: null, expiresAt: 0 },
};
export var CATEGORIES_CACHE_TTL_MS = 60000;

export function getCategoriesCache(): {value: {[key: string]: any} | null, expiresAt: number} {
  if (!CATEGORIES_CACHE_STORE.cache) {
    CATEGORIES_CACHE_STORE.cache = { value: null, expiresAt: 0 };
  }
  return CATEGORIES_CACHE_STORE.cache;
}

export function getCategoriesFromDb(nk: nkruntime.Nakama, logger: nkruntime.Logger): {[key: string]: any} {
  var cache = getCategoriesCache();
  var now = Date.now();
  if (cache.value && cache.expiresAt > now) {
    return cache.value;
  }

  try {
    var result = nk.sqlQuery(`SELECT * FROM categories WHERE is_active = true ORDER BY display_order ASC`);
    var rows = Array.isArray(result) ? result : [];
    var categories: {[key: string]: any} = {};
    var questionCountDefaults = getQuestionCountDefaults(nk, logger);
    var questionCountCaps = getQuestionCountCaps(nk, logger);

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var categoryType = normalizeCategoryType(row.category_type);
      var categoryCap = categoryType === 'vocabulary'
        ? questionCountCaps.vocabularyMax
        : questionCountCaps.normalMax;
      var typeDefault = categoryType === 'vocabulary'
        ? questionCountDefaults.vocabularyDefault
        : questionCountDefaults.normalDefault;
      var parsedQuestionOverride: number | null = null;
      if (row.questions_per_match !== undefined && row.questions_per_match !== null) {
        var parsedRawOverride = parseInt(String(row.questions_per_match), 10);
        if (Number.isFinite(parsedRawOverride) && parsedRawOverride > 0) {
          parsedQuestionOverride = Math.floor(parsedRawOverride);
        }
      }
      var effectiveQuestionsPerMatch = clampWholeNumber(
        parsedQuestionOverride !== null ? parsedQuestionOverride : typeDefault,
        typeDefault,
        1,
        categoryCap
      );
      categories[row.category_key] = {
        id: row.id,
        categoryKey: row.category_key,
        name: row.name,
        description: row.description || '',
        icon: row.icon || '',
        iconUrl: row.icon_url || '',
        parentId: row.parent_id,
        categoryType: categoryType,
        isActive: row.is_active,
        minQuestionsRequired: row.min_questions_required || 10,
        questionsPerMatch: effectiveQuestionsPerMatch,
        questionsPerMatchOverride: parsedQuestionOverride,
        useGlobalQuestionCount: parsedQuestionOverride === null,
        timePerQuestion: row.time_per_question || 15,
        displayOrder: row.display_order || 0,
      };
    }

    cache.value = categories;
    cache.expiresAt = now + CATEGORIES_CACHE_TTL_MS;
    return categories;
  } catch (err) {
    logger.warn('Failed to load categories from database: ' + err);
    // Return empty object - categories must be created via admin dashboard
    return {};
  }
}

export function invalidateCategoriesCache(): void {
  CATEGORIES_CACHE_STORE.cache.value = null;
  CATEGORIES_CACHE_STORE.cache.expiresAt = 0;
}

export function isValidCategoryFromDb(nk: nkruntime.Nakama, logger: nkruntime.Logger, category: string): boolean {
  var categories = getCategoriesFromDb(nk, logger);
  return !!categories[category];
}

export function getPlayableCategoryKeys(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  categoryKeys: string[]
): string[] {
  var categories = getCategoriesFromDb(nk, logger);
  var seen: {[key: string]: boolean} = {};
  var normalizedKeys: string[] = [];

  for (var i = 0; i < categoryKeys.length; i++) {
    var key = String(categoryKeys[i] || '').trim().toLowerCase();
    if (!key || seen[key] || !categories[key]) continue;
    seen[key] = true;
    normalizedKeys.push(key);
  }
  if (normalizedKeys.length === 0) return [];

  var questionCounts: {[key: string]: number} = {};
  try {
    var result = nk.sqlQuery(
      `SELECT category, COUNT(*)::int AS question_count
       FROM questions
       WHERE is_active = true
         AND category = ANY($1::text[])
       GROUP BY category`,
      [normalizedKeys]
    );
    var rows = Array.isArray(result) ? result : [];
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      var row = rows[rowIndex];
      var rowKey = String(row.category || '').trim().toLowerCase();
      var count = parseInt(String(row.question_count || row.count || 0), 10);
      if (rowKey && Number.isFinite(count)) {
        questionCounts[rowKey] = count;
      }
    }
  } catch (error) {
    logger.error('Failed to load category question availability: ' + error);
    return [];
  }

  var playable: string[] = [];
  for (var keyIndex = 0; keyIndex < normalizedKeys.length; keyIndex++) {
    var categoryKey = normalizedKeys[keyIndex];
    var configuredQuestionCount = Number(categories[categoryKey].questionsPerMatch);
    var required = Number.isFinite(configuredQuestionCount) && configuredQuestionCount > 0
      ? Math.floor(configuredQuestionCount)
      : 1;
    var available = questionCounts[categoryKey] || 0;
    if (available >= required) {
      playable.push(categoryKey);
    } else {
      logger.warn(
        'Excluding underfilled category from match selection'
        + ' (category=' + categoryKey
        + ', available=' + available
        + ', required=' + required
        + ')'
      );
    }
  }
  return playable;
}

export function getCategoryTypeByKey(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  categoryKey: string
): CategoryType {
  var normalizedKey = String(categoryKey || '').trim();
  if (!normalizedKey) {
    return 'normal';
  }
  var categories = getCategoriesFromDb(nk, logger);
  var category = categories[normalizedKey];
  return category ? normalizeCategoryType(category.categoryType) : 'normal';
}

// ============================================================================
// RANK TIERS - Load rank tiers from database
// NOTE: Uses a small in-memory cache to reduce DB load
// ============================================================================

export var RANK_TIERS_CACHE_STORE: {cache: {value: any[] | null, expiresAt: number}} = {
  cache: { value: null, expiresAt: 0 },
};
export var RANK_TIERS_CACHE_TTL_MS = 60000;

export function getRankTiersCache(): {value: any[] | null, expiresAt: number} {
  return RANK_TIERS_CACHE_STORE.cache;
}

export function invalidateRankTiersCache(): void {
  RANK_TIERS_CACHE_STORE.cache.value = null;
  RANK_TIERS_CACHE_STORE.cache.expiresAt = 0;
}

export function getRankTiersFromDb(nk: nkruntime.Nakama, logger: nkruntime.Logger): any[] {
  var cache = getRankTiersCache();
  var now = Date.now();
  if (cache.value && cache.expiresAt > now) {
    return cache.value;
  }

  try {
    var result = nk.sqlQuery(`SELECT * FROM rank_tiers WHERE is_active = true ORDER BY display_order ASC`);
    var rows = Array.isArray(result) ? result : [];
    var tiers: any[] = [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      tiers.push({
        id: row.id,
        tierKey: row.tier_key,
        name: row.name,
        minMmr: row.min_mmr,
        maxMmr: row.max_mmr,
        iconUrl: row.icon_url || '',
        color: row.color || '',
        displayOrder: row.display_order || 0,
        isActive: row.is_active,
      });
    }

    cache.value = tiers;
    cache.expiresAt = now + RANK_TIERS_CACHE_TTL_MS;
    return tiers;
  } catch (err) {
    logger.warn('Failed to load rank tiers from database, using hardcoded fallback: ' + err);
    // Fallback to hardcoded RANK_TIERS if database fails
    var fallback: any[] = [];
    var order = 1;
    for (var tierKey in RANK_TIERS) {
      fallback.push({
        id: tierKey,
        tierKey: tierKey,
        name: RANK_TIERS[tierKey].name,
        minMmr: RANK_TIERS[tierKey].min,
        maxMmr: RANK_TIERS[tierKey].max,
        displayOrder: order++,
        isActive: true,
      });
    }
    return fallback;
  }
}


export function getRankTierForMmr(nk: nkruntime.Nakama, logger: nkruntime.Logger, mmr: number): any {
  var tiers = getRankTiersFromDb(nk, logger);
  var bestLower: any = null;
  var lowest: any = null;
  for (var i = 0; i < tiers.length; i++) {
    var tier = tiers[i];
    if (!lowest || tier.minMmr < lowest.minMmr) {
      lowest = tier;
    }
    if (mmr >= tier.minMmr && mmr <= tier.maxMmr) {
      return tier;
    }
    if (mmr >= tier.minMmr && (!bestLower || tier.minMmr > bestLower.minMmr)) {
      bestLower = tier;
    }
  }
  if (bestLower) {
    return bestLower;
  }
  return lowest || { tierKey: 'bronze', name: 'Bronze', minMmr: 0, maxMmr: 1099 };
}

// Helper to get specific config values with proper types
export function getQuestionsPerMatch(nk: nkruntime.Nakama, logger: nkruntime.Logger): number {
  return getQuestionsPerMatchByCategoryType(nk, logger, 'normal');
}

export function getQuestionCountDefaults(nk: nkruntime.Nakama, logger: nkruntime.Logger): QuestionCountDefaults {
  var counts = getDbConfig(nk, logger, 'question_counts', { default: GAME_CONFIG.QUESTIONS_PER_MATCH });
  var caps = getQuestionCountCaps(nk, logger);
  var fallbackDefault = getQuestionCountConfigValue(counts, 'default', GAME_CONFIG.QUESTIONS_PER_MATCH);
  var normalDefault = getQuestionCountConfigValue(counts, 'default_normal', fallbackDefault);
  // Legacy configs might only contain "default"; keep vocabulary independent in that case.
  var vocabularyDefaultFallback = clampWholeNumber(
    DEFAULT_VOCABULARY_QUESTION_CAP,
    DEFAULT_VOCABULARY_QUESTION_CAP,
    1,
    caps.vocabularyMax
  );
  var vocabularyDefault = getQuestionCountConfigValue(
    counts,
    'default_vocabulary',
    vocabularyDefaultFallback
  );

  return {
    normalDefault: clampWholeNumber(normalDefault, fallbackDefault, 1, caps.normalMax),
    vocabularyDefault: clampWholeNumber(vocabularyDefault, vocabularyDefaultFallback, 1, caps.vocabularyMax),
  };
}

export function getQuestionsPerMatchByCategoryType(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  categoryType: CategoryType
): number {
  var defaults = getQuestionCountDefaults(nk, logger);
  return categoryType === 'vocabulary' ? defaults.vocabularyDefault : defaults.normalDefault;
}

export function getQuestionsPerMatchForCategory(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  categoryKey: string
): number {
  var normalizedKey = String(categoryKey || '').trim();
  var resolvedType = getCategoryTypeByKey(nk, logger, normalizedKey);
  var caps = getQuestionCountCaps(nk, logger);
  var categoryCap = resolvedType === 'vocabulary' ? caps.vocabularyMax : caps.normalMax;
  var fallbackByType = getQuestionsPerMatchByCategoryType(nk, logger, resolvedType);
  if (!normalizedKey) {
    return clampWholeNumber(fallbackByType, fallbackByType, 1, categoryCap);
  }

  var categories = getCategoriesFromDb(nk, logger);
  var category = categories[normalizedKey];
  if (!category) {
    return clampWholeNumber(fallbackByType, fallbackByType, 1, categoryCap);
  }

  var value = category.questionsPerMatch;
  return clampWholeNumber(value, fallbackByType, 1, categoryCap);
}

export function getQuestionCountCaps(nk: nkruntime.Nakama, logger: nkruntime.Logger): QuestionCountCaps {
  var counts = getDbConfig(nk, logger, 'question_counts', { default: GAME_CONFIG.QUESTIONS_PER_MATCH });
  var normalMax = getQuestionCountConfigValue(counts, 'max_normal', DEFAULT_NORMAL_QUESTION_CAP);
  var vocabularyMax = getQuestionCountConfigValue(counts, 'max_vocabulary', DEFAULT_VOCABULARY_QUESTION_CAP);

  return {
    normalMax: clampWholeNumber(normalMax, DEFAULT_NORMAL_QUESTION_CAP, 1, SYSTEM_HARD_QUESTION_CAP),
    vocabularyMax: clampWholeNumber(vocabularyMax, DEFAULT_VOCABULARY_QUESTION_CAP, 1, SYSTEM_HARD_QUESTION_CAP),
    systemHardMax: SYSTEM_HARD_QUESTION_CAP,
  };
}

export function getTimePerQuestionMs(nk: nkruntime.Nakama, logger: nkruntime.Logger): number {
  var value = getDbConfig(nk, logger, 'time_per_question_ms', GAME_CONFIG.TIME_PER_QUESTION_MS);
  logger.debug('getTimePerQuestionMs: raw value=' + JSON.stringify(value) + ', type=' + typeof value);
  var parsed = typeof value === 'number' ? value : parseInt(String(value));
  logger.debug('getTimePerQuestionMs: parsed=' + parsed);
  // Enforce minimum 5 seconds (5000ms), fallback to default if invalid
  if (!parsed || parsed < 5000) {
    logger.debug('getTimePerQuestionMs: using default ' + GAME_CONFIG.TIME_PER_QUESTION_MS);
    return GAME_CONFIG.TIME_PER_QUESTION_MS;
  }
  return parsed;
}

export function getMatchmakingTimeoutMs(nk: nkruntime.Nakama, logger: nkruntime.Logger): number {
  var value = getDbConfig(nk, logger, 'matchmaking_timeout_ms', 30000);
  return typeof value === 'number' ? value : parseInt(String(value)) || 30000;
}

export function getMatchmakingMmrTolerance(nk: nkruntime.Nakama, logger: nkruntime.Logger): number {
  var value = getDbConfig(nk, logger, 'matchmaking_mmr_tolerance', 100);
  var parsed = typeof value === 'number' ? value : parseInt(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
}

export function isBotEnabled(nk: nkruntime.Nakama, logger: nkruntime.Logger): boolean {
  var value = getDbConfig(nk, logger, 'bot_enabled', true);
  return value === true || value === 'true';
}

export function getTelegramBotToken(ctx: nkruntime.Context, nk: nkruntime.Nakama, logger: nkruntime.Logger): string {
  // First check DB config (allows runtime updates)
  var dbToken = getDbConfig(nk, logger, 'telegram_bot_token', '');
  if (dbToken && typeof dbToken === 'string' && dbToken.length > 10) {
    return dbToken;
  }

  // Fall back to environment variable
  var envToken = ctx.env['TELEGRAM_BOT_TOKEN'] || TELEGRAM_BOT_TOKEN;
  return envToken || '';
}

// ============================================================================
