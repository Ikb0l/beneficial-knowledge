import { checkRateLimitByKey } from '../rate-limiter';
import { initializePlayerData, validateTelegramLoginPayload } from './auth-telegram';
import type { TelegramLoginPayload } from './auth-telegram';
import { requireAdminCapability, logAdminAction } from './admin';
import { getTelegramBotToken } from './config';
import { GAME_CONFIG } from './constants';

// WEB AUTHENTICATION & REFERRAL SYSTEM
// ============================================================================

function getPublicRateKey(ctx: nkruntime.Context): string {
  // Public endpoints must never key by ctx.userId because anonymous auth
  // can be shared and would create a global throttle bucket.
  var ip = (ctx.clientIp || '').trim();
  if (ip) {
    return 'ip_' + ip;
  }
  if (ctx.userId) {
    return 'anon_' + ctx.userId;
  }
  return 'anonymous';
}

// Helper: Generate a random referral code (8 uppercase alphanumeric characters)
export function generateReferralCode(): string {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I, O, 0, 1
  var code = '';
  for (var i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: Generate a strong random salt for password hashing
export function generateSalt(nk: nkruntime.Nakama): string {
  return nk.uuidv4().replace(/-/g, '') + nk.uuidv4().replace(/-/g, '');
}

// Helper: Hash password using bcrypt (salt embedded)
export function hashPassword(password: string, nk: nkruntime.Nakama): { hash: string; salt: string } {
  var hash = nk.bcryptHash(password);
  // Store bcrypt salt prefix for reference (hash contains full salt+hash)
  var salt = hash.substring(0, 29);
  return { hash: hash, salt: salt };
}

// Helper: Verify password against bcrypt hash
export function verifyPassword(password: string, hash: string, nk: nkruntime.Nakama): boolean {
  return nk.bcryptCompare(password, hash);
}

// Helper: Web session token hashing (peppered)
export function hashWebSessionToken(token: string, pepper: string, nk: nkruntime.Nakama): string {
  return nk.sha256Hash(token + '|' + pepper);
}

export function getWebAuthPepper(ctx: nkruntime.Context, logger: nkruntime.Logger): string {
  var pepper = ctx.env['WEB_AUTH_PEPPER'] || ctx.env['NAKAMA_SERVER_KEY'];
  if (!pepper) {
    logger.error('WEB_AUTH_PEPPER is required for web auth');
    throw new Error('Server misconfiguration');
  }
  return pepper;
}

export function getWebSessionTtlMinutes(ctx: nkruntime.Context): number {
  var raw = parseInt(ctx.env['WEB_SESSION_TTL_MINUTES'] || '30', 10);
  if (isNaN(raw)) return 30;
  return Math.min(Math.max(raw, 5), 1440);
}

export function issueWebSessionToken(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  ctx: nkruntime.Context,
  userId: string
): { token: string; expiresAt: string } {
  var token = nk.uuidv4() + nk.uuidv4();
  var pepper = getWebAuthPepper(ctx, logger);
  var tokenHash = hashWebSessionToken(token, pepper, nk);
  var ttlMinutes = getWebSessionTtlMinutes(ctx);
  var expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  try {
    var updateRows = nk.sqlQuery(
      `UPDATE web_credentials
       SET session_token_hash = $1, session_token_expires_at = $2
       WHERE user_id = $3
       RETURNING user_id`,
      [tokenHash, expiresAt, userId]
    ) as unknown as any[];
    if (!updateRows || updateRows.length === 0) {
      throw new Error('Web session token update failed');
    }
  } catch (error) {
    logger.error('Failed to store web session token: ' + error);
    throw error;
  }

  return { token: token, expiresAt: expiresAt };
}

export function getTelegramLoginTtlMinutes(ctx: nkruntime.Context): number {
  var raw = parseInt(ctx.env['TELEGRAM_LOGIN_TTL_MINUTES'] || '5', 10);
  if (isNaN(raw)) return 5;
  return Math.min(Math.max(raw, 1), 60);
}

export function issueTelegramLoginToken(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  ctx: nkruntime.Context,
  payload: TelegramLoginPayload
): { token: string; expiresAt: string } {
  var token = nk.uuidv4() + nk.uuidv4();
  var pepper = getWebAuthPepper(ctx, logger);
  var tokenHash = hashWebSessionToken(token, pepper, nk);
  var ttlMinutes = getTelegramLoginTtlMinutes(ctx);
  var expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  try {
    nk.sqlExec(
      `INSERT INTO telegram_login_tokens
        (telegram_id, token_hash, first_name, last_name, username, photo_url, auth_date, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (telegram_id)
       DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         username = EXCLUDED.username,
         photo_url = EXCLUDED.photo_url,
         auth_date = EXCLUDED.auth_date,
         expires_at = EXCLUDED.expires_at`,
      [
        payload.id,
        tokenHash,
        payload.first_name || '',
        payload.last_name || '',
        payload.username || '',
        payload.photo_url || '',
        payload.auth_date || 0,
        expiresAt,
      ]
    );
  } catch (error) {
    logger.error('Failed to store Telegram login token: ' + error);
    throw error;
  }

  return { token: token, expiresAt: expiresAt };
}

// Helper: Validate referral code and return code data if valid
export function validateReferralCodeInternal(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  code: string
): { valid: boolean; codeId?: string; error?: string } {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Referral code is required' };
  }

  var normalizedCode = code.toUpperCase().trim();
  if (normalizedCode.length < 3 || normalizedCode.length > 20) {
    return { valid: false, error: 'Invalid referral code format' };
  }

  try {
    var result = nk.sqlQuery(
      `SELECT id, max_uses, current_uses, is_active, expires_at
       FROM referral_codes
       WHERE code = $1`,
      [normalizedCode]
    ) as unknown as any[];

    if (!result || result.length === 0) {
      return { valid: false, error: 'Referral code not found' };
    }

    var codeData = result[0];

    if (!codeData.is_active) {
      return { valid: false, error: 'Referral code is no longer active' };
    }

    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return { valid: false, error: 'Referral code has expired' };
    }

    if (codeData.current_uses >= codeData.max_uses) {
      return { valid: false, error: 'Referral code has reached maximum uses' };
    }

    return { valid: true, codeId: codeData.id };
  } catch (error) {
    logger.error('Error validating referral code: ' + error);
    return { valid: false, error: 'Failed to validate referral code' };
  }
}

