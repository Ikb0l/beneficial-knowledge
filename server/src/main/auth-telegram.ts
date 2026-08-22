import { isAdminTelegramId } from './admin';
import { getTelegramBotToken } from './config';
import { GAME_CONFIG } from './constants';
import { getWebAuthPepper, hashWebSessionToken } from './web-auth';

// ============================================================================
// TELEGRAM AUTHENTICATION
// ============================================================================

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface TelegramInitData {
  user?: TelegramUser;
  auth_date: number;
  hash: string;
  query_id?: string;
  [key: string]: any;
}

export interface TelegramLoginPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number;
  hash?: string;
}

export function parseTelegramInitDataParams(initData: string): {[key: string]: string} {
  var params: {[key: string]: string} = {};
  var pairs = initData.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    if (!pair) continue;
    var eqIndex = pair.indexOf('=');
    var rawKey = eqIndex >= 0 ? pair.slice(0, eqIndex) : pair;
    var rawValue = eqIndex >= 0 ? pair.slice(eqIndex + 1) : '';
    // Replace '+' with space before decoding to match URL query behavior.
    var key = decodeURIComponent(rawKey.replace(/\+/g, '%20'));
    var value = decodeURIComponent(rawValue.replace(/\+/g, '%20'));
    params[key] = value;
  }
  return params;
}

export function parseTelegramInitDataParamsRaw(initData: string): {[key: string]: string} {
  var params: {[key: string]: string} = {};
  var pairs = initData.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    if (!pair) continue;
    var eqIndex = pair.indexOf('=');
    var rawKey = eqIndex >= 0 ? pair.slice(0, eqIndex) : pair;
    var rawValue = eqIndex >= 0 ? pair.slice(eqIndex + 1) : '';
    params[rawKey] = rawValue;
  }
  return params;
}

export function utf8ToBytes(input: string): number[] {
  var bytes: number[] = [];
  for (var i = 0; i < input.length; i++) {
    var code = input.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      var next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        var codePoint = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        bytes.push(0xf0 | (codePoint >> 18));
        bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
        bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
        bytes.push(0x80 | (codePoint & 0x3f));
        continue;
      }
    }
    bytes.push(0xe0 | (code >> 12));
    bytes.push(0x80 | ((code >> 6) & 0x3f));
    bytes.push(0x80 | (code & 0x3f));
  }
  return bytes;
}

export function bytesToHex(bytes: number[]): string {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var hex = bytes[i].toString(16);
    if (hex.length < 2) hex = '0' + hex;
    out += hex;
  }
  return out;
}

export function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

