import { getDbConfig } from './config';

export interface TournamentBotDifficultyProfile {
  baseAccuracy: number;
  minAccuracy: number;
  maxAccuracy: number;
  roundAccuracyBonus: number;
  minDelayMs: number;
  maxDelayMs: number;
  roundDelayReductionMs: number;
  nearMissChance: number;
}

export interface TournamentBotPolicy {
  enabled: boolean;
  fillOnStart: boolean;
  replaceMissingBeforeMatch: boolean;
  botMmr: number;
  rewardCoinMultiplier: number;
  skipMmrBonusWhenBotInfluenced: boolean;
  difficulty: TournamentBotDifficultyProfile;
}

export interface TournamentBotProfile {
  id: string;
  bot_key: string;
  display_name: string;
}

export interface TournamentMatchBotReconciliation {
  replacedCount: number;
  player1IsBot: boolean;
  player2IsBot: boolean;
  player1ParticipantId: string | null;
  player2ParticipantId: string | null;
  matchStatus: string;
  policy: TournamentBotPolicy;
}

export interface TournamentParticipantReplacementResult {
  replaced: boolean;
  wasInProgress: boolean;
  matchId: string | null;
  botParticipantId: string | null;
}

export var DEFAULT_TOURNAMENT_BOT_DIFFICULTY: TournamentBotDifficultyProfile = {
  baseAccuracy: 0.9,
  minAccuracy: 0.72,
  maxAccuracy: 0.985,
  roundAccuracyBonus: 0.012,
  minDelayMs: 900,
  maxDelayMs: 2800,
  roundDelayReductionMs: 110,
  nearMissChance: 0.72,
};

export var DEFAULT_TOURNAMENT_BOT_POLICY: TournamentBotPolicy = {
  enabled: true,
  fillOnStart: true,
  replaceMissingBeforeMatch: true,
  botMmr: 1850,
  rewardCoinMultiplier: 1,
  skipMmrBonusWhenBotInfluenced: true,
  difficulty: DEFAULT_TOURNAMENT_BOT_DIFFICULTY,
};

function parseBoolean(value: any, fallback: boolean): boolean {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 't') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'f') {
    return false;
  }
  return fallback;
}

function clampNumber(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) return minValue;
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function parseNumber(value: any, fallback: number, minValue: number, maxValue: number): number {
  var num = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(num)) {
    num = fallback;
  }
  return clampNumber(num, minValue, maxValue);
}

function parseIntNumber(value: any, fallback: number, minValue: number, maxValue: number): number {
  var num = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(num)) {
    num = fallback;
  }
  num = Math.floor(num);
  return clampNumber(num, minValue, maxValue);
}

function parseJsonLike(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (Array.isArray(value)) {
    try {
      var byteString = '';
      for (var i = 0; i < value.length; i++) {
        byteString += String.fromCharCode(value[i]);
      }
      return JSON.parse(byteString);
    } catch (_e) {
      return null;
    }
  }
  if (typeof value === 'string') {
    var trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (_parseError) {
      return null;
    }
  }
  return null;
}

function clonePolicy(policy: TournamentBotPolicy): TournamentBotPolicy {
  return {
    enabled: !!policy.enabled,
    fillOnStart: !!policy.fillOnStart,
    replaceMissingBeforeMatch: !!policy.replaceMissingBeforeMatch,
    botMmr: policy.botMmr,
    rewardCoinMultiplier: policy.rewardCoinMultiplier,
    skipMmrBonusWhenBotInfluenced: !!policy.skipMmrBonusWhenBotInfluenced,
    difficulty: {
      baseAccuracy: policy.difficulty.baseAccuracy,
      minAccuracy: policy.difficulty.minAccuracy,
      maxAccuracy: policy.difficulty.maxAccuracy,
      roundAccuracyBonus: policy.difficulty.roundAccuracyBonus,
      minDelayMs: policy.difficulty.minDelayMs,
      maxDelayMs: policy.difficulty.maxDelayMs,
      roundDelayReductionMs: policy.difficulty.roundDelayReductionMs,
      nearMissChance: policy.difficulty.nearMissChance,
    },
  };
}