// Helper: Create a referral code for a new user
export function createUserReferralCode(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string
): string {
  var maxAttempts = 5;
  var code = '';

  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    code = generateReferralCode();
    try {
      // Try to insert the referral code
      nk.sqlExec(
        `INSERT INTO referral_codes (code, creator_id, creator_type, max_uses, current_uses, is_active)
         VALUES ($1, $2, 'user', 10, 0, true)`,
        [code, userId]
      );

      // Get the created code ID
      var result = nk.sqlQuery(
        `SELECT id FROM referral_codes WHERE code = $1`,
        [code]
      ) as unknown as any[];

      if (result && result.length > 0) {
        var codeId = result[0].id;
        // Link the code to the user
        nk.sqlExec(
          `INSERT INTO user_referral_codes (user_id, referral_code_id) VALUES ($1, $2)`,
          [userId, codeId]
        );
        logger.info('Created referral code ' + code + ' for user ' + userId);
        return code;
      }
    } catch (error) {
      // Code might be duplicate, try again
      logger.debug('Referral code collision, retrying: ' + error);
    }
  }

  logger.error('Failed to create referral code for user ' + userId + ' after ' + maxAttempts + ' attempts');
  return '';
}

// RPC: Telegram web login (no auth required)
export function rpcTelegramWebLogin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var request: TelegramLoginPayload;
  try {
    request = JSON.parse(payload || '{}');
  } catch (error) {
    throw new Error('Invalid request payload');
  }

  var telegramId = typeof request.id === 'number' ? request.id : parseInt(String(request.id || ''), 10);
  var authDate = typeof request.auth_date === 'number' ? request.auth_date : parseInt(String(request.auth_date || ''), 10);
  if (!telegramId || !request.hash || !authDate) {
    throw new Error('Invalid Telegram login payload');
  }

  var rateKey = getPublicRateKey(ctx);
  checkRateLimitByKey(ctx, logger, nk, 'telegram_web_login', rateKey);

  var botToken = getTelegramBotToken(ctx, nk, logger);
  var allowInsecure = ctx.env['ALLOW_INSECURE_TELEGRAM_AUTH'] === 'true';

  var payloadForValidation: TelegramLoginPayload = {
    id: telegramId,
    first_name: request.first_name,
    last_name: request.last_name,
    username: request.username,
    photo_url: request.photo_url,
    auth_date: authDate,
    hash: request.hash,
  };

  if (!validateTelegramLoginPayload(payloadForValidation, botToken, logger, allowInsecure)) {
    throw new Error('Invalid Telegram login');
  }

  var sessionToken: { token: string; expiresAt: string };
  try {
    sessionToken = issueTelegramLoginToken(nk, logger, ctx, payloadForValidation);
  } catch (error) {
    logger.error('Failed to issue Telegram login token: ' + error);
    throw new Error('Login failed');
  }

  return JSON.stringify({
    success: true,
    authToken: 'telegram_' + telegramId.toString(),
    sessionToken: sessionToken.token,
    sessionExpiresAt: sessionToken.expiresAt,
    telegramId: telegramId,
  });
}

