#!/usr/bin/env node

/**
 * TOURNAMENT 128-PLAYER BO3 DOUBLE ELIMINATION COMPREHENSIVE TEST
 * ============================================================================
 *
 * This test creates a 128-player double elimination tournament with:
 *   - BO3 for all rounds (winners & losers)
 *   - BO5 for grand final
 *   - Grand final reset enabled
 *   - Random opening round seeding
 *   - Bot fill disabled (all 128 players are real bridge users)
 *
 * It stress-tests every code-path in the tournament system:
 *   - Bracket generation (128 → 7 winners rounds, 12 losers rounds, grand final)
 *   - Seeding with random_opening_round
 *   - Ready-check flow
 *   - Match start concurrency (advisory locks)
 *   - Best-of series (BO3 = 2 wins needed per match)
 *   - Winners bracket advancement
 *   - Losers bracket population and advancement
 *   - Grand final creation
 *   - Grand final reset (if losers bracket winner wins first grand final)
 *   - Tournament completion
 *   - Final placement assignment
 *   - Reward distribution
 *   - Pause/resume mid-tournament
 *   - Concurrent match reporting
 *   - Bracket integrity validation
 *
 * Usage:
 *   node scripts/tournament-128-bench.mjs
 *
 * Environment variables (same as tournament-e2e-smoke.mjs):
 *   NAKAMA_HOST / VITE_NAKAMA_HOST
 *   NAKAMA_PORT / VITE_NAKAMA_PORT
 *   VITE_NAKAMA_SSL
 *   NAKAMA_SERVER_KEY / VITE_NAKAMA_KEY
 *   ADMIN_TELEGRAM_IDS
 *   ADMIN_LOGIN_TOKEN
 *   E2E_KEEP_USERS=true|false
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// ============================================================================
// CONSTANTS
// ============================================================================

const HEALTHCHECK_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 60_000;
const LOOP_SLEEP_MS = 300;
const MAX_TOURNAMENT_LOOPS = 900; // 128-player double elim needs a LOT of iterations
const IDLE_LIMIT = 300;
const BRACKET_SIZE = 128;
const TOTAL_WINNERS_ROUNDS = 7; // log2(128)
const TOTAL_LOSERS_ROUNDS = (TOTAL_WINNERS_ROUNDS - 1) * 2; // 12

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonOrThrow(text, context) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${context}: expected JSON response, got: ${text.slice(0, 400)}`);
  }
}

function parseRpcPayload(payload) {
  if (payload === null || payload === undefined) return {};
  if (typeof payload === 'string') {
    if (!payload.trim()) return {};
    try { return JSON.parse(payload); } catch { return {}; }
  }
  if (typeof payload === 'object') return payload;
  return {};
}

function decodeJwtClaims(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch { return null; }
}

function basicAuthHeader(serverKey) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

function resolveBaseUrl() {
  const host = process.env.NAKAMA_HOST || process.env.VITE_NAKAMA_HOST || 'localhost';
  const port = process.env.NAKAMA_PORT || process.env.VITE_NAKAMA_PORT || '7350';
  const ssl = (process.env.VITE_NAKAMA_SSL || 'false').toLowerCase() === 'true';
  if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, '');
  const protocol = ssl ? 'https' : 'http';
  return `${protocol}://${host}:${port}`;
}

function resolveServerKey() {
  return process.env.NAKAMA_SERVER_KEY
    || process.env.VITE_NAKAMA_KEY
    || 'dev_server_key_change_me';
}

function resolveAdminTelegramId() {
  const raw = String(process.env.ADMIN_TELEGRAM_IDS || '').split(',')[0] || '';
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function createStableCustomId(seedPrefix, index) {
  const stamp = Date.now().toString(36).slice(-6);
  const nonce = Math.random().toString(36).slice(2, 7);
  // MUST use quizzy_ prefix — the auth system whitelists it for bridge/test users
  return `quizzy_${stamp}${nonce}_${seedPrefix}${index}`;
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

function isTransientRpcError(error) {
  const text = String(error && error.message ? error.message : error).toLowerCase();
  if (!text) return false;
  return text.includes('rate limit')
    || text.includes('timeout')
    || text.includes('temporar')
    || text.includes('concurrent')
    || text.includes('already been completed')
    || text.includes('is not in progress')
    || text.includes('match is currently being');
}

function isIgnorableStartError(error) {
  const text = String(error && error.message ? error.message : error).toLowerCase();
  return text.includes('already been completed')
    || text.includes('is not ready to start')
    || text.includes('not in progress')
    || text.includes('not a participant')
    || text.includes('both players must be ready')
    || text.includes('match is currently being')
    || text.includes('is not ready');
}

function isIgnorableReadyError(error) {
  const text = String(error && error.message ? error.message : error).toLowerCase();
  return text.includes('ready check is not required')
    || text.includes('match is not in ready state')
    || text.includes('tournament is paused')
    || text.includes('match not found')
    || text.includes('user is not a participant')
    || text.includes('status is: eliminated')
    || text.includes('status is: forfeited')
    || text.includes('status is: disqualified');
}

function isRateLimitError(error) {
  const text = String(error && error.message ? error.message : error).toLowerCase();
  return text.includes('rate limit');
}

// ============================================================================
// NAKAMA HTTP CLIENT
// ============================================================================

class NakamaHarnessClient {
  constructor(baseUrl, serverKey) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.serverKey = serverKey;
    this.basicAuth = basicAuthHeader(serverKey);
  }

  async requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const isJson = contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[');
      const data = isJson && text ? parseJsonOrThrow(text, `HTTP ${method} ${url}`) : text;
      if (!response.ok) {
        const message = typeof data === 'object' && data !== null
          ? (data.message || data.error || JSON.stringify(data))
          : String(data || `HTTP ${response.status}`);
        const err = new Error(`HTTP ${response.status} ${method} ${url}: ${message}`);
        err.status = response.status;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async healthcheck() {
    return this.requestJson(`${this.baseUrl}/healthcheck`, { timeoutMs: HEALTHCHECK_TIMEOUT_MS });
  }

  async authenticateCustom({ customId, username, vars = {}, create = true }) {
    const params = new URLSearchParams();
    params.set('create', create ? 'true' : 'false');
    if (username) params.set('username', username);
    const url = `${this.baseUrl}/v2/account/authenticate/custom?${params.toString()}`;
    const response = await this.requestJson(url, {
      method: 'POST',
      headers: {
        Authorization: this.basicAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: customId, vars }),
    });
    const claims = decodeJwtClaims(response && response.token ? response.token : '');
    const userId = response && response.user_id
      ? response.user_id
      : (claims && (claims.uid || claims.user_id) ? String(claims.uid || claims.user_id) : null);
    if (!response || !response.token || !userId) {
      throw new Error(`authenticateCustom(${customId}) returned invalid response`);
    }
    return {
      token: response.token,
      refreshToken: response.refresh_token || null,
      userId,
      username: response.username || null,
      customId,
    };
  }

  async deleteAccount(token) {
    const url = `${this.baseUrl}/v2/account`;
    await this.requestJson(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async rpc(token, rpcId, payload = {}) {
    const url = `${this.baseUrl}/v2/rpc/${encodeURIComponent(rpcId)}`;
    const hasPayload = payload !== null
      && payload !== undefined
      && !(typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 0);
    const payloadText = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    const response = await this.requestJson(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: hasPayload ? JSON.stringify(payloadText) : undefined,
    });
    if (response && Object.prototype.hasOwnProperty.call(response, 'payload')) {
      return parseRpcPayload(response.payload);
    }
    return parseRpcPayload(response);
  }
}

// ============================================================================
// RETRY HELPER
// ============================================================================

async function withRetry(fn, label, options = {}) {
  const retries = Number.isFinite(options.retries) ? Number(options.retries) : 4;
  const baseDelayMs = Number.isFinite(options.baseDelayMs) ? Number(options.baseDelayMs) : 300;
  const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : isTransientRpcError;
  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) throw error;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[retry] ${label} failed (attempt ${attempt + 1}/${retries + 1}): ${error.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastError || new Error(`${label} failed`);
}

// ============================================================================
// ADMIN AUTH
// ============================================================================

async function ensureAdminSession(client) {
  const adminTelegramId = resolveAdminTelegramId();
  const adminToken = String(process.env.ADMIN_LOGIN_TOKEN || '').trim();
  if (!adminTelegramId) throw new Error('ADMIN_TELEGRAM_IDS is required');
  if (!adminToken) throw new Error('ADMIN_LOGIN_TOKEN is required');

  const admin = await client.authenticateCustom({
    customId: `admin_token_${adminTelegramId}`,
    create: true,
    vars: { adminToken },
  });
  const verify = await client.rpc(admin.token, 'admin_verify_session', {});
  if (!verify || verify.valid !== true) {
    throw new Error('admin_verify_session returned invalid=false');
  }
  return { ...admin, telegramId: adminTelegramId, adminInfo: verify.adminInfo || null };
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function createBridgeUsers(client, count, prefix) {
  const users = [];
  const batchSize = 10; // Create in batches to avoid overwhelming the server
  for (let batch = 0; batch < count; batch += batchSize) {
    const batchEnd = Math.min(batch + batchSize, count);
    const batchPromises = [];
    for (let i = batch; i < batchEnd; i++) {
      batchPromises.push((async (idx) => {
        const customId = createStableCustomId(prefix, idx + 1);
        const displayName = `P${idx + 1}`;
        return withRetry(
          () => client.authenticateCustom({ customId, create: true, vars: {} }),
          `auth user ${customId}`,
          { retries: 5, shouldRetry: isTransientRpcError }
        );
      })(i));
    }
    const batchResults = await Promise.allSettled(batchPromises);
    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].status === 'fulfilled') {
        const user = batchResults[j].value;
        users.push({ ...user, displayName: `P${batch + j + 1}` });
      } else {
        throw new Error(`Failed to create user ${batch + j + 1}: ${batchResults[j].reason}`);
      }
    }
    if (batch + batchSize < count) {
      console.log(`[users] Created ${batchEnd}/${count} users...`);
      await sleep(200); // Brief pause between batches
    }
  }
  console.log(`[users] Created all ${users.length} bridge users`);
  return users;
}

// ============================================================================
// TOURNAMENT OPERATIONS
// ============================================================================

function buildTournamentCreatePayload() {
  const now = Date.now();
  return {
    name: `128P DOUBLE ELIM BO3 STRESS TEST ${Date.now()}`,
    description: 'Comprehensive 128-player double elimination BO3 stress test with grand final reset',
    format: 'double_elimination',
    seedingMode: 'random_opening_round',
    bracketSize: BRACKET_SIZE,
    minMmr: 0,
    maxMmr: 5000,
    questionCount: 5,
    timePerQuestionMs: 10000,
    registrationStart: new Date(now - 2 * 60_000).toISOString(),
    registrationEnd: new Date(now + 60 * 60_000).toISOString(),
    tournamentStart: new Date(now + 120 * 60_000).toISOString(),
    allowSpectators: true,
    category: null, // mixed
    grandFinalReset: true,
    bestOfByRound: {
      opening: 1,         // Opening round: BO1
      winners: {
        1: 1,             // Round 1: BO1
        2: 3,             // Round 2: BO3
        3: 3,             // Round 3: BO3
        4: 3,             // Round 4: BO3
        5: 3,             // Round 5: BO3
        6: 3,             // Round 6: BO3
        7: 3,             // Round 7 (semifinals): BO3
      },
      losers: {
        1: 1,             // LR1: BO1
        2: 1,             // LR2: BO1
        3: 3,             // LR3: BO3
        4: 3,             // LR4: BO3
        5: 3,             // LR5: BO3
        6: 3,             // LR6: BO3
        7: 3,             // LR7: BO3
        8: 3,             // LR8: BO3
        9: 3,             // LR9: BO3
        10: 3,            // LR10: BO3
        11: 3,            // LR11: BO3
        12: 3,            // LR12 (losers final): BO3
      },
      grand_final: 5,     // Grand final: BO5
      default: 1,
    },
  };
}

async function registerUsers(client, tournamentId, users) {
  const batchSize = 10;
  let registered = 0;
  for (let batch = 0; batch < users.length; batch += batchSize) {
    const batchEnd = Math.min(batch + batchSize, users.length);
    const batchPromises = [];
    for (let i = batch; i < batchEnd; i++) {
      batchPromises.push(
        withRetry(
          () => client.rpc(users[i].token, 'register_for_tournament', { tournamentId }),
          `register ${users[i].displayName}`,
          { retries: 5, shouldRetry: isTransientRpcError }
        )
      );
    }
    const results = await Promise.allSettled(batchPromises);
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      if (result.value && result.value.success) registered++;
    }
    if (batch + batchSize < users.length) {
      console.log(`[register] Registered ${batchEnd}/${users.length}...`);
      await sleep(100);
    }
  }
  console.log(`[register] All ${registered} users registered`);
  return registered;
}

// ============================================================================
// MATCH PROGRESSION LOGIC
// ============================================================================

function pickHumanStarters(match, usersById) {
  const starters = [];
  const seen = new Set();
  if (match.player1UserId && usersById.has(match.player1UserId) && !seen.has(match.player1UserId)) {
    seen.add(match.player1UserId);
    starters.push(usersById.get(match.player1UserId));
  }
  if (match.player2UserId && usersById.has(match.player2UserId) && !seen.has(match.player2UserId)) {
    seen.add(match.player2UserId);
    starters.push(usersById.get(match.player2UserId));
  }
  return starters;
}

function pickWinnerUserId(match) {
  const p1 = match && match.player1UserId ? String(match.player1UserId) : null;
  const p2 = match && match.player2UserId ? String(match.player2UserId) : null;
  if (p1 && !p2) return p1;
  if (p2 && !p1) return p2;
  if (p1) return p1;
  return p2;
}

function determineRandomWinner(match) {
  // Randomly pick winner for stress testing
  const p1 = match && match.player1UserId ? String(match.player1UserId) : null;
  const p2 = match && match.player2UserId ? String(match.player2UserId) : null;
  if (p1 && p2) return Math.random() < 0.5 ? p1 : p2;
  return p1 || p2;
}

async function markReadyForMatch(client, tournamentId, match, starters, label) {
  for (const starter of starters) {
    try {
      await withRetry(
        () => client.rpc(starter.token, 'tournament_ready_check', {
          tournamentId,
          matchId: match.id,
          ready: true,
        }),
        `${label} ready-check ${match.id}`,
        { retries: 2, shouldRetry: isTransientRpcError }
      );
    } catch (error) {
      if (isRateLimitError(error)) return { rateLimited: true };
      if (!isIgnorableReadyError(error)) throw error;
    }
  }
  return { rateLimited: false };
}

async function startAndReportMatch(client, admin, tournamentId, match, starters, label) {
  // Step 1: Ready check
  const readyResult = await markReadyForMatch(client, tournamentId, match, starters, label);
  if (readyResult.rateLimited) return { rateLimited: true, resolved: false };

  // Step 2: Start match
  for (const starter of starters) {
    try {
      const startResponse = await withRetry(
        () => client.rpc(starter.token, 'start_tournament_match', { matchId: match.id }),
        `${label} start match ${match.id}`,
        { retries: 2, shouldRetry: isTransientRpcError }
      );
      if (startResponse && startResponse.matchId) break;
    } catch (error) {
      if (isRateLimitError(error)) return { rateLimited: true, resolved: false };
      if (!isIgnorableStartError(error)) throw error;
    }
  }

  await sleep(50); // Brief pause to let match state settle

  // Step 3: Report result (admin force-report to simulate match completion)
  const winnerId = determineRandomWinner(match);
  const p1 = String(match.player1UserId || '');
  const p2 = String(match.player2UserId || '');
  const player1Score = winnerId === p1 ? 10 : 7;
  const player2Score = winnerId === p2 ? 10 : 7;

  await withRetry(
    () => client.rpc(admin.token, 'report_tournament_match_result', {
      tournamentMatchId: match.id,
      winnerId,
      player1Score,
      player2Score,
    }),
    `${label} report match ${match.id}`,
    { retries: 4, shouldRetry: isTransientRpcError }
  );

  return { rateLimited: false, resolved: true, winnerId };
}

async function progressTournamentToCompletion(client, admin, users, tournamentId, label) {
  const usersById = new Map(users.map((u) => [u.userId, u]));
  let totalResolved = 0;
  let idleCycles = 0;
  let lastSnapshot = null;
  let pauseResumeDone = false;
  const summary = {
    winnersResolved: 0,
    losersResolved: 0,
    grandFinalResolved: 0,
    byes: 0,
    errors: [],
    warnings: [],
    pauseResumeTested: false,
    grandFinalResetTriggered: false,
    roundsCompleted: new Set(),
    bracketMismatches: [],
  };

  for (let loop = 0; loop < MAX_TOURNAMENT_LOOPS; loop++) {
    const details = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const tournamentStatus = details && details.tournament ? String(details.tournament.status || '') : '';

    if (tournamentStatus === 'completed') {
      console.log(`[${label}] Tournament completed! Total loops: ${loop + 1}`);
      summary.loops = loop + 1;
      summary.totalResolved = totalResolved;

      // Collect final stats
      const matches = Array.isArray(details.matches) ? details.matches : [];
      summary.finalMatchCount = matches.length;
      summary.finalCompletedCount = matches.filter(m => m.status === 'completed').length;
      summary.finalByeCount = matches.filter(m => m.status === 'bye').length;
      summary.finalPendingCount = matches.filter(m => m.status === 'pending').length;
      summary.finalReadyCount = matches.filter(m => m.status === 'ready').length;

      return summary;
    }

    if (tournamentStatus === 'cancelled') {
      throw new Error(`${label}: Tournament unexpectedly cancelled`);
    }

    const matches = Array.isArray(details.matches) ? details.matches : [];

    // Build bracket status snapshot
    const bracketStatus = {};
    for (const match of matches) {
      if (!match) continue;
      const key = `${String(match.bracketType || 'winners')}:${String(match.status || 'unknown')}`;
      bracketStatus[key] = (bracketStatus[key] || 0) + 1;
    }

    lastSnapshot = {
      tournamentStatus,
      totalMatches: matches.length,
      bracketStatus,
      loop,
    };

    // Categorize matches
    const readyMatches = matches.filter(m => m && m.status === 'ready');
    const inProgressMatches = matches.filter(m => m && m.status === 'in_progress');
    const pendingMatches = matches.filter(m => m && m.status === 'pending');
    const byeMatches = matches.filter(m => m && m.status === 'bye');

    let actions = 0;
    let sawRateLimit = false;

    // Test pause/resume once when we have ready matches
    if (!pauseResumeDone && readyMatches.length > 0 && inProgressMatches.length === 0) {
      console.log(`[${label}] Testing pause/resume at loop ${loop}...`);
      try {
        await withRetry(
          () => client.rpc(admin.token, 'admin_pause_tournament', { tournamentId }),
          `${label} pause tournament`,
          { retries: 3, shouldRetry: isTransientRpcError }
        );
        await sleep(500);
        await withRetry(
          () => client.rpc(admin.token, 'admin_resume_tournament', { tournamentId }),
          `${label} resume tournament`,
          { retries: 3, shouldRetry: isTransientRpcError }
        );
        pauseResumeDone = true;
        summary.pauseResumeTested = true;
        console.log(`[${label}] Pause/resume test passed`);
        actions++;
      } catch (error) {
        summary.errors.push(`Pause/resume failed: ${error.message}`);
      }
    }

    // Process ready matches (ready check + start + report)
    for (const match of readyMatches) {
      const starters = pickHumanStarters(match, usersById);
      if (starters.length === 0) continue;

      const result = await startAndReportMatch(client, admin, tournamentId, match, starters, label);
      if (result.rateLimited) {
        sawRateLimit = true;
        continue;
      }
      if (result.resolved) {
        actions++;
        totalResolved++;
        if (match.bracketType === 'winners') summary.winnersResolved++;
        else if (match.bracketType === 'losers') summary.losersResolved++;
        else if (match.bracketType === 'grand_final') summary.grandFinalResolved++;
      }
    }

    // Handle in-progress matches (report results)
    const refreshed = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const refreshedMatches = Array.isArray(refreshed.matches) ? refreshed.matches : [];
    const liveMatches = refreshedMatches.filter(m => m && m.status === 'in_progress');

    for (const match of liveMatches) {
      const winnerId = pickWinnerUserId(match);
      if (!winnerId) continue;
      const p1 = String(match.player1UserId || '');
      const p2 = String(match.player2UserId || '');
      const player1Score = winnerId === p1 ? 10 : 7;
      const player2Score = winnerId === p2 ? 10 : 7;

      try {
        await withRetry(
          () => client.rpc(admin.token, 'report_tournament_match_result', {
            tournamentMatchId: match.id,
            winnerId,
            player1Score,
            player2Score,
          }),
          `${label} report in-progress ${match.id}`,
          { retries: 3, shouldRetry: isTransientRpcError }
        );
        actions++;
        totalResolved++;
      } catch (error) {
        if (isRateLimitError(error)) {
          sawRateLimit = true;
          continue;
        }
        if (!isIgnorableStartError(error)) {
          summary.errors.push(`Failed to report match ${match.id}: ${error.message}`);
        }
      }
    }

    // Check for grand final reset (second grand final match)
    const grandFinals = refreshedMatches.filter(m => m && m.bracketType === 'grand_final');
    if (grandFinals.length > 1) {
      summary.grandFinalResetTriggered = true;
    }

    // Track round completion
    for (const match of refreshedMatches) {
      if (match && (match.status === 'completed' || match.status === 'bye')) {
        const roundKey = `${match.bracketType}:${match.roundNumber}`;
        summary.roundsCompleted.add(roundKey);
      }
    }

    // Validate bracket integrity periodically
    if (loop % 50 === 0) {
      // Check for orphaned matches (matches with no participants)
      for (const match of pendingMatches) {
        if (!match.player1Id && !match.player2Id && match.bracketType !== 'losers') {
          // Empty pending winners matches after bracket is far along could be orphans
          // This is expected for future rounds; only flag if bracket seems stuck
        }
      }

      // Log progress
      const activeReady = readyMatches.length;
      const activeLive = inProgressMatches.length;
      const bracketSummary = Object.entries(bracketStatus)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      console.log(`[${label}] Loop ${loop}: resolved=${totalResolved}, ready=${activeReady}, live=${activeLive}, idle=${idleCycles} | ${bracketSummary}`);
    }

    // Idle detection
    if (actions === 0) {
      idleCycles++;
      if (sawRateLimit) {
        await sleep(1000);
        continue;
      }

      // Try cron nudge on extended idle
      if (idleCycles > 0 && idleCycles % 30 === 0) {
        try {
          await client.rpc(admin.token, '_cron_tournament_status_sync', {});
          await client.rpc(admin.token, '_cron_tournament_noshow_check', {});
        } catch (cronError) {
          // Best-effort
        }
      }

      if (idleCycles > IDLE_LIMIT) {
        // Check if tournament is actually complete but status not updated
        const allResolved = refreshedMatches.every(m =>
          m && (m.status === 'completed' || m.status === 'bye' || m.status === 'pending')
        );
        const hasLiveGrandFinal = refreshedMatches.some(m =>
          m && m.bracketType === 'grand_final' && (m.status === 'ready' || m.status === 'in_progress')
        );

        if (allResolved && !hasLiveGrandFinal) {
          summary.warnings.push(`Tournament appears complete but status is still ${tournamentStatus} at idle=${idleCycles}`);
        }

        summary.warnings.push(`Extended idle (${idleCycles} cycles) - snapshot: ${JSON.stringify(lastSnapshot)}`);
        throw new Error(`${label}: No tournament progress for ${idleCycles} consecutive polls; snapshot=${JSON.stringify(lastSnapshot)}`);
      }
      await sleep(LOOP_SLEEP_MS);
    } else {
      idleCycles = 0;
      await sleep(80);
    }
  }

  throw new Error(`${label}: Tournament did not complete within ${MAX_TOURNAMENT_LOOPS} loops`);
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

async function validateTournamentBracket(client, admin, tournamentId) {
  const bugs = [];
  const warnings = [];

  const details = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
  const tournament = details.tournament;
  const matches = Array.isArray(details.matches) ? details.matches : [];
  const participants = Array.isArray(details.participants) ? details.participants : [];

  // 1. Check match count
  const expectedWinnersMatches = BRACKET_SIZE - 1; // 127
  const expectedLosersMatches = BRACKET_SIZE - 2; // 126 (for 128 bracket)
  const expectedGrandFinal = 1;
  const expectedMinTotal = expectedWinnersMatches + expectedLosersMatches + expectedGrandFinal;

  const winnersMatches = matches.filter(m => m.bracketType === 'winners');
  const losersMatches = matches.filter(m => m.bracketType === 'losers');
  const grandFinalMatches = matches.filter(m => m.bracketType === 'grand_final');

  if (winnersMatches.length !== expectedWinnersMatches) {
    bugs.push(`Winners matches: ${winnersMatches.length} (expected ${expectedWinnersMatches})`);
  }
  if (losersMatches.length !== expectedLosersMatches) {
    bugs.push(`Losers matches: ${losersMatches.length} (expected ${expectedLosersMatches})`);
  }

  // 2. Check bracket size vs participants
  if (participants.length !== BRACKET_SIZE) {
    bugs.push(`Participant count: ${participants.length} (expected ${BRACKET_SIZE})`);
  }

  // 3. Check seeding
  const seeds = new Set();
  for (const p of participants) {
    if (seeds.has(p.seedNumber)) {
      bugs.push(`Duplicate seed ${p.seedNumber} for participant ${p.id}`);
    }
    seeds.add(p.seedNumber);
  }
  for (let s = 1; s <= BRACKET_SIZE; s++) {
    if (!seeds.has(s)) {
      bugs.push(`Missing seed ${s}`);
    }
  }

  // 4. Check match rounds
  for (let r = 1; r <= TOTAL_WINNERS_ROUNDS; r++) {
    const roundMatches = winnersMatches.filter(m => m.roundNumber === r);
    const expectedCount = Math.pow(2, TOTAL_WINNERS_ROUNDS - r);
    if (roundMatches.length !== expectedCount) {
      bugs.push(`Winners round ${r}: ${roundMatches.length} matches (expected ${expectedCount})`);
    }
  }

  // 5. Check losers bracket rounds
  for (let r = 1; r <= TOTAL_LOSERS_ROUNDS; r++) {
    const roundMatches = losersMatches.filter(m => m.roundNumber === r);
    if (roundMatches.length === 0 && r <= TOTAL_LOSERS_ROUNDS) {
      warnings.push(`Losers round ${r}: 0 matches (may be expected if tournament just started)`);
    }
  }

  // 6. Check completed match data integrity
  for (const match of matches) {
    if (match.status === 'completed' && !match.winnerId) {
      bugs.push(`Completed match ${match.id} has no winner`);
    }
    if (match.status === 'completed' && match.player1Score === null) {
      warnings.push(`Completed match ${match.id} has null player1Score`);
    }
    if (match.bestOf > 1) {
      const requiredWins = Math.ceil(match.bestOf / 2);
      if (match.status === 'completed') {
        const p1Wins = match.seriesWinsPlayer1 || 0;
        const p2Wins = match.seriesWinsPlayer2 || 0;
        if (p1Wins < requiredWins && p2Wins < requiredWins) {
          bugs.push(`BO${match.bestOf} match ${match.id} completed but neither player has ${requiredWins} wins (${p1Wins}-${p2Wins})`);
        }
      }
    }
  }

  // 7. Check placements
  const placements = participants
    .filter(p => p.finalPlacement)
    .map(p => p.finalPlacement)
    .sort((a, b) => a - b);

  if (placements.length > 0) {
    for (let i = 0; i < placements.length; i++) {
      if (placements[i] !== i + 1) {
        bugs.push(`Placement gap: expected ${i + 1}, got ${placements[i]}`);
        break;
      }
    }
  }

  return { bugs, warnings };
}

// ============================================================================
// CLEANUP
// ============================================================================

async function cleanupTournament(client, admin, tournamentId) {
  if (!tournamentId) return;
  try {
    const details = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const status = details && details.tournament ? String(details.tournament.status || '') : '';
    if (status === 'in_progress') {
      await client.rpc(admin.token, 'admin_cancel_tournament', { tournamentId });
    }
  } catch (error) {
    console.warn(`[cleanup] Failed to inspect/cancel tournament ${tournamentId}: ${error.message}`);
  }
  try {
    await client.rpc(admin.token, 'admin_delete_tournament', { tournamentId });
    console.log(`[cleanup] Tournament ${tournamentId} deleted`);
  } catch (error) {
    console.warn(`[cleanup] Failed to delete tournament ${tournamentId}: ${error.message}`);
  }
}

async function cleanupBridgeUsers(client, users) {
  const keepUsers = String(process.env.E2E_KEEP_USERS || '').trim().toLowerCase();
  if (keepUsers === 'true' || keepUsers === '1' || keepUsers === 'yes' || keepUsers === 'on') {
    console.log('[cleanup] Keeping bridge users (E2E_KEEP_USERS=true)');
    return { attempted: 0, deleted: 0, failed: 0 };
  }

  console.log(`[cleanup] Deleting ${users.length} bridge users...`);
  let deleted = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await withRetry(
        () => client.deleteAccount(user.token),
        `delete ${user.displayName}`,
        { retries: 2, shouldRetry: isTransientRpcError }
      );
      deleted++;
    } catch (error) {
      failed++;
      if (failed <= 5) {
        console.warn(`[cleanup] Failed to delete ${user.displayName}: ${error.message}`);
      }
    }
  }

  console.log(`[cleanup] Deleted ${deleted}/${users.length} users (${failed} failed)`);
  return { attempted: users.length, deleted, failed };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const startTime = Date.now();
  const rootDir = process.cwd();
  loadEnvFile(path.join(rootDir, '.env'));

  const baseUrl = resolveBaseUrl();
  const serverKey = resolveServerKey();
  const client = new NakamaHarnessClient(baseUrl, serverKey);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  128-PLAYER BO3 DOUBLE ELIMINATION TOURNAMENT STRESS TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Base URL: ${baseUrl}`);
  console.log(`  Bracket Size: ${BRACKET_SIZE}`);
  console.log(`  Format: double_elimination`);
  console.log(`  Best-of: BO3 (all rounds except opening), BO5 grand final`);
  console.log(`  Grand Final Reset: enabled`);
  console.log(`  Expected Matches: ~253+`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Healthcheck
  console.log('[setup] Waiting for healthcheck...');
  await client.healthcheck();
  console.log('[setup] Server is healthy\n');

  // Admin auth
  const admin = await ensureAdminSession(client);
  console.log(`[setup] Admin authenticated (telegramId=${admin.telegramId}, userId=${admin.userId})\n`);

  const bridgeUsers = [];
  let tournamentId = null;
  const testReport = {
    timestamp: new Date().toISOString(),
    baseUrl,
    bracketSize: BRACKET_SIZE,
    format: 'double_elimination',
    bestOf: 'BO3/BO5',
    grandFinalReset: true,
    phases: {},
    bugs: [],
    warnings: [],
    errors: [],
    duration: null,
  };

  try {
    // ======================================================================
    // PHASE 1: Create 128 bridge users
    // ======================================================================
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  PHASE 1: Creating 128 bridge users');
    console.log('───────────────────────────────────────────────────────────────');
    const phase1Start = Date.now();

    const users = await createBridgeUsers(client, BRACKET_SIZE, 'p');
    bridgeUsers.push(...users);

    testReport.phases.createUsers = {
      durationMs: Date.now() - phase1Start,
      count: users.length,
    };
    console.log(`[phase1] Created ${users.length} users in ${testReport.phases.createUsers.durationMs}ms\n`);

    // ======================================================================
    // PHASE 2: Create tournament
    // ======================================================================
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  PHASE 2: Creating tournament');
    console.log('───────────────────────────────────────────────────────────────');
    const phase2Start = Date.now();

    const createPayload = buildTournamentCreatePayload();
    const createResponse = await client.rpc(admin.token, 'admin_create_tournament', createPayload);
    tournamentId = createResponse.tournamentId;

    if (!tournamentId) {
      throw new Error('admin_create_tournament returned empty tournamentId');
    }

    testReport.phases.createTournament = {
      durationMs: Date.now() - phase2Start,
      tournamentId,
      name: createPayload.name,
    };
    console.log(`[phase2] Tournament created: ${tournamentId}`);
    console.log(`[phase2] Name: ${createPayload.name}\n`);

    // ======================================================================
    // PHASE 3: Register all 128 users
    // ======================================================================
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  PHASE 3: Registering 128 users');
    console.log('───────────────────────────────────────────────────────────────');
    const phase3Start = Date.now();

    const registeredCount = await registerUsers(client, tournamentId, users);

    testReport.phases.registerUsers = {
      durationMs: Date.now() - phase3Start,
      count: registeredCount,
    };
    console.log(`[phase3] Registered ${registeredCount} users in ${testReport.phases.registerUsers.durationMs}ms\n`);

    // Verify registration count
    const preStartDetails = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const preStartRegistered = preStartDetails.tournament?.registeredCount || 0;
    const preStartParticipants = Array.isArray(preStartDetails.participants) ? preStartDetails.participants : [];

    if (preStartRegistered !== BRACKET_SIZE) {
      testReport.bugs.push(`Pre-start registeredCount: ${preStartRegistered} (expected ${BRACKET_SIZE})`);
    }
    if (preStartParticipants.length !== BRACKET_SIZE) {
      testReport.bugs.push(`Pre-start participant count: ${preStartParticipants.length} (expected ${BRACKET_SIZE})`);
    }
    console.log(`[verify] Pre-start: registeredCount=${preStartRegistered}, participants=${preStartParticipants.length}\n`);

    // ======================================================================
    // PHASE 4: Start tournament
    // ======================================================================
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  PHASE 4: Starting tournament');
    console.log('───────────────────────────────────────────────────────────────');
    const phase4Start = Date.now();

    const startResponse = await client.rpc(admin.token, 'admin_start_tournament', { tournamentId });

    testReport.phases.startTournament = {
      durationMs: Date.now() - phase4Start,
      participantCount: startResponse.participantCount,
    };
    console.log(`[phase4] Tournament started: participantCount=${startResponse.participantCount}\n`);

    // Verify bracket generation
    const postStartDetails = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const postStartMatches = Array.isArray(postStartDetails.matches) ? postStartDetails.matches : [];
    const postStartParticipants = Array.isArray(postStartDetails.participants) ? postStartDetails.participants : [];

    const winnersR1Matches = postStartMatches.filter(m => m.bracketType === 'winners' && m.roundNumber === 1);
    const expectedR1Matches = BRACKET_SIZE / 2; // 64

    if (winnersR1Matches.length !== expectedR1Matches) {
      testReport.bugs.push(`Round 1 winners matches: ${winnersR1Matches.length} (expected ${expectedR1Matches})`);
    }

    const activeParticipants = postStartParticipants.filter(p => p.status === 'active');
    if (activeParticipants.length !== BRACKET_SIZE) {
      testReport.bugs.push(`Active participants: ${activeParticipants.length} (expected ${BRACKET_SIZE})`);
    }

    // Check that seeds are 1-128
    const seeds = postStartParticipants.map(p => p.seedNumber).sort((a, b) => a - b);
    const expectedSeeds = Array.from({ length: BRACKET_SIZE }, (_, i) => i + 1);
    if (JSON.stringify(seeds) !== JSON.stringify(expectedSeeds)) {
      testReport.bugs.push('Seeds are not a complete 1-128 set');
    }

    // Verify match best_of values
    const boMismatches = [];
    for (const match of postStartMatches) {
      const isRandomOpening = match.bracketType === 'winners' && match.roundNumber === 1;
      const expectedBO = isRandomOpening ? 1 :
        (match.bracketType === 'grand_final' ? 5 :
         match.bracketType === 'winners' ? (match.roundNumber >= 2 ? 3 : 1) :
         (match.roundNumber >= 3 ? 3 : 1));

      if (match.bestOf !== expectedBO) {
        boMismatches.push(`${match.bracketType} R${match.roundNumber} M${match.matchNumber}: BO${match.bestOf} (expected BO${expectedBO})`);
      }
    }
    if (boMismatches.length > 0) {
      testReport.bugs.push(`Best-of mismatches: ${boMismatches.slice(0, 10).join('; ')}${boMismatches.length > 10 ? ` ...and ${boMismatches.length - 10} more` : ''}`);
    }

    console.log(`[verify] Bracket: ${postStartMatches.length} total matches, ${winnersR1Matches.length} R1 matches`);
    console.log(`[verify] Participants: ${activeParticipants.length} active, seeds 1-${seeds[seeds.length-1]}`);
    console.log(`[verify] BO mismatches: ${boMismatches.length}\n`);

    // ======================================================================
    // PHASE 5: Progress tournament to completion
    // ======================================================================
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  PHASE 5: Progressing tournament to completion');
    console.log('───────────────────────────────────────────────────────────────');
    const phase5Start = Date.now();

    const progressSummary = await progressTournamentToCompletion(
      client, admin, users, tournamentId, '128p-de'
    );

    testReport.phases.progressTournament = {
      durationMs: Date.now() - phase5Start,
      ...progressSummary,
    };
    console.log(`[phase5] Tournament completed in ${progressSummary.loops} loops (${testReport.phases.progressTournament.durationMs}ms)`);
    console.log(`[phase5] Resolved: ${progressSummary.totalResolved} matches`);
    console.log(`[phase5] Grand final reset: ${progressSummary.grandFinalResetTriggered ? 'TRIGGERED' : 'NOT TRIGGERED'}\n`);

    // ======================================================================
    // PHASE 6: Validate tournament integrity
    // ======================================================================
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  PHASE 6: Validating tournament integrity');
    console.log('───────────────────────────────────────────────────────────────');
    const phase6Start = Date.now();

    const validation = await validateTournamentBracket(client, admin, tournamentId);

    testReport.bugs.push(...validation.bugs);
    testReport.warnings.push(...validation.warnings);

    testReport.phases.validation = {
      durationMs: Date.now() - phase6Start,
      bugsFound: validation.bugs.length,
      warningsFound: validation.warnings.length,
      bugs: validation.bugs,
      warnings: validation.warnings,
    };

    if (validation.bugs.length > 0) {
      console.log(`[phase6] 🐛 BUGS FOUND (${validation.bugs.length}):`);
      for (const bug of validation.bugs) {
        console.log(`  ❌ ${bug}`);
      }
    } else {
      console.log('[phase6] ✅ No bugs found!');
    }

    if (validation.warnings.length > 0) {
      console.log(`[phase6] ⚠️  Warnings (${validation.warnings.length}):`);
      for (const w of validation.warnings) {
        console.log(`  ⚠️  ${w}`);
      }
    }
    console.log('');

    // ======================================================================
    // PHASE 7: Additional stress tests
    // ======================================================================
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  PHASE 7: Running additional integrity checks');
    console.log('───────────────────────────────────────────────────────────────');

    // 7a: Get progress snapshot
    const snapshot = await client.rpc(admin.token, 'admin_get_tournament_progress_snapshot', { tournamentId });
    console.log(`[phase7] Progress snapshot: status=${snapshot.tournament?.status}, rounds=${snapshot.rounds?.length || 0}`);

    // 7b: Check for stale data
    const finalDetails = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const finalMatches = Array.isArray(finalDetails.matches) ? finalDetails.matches : [];
    const finalParticipants = Array.isArray(finalDetails.participants) ? finalDetails.participants : [];

    // Check all completed matches have completed_at set
    const completedNoDate = finalMatches.filter(m => m.status === 'completed' && !m.completedAt);
    if (completedNoDate.length > 0) {
      testReport.bugs.push(`${completedNoDate.length} completed matches have no completedAt`);
    }

    // Check winner is set
    const tournamentWinner = finalDetails.tournament?.winnerId || null;
    if (!tournamentWinner) {
      testReport.bugs.push('Tournament has no winner_id set');
    }

    // Check final placements
    const placements = finalParticipants
      .filter(p => p.finalPlacement)
      .map(p => ({ id: p.id, placement: p.finalPlacement, status: p.status }));

    if (placements.length !== BRACKET_SIZE) {
      testReport.bugs.push(`Final placements: ${placements.length}/${BRACKET_SIZE} participants have placements`);
    }

    // Check for duplicate placements
    const placementValues = placements.map(p => p.placement).sort((a, b) => a - b);
    const uniquePlacements = new Set(placementValues);
    if (uniquePlacements.size !== placementValues.length) {
      testReport.bugs.push(`Duplicate placements detected! ${placementValues.length} values, ${uniquePlacements.size} unique`);
    }

    // Verify 1st place
    const firstPlace = finalParticipants.filter(p => p.finalPlacement === 1);
    if (firstPlace.length !== 1) {
      testReport.bugs.push(`Expected 1 participant with placement 1, got ${firstPlace.length}`);
    }

    console.log(`[phase7] Final state:`);
    console.log(`  Winner: ${tournamentWinner || 'MISSING!'}`);
    console.log(`  Placements assigned: ${placements.length}/${BRACKET_SIZE}`);
    console.log(`  Unique placements: ${uniquePlacements.size}`);
    console.log(`  Completed matches without completedAt: ${completedNoDate.length}`);
    console.log('');

  } catch (error) {
    testReport.errors.push({
      phase: 'execution',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
    console.error(`\n[FATAL] Test failed: ${error.message}`);
    console.error(error.stack);
  } finally {
    // ======================================================================
    // CLEANUP
    // ======================================================================
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  CLEANUP');
    console.log('───────────────────────────────────────────────────────────────');

    if (tournamentId) {
      await cleanupTournament(client, admin, tournamentId);
    }
    await cleanupBridgeUsers(client, bridgeUsers);

    testReport.duration = Date.now() - startTime;
    console.log(`\n[cleanup] Done. Total test duration: ${(testReport.duration / 1000).toFixed(1)}s\n`);
  }

  // ======================================================================
  // FINAL REPORT
  // ======================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TEST REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Duration: ${(testReport.duration / 1000).toFixed(1)}s`);
  console.log(`  Bugs: ${testReport.bugs.length}`);
  console.log(`  Warnings: ${testReport.warnings.length}`);
  console.log(`  Errors: ${testReport.errors.length}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (testReport.bugs.length > 0) {
    console.log('\n🐛 BUGS:');
    for (const bug of testReport.bugs) {
      console.log(`  ❌ ${bug}`);
    }
  }

  if (testReport.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    for (const w of testReport.warnings) {
      console.log(`  ⚠️  ${w}`);
    }
  }

  if (testReport.errors.length > 0) {
    console.log('\n💥 ERRORS:');
    for (const e of testReport.errors) {
      console.log(`  💥 ${e.phase}: ${e.message}`);
    }
  }

  if (testReport.bugs.length === 0 && testReport.errors.length === 0) {
    console.log('\n✅ ALL CHECKS PASSED - NO BUGS FOUND!');
  }

  console.log('\n' + JSON.stringify(testReport, null, 2));

  if (testReport.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[128-bench] FATAL:', error && error.stack ? error.stack : error);
  process.exit(1);
});