export function normalizeTournamentBotDifficultyProfile(
  input: any,
  fallback?: TournamentBotDifficultyProfile
): TournamentBotDifficultyProfile {
  var base = fallback || DEFAULT_TOURNAMENT_BOT_DIFFICULTY;
  var parsed = parseJsonLike(input);
  var obj = parsed && typeof parsed === 'object' ? parsed : {};

  return {
    baseAccuracy: parseNumber(obj.baseAccuracy, base.baseAccuracy, 0.1, 0.999),
    minAccuracy: parseNumber(obj.minAccuracy, base.minAccuracy, 0.05, 0.995),
    maxAccuracy: parseNumber(obj.maxAccuracy, base.maxAccuracy, 0.1, 0.999),
    roundAccuracyBonus: parseNumber(obj.roundAccuracyBonus, base.roundAccuracyBonus, 0, 0.1),
    minDelayMs: parseIntNumber(obj.minDelayMs, base.minDelayMs, 250, 30000),
    maxDelayMs: parseIntNumber(obj.maxDelayMs, base.maxDelayMs, 300, 60000),
    roundDelayReductionMs: parseIntNumber(obj.roundDelayReductionMs, base.roundDelayReductionMs, 0, 5000),
    nearMissChance: parseNumber(obj.nearMissChance, base.nearMissChance, 0, 1),
  };
}

export function normalizeTournamentBotPolicy(input: any, fallback?: TournamentBotPolicy): TournamentBotPolicy {
  var base = clonePolicy(fallback || DEFAULT_TOURNAMENT_BOT_POLICY);
  var parsed = parseJsonLike(input);
  var obj = parsed && typeof parsed === 'object' ? parsed : {};

  var difficultyRaw = null;
  if (Object.prototype.hasOwnProperty.call(obj, 'difficulty')) {
    difficultyRaw = obj.difficulty;
  } else if (Object.prototype.hasOwnProperty.call(obj, 'difficultyProfile')) {
    difficultyRaw = obj.difficultyProfile;
  } else if (Object.prototype.hasOwnProperty.call(obj, 'difficulty_profile')) {
    difficultyRaw = obj.difficulty_profile;
  }

  base.enabled = parseBoolean(obj.enabled, base.enabled);
  base.fillOnStart = parseBoolean(
    obj.fillOnStart !== undefined ? obj.fillOnStart : obj.fill_on_start,
    base.fillOnStart
  );
  base.replaceMissingBeforeMatch = parseBoolean(
    obj.replaceMissingBeforeMatch !== undefined ? obj.replaceMissingBeforeMatch : obj.replace_missing_before_match,
    base.replaceMissingBeforeMatch
  );
  base.botMmr = parseIntNumber(obj.botMmr !== undefined ? obj.botMmr : obj.bot_mmr, base.botMmr, 0, 10000);
  base.rewardCoinMultiplier = parseNumber(
    obj.rewardCoinMultiplier !== undefined ? obj.rewardCoinMultiplier : obj.reward_coin_multiplier,
    base.rewardCoinMultiplier,
    0,
    1
  );
  base.skipMmrBonusWhenBotInfluenced = parseBoolean(
    obj.skipMmrBonusWhenBotInfluenced !== undefined
      ? obj.skipMmrBonusWhenBotInfluenced
      : obj.skip_mmr_bonus_when_bot_influenced,
    base.skipMmrBonusWhenBotInfluenced
  );

  if (difficultyRaw !== null) {
    base.difficulty = normalizeTournamentBotDifficultyProfile(difficultyRaw, base.difficulty);
  }

  if (base.difficulty.minAccuracy > base.difficulty.maxAccuracy) {
    var swap = base.difficulty.minAccuracy;
    base.difficulty.minAccuracy = base.difficulty.maxAccuracy;
    base.difficulty.maxAccuracy = swap;
  }
  if (base.difficulty.baseAccuracy < base.difficulty.minAccuracy) {
    base.difficulty.baseAccuracy = base.difficulty.minAccuracy;
  }
  if (base.difficulty.baseAccuracy > base.difficulty.maxAccuracy) {
    base.difficulty.baseAccuracy = base.difficulty.maxAccuracy;
  }
  if (base.difficulty.maxDelayMs < base.difficulty.minDelayMs) {
    var delaySwap = base.difficulty.minDelayMs;
    base.difficulty.minDelayMs = base.difficulty.maxDelayMs;
    base.difficulty.maxDelayMs = delaySwap;
  }

  return base;
}