// RPC: Validate referral code (no auth required)
export function rpcValidateReferralCode(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var request: { code: string };
  try {
    request = JSON.parse(payload || '{}');
  } catch (error) {
    throw new Error('Invalid request payload');
  }

  var rateKey = getPublicRateKey(ctx);
  checkRateLimitByKey(ctx, logger, nk, 'validate_referral_code', rateKey);

  var result = validateReferralCodeInternal(nk, logger, request.code);

  return JSON.stringify({
    valid: result.valid,
    error: result.error || null,
  });
}

// RPC: Web user registration (no auth required)
export function rpcWebRegister(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var request: { nickname: string; password: string; referralCode: string };
  try {
    request = JSON.parse(payload);
  } catch (error) {
    throw new Error('Invalid request payload');
  }

  var rateKey = getPublicRateKey(ctx);
  checkRateLimitByKey(ctx, logger, nk, 'web_register', rateKey);

  // Validate inputs
  if (!request.nickname || typeof request.nickname !== 'string') {
    throw new Error('Nickname is required');
  }
  if (!request.password || typeof request.password !== 'string') {
    throw new Error('Password is required');
  }
  if (!request.referralCode || typeof request.referralCode !== 'string') {
    throw new Error('Referral code is required');
  }

  var nickname = request.nickname.trim();
  var password = request.password;
  var referralCode = request.referralCode.toUpperCase().trim();

  // Validate nickname format
  if (nickname.length < 3 || nickname.length > 20) {
    throw new Error('Nickname must be between 3 and 20 characters');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(nickname)) {
    throw new Error('Nickname can only contain letters, numbers, and underscores');
  }

  // Validate password
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  // Check if nickname is already taken
  try {
    var existingCheck = nk.sqlQuery(
      `SELECT id FROM web_credentials WHERE LOWER(nickname) = LOWER($1)`,
      [nickname]
    ) as unknown as any[];
    if (existingCheck && existingCheck.length > 0) {
      throw new Error('Nickname is already taken');
    }
  } catch (error: any) {
    if (error.message === 'Nickname is already taken') {
      throw error;
    }
    logger.error('Error checking nickname: ' + error);
    throw new Error('Registration failed');
  }

  // Validate referral code
  var codeValidation = validateReferralCodeInternal(nk, logger, referralCode);
  if (!codeValidation.valid) {
    throw new Error(codeValidation.error || 'Invalid referral code');
  }

  // Reserve a referral code use (atomic update)
  var usageReserved = false;
  try {
    var reserveRows = nk.sqlQuery(
      `UPDATE referral_codes
       SET current_uses = current_uses + 1
       WHERE id = $1
       AND is_active = true
       AND current_uses < max_uses
       AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING id`,
      [codeValidation.codeId]
    ) as unknown as any[];

    if (!reserveRows || reserveRows.length === 0) {
      throw new Error('Referral code has reached maximum uses');
    }
    usageReserved = true;
  } catch (error) {
    logger.warn('Failed to reserve referral code usage: ' + error);
    throw error instanceof Error ? error : new Error('Referral code reservation failed');
  }

  // Create the user with Nakama custom auth
  var webUserId = 'web_' + nickname.toLowerCase();
  var authResult: nkruntime.AuthResult;
  try {
    authResult = nk.authenticateCustom(webUserId, nickname, true);
  } catch (error) {
    logger.error('Failed to create web user: ' + error);
    if (usageReserved) {
      nk.sqlExec(
        `UPDATE referral_codes SET current_uses = GREATEST(current_uses - 1, 0) WHERE id = $1`,
        [codeValidation.codeId]
      );
    }
    throw new Error('Registration failed');
  }

  // Generate password hash
  var passwordData = hashPassword(password, nk);

  // Store web credentials
  try {
    nk.sqlExec(
      `INSERT INTO web_credentials (user_id, nickname, password_hash, password_salt, referral_code_used)
       VALUES ($1, $2, $3, $4, $5)`,
      [authResult.userId, nickname, passwordData.hash, passwordData.salt, codeValidation.codeId]
    );
  } catch (error) {
    logger.error('Failed to store web credentials: ' + error);
    if (usageReserved) {
      nk.sqlExec(
        `UPDATE referral_codes SET current_uses = GREATEST(current_uses - 1, 0) WHERE id = $1`,
        [codeValidation.codeId]
      );
    }
    throw new Error('Registration failed');
  }

  // Record usage
  try {
    nk.sqlExec(
      `INSERT INTO referral_usage (code_id, user_id) VALUES ($1, $2)`,
      [codeValidation.codeId, authResult.userId]
    );
  } catch (error) {
    logger.warn('Failed to record referral usage: ' + error);
  }

  // Initialize player data
  initializePlayerData(nk, authResult.userId, {
    id: 0, // No Telegram ID for web users
    first_name: nickname,
    username: nickname,
  } as any, logger);

  // Get player profile data with all fields for matchmaking
  var profileData: any = {
    mmr: GAME_CONFIG.STARTING_MMR,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rankTier: 'bronze',
    peakMmr: GAME_CONFIG.STARTING_MMR,
    rd: 350,        // Glicko-2 rating deviation (starting value)
    volatility: 0.06  // Glicko-2 volatility (starting value)
  };

  var sessionToken: { token: string; expiresAt: string };
  try {
    sessionToken = issueWebSessionToken(nk, logger, ctx, authResult.userId);
  } catch (error) {
    logger.error('Failed to issue web session token: ' + error);
    try {
      nk.sqlExec(`DELETE FROM web_credentials WHERE user_id = $1`, [authResult.userId]);
      nk.sqlExec(`DELETE FROM referral_usage WHERE code_id = $1 AND user_id = $2`, [codeValidation.codeId, authResult.userId]);
      nk.sqlExec(`UPDATE referral_codes SET current_uses = GREATEST(current_uses - 1, 0) WHERE id = $1`, [codeValidation.codeId]);
    } catch (cleanupError) {
      logger.warn('Failed to cleanup web registration after token error: ' + cleanupError);
    }
    throw new Error('Registration failed');
  }

  // Create a referral code for the new user
  var userReferralCode = createUserReferralCode(nk, logger, authResult.userId);

  logger.info('Web user registered: ' + authResult.userId + ' (' + nickname + ')');

  return JSON.stringify({
    success: true,
    userId: authResult.userId,
    username: nickname,
    displayName: nickname,
    authToken: webUserId,
    sessionToken: sessionToken.token,
    sessionExpiresAt: sessionToken.expiresAt,
    globalMmr: profileData,
    referralCode: userReferralCode,
  });
}