export function sha256(bytes: number[]): number[] {
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  var h0 = 0x6a09e667;
  var h1 = 0xbb67ae85;
  var h2 = 0x3c6ef372;
  var h3 = 0xa54ff53a;
  var h4 = 0x510e527f;
  var h5 = 0x9b05688c;
  var h6 = 0x1f83d9ab;
  var h7 = 0x5be0cd19;

  var message = bytes.slice();
  var bitLen = message.length * 8;
  message.push(0x80);
  while ((message.length % 64) !== 56) {
    message.push(0x00);
  }

  var bitLenHi = Math.floor(bitLen / 0x100000000);
  var bitLenLo = bitLen >>> 0;
  message.push((bitLenHi >>> 24) & 0xff);
  message.push((bitLenHi >>> 16) & 0xff);
  message.push((bitLenHi >>> 8) & 0xff);
  message.push(bitLenHi & 0xff);
  message.push((bitLenLo >>> 24) & 0xff);
  message.push((bitLenLo >>> 16) & 0xff);
  message.push((bitLenLo >>> 8) & 0xff);
  message.push(bitLenLo & 0xff);

  for (var i = 0; i < message.length; i += 64) {
    var w: number[] = new Array(64);
    for (var t = 0; t < 16; t++) {
      var j = i + (t * 4);
      w[t] = ((message[j] << 24) | (message[j + 1] << 16) | (message[j + 2] << 8) | message[j + 3]) >>> 0;
    }
    for (var t = 16; t < 64; t++) {
      var s0 = (rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      var s1 = (rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;
    var f = h5;
    var g = h6;
    var h = h7;

    for (var t = 0; t < 64; t++) {
      var S1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) >>> 0;
      var ch = ((e & f) ^ (~e & g)) >>> 0;
      var temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      var S0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) >>> 0;
      var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      var temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [
    (h0 >>> 24) & 0xff, (h0 >>> 16) & 0xff, (h0 >>> 8) & 0xff, h0 & 0xff,
    (h1 >>> 24) & 0xff, (h1 >>> 16) & 0xff, (h1 >>> 8) & 0xff, h1 & 0xff,
    (h2 >>> 24) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 8) & 0xff, h2 & 0xff,
    (h3 >>> 24) & 0xff, (h3 >>> 16) & 0xff, (h3 >>> 8) & 0xff, h3 & 0xff,
    (h4 >>> 24) & 0xff, (h4 >>> 16) & 0xff, (h4 >>> 8) & 0xff, h4 & 0xff,
    (h5 >>> 24) & 0xff, (h5 >>> 16) & 0xff, (h5 >>> 8) & 0xff, h5 & 0xff,
    (h6 >>> 24) & 0xff, (h6 >>> 16) & 0xff, (h6 >>> 8) & 0xff, h6 & 0xff,
    (h7 >>> 24) & 0xff, (h7 >>> 16) & 0xff, (h7 >>> 8) & 0xff, h7 & 0xff,
  ];
}

export function hmacSha256Bytes(keyBytes: number[], messageBytes: number[]): number[] {
  var blockSize = 64;
  var key = keyBytes.slice();
  if (key.length > blockSize) {
    key = sha256(key);
  }
  while (key.length < blockSize) {
    key.push(0x00);
  }

  var oKeyPad: number[] = [];
  var iKeyPad: number[] = [];
  for (var i = 0; i < blockSize; i++) {
    oKeyPad[i] = key[i] ^ 0x5c;
    iKeyPad[i] = key[i] ^ 0x36;
  }

  var inner = sha256(iKeyPad.concat(messageBytes));
  return sha256(oKeyPad.concat(inner));
}

// Parse Telegram initData string into object
export function parseTelegramInitData(initData: string): TelegramInitData {
  var params = parseTelegramInitDataParams(initData);

  var result: TelegramInitData = {
    auth_date: parseInt(params.auth_date || '0', 10),
    hash: params.hash || '',
  };

  if (params.user) {
    try {
      result.user = JSON.parse(params.user);
    } catch (e) {
      // Invalid user JSON
    }
  }

  if (params.query_id) {
    result.query_id = params.query_id;
  }

  return result;
}

// Validate Telegram initData signature
  function validateTelegramInitData(
    initData: string,
    botToken: string,
    nk: nkruntime.Nakama,
    logger: nkruntime.Logger,
    allowInsecure: boolean
  ): boolean {
  // SECURITY: Only allow insecure mode when explicitly enabled
  // In production, ensure ALLOW_INSECURE_TELEGRAM_AUTH is never set to 'true'
  if (allowInsecure) {
    logger.warn('WARNING: Insecure Telegram auth mode enabled - signatures will NOT be validated!');
    logger.warn('This should ONLY be used for local development. Never enable in production.');
    return true;
  }

    if (!botToken) {
      logger.error('Telegram bot token not configured');
      return false;
    }
    if (typeof botToken !== 'string') {
      logger.error('Telegram bot token has invalid type: ' + typeof botToken);
      return false;
    }

    try {
      var rawParams = parseTelegramInitDataParamsRaw(initData);
      var params = parseTelegramInitDataParams(initData);

    var hash = rawParams.hash || params.hash;
    if (!hash) {
      logger.error('No hash in initData');
      return false;
    }

    // Build data-check-string (sorted alphabetically, excluding hash)
    var checkKeys: string[] = [];
    for (var key in rawParams) {
      if (key !== 'hash') {
        checkKeys.push(key);
      }
    }
    checkKeys.sort();

    var rawDataCheckString = '';
    var decodedDataCheckString = '';
    for (var i = 0; i < checkKeys.length; i++) {
      if (i > 0) {
        rawDataCheckString += '\n';
        decodedDataCheckString += '\n';
      }
      var key = checkKeys[i];
      rawDataCheckString += key + '=' + (rawParams[key] || '');
      decodedDataCheckString += key + '=' + (params[key] || '');
    }

      // Create secret key: HMAC-SHA256(bot_token, "WebAppData")
      // Telegram spec: bot_token is the input data, "WebAppData" is the key
      var secretKeyBytes = hmacSha256Bytes(
        utf8ToBytes('WebAppData'),
        utf8ToBytes(botToken)
      );

      // Calculate hash: HMAC-SHA256(data_check_string, secret_key)
      var calculatedRawHash = bytesToHex(hmacSha256Bytes(
        secretKeyBytes,
        utf8ToBytes(rawDataCheckString)
      ));
      var calculatedDecodedHash = bytesToHex(hmacSha256Bytes(
        secretKeyBytes,
        utf8ToBytes(decodedDataCheckString)
      ));

    // Compare hashes
    var hashLower = hash.toLowerCase();
    if (calculatedRawHash.toLowerCase() !== hashLower && calculatedDecodedHash.toLowerCase() !== hashLower) {
      logger.error('Invalid Telegram initData hash');
      return false;
    }

    // Check auth_date is not too old (allow 1 hour)
    var authDate = parseInt(params.auth_date || '0', 10);
    var now = Math.floor(Date.now() / 1000);
    if (now - authDate > 3600) {
      logger.error('Telegram initData expired');
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error validating Telegram initData: ' + error);
    return false;
  }
}

export function buildTelegramLoginCheckString(payload: TelegramLoginPayload): string {
  var parts: string[] = [];

  if (typeof payload.auth_date === 'number') {
    parts.push('auth_date=' + payload.auth_date.toString());
  }
  if (payload.first_name) {
    parts.push('first_name=' + payload.first_name);
  }
  if (typeof payload.id === 'number') {
    parts.push('id=' + payload.id.toString());
  }
  if (payload.last_name) {
    parts.push('last_name=' + payload.last_name);
  }
  if (payload.photo_url) {
    parts.push('photo_url=' + payload.photo_url);
  }
  if (payload.username) {
    parts.push('username=' + payload.username);
  }

  parts.sort();
  return parts.join('\n');
}

export function validateTelegramLoginPayload(
  payload: TelegramLoginPayload,
  botToken: string,
  logger: nkruntime.Logger,
  allowInsecure: boolean
): boolean {
  if (allowInsecure) {
    logger.warn('WARNING: Insecure Telegram auth mode enabled - signatures will NOT be validated!');
    logger.warn('This should ONLY be used for local development. Never enable in production.');
    return true;
  }

  if (!botToken) {
    logger.error('Telegram bot token not configured');
    return false;
  }

  if (!payload || typeof payload.id !== 'number' || !payload.hash || typeof payload.hash !== 'string') {
    logger.error('Invalid Telegram login payload');
    return false;
  }

  if (typeof payload.auth_date !== 'number') {
    logger.error('Telegram login payload missing auth_date');
    return false;
  }

  try {
    var checkString = buildTelegramLoginCheckString(payload);
    var secretKey = sha256(utf8ToBytes(botToken));
    var calculatedHash = bytesToHex(hmacSha256Bytes(secretKey, utf8ToBytes(checkString)));

    if (calculatedHash.toLowerCase() !== payload.hash.toLowerCase()) {
      logger.error('Invalid Telegram login hash');
      return false;
    }

    var now = Math.floor(Date.now() / 1000);
    if (now - payload.auth_date > 3600) {
      logger.error('Telegram login payload expired');
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error validating Telegram login payload: ' + error);
    return false;
  }
}

export function getTelegramUserFromInitData(
  initData: string,
  botToken: string,
  allowInsecure: boolean,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): TelegramUser {
  if (!validateTelegramInitData(initData, botToken, nk, logger, allowInsecure)) {
    throw new Error('Invalid Telegram authentication data');
  }
  var telegramData = parseTelegramInitData(initData);
  if (!telegramData.user) {
    throw new Error('User data not found in initData');
  }
  return telegramData.user;
}

export function buildTelegramUsername(telegramUser: TelegramUser): string {
  var base = telegramUser.username ||
    ((telegramUser.first_name || '') + (telegramUser.last_name ? '_' + telegramUser.last_name : ''));
  base = base.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (base.length < 3) {
    base = 'user';
  }
  return base + '_' + telegramUser.id.toString();
}

// Initialize new player data
export function initializePlayerData(
  nk: nkruntime.Nakama,
  userId: string,
  telegramUser: TelegramUser,
  logger: nkruntime.Logger
): void {
  logger.info('Initializing player data for user: ' + userId);

  // Create global MMR record
  var globalMmr = {
    mmr: GAME_CONFIG.STARTING_MMR,
    rd: GAME_CONFIG.STARTING_RD,
    volatility: GAME_CONFIG.STARTING_VOLATILITY,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rankTier: 'bronze',
    peakMmr: GAME_CONFIG.STARTING_MMR,
  };

  // Create category-specific MMR records (empty - populated as player plays each category)
  var categoryMmr: {[key: string]: any} = {};
  // Categories are dynamic now - MMR for each category is created when player first plays it

  // Create player stats
  var stats = {
    totalQuestions: 0,
    correctAnswers: 0,
    averageResponseTime: 0,
    longestStreak: 0,
    currentStreak: 0,
    perfectGames: 0,
    challengeWins: 0,
  };

  // Recent questions per category (populated dynamically as player plays)
  var recentQuestions: {[key: string]: string[]} = {};

  // Create Telegram-specific data
  var telegramData = {
    telegramId: telegramUser.id,
    firstName: telegramUser.first_name,
    lastName: telegramUser.last_name || '',
    username: telegramUser.username || '',
    languageCode: telegramUser.language_code || 'en',
    photoUrl: telegramUser.photo_url || '',
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };

  // Write all data to storage
  var writes: nkruntime.StorageWriteRequest[] = [
    {
      collection: 'player_data',
      key: 'global_mmr',
      userId: userId,
      value: globalMmr,
      permissionRead: 2, // Public read
      permissionWrite: 0, // Server only write
    },
    {
      collection: 'player_data',
      key: 'category_mmr',
      userId: userId,
      value: categoryMmr,
      permissionRead: 2,
      permissionWrite: 0,
    },
    {
      collection: 'player_data',
      key: 'stats',
      userId: userId,
      value: stats,
      permissionRead: 2,
      permissionWrite: 0,
    },
    {
      collection: 'player_data',
      key: 'recent_questions',
      userId: userId,
      value: recentQuestions,
      permissionRead: 0,
      permissionWrite: 0,
    },
    {
      collection: 'player_data',
      key: 'telegram',
      userId: userId,
      value: telegramData,
      permissionRead: 1, // Owner read only
      permissionWrite: 0,
    },
  ];

  nk.storageWrite(writes);
  logger.info('Player data initialized successfully');
}

export function updateTelegramData(
  nk: nkruntime.Nakama,
  userId: string,
  telegramUser: TelegramUser,
  logger: nkruntime.Logger
): void {
  try {
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'telegram', userId: userId },
    ];
    var results = nk.storageRead(reads);
    var existing = results[0]?.value || {};

    var telegramDataStored = {
      telegramId: telegramUser.id,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name || '',
      username: telegramUser.username || '',
      languageCode: telegramUser.language_code || 'en',
      photoUrl: telegramUser.photo_url || existing.photoUrl || '',
      createdAt: existing.createdAt || Date.now(),
      lastLoginAt: Date.now(),
    };

    var writes: nkruntime.StorageWriteRequest[] = [
      {
        collection: 'player_data',
        key: 'telegram',
        userId: userId,
        value: telegramDataStored,
        permissionRead: 1,
        permissionWrite: 0,
      },
    ];
    nk.storageWrite(writes);
  } catch (error) {
    logger.warn('Could not update Telegram data: ' + error);
  }
}

function toStablePseudoTelegramId(seed: string): number {
  var hash = 0;
  for (var i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  var positive = Math.abs(hash);
  return 100000000 + (positive % 900000000);
}

function toBridgeUsername(customId: string): string {
  var base = customId.replace(/^quizzy_/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (base.length < 3) {
    base = 'quizzy_user';
  }
  if (base.length > 24) {
    base = base.slice(0, 24);
  }
  return base;
}

function sanitizeBridgeDisplayName(rawValue: string): string {
  if (!rawValue) {
    return '';
  }
  var normalized = rawValue.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length > 50) {
    normalized = normalized.slice(0, 50).trim();
  }
  return normalized;
}

function toBridgeNameParts(displayName: string): { firstName: string; lastName: string } {
  var normalized = sanitizeBridgeDisplayName(displayName);
  if (!normalized) {
    return { firstName: 'Quizzy', lastName: '' };
  }

  var split = normalized.split(' ');
  var firstName = split[0] || 'Quizzy';
  var lastName = split.length > 1 ? split.slice(1).join(' ') : '';
  return { firstName: firstName, lastName: lastName };
}

function toBridgeUsernameFromDisplayName(displayName: string, fallbackCustomId: string): string {
  var normalized = sanitizeBridgeDisplayName(displayName)
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, '')
    .replace(/\s+/g, '_');

  if (!normalized) {
    return toBridgeUsername(fallbackCustomId);
  }
  if (normalized.length < 3) {
    normalized += '_user';
  }
  if (normalized.length > 24) {
    normalized = normalized.slice(0, 24);
  }
  return normalized;
}

export function beforeAuthenticateCustom(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  data: nkruntime.AuthenticateCustomRequest
): nkruntime.AuthenticateCustomRequest {
  function getAuthVar(varsSource: any, key: string): string {
    if (!varsSource) return '';
    var direct = varsSource[key];
    if (typeof direct === 'string') return direct;
    if (typeof varsSource.get === 'function') {
      var mapped = varsSource.get(key);
      if (typeof mapped === 'string') return mapped;
    }
    return '';
  }

  function copyAuthVars(varsSource: any): { [key: string]: any } {
    var out: { [key: string]: any } = {};
    if (!varsSource) return out;
    if (typeof varsSource.entries === 'function') {
      var iterator = varsSource.entries();
      if (iterator && typeof iterator.next === 'function') {
        while (true) {
          var next = iterator.next();
          if (!next || next.done) break;
          var pair = next.value;
          if (!pair || pair.length < 2) continue;
          out[String(pair[0])] = pair[1];
        }
      }
      return out;
    }
    for (var key in varsSource) {
      out[key] = varsSource[key];
    }
    return out;
  }

  // Debug logging
  var allowInsecure = ctx.env['ALLOW_INSECURE_TELEGRAM_AUTH'] === 'true';
  logger.info('beforeAuthenticateCustom: ALLOW_INSECURE_TELEGRAM_AUTH=' + allowInsecure);

  var account = data.account || {};
  var customId = account.id || '';
  var vars = account.vars || (data as any).vars || {};
  var initData = getAuthVar(vars, 'initData') || getAuthVar(vars, 'init_data');

  logger.info('beforeAuthenticateCustom: initData type=' + typeof initData + ', length=' + (initData ? initData.length : 0));

  // Detect admin token login via vars (handles first-time login where account
  // doesn't exist yet and data.account is null, so customId would be empty).
  var adminToken = getAuthVar(vars, 'adminToken') || getAuthVar(vars, 'admin_token');
  if (customId.indexOf('admin_token_') === 0 || adminToken) {
    adminToken = adminToken || getAuthVar(vars, 'adminToken') || getAuthVar(vars, 'admin_token');
    var expectedToken = (ctx.env['ADMIN_LOGIN_TOKEN'] || '').trim();
    adminToken = adminToken ? adminToken.trim() : '';
    if (!expectedToken) {
      throw new Error('Admin token login is disabled');
    }
    if (!adminToken || adminToken !== expectedToken) {
      throw new Error('Invalid admin token');
    }

    // Get telegram ID: try customId prefix first, then vars fallback
    var adminTelegramId;
    if (customId.indexOf('admin_token_') === 0) {
      adminTelegramId = parseInt(customId.replace('admin_token_', ''), 10);
    } else {
      var adminTgIdStr = getAuthVar(vars, 'adminTelegramId') || getAuthVar(vars, 'admin_telegram_id') || '0';
      adminTelegramId = parseInt(adminTgIdStr, 10);
    }
    if (!adminTelegramId || adminTelegramId <= 0) {
      throw new Error('Invalid admin Telegram ID');
    }

    var adminCheck = isAdminTelegramId(nk, logger, ctx, adminTelegramId);
    if (!adminCheck.isAdmin) {
      throw new Error('Unauthorized admin');
    }

    var adminVars = copyAuthVars(vars);
    adminVars.adminLogin = 'token';
    adminVars.adminTelegramId = adminTelegramId.toString();
    delete adminVars.adminToken;
    delete adminVars.admin_token;

    data.account = { id: 'telegram_' + adminTelegramId.toString(), vars: adminVars };
    data.username = 'admin_' + adminTelegramId.toString();
    data.create = true;

    return data;
  }

  if (customId.indexOf('web_') === 0) {
    var webToken = getAuthVar(vars, 'webSessionToken') || getAuthVar(vars, 'web_session_token');
    if (!webToken) {
      throw new Error('Web session token required');
    }

    var nickname = customId.replace('web_', '').trim();
    if (!nickname) {
      throw new Error('Invalid web credentials');
    }

    var webRows = nk.sqlQuery(
      `SELECT user_id, session_token_hash, session_token_expires_at
       FROM web_credentials
       WHERE LOWER(nickname) = LOWER($1)`,
      [nickname]
    ) as unknown as any[];

    if (!webRows || webRows.length === 0) {
      throw new Error('Invalid web credentials');
    }

    var webCred = webRows[0];
    var pepper = getWebAuthPepper(ctx, logger);
    var expectedHash = hashWebSessionToken(webToken, pepper, nk);

    if (!webCred.session_token_hash || expectedHash !== webCred.session_token_hash) {
      throw new Error('Invalid web credentials');
    }

    if (webCred.session_token_expires_at && new Date(webCred.session_token_expires_at) < new Date()) {
      throw new Error('Web session token expired');
    }

    // Check if web user is banned
    try {
      var webBanResult = nk.sqlQuery(
        `SELECT id, reason, is_permanent, expires_at
         FROM user_bans
         WHERE user_id = $1
         AND is_active = true
         AND (is_permanent = true OR expires_at > NOW())
         LIMIT 1`,
        [webCred.user_id]
      ) as unknown as any[];

      if (webBanResult && webBanResult.length > 0) {
        var webBan = webBanResult[0] as any;
        var webBanMessage = 'Your account has been banned.';
        if (webBan.is_permanent) {
          webBanMessage = 'Your account has been permanently banned. Reason: ' + (webBan.reason || 'Violation of terms');
        } else if (webBan.expires_at) {
          webBanMessage = 'Your account is temporarily banned until ' + webBan.expires_at + '. Reason: ' + (webBan.reason || 'Violation of terms');
        }
        logger.warn('Banned web user attempted login: user_id=' + webCred.user_id);
        throw new Error(webBanMessage);
      }
    } catch (banError: any) {
      if (banError.message && banError.message.includes('banned')) {
        throw banError;
      }
      logger.debug('Web ban check skipped: ' + banError);
    }

    var sanitizedVars = copyAuthVars(vars);
    for (var key in sanitizedVars) {
      if (key !== 'webSessionToken' && key !== 'web_session_token') {
        continue;
      }
      delete sanitizedVars[key];
    }

    // Force non-creation for web logins (user already exists)
    data.account = { id: 'web_' + nickname.toLowerCase(), vars: sanitizedVars };
    data.username = nickname;
    data.create = false;
    return data;
  }

  if (customId.indexOf('quizzy_') === 0) {
    var bridgeVars = copyAuthVars(vars);
    var bridgeDisplayName = sanitizeBridgeDisplayName(
      getAuthVar(vars, 'bridgeDisplayName') || getAuthVar(vars, 'displayName')
    );
    if (bridgeDisplayName) {
      bridgeVars.bridgeDisplayName = bridgeDisplayName;
      bridgeVars.displayName = bridgeDisplayName;
    }

    data.account = { id: customId, vars: bridgeVars };
    data.username = bridgeDisplayName
      ? toBridgeUsernameFromDisplayName(bridgeDisplayName, customId)
      : toBridgeUsername(customId);
    data.create = true;
    return data;
  }

    if (customId.indexOf('telegram_') === 0) {
    var telegramSessionToken = getAuthVar(vars, 'telegramSessionToken') || getAuthVar(vars, 'telegram_session_token');
    if (telegramSessionToken) {
      var rawTelegramId = parseInt(customId.replace('telegram_', ''), 10);
      if (!rawTelegramId || rawTelegramId <= 0) {
        throw new Error('Invalid Telegram credentials');
      }

      var tokenRows = nk.sqlQuery(
        `SELECT telegram_id, token_hash, expires_at, first_name, last_name, username, photo_url
         FROM telegram_login_tokens
         WHERE telegram_id = $1`,
        [rawTelegramId]
      ) as unknown as any[];

      if (!tokenRows || tokenRows.length === 0) {
        throw new Error('Invalid Telegram credentials');
      }

      var tokenRow = tokenRows[0];
      var pepper = getWebAuthPepper(ctx, logger);
      var expectedHash = hashWebSessionToken(telegramSessionToken, pepper, nk);

      if (!tokenRow.token_hash || tokenRow.token_hash !== expectedHash) {
        throw new Error('Invalid Telegram credentials');
      }

      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        throw new Error('Telegram login expired');
      }

      try {
        nk.sqlExec('DELETE FROM telegram_login_tokens WHERE telegram_id = $1', [rawTelegramId]);
      } catch (deleteError) {
        logger.warn('Failed to delete Telegram login token: ' + deleteError);
      }

      // Check if user is banned by telegram ID
      try {
        var banCheckResult = nk.sqlQuery(
          `SELECT id, reason, is_permanent, expires_at
           FROM user_bans
           WHERE telegram_id = $1
           AND is_active = true
           AND (is_permanent = true OR expires_at > NOW())
           LIMIT 1`,
          [rawTelegramId]
        );
        var banRows = Array.isArray(banCheckResult) ? banCheckResult : [];

        if (banRows.length > 0) {
          var ban = banRows[0] as any;
          var banMessage = 'Your account has been banned.';
          if (ban.is_permanent) {
            banMessage = 'Your account has been permanently banned. Reason: ' + (ban.reason || 'Violation of terms');
          } else if (ban.expires_at) {
            banMessage = 'Your account is temporarily banned until ' + ban.expires_at + '. Reason: ' + (ban.reason || 'Violation of terms');
          }
          logger.warn('Banned user attempted login: telegram_id=' + rawTelegramId);
          throw new Error(banMessage);
        }
      } catch (banError: any) {
        if (banError.message && banError.message.includes('banned')) {
          throw banError;
        }
        logger.debug('Ban check skipped: ' + banError);
      }

      var telegramLoginUser = {
        id: rawTelegramId,
        first_name: tokenRow.first_name || '',
        last_name: tokenRow.last_name || '',
        username: tokenRow.username || '',
        language_code: 'en',
        photo_url: tokenRow.photo_url || '',
      };

      var sanitizedVars = copyAuthVars(vars);
      for (var key in sanitizedVars) {
        if (key !== 'telegramSessionToken' && key !== 'telegram_session_token') {
          continue;
        }
        delete sanitizedVars[key];
      }
      sanitizedVars.telegram_login = JSON.stringify(telegramLoginUser);

      data.account = { id: 'telegram_' + rawTelegramId.toString(), vars: sanitizedVars };
      data.username = buildTelegramUsername(telegramLoginUser as TelegramUser);
      data.create = true;
      return data;
    }
  }

  if (!initData) {
    throw new Error('initData is required');
  }

  var botToken = getTelegramBotToken(ctx, nk, logger);
  var telegramUser = getTelegramUserFromInitData(initData, botToken, allowInsecure, nk, logger);
  var telegramId = 'telegram_' + telegramUser.id.toString();

  // Check if user is banned by telegram ID
  try {
    var banCheckResult = nk.sqlQuery(
      `SELECT id, reason, is_permanent, expires_at
       FROM user_bans
       WHERE telegram_id = $1
       AND is_active = true
       AND (is_permanent = true OR expires_at > NOW())
       LIMIT 1`,
      [telegramUser.id]
    );
    var banRows = Array.isArray(banCheckResult) ? banCheckResult : [];

    if (banRows.length > 0) {
      var ban = banRows[0] as any;
      var banMessage = 'Your account has been banned.';
      if (ban.is_permanent) {
        banMessage = 'Your account has been permanently banned. Reason: ' + (ban.reason || 'Violation of terms');
      } else if (ban.expires_at) {
        banMessage = 'Your account is temporarily banned until ' + ban.expires_at + '. Reason: ' + (ban.reason || 'Violation of terms');
      }
      logger.warn('Banned user attempted login: telegram_id=' + telegramUser.id);
      throw new Error(banMessage);
    }
  } catch (banError: any) {
    // If it's a ban error, re-throw it
    if (banError.message && banError.message.includes('banned')) {
      throw banError;
    }
    // Otherwise log and continue (table might not exist yet)
    logger.debug('Ban check skipped: ' + banError);
  }

  data.account = { id: telegramId, vars: vars };
  data.username = buildTelegramUsername(telegramUser);
  data.create = true;

  return data;
}

export function afterAuthenticateCustom(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  data: nkruntime.AuthResult,
  request: nkruntime.AuthenticateCustomRequest
): void {
  try {
    // Get userId from data or fallback to context
    var userId = data?.userId || ctx.userId;
    if (!userId || typeof userId !== 'string') {
      logger.warn('afterAuthenticateCustom: No valid userId available');
      return;
    }

    var customId = request?.account?.id || '';
    var vars = request?.account?.vars || {};
    var allowInsecure = ctx.env['ALLOW_INSECURE_TELEGRAM_AUTH'] === 'true';

    if (vars.adminLogin === 'token' && vars.adminTelegramId) {
      var adminTelegramId = parseInt(vars.adminTelegramId, 10);
      if (adminTelegramId > 0) {
        var adminUser = {
          id: adminTelegramId,
          first_name: 'Admin',
          last_name: '',
          username: 'admin_' + adminTelegramId.toString(),
        };
        if (data?.created) {
          initializePlayerData(nk, userId, adminUser, logger);
        } else {
          updateTelegramData(nk, userId, adminUser, logger);
        }
      }
      return;
    }

    if (customId.indexOf('quizzy_') === 0) {
      var bridgeDisplayName = sanitizeBridgeDisplayName(
        (vars as any).bridgeDisplayName || (vars as any).displayName || ''
      );
      var bridgeNameParts = toBridgeNameParts(bridgeDisplayName || request?.username || '');
      var bridgeUsername = bridgeDisplayName
        ? toBridgeUsernameFromDisplayName(bridgeDisplayName, customId)
        : (request?.username || toBridgeUsername(customId));
      var pseudoTelegramUser = {
        id: toStablePseudoTelegramId(customId),
        first_name: bridgeNameParts.firstName,
        last_name: bridgeNameParts.lastName,
        username: bridgeUsername,
      };

      if (data?.created) {
        initializePlayerData(nk, userId, pseudoTelegramUser as TelegramUser, logger);
      } else {
        updateTelegramData(nk, userId, pseudoTelegramUser as TelegramUser, logger);
      }

      if (bridgeDisplayName) {
        try {
          nk.accountUpdateId(
            userId,
            undefined,
            bridgeDisplayName,
            undefined,
            undefined,
            undefined,
            undefined
          );
          nk.storageWrite([
            {
              collection: 'player_data',
              key: 'profile_overrides',
              userId: userId,
              value: { displayName: bridgeDisplayName },
              permissionRead: 2,
              permissionWrite: 0,
            },
          ]);
        } catch (bridgeProfileError) {
          logger.warn('Could not apply bridge display name: ' + bridgeProfileError);
        }
      }
      return;
    }

    var telegramLoginRaw = (vars as any).telegram_login || (vars as any).telegramLogin;
    if (telegramLoginRaw) {
      var telegramLogin: TelegramUser | null = null;
      if (typeof telegramLoginRaw === 'string') {
        try {
          telegramLogin = JSON.parse(telegramLoginRaw);
        } catch {
          telegramLogin = null;
        }
      } else {
        telegramLogin = telegramLoginRaw as TelegramUser;
      }

      if (telegramLogin && telegramLogin.id) {
        if (data?.created) {
          initializePlayerData(nk, userId, telegramLogin, logger);
        } else {
          updateTelegramData(nk, userId, telegramLogin, logger);
        }
      }
      return;
    }

    var initData = vars.initData || vars.init_data;
    if (!initData) {
      return;
    }

    var botToken = getTelegramBotToken(ctx, nk, logger);
    var telegramUser = getTelegramUserFromInitData(initData, botToken, allowInsecure, nk, logger);

    if (data?.created) {
      initializePlayerData(nk, userId, telegramUser, logger);
    } else {
      updateTelegramData(nk, userId, telegramUser, logger);
    }
  } catch (error) {
    logger.error('afterAuthenticateCustom error: ' + error);
  }
}

// RPC: Telegram Authentication
export function rpcTelegramAuth(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  logger.debug('Telegram auth request received');

  var request: { initData: string };
  try {
    request = JSON.parse(payload || '{}');
  } catch (error) {
    throw new Error('Invalid request payload');
  }

  if (!request.initData) {
    throw new Error('initData is required');
  }

  // Get bot token from DB config or environment
  var botToken = getTelegramBotToken(ctx, nk, logger);
  var allowInsecure = ctx.env['ALLOW_INSECURE_TELEGRAM_AUTH'] === 'true';

  // Validate Telegram initData and extract user
  var telegramUser = getTelegramUserFromInitData(request.initData, botToken, allowInsecure, nk, logger);
  var telegramId = 'telegram_' + telegramUser.id.toString();

  // Generate username from Telegram data
  var username = buildTelegramUsername(telegramUser);

  logger.info('Authenticating Telegram user: ' + telegramId + ' (' + username + ')');

  // Authenticate or create user
  var authResult: nkruntime.AuthResult;
  try {
    authResult = nk.authenticateCustom(telegramId, username, true);
  } catch (error) {
    logger.error('Authentication failed: ' + error);
    throw new Error('Authentication failed');
  }

  // If this is a new user, initialize their data
  if (authResult.created) {
    logger.info('New user created: ' + authResult.userId);
    initializePlayerData(nk, authResult.userId, telegramUser, logger);

    // Update account with display name and avatar
    try {
      var displayName = telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : '');
      // Note: accountUpdateId would be ideal but we'll update via storage for now
    } catch (error) {
      logger.warn('Could not update account details: ' + error);
    }
  } else {
    // Update last login time for existing user
    logger.info('Existing user logged in: ' + authResult.userId);
    updateTelegramData(nk, authResult.userId, telegramUser, logger);
  }

  // Get player profile data
  var profileData: any = {
    mmr: GAME_CONFIG.STARTING_MMR,
    gamesPlayed: 0,
    wins: 0,
    rankTier: 'bronze',
  };

  try {
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'global_mmr', userId: authResult.userId },
    ];
    var results = nk.storageRead(reads);
    if (results.length > 0) {
      profileData = results[0].value;
    }
  } catch (error) {
    logger.warn('Could not read profile data: ' + error);
  }

  return JSON.stringify({
    userId: authResult.userId,
    username: authResult.username,
    created: authResult.created,
    telegramId: telegramUser.id,
    displayName: telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : ''),
    photoUrl: telegramUser.photo_url || '',
    profile: profileData,
  });
}

// ============================================================================