export function sanitizeTournamentBotPolicyOverride(input: any): any {
  var parsed = parseJsonLike(input);
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  var obj: any = parsed;
  var out: any = {};

  if (Object.prototype.hasOwnProperty.call(obj, 'enabled')) {
    out.enabled = parseBoolean(obj.enabled, DEFAULT_TOURNAMENT_BOT_POLICY.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'fillOnStart') || Object.prototype.hasOwnProperty.call(obj, 'fill_on_start')) {
    out.fillOnStart = parseBoolean(
      obj.fillOnStart !== undefined ? obj.fillOnStart : obj.fill_on_start,
      DEFAULT_TOURNAMENT_BOT_POLICY.fillOnStart
    );
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'replaceMissingBeforeMatch') || Object.prototype.hasOwnProperty.call(obj, 'replace_missing_before_match')) {
    out.replaceMissingBeforeMatch = parseBoolean(
      obj.replaceMissingBeforeMatch !== undefined ? obj.replaceMissingBeforeMatch : obj.replace_missing_before_match,
      DEFAULT_TOURNAMENT_BOT_POLICY.replaceMissingBeforeMatch
    );
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'botMmr') || Object.prototype.hasOwnProperty.call(obj, 'bot_mmr')) {
    out.botMmr = parseIntNumber(
      obj.botMmr !== undefined ? obj.botMmr : obj.bot_mmr,
      DEFAULT_TOURNAMENT_BOT_POLICY.botMmr,
      0,
      10000
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(obj, 'rewardCoinMultiplier') ||
    Object.prototype.hasOwnProperty.call(obj, 'reward_coin_multiplier')
  ) {
    out.rewardCoinMultiplier = parseNumber(
      obj.rewardCoinMultiplier !== undefined ? obj.rewardCoinMultiplier : obj.reward_coin_multiplier,
      DEFAULT_TOURNAMENT_BOT_POLICY.rewardCoinMultiplier,
      0,
      1
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(obj, 'skipMmrBonusWhenBotInfluenced') ||
    Object.prototype.hasOwnProperty.call(obj, 'skip_mmr_bonus_when_bot_influenced')
  ) {
    out.skipMmrBonusWhenBotInfluenced = parseBoolean(
      obj.skipMmrBonusWhenBotInfluenced !== undefined
        ? obj.skipMmrBonusWhenBotInfluenced
        : obj.skip_mmr_bonus_when_bot_influenced,
      DEFAULT_TOURNAMENT_BOT_POLICY.skipMmrBonusWhenBotInfluenced
    );
  }

  var difficultyInput = null;
  if (Object.prototype.hasOwnProperty.call(obj, 'difficulty')) {
    difficultyInput = obj.difficulty;
  } else if (Object.prototype.hasOwnProperty.call(obj, 'difficultyProfile')) {
    difficultyInput = obj.difficultyProfile;
  } else if (Object.prototype.hasOwnProperty.call(obj, 'difficulty_profile')) {
    difficultyInput = obj.difficulty_profile;
  }
  if (difficultyInput && typeof difficultyInput === 'object') {
    var difficultyOut: any = {};
    if (Object.prototype.hasOwnProperty.call(difficultyInput, 'baseAccuracy')) {
      difficultyOut.baseAccuracy = parseNumber(
        difficultyInput.baseAccuracy,
        DEFAULT_TOURNAMENT_BOT_DIFFICULTY.baseAccuracy,
        0.1,
        0.999
      );
    }
    if (Object.prototype.hasOwnProperty.call(difficultyInput, 'minAccuracy')) {
      difficultyOut.minAccuracy = parseNumber(
        difficultyInput.minAccuracy,
        DEFAULT_TOURNAMENT_BOT_DIFFICULTY.minAccuracy,
        0.05,
        0.995
      );
    }
    if (Object.prototype.hasOwnProperty.call(difficultyInput, 'maxAccuracy')) {
      difficultyOut.maxAccuracy = parseNumber(
        difficultyInput.maxAccuracy,
        DEFAULT_TOURNAMENT_BOT_DIFFICULTY.maxAccuracy,
        0.1,
        0.999
      );
    }
    if (Object.prototype.hasOwnProperty.call(difficultyInput, 'roundAccuracyBonus')) {
      difficultyOut.roundAccuracyBonus = parseNumber(
        difficultyInput.roundAccuracyBonus,
        DEFAULT_TOURNAMENT_BOT_DIFFICULTY.roundAccuracyBonus,
        0,
        0.1
      );
    }
    if (Object.prototype.hasOwnProperty.call(difficultyInput, 'minDelayMs')) {
      difficultyOut.minDelayMs = parseIntNumber(
        difficultyInput.minDelayMs,
        DEFAULT_TOURNAMENT_BOT_DIFFICULTY.minDelayMs,
        250,
        30000
      );
    }
    if (Object.prototype.hasOwnProperty.call(difficultyInput, 'maxDelayMs')) {
      difficultyOut.maxDelayMs = parseIntNumber(
        difficultyInput.maxDelayMs,
        DEFAULT_TOURNAMENT_BOT_DIFFICULTY.maxDelayMs,
        300,
        60000
      );
    }
    if (Object.prototype.hasOwnProperty.call(difficultyInput, 'roundDelayReductionMs')) {
      difficultyOut.roundDelayReductionMs = parseIntNumber(
        difficultyInput.roundDelayReductionMs,
        DEFAULT_TOURNAMENT_BOT_DIFFICULTY.roundDelayReductionMs,
        0,
        5000
      );
    }
    if (Object.prototype.hasOwnProperty.call(difficultyInput, 'nearMissChance')) {
      difficultyOut.nearMissChance = parseNumber(
        difficultyInput.nearMissChance,
        DEFAULT_TOURNAMENT_BOT_DIFFICULTY.nearMissChance,
        0,
        1
      );
    }
    if (Object.keys(difficultyOut).length > 0) {
      out.difficulty = difficultyOut;
    }
  }

  return out;
}

export function getGlobalTournamentBotPolicy(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): TournamentBotPolicy {
  var policyRaw = getDbConfig(nk, logger, 'bot_tournament_default_policy', {});
  var difficultyRaw = getDbConfig(nk, logger, 'bot_tournament_difficulty_profile', {});
  var policy = normalizeTournamentBotPolicy(policyRaw, DEFAULT_TOURNAMENT_BOT_POLICY);
  policy.difficulty = normalizeTournamentBotDifficultyProfile(difficultyRaw, policy.difficulty);
  return policy;
}

export function getTournamentBotPolicy(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  tournamentBotPolicyRaw?: any
): TournamentBotPolicy {
  var globalPolicy = getGlobalTournamentBotPolicy(nk, logger);
  var rawPolicy = tournamentBotPolicyRaw;

  if (rawPolicy === undefined) {
    try {
      var result = nk.sqlQuery(
        `SELECT bot_policy FROM tournaments WHERE id = $1`,
        [tournamentId]
      );
      var rows = Array.isArray(result) ? result : [];
      rawPolicy = rows.length > 0 ? rows[0].bot_policy : null;
    } catch (error) {
      logger.warn('Failed to load tournament bot policy for ' + tournamentId + ': ' + error);
      rawPolicy = null;
    }
  }

  return normalizeTournamentBotPolicy(rawPolicy, globalPolicy);
}

var DEFAULT_BOT_PROFILES: Array<{ key: string; name: string }> = [
  { key: 'atlas', name: 'Atlas Bot' },
  { key: 'nova', name: 'Nova Bot' },
  { key: 'orion', name: 'Orion Bot' },
  { key: 'quark', name: 'Quark Bot' },
  { key: 'zenith', name: 'Zenith Bot' },
  { key: 'lumen', name: 'Lumen Bot' },
  { key: 'cipher', name: 'Cipher Bot' },
  { key: 'vortex', name: 'Vortex Bot' },
];

var TOURNAMENT_BOT_FIRST_NAMES = [
  'Aiden', 'Amelia', 'Aria', 'Asher', 'Avery', 'Bella', 'Blake', 'Caleb',
  'Chloe', 'Clara', 'Cole', 'Connor', 'Daniel', 'Dylan', 'Eli', 'Ella',
  'Ethan', 'Eva', 'Evelyn', 'Felix', 'Finn', 'Gabriel', 'Grace', 'Hannah',
  'Harper', 'Hazel', 'Henry', 'Hudson', 'Isaac', 'Isla', 'Jack', 'Jade',
  'James', 'Jaxon', 'Joseph', 'Julia', 'Kai', 'Layla', 'Leah', 'Leo',
  'Levi', 'Liam', 'Lila', 'Lucas', 'Mason', 'Mia', 'Mila', 'Nora',
  'Noah', 'Nolan', 'Oliver', 'Olivia', 'Owen', 'Penelope', 'Riley', 'Ruby',
  'Ryan', 'Sadie', 'Samuel', 'Scarlett', 'Sebastian', 'Sofia', 'Stella', 'Theo',
  'Thomas', 'Violet', 'Wyatt', 'Zoe',
];

var TOURNAMENT_BOT_LAST_NAMES = [
  'Adams', 'Allen', 'Anderson', 'Baker', 'Barnes', 'Bennett', 'Brooks', 'Bryant',
  'Carter', 'Clark', 'Coleman', 'Collins', 'Cook', 'Cooper', 'Cruz', 'Davis',
  'Diaz', 'Edwards', 'Evans', 'Fisher', 'Foster', 'Garcia', 'Gomez', 'Gonzalez',
  'Gray', 'Green', 'Griffin', 'Hall', 'Harris', 'Hayes', 'Henderson', 'Hernandez',
  'Hill', 'Howard', 'Hughes', 'Jackson', 'James', 'Jenkins', 'Johnson', 'Jones',
  'Kelly', 'King', 'Lee', 'Lewis', 'Long', 'Lopez', 'Martin', 'Martinez',
  'Miller', 'Mitchell', 'Moore', 'Morgan', 'Morris', 'Murphy', 'Nelson', 'Parker',
  'Perez', 'Perry', 'Peterson', 'Phillips', 'Powell', 'Price', 'Ramirez', 'Reed',
  'Reyes', 'Richardson', 'Rivera', 'Roberts', 'Robinson', 'Rodriguez', 'Rogers', 'Ross',
  'Russell', 'Sanchez', 'Sanders', 'Scott', 'Simmons', 'Smith', 'Stewart', 'Taylor',
  'Thomas', 'Torres', 'Turner', 'Walker', 'Ward', 'Watson', 'White', 'Williams',
  'Wilson', 'Wright', 'Young',
];

function normalizeSeedPart(value: any): string {
  if (value === null || value === undefined) return '';
  var text = String(value).trim();
  return text;
}

function hashStringFNV1a(value: string): number {
  var hash = 0x811c9dc5;
  for (var i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickAliasPart(values: string[], seed: string, salt: string): string {
  if (!values.length) return '';
  var index = hashStringFNV1a(seed + '|' + salt) % values.length;
  return values[index];
}

export function getTournamentBotDisplayName(
  botProfileKey: any,
  participantId: any,
  profileDisplayName?: any
): string {
  var seedParts = [
    normalizeSeedPart(participantId),
    normalizeSeedPart(botProfileKey),
    normalizeSeedPart(profileDisplayName),
  ];
  var filtered: string[] = [];
  for (var i = 0; i < seedParts.length; i++) {
    if (seedParts[i]) filtered.push(seedParts[i]);
  }
  var seed = filtered.length > 0 ? filtered.join('|') : 'tournament-bot';

  var firstName = pickAliasPart(TOURNAMENT_BOT_FIRST_NAMES, seed, 'first');
  var lastName = pickAliasPart(TOURNAMENT_BOT_LAST_NAMES, seed, 'last');
  if (!firstName || !lastName) {
    return 'Tournament Player';
  }

  var style = hashStringFNV1a(seed + '|style') % 4;
  if (style === 0) {
    return firstName + ' ' + lastName;
  }

  var middleInitialCode = 65 + (hashStringFNV1a(seed + '|middle') % 26);
  var middleInitial = String.fromCharCode(middleInitialCode);
  return firstName + ' ' + middleInitial + '. ' + lastName;
}

export function seedTournamentBotProfiles(nk: nkruntime.Nakama, logger: nkruntime.Logger): void {
  for (var i = 0; i < DEFAULT_BOT_PROFILES.length; i++) {
    var profile = DEFAULT_BOT_PROFILES[i];
    try {
      nk.sqlExec(
        `INSERT INTO tournament_bot_profiles (bot_key, display_name, difficulty_overrides, is_active)
         VALUES ($1, $2, '{}'::jsonb, true)
         ON CONFLICT (bot_key) DO NOTHING`,
        [profile.key, profile.name]
      );
    } catch (error) {
      logger.warn('Failed to seed tournament bot profile [' + profile.key + ']: ' + error);
    }
  }
}

function getActiveTournamentBotProfiles(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): TournamentBotProfile[] {
  try {
    seedTournamentBotProfiles(nk, logger);
    var result = nk.sqlQuery(
      `SELECT id, bot_key, display_name
       FROM tournament_bot_profiles
       WHERE is_active = true
       ORDER BY bot_key ASC`
    );
    var rows = Array.isArray(result) ? result : [];
    var profiles: TournamentBotProfile[] = [];
    for (var i = 0; i < rows.length; i++) {
      profiles.push({
        id: rows[i].id,
        bot_key: rows[i].bot_key,
        display_name: rows[i].display_name,
      });
    }
    return profiles;
  } catch (error) {
    logger.error('Failed to load active tournament bot profiles: ' + error);
    return [];
  }
}

function createUsedSeedMap(
  nk: nkruntime.Nakama,
  tournamentId: string
): {[key: number]: boolean} {
  var used: {[key: number]: boolean} = {};
  var result = nk.sqlQuery(
    `SELECT seed_number
     FROM tournament_participants
     WHERE tournament_id = $1 AND seed_number IS NOT NULL`,
    [tournamentId]
  );
  var rows = Array.isArray(result) ? result : [];
  for (var i = 0; i < rows.length; i++) {
    var seedNumber = parseInt(rows[i].seed_number, 10);
    if (Number.isFinite(seedNumber) && seedNumber > 0) {
      used[seedNumber] = true;
    }
  }
  return used;
}

function pickBottomSeed(usedSeeds: {[key: number]: boolean}, bracketSize: number): number | null {
  for (var seed = bracketSize; seed >= 1; seed--) {
    if (!usedSeeds[seed]) {
      usedSeeds[seed] = true;
      return seed;
    }
  }
  return null;
}

function insertBotParticipant(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  policy: TournamentBotPolicy,
  seedNumber: number | null,
  status: string,
  profiles: TournamentBotProfile[],
  profileCursor: number
): { id: string | null; nextCursor: number } {
  if (!profiles.length) {
    return { id: null, nextCursor: profileCursor };
  }

  var profile = profiles[profileCursor % profiles.length];
  var nextCursor = profileCursor + 1;

  try {
    var result = nk.sqlQuery(
      `INSERT INTO tournament_participants
       (tournament_id, user_id, seed_number, mmr_at_registration, status, is_bot, bot_profile_id, bot_influenced)
       VALUES ($1, NULL, $2, $3, $4, true, $5, false)
       RETURNING id`,
      [tournamentId, seedNumber, policy.botMmr, status, profile.id]
    );
    var rows = Array.isArray(result) ? result : [];
    if (rows.length > 0) {
      return { id: rows[0].id, nextCursor: nextCursor };
    }
  } catch (error) {
    logger.error('Failed to insert tournament bot participant: ' + error);
  }

  return { id: null, nextCursor: nextCursor };
}

export function fillTournamentWithBots(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  bracketSize: number,
  policyOverride?: TournamentBotPolicy
): number {
  var policy = policyOverride || getTournamentBotPolicy(nk, logger, tournamentId);
  if (!policy.enabled || !policy.fillOnStart) {
    return 0;
  }

  if (!Number.isFinite(bracketSize) || bracketSize <= 0) {
    return 0;
  }

  // Keep fill eligibility aligned with bracket generation, which currently seeds
  // only participants in `registered` status.
  var countResult = nk.sqlQuery(
    `SELECT COUNT(*) as total_count
     FROM tournament_participants
     WHERE tournament_id = $1
       AND status = 'registered'`,
    [tournamentId]
  );
  var countRows = Array.isArray(countResult) ? countResult : [];
  var currentCount = countRows.length > 0 ? parseInt(countRows[0].total_count, 10) || 0 : 0;
  var missingCount = bracketSize - currentCount;
  if (missingCount <= 0) {
    return 0;
  }

  var profiles = getActiveTournamentBotProfiles(nk, logger);
  if (!profiles.length) {
    logger.warn('Tournament bot fill skipped: no active bot profiles available');
    return 0;
  }

  var usedSeeds = createUsedSeedMap(nk, tournamentId);
  var startOffset = Math.floor(Math.random() * profiles.length);
  var cursor = startOffset;
  var insertedCount = 0;

  for (var i = 0; i < missingCount; i++) {
    var seed = pickBottomSeed(usedSeeds, bracketSize);
    var inserted = insertBotParticipant(nk, logger, tournamentId, policy, seed, 'registered', profiles, cursor);
    cursor = inserted.nextCursor;
    if (inserted.id) {
      insertedCount++;
    }
  }

  if (insertedCount > 0) {
    logger.info(
      'Filled tournament ' + tournamentId + ' with ' + insertedCount + ' bot participants (missing slots)'
    );
  }

  return insertedCount;
}

function isInactiveStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === 'forfeited' || status === 'disqualified' || status === 'eliminated';
}

function parsePgBoolean(value: any): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

export function reconcileTournamentMatchBots(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentMatchId: string,
  policyOverride?: TournamentBotPolicy
): TournamentMatchBotReconciliation {
  var defaultPolicy = policyOverride || DEFAULT_TOURNAMENT_BOT_POLICY;
  var empty: TournamentMatchBotReconciliation = {
    replacedCount: 0,
    player1IsBot: false,
    player2IsBot: false,
    player1ParticipantId: null,
    player2ParticipantId: null,
    matchStatus: 'pending',
    policy: defaultPolicy,
  };

  var result = nk.sqlQuery(
    `SELECT tm.id, tm.tournament_id, tm.status,
            tm.player1_participant_id, tm.player2_participant_id,
            p1.user_id as player1_user_id, p2.user_id as player2_user_id,
            p1.status as player1_status, p2.status as player2_status,
            p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot,
            p1.seed_number as player1_seed, p2.seed_number as player2_seed,
            t.bot_policy, t.bracket_size
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
     LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
     WHERE tm.id = $1`,
    [tournamentMatchId]
  );
  var rows = Array.isArray(result) ? result : [];
  if (rows.length === 0) {
    return empty;
  }

  var row = rows[0];
  var policy = policyOverride || getTournamentBotPolicy(nk, logger, row.tournament_id, row.bot_policy);

  var player1IsBot = parsePgBoolean(row.player1_is_bot);
  var player2IsBot = parsePgBoolean(row.player2_is_bot);
  var player1ParticipantId = row.player1_participant_id || null;
  var player2ParticipantId = row.player2_participant_id || null;
  var matchStatus = row.status || 'pending';

  if (matchStatus !== 'pending' && matchStatus !== 'ready') {
    return {
      replacedCount: 0,
      player1IsBot: player1IsBot,
      player2IsBot: player2IsBot,
      player1ParticipantId: player1ParticipantId,
      player2ParticipantId: player2ParticipantId,
      matchStatus: matchStatus,
      policy: policy,
    };
  }

  if (!policy.enabled || !policy.replaceMissingBeforeMatch) {
    return {
      replacedCount: 0,
      player1IsBot: player1IsBot,
      player2IsBot: player2IsBot,
      player1ParticipantId: player1ParticipantId,
      player2ParticipantId: player2ParticipantId,
      matchStatus: matchStatus,
      policy: policy,
    };
  }

  var needsReplacePlayer1 =
    !player1ParticipantId ||
    (!player1IsBot && (!row.player1_user_id || isInactiveStatus(row.player1_status)));
  var needsReplacePlayer2 =
    !player2ParticipantId ||
    (!player2IsBot && (!row.player2_user_id || isInactiveStatus(row.player2_status)));

  if (!needsReplacePlayer1 && !needsReplacePlayer2) {
    return {
      replacedCount: 0,
      player1IsBot: player1IsBot,
      player2IsBot: player2IsBot,
      player1ParticipantId: player1ParticipantId,
      player2ParticipantId: player2ParticipantId,
      matchStatus: matchStatus,
      policy: policy,
    };
  }

  var profiles = getActiveTournamentBotProfiles(nk, logger);
  if (!profiles.length) {
    return {
      replacedCount: 0,
      player1IsBot: player1IsBot,
      player2IsBot: player2IsBot,
      player1ParticipantId: player1ParticipantId,
      player2ParticipantId: player2ParticipantId,
      matchStatus: matchStatus,
      policy: policy,
    };
  }

  var bracketSize = Number(row.bracket_size) || 0;
  var replacementSlotsNeeded = (needsReplacePlayer1 ? 1 : 0) + (needsReplacePlayer2 ? 1 : 0);
  if (bracketSize > 0 && replacementSlotsNeeded > 0) {
    var participantCountResult = nk.sqlQuery(
      `SELECT COUNT(*) as total_count
       FROM tournament_participants
       WHERE tournament_id = $1`,
      [row.tournament_id]
    );
    var participantCountRows = Array.isArray(participantCountResult) ? participantCountResult : [];
    var participantCount = participantCountRows.length > 0
      ? parseInt(participantCountRows[0].total_count, 10) || 0
      : 0;
    if (participantCount + replacementSlotsNeeded > bracketSize) {
      logger.warn(
        'Tournament bot replacement skipped for match ' + tournamentMatchId +
        ': bracket is at capacity (' + participantCount + '/' + bracketSize + ')'
      );
      return {
        replacedCount: 0,
        player1IsBot: player1IsBot,
        player2IsBot: player2IsBot,
        player1ParticipantId: player1ParticipantId,
        player2ParticipantId: player2ParticipantId,
        matchStatus: matchStatus,
        policy: policy,
      };
    }
  }

  var usedSeeds = createUsedSeedMap(nk, row.tournament_id);
  var cursor = Math.floor(Math.random() * profiles.length);
  var replacedCount = 0;
  var oldPlayer1ParticipantId = player1ParticipantId;
  var oldPlayer2ParticipantId = player2ParticipantId;

  if (needsReplacePlayer1) {
    var player1Seed = parseInt(row.player1_seed, 10);
    var selectedSeed1 = Number.isFinite(player1Seed) && player1Seed > 0
      ? player1Seed
      : pickBottomSeed(usedSeeds, bracketSize);
    if (Number.isFinite(player1Seed) && player1Seed > 0) {
      usedSeeds[player1Seed] = true;
    }
    var insertedP1 = insertBotParticipant(
      nk,
      logger,
      row.tournament_id,
      policy,
      selectedSeed1,
      'active',
      profiles,
      cursor
    );
    cursor = insertedP1.nextCursor;
    if (insertedP1.id) {
      player1ParticipantId = insertedP1.id;
      player1IsBot = true;
      replacedCount++;
    }
  }

  if (needsReplacePlayer2) {
    var player2Seed = parseInt(row.player2_seed, 10);
    var selectedSeed2 = Number.isFinite(player2Seed) && player2Seed > 0
      ? player2Seed
      : pickBottomSeed(usedSeeds, bracketSize);
    if (Number.isFinite(player2Seed) && player2Seed > 0) {
      usedSeeds[player2Seed] = true;
    }
    var insertedP2 = insertBotParticipant(
      nk,
      logger,
      row.tournament_id,
      policy,
      selectedSeed2,
      'active',
      profiles,
      cursor
    );
    cursor = insertedP2.nextCursor;
    if (insertedP2.id) {
      player2ParticipantId = insertedP2.id;
      player2IsBot = true;
      replacedCount++;
    }
  }

  if (replacedCount > 0) {
    var nextStatus = player1ParticipantId && player2ParticipantId ? 'ready' : 'pending';
    nk.sqlExec(
      `UPDATE tournament_matches
       SET player1_participant_id = $1,
           player2_participant_id = $2,
           status = $3,
           ready_player1 = false,
           ready_player2 = false,
           ready_at = CASE WHEN $3::varchar = 'ready' THEN NOW() ELSE NULL END,
           nakama_match_id = NULL,
           started_at = NULL,
           spectator_count = 0,
           last_activity_at = NOW()
       WHERE id = $4 AND status IN ('pending', 'ready')`,
      [player1ParticipantId, player2ParticipantId, nextStatus, tournamentMatchId]
    );
    matchStatus = nextStatus;

    // Remove old seed assignments when a human has been replaced by a bot.
    if (needsReplacePlayer1 && oldPlayer1ParticipantId) {
      nk.sqlExec(
        `UPDATE tournament_participants
         SET seed_number = NULL
         WHERE id = $1`,
        [oldPlayer1ParticipantId]
      );
    }
    if (needsReplacePlayer2 && oldPlayer2ParticipantId) {
      nk.sqlExec(
        `UPDATE tournament_participants
         SET seed_number = NULL
         WHERE id = $1`,
        [oldPlayer2ParticipantId]
      );
    }

    logger.info(
      'Reconciled tournament match ' +
      tournamentMatchId +
      ' with ' +
      replacedCount +
      ' bot replacement(s)'
    );
  }

  return {
    replacedCount: replacedCount,
    player1IsBot: player1IsBot,
    player2IsBot: player2IsBot,
    player1ParticipantId: player1ParticipantId,
    player2ParticipantId: player2ParticipantId,
    matchStatus: matchStatus,
    policy: policy,
  };
}

export function replaceParticipantInPendingOrReadyMatchWithBot(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tournamentId: string,
  participantId: string,
  policyOverride?: TournamentBotPolicy
): TournamentParticipantReplacementResult {
  var result = nk.sqlQuery(
    `SELECT id, status
     FROM tournament_matches
     WHERE tournament_id = $1
       AND (player1_participant_id = $2 OR player2_participant_id = $2)
       AND status IN ('pending', 'ready', 'in_progress')
     ORDER BY
       CASE status
         WHEN 'in_progress' THEN 1
         WHEN 'ready' THEN 2
         ELSE 3
       END,
       round_number ASC,
       match_number ASC
     LIMIT 1`,
    [tournamentId, participantId]
  );
  var rows = Array.isArray(result) ? result : [];
  if (rows.length === 0) {
    return {
      replaced: false,
      wasInProgress: false,
      matchId: null,
      botParticipantId: null,
    };
  }

  var matchId = rows[0].id;
  var status = rows[0].status;
  if (status === 'in_progress') {
    return {
      replaced: false,
      wasInProgress: true,
      matchId: matchId,
      botParticipantId: null,
    };
  }

  var reconciliation = reconcileTournamentMatchBots(nk, logger, matchId, policyOverride);
  var botParticipantId: string | null = null;
  if (reconciliation.replacedCount > 0) {
    var matchStateResult = nk.sqlQuery(
      `SELECT player1_participant_id, player2_participant_id, p1.is_bot as player1_is_bot, p2.is_bot as player2_is_bot
       FROM tournament_matches tm
       LEFT JOIN tournament_participants p1 ON p1.id = tm.player1_participant_id
       LEFT JOIN tournament_participants p2 ON p2.id = tm.player2_participant_id
       WHERE tm.id = $1`,
      [matchId]
    );
    var matchStateRows = Array.isArray(matchStateResult) ? matchStateResult : [];
    if (matchStateRows.length > 0) {
      var matchState = matchStateRows[0];
      if (parsePgBoolean(matchState.player1_is_bot) && matchState.player1_participant_id !== participantId) {
        botParticipantId = matchState.player1_participant_id;
      } else if (parsePgBoolean(matchState.player2_is_bot) && matchState.player2_participant_id !== participantId) {
        botParticipantId = matchState.player2_participant_id;
      }
    }
  }

  return {
    replaced: reconciliation.replacedCount > 0,
    wasInProgress: false,
    matchId: matchId,
    botParticipantId: botParticipantId,
  };
}