// RPC: Web user login (no auth required)
export function rpcWebLogin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var request: { nickname: string; password: string };
  try {
    request = JSON.parse(payload || '{}');
  } catch (error) {
    throw new Error('Invalid request payload');
  }

  if (!request.nickname || !request.password) {
    throw new Error('Nickname and password are required');
  }

  var rateKey = getPublicRateKey(ctx);
  checkRateLimitByKey(ctx, logger, nk, 'web_login', rateKey);

  var nickname = request.nickname.trim();
  var password = request.password;

  // Look up web credentials
  var credResult: any[];
  try {
    credResult = nk.sqlQuery(
      `SELECT user_id, password_hash, password_salt FROM web_credentials WHERE LOWER(nickname) = LOWER($1)`,
      [nickname]
    ) as unknown as any[];
  } catch (error) {
    logger.error('Error looking up credentials: ' + error);
    throw new Error('Login failed');
  }

  if (!credResult || credResult.length === 0) {
    throw new Error('Invalid nickname or password');
  }

  var cred = credResult[0];

  // Verify password (supports legacy SHA256+salt and bcrypt)
  var passwordValid = false;
  if (cred.password_hash && cred.password_hash.indexOf('$2') === 0) {
    passwordValid = verifyPassword(password, cred.password_hash, nk);
  } else {
    var legacySalt = cred.password_salt || '';
    var legacyHash = nk.sha256Hash(password + legacySalt);
    if (legacyHash === cred.password_hash) {
      passwordValid = true;
      // Upgrade legacy hash to bcrypt on successful login
      try {
        var upgraded = hashPassword(password, nk);
        nk.sqlExec(
          `UPDATE web_credentials SET password_hash = $1, password_salt = $2 WHERE user_id = $3`,
          [upgraded.hash, upgraded.salt, cred.user_id]
        );
      } catch (upgradeError) {
        logger.warn('Failed to upgrade legacy password hash: ' + upgradeError);
      }
    }
  }
  if (!passwordValid) {
    throw new Error('Invalid nickname or password');
  }

  // Update last login time
  try {
    nk.sqlExec(
      `UPDATE web_credentials SET last_login_at = NOW() WHERE user_id = $1`,
      [cred.user_id]
    );
  } catch (error) {
    logger.warn('Failed to update last login: ' + error);
  }

  // Get user's auth token for Nakama
  var webUserId = 'web_' + nickname.toLowerCase();

  // Get player profile data with all fields for matchmaking
  var profileData: any = {
    mmr: GAME_CONFIG.STARTING_MMR,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rankTier: 'bronze',
    peakMmr: GAME_CONFIG.STARTING_MMR,
    rd: 350,        // Glicko-2 rating deviation (starting value)
    volatility: 0.06  // Glicko-2 volatility (starting value)
  };

  try {
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'global_mmr', userId: cred.user_id },
    ];
    var results = nk.storageRead(reads);
    if (results.length > 0) {
      var storedData = results[0].value;
      // Merge stored data with defaults to ensure all fields exist
      profileData = {
        mmr: storedData.mmr !== undefined ? storedData.mmr : profileData.mmr,
        gamesPlayed: storedData.gamesPlayed !== undefined ? storedData.gamesPlayed : profileData.gamesPlayed,
        wins: storedData.wins !== undefined ? storedData.wins : profileData.wins,
        losses: storedData.losses !== undefined ? storedData.losses : profileData.losses,
        draws: storedData.draws !== undefined ? storedData.draws : profileData.draws,
        rankTier: storedData.rankTier || profileData.rankTier,
        peakMmr: storedData.peakMmr !== undefined ? storedData.peakMmr : (storedData.mmr || profileData.peakMmr),
        rd: storedData.rd !== undefined ? storedData.rd : profileData.rd,
        volatility: storedData.volatility !== undefined ? storedData.volatility : profileData.volatility
      };
    }
  } catch (error) {
    logger.warn('Could not read profile data: ' + error);
  }

  // Get user's display name
  var displayName = nickname;
  try {
    var account = nk.accountGetId(cred.user_id);
    if (account && account.user && account.user.displayName) {
      displayName = account.user.displayName;
    }
  } catch (error) {
    logger.warn('Could not get account: ' + error);
  }

  logger.info('Web user logged in: ' + cred.user_id + ' (' + nickname + ')');

  var sessionToken: { token: string; expiresAt: string };
  try {
    sessionToken = issueWebSessionToken(nk, logger, ctx, cred.user_id);
  } catch (error) {
    logger.error('Failed to issue web session token: ' + error);
    throw new Error('Login failed');
  }

  return JSON.stringify({
    success: true,
    userId: cred.user_id,
    username: nickname,
    displayName: displayName,
    authToken: webUserId,
    sessionToken: sessionToken.token,
    sessionExpiresAt: sessionToken.expiresAt,
    globalMmr: profileData,
  });
}

// RPC: Get user's own referral code (auth required)
export function rpcGetMyReferralCode(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  // Check if user already has a referral code
  var result: any[];
  try {
    result = nk.sqlQuery(
      `SELECT rc.code, rc.max_uses, rc.current_uses, rc.is_active, rc.created_at
       FROM user_referral_codes urc
       JOIN referral_codes rc ON urc.referral_code_id = rc.id
       WHERE urc.user_id = $1`,
      [ctx.userId]
    ) as unknown as any[];
  } catch (error) {
    logger.error('Error getting user referral code: ' + error);
    throw new Error('Failed to get referral code');
  }

  if (result && result.length > 0) {
    var codeData = result[0];
    return JSON.stringify({
      code: codeData.code,
      maxUses: codeData.max_uses,
      currentUses: codeData.current_uses,
      isActive: codeData.is_active,
      createdAt: codeData.created_at,
    });
  }

  // Create a new referral code for the user if they don't have one
  var newCode = createUserReferralCode(nk, logger, ctx.userId);
  if (!newCode) {
    throw new Error('Failed to create referral code');
  }

  return JSON.stringify({
    code: newCode,
    maxUses: 10,
    currentUses: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
  });
}

// RPC: Web logout (auth required)
export function rpcWebLogout(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    nk.sqlExec(
      `UPDATE web_credentials SET session_token_hash = NULL, session_token_expires_at = NULL WHERE user_id = $1`,
      [ctx.userId]
    );
  } catch (error) {
    logger.warn('Failed to revoke web session token: ' + error);
  }

  return JSON.stringify({ success: true });
}

// RPC: Admin create referral code
export function rpcAdminCreateReferralCode(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var admin = requireAdminCapability(ctx, nk, logger, 'referral_codes.manage');

  var request: { code?: string; maxUses?: number; expiresAt?: string; notes?: string };
  try {
    request = JSON.parse(payload);
  } catch (error) {
    throw new Error('Invalid request payload');
  }

  var code = request.code ? request.code.toUpperCase().trim() : generateReferralCode();
  var maxUses = request.maxUses && request.maxUses > 0 ? request.maxUses : 100;
  var expiresAt = request.expiresAt || null;
  var notes = request.notes || null;

  // Validate code format
  if (!/^[A-Z0-9]{3,20}$/.test(code)) {
    throw new Error('Code must be 3-20 alphanumeric characters');
  }

  try {
    nk.sqlExec(
      `INSERT INTO referral_codes (code, creator_id, creator_type, max_uses, current_uses, is_active, expires_at, notes)
       VALUES ($1, $2, 'admin', $3, 0, true, $4, $5)`,
      [code, ctx.userId || null, maxUses, expiresAt, notes]
    );
  } catch (error: any) {
    if (error.message && error.message.indexOf('duplicate') >= 0) {
      throw new Error('A referral code with this value already exists');
    }
    logger.error('Failed to create referral code: ' + error);
    throw new Error('Failed to create referral code');
  }

  // Log admin action
  logAdminAction(
    nk,
    logger,
    ctx.userId || '',
    admin.telegramId,
    'create_referral_code',
    'referral_code',
    code,
    null,
    {
      maxUses: maxUses,
      expiresAt: expiresAt,
      notes: notes,
    }
  );

  logger.info('Admin created referral code: ' + code);

  return JSON.stringify({
    success: true,
    code: code,
    maxUses: maxUses,
    expiresAt: expiresAt,
  });
}

// RPC: Admin list referral codes
export function rpcAdminListReferralCodes(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  requireAdminCapability(ctx, nk, logger, 'referral_codes.view');

  var request: { page?: number; limit?: number; filter?: string };
  try {
    request = payload ? JSON.parse(payload) : {};
  } catch (error) {
    request = {};
  }

  var page = request.page && request.page > 0 ? request.page : 1;
  var limit = request.limit && request.limit > 0 && request.limit <= 100 ? request.limit : 20;
  var offset = (page - 1) * limit;
  var filter = request.filter || 'all'; // 'all', 'active', 'expired', 'exhausted'

  var whereClause = '';
  if (filter === 'active') {
    whereClause = 'WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW()) AND current_uses < max_uses';
  } else if (filter === 'expired') {
    whereClause = 'WHERE expires_at IS NOT NULL AND expires_at <= NOW()';
  } else if (filter === 'exhausted') {
    whereClause = 'WHERE current_uses >= max_uses';
  } else if (filter === 'inactive') {
    whereClause = 'WHERE is_active = false';
  }

  // Get total count
  var countQuery = 'SELECT COUNT(*) as total FROM referral_codes ' + whereClause;
  var countResult = nk.sqlQuery(countQuery, []) as unknown as any[];
  var total = countResult && countResult.length > 0 ? parseInt(countResult[0].total) : 0;

  // Get referral codes
  var query = `
    SELECT rc.id, rc.code, rc.creator_id, rc.creator_type, rc.max_uses, rc.current_uses,
           rc.is_active, rc.created_at, rc.expires_at, rc.notes
    FROM referral_codes rc
    ${whereClause}
    ORDER BY rc.created_at DESC
    LIMIT $1 OFFSET $2
  `;

  var result: any[];
  try {
    result = nk.sqlQuery(query, [limit, offset]) as unknown as any[];
  } catch (error) {
    logger.error('Failed to list referral codes: ' + error);
    throw new Error('Failed to list referral codes');
  }

  var codes = (result || []).map(function(row: any) {
    return {
      id: row.id,
      code: row.code,
      creatorId: row.creator_id,
      creatorType: row.creator_type,
      maxUses: row.max_uses,
      currentUses: row.current_uses,
      isActive: row.is_active,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      notes: row.notes,
    };
  });

  return JSON.stringify({
    codes: codes,
    total: total,
    page: page,
    limit: limit,
    totalPages: Math.ceil(total / limit),
  });
}

// RPC: Admin toggle referral code active status
export function rpcAdminToggleReferralCode(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var admin = requireAdminCapability(ctx, nk, logger, 'referral_codes.manage');

  var request: { codeId?: string; code?: string; isActive: boolean };
  try {
    request = JSON.parse(payload);
  } catch (error) {
    throw new Error('Invalid request payload');
  }

  if (typeof request.isActive !== 'boolean') {
    throw new Error('isActive is required');
  }

  var whereClause = '';
  var params: any[] = [request.isActive];

  if (request.codeId) {
    whereClause = 'WHERE id = $2';
    params.push(request.codeId);
  } else if (request.code) {
    whereClause = 'WHERE code = $2';
    params.push(request.code.toUpperCase().trim());
  } else {
    throw new Error('Either codeId or code is required');
  }

  try {
    nk.sqlExec(
      `UPDATE referral_codes SET is_active = $1 ${whereClause}`,
      params
    );
  } catch (error) {
    logger.error('Failed to toggle referral code: ' + error);
    throw new Error('Failed to update referral code');
  }

  // Log admin action
  logAdminAction(
    nk,
    logger,
    ctx.userId || '',
    admin.telegramId,
    'toggle_referral_code',
    'referral_code',
    request.codeId || request.code || '',
    null,
    { isActive: request.isActive }
  );

  return JSON.stringify({
    success: true,
  });
}

// RPC: Admin get referral code usage details
export function rpcAdminGetReferralCodeUsage(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  requireAdminCapability(ctx, nk, logger, 'referral_codes.view');

  var request: { codeId?: string; code?: string };
  try {
    request = JSON.parse(payload);
  } catch (error) {
    throw new Error('Invalid request payload');
  }

  var codeId = request.codeId;

  // If code string provided, look up the ID
  if (!codeId && request.code) {
    var codeResult = nk.sqlQuery(
      `SELECT id FROM referral_codes WHERE code = $1`,
      [request.code.toUpperCase().trim()]
    ) as unknown as any[];
    if (codeResult && codeResult.length > 0) {
      codeId = codeResult[0].id;
    } else {
      throw new Error('Referral code not found');
    }
  }

  if (!codeId) {
    throw new Error('Either codeId or code is required');
  }

  // Get code details
  var codeDetails = nk.sqlQuery(
    `SELECT id, code, creator_id, creator_type, max_uses, current_uses, is_active, created_at, expires_at, notes
     FROM referral_codes WHERE id = $1`,
    [codeId]
  ) as unknown as any[];

  if (!codeDetails || codeDetails.length === 0) {
    throw new Error('Referral code not found');
  }

  // Get usage records
  var usageResult = nk.sqlQuery(
    `SELECT ru.user_id, ru.used_at, wc.nickname
     FROM referral_usage ru
     LEFT JOIN web_credentials wc ON ru.user_id = wc.user_id
     WHERE ru.code_id = $1
     ORDER BY ru.used_at DESC
     LIMIT 100`,
    [codeId]
  ) as unknown as any[];

  var usage = (usageResult || []).map(function(row: any) {
    return {
      userId: row.user_id,
      nickname: row.nickname || 'Unknown',
      usedAt: row.used_at,
    };
  });

  var code = codeDetails[0];
  return JSON.stringify({
    code: {
      id: code.id,
      code: code.code,
      creatorId: code.creator_id,
      creatorType: code.creator_type,
      maxUses: code.max_uses,
      currentUses: code.current_uses,
      isActive: code.is_active,
      createdAt: code.created_at,
      expiresAt: code.expires_at,
      notes: code.notes,
    },
    usage: usage,
  });
}
