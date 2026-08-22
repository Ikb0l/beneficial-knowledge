#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HEALTHCHECK_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 30_000;
const LOOP_SLEEP_MS = 500;
const MAX_TOURNAMENT_LOOPS = 360;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
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
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
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
  } catch {
    return null;
  }
}

async function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
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

function resolveBaseUrl() {
  const host = process.env.NAKAMA_HOST || process.env.VITE_NAKAMA_HOST || 'localhost';
  const port = process.env.NAKAMA_PORT || process.env.VITE_NAKAMA_PORT || '7350';
  const ssl = (process.env.VITE_NAKAMA_SSL || 'false').toLowerCase() === 'true';
  if (/^https?:\/\//i.test(host)) {
    return host.replace(/\/+$/, '');
  }
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

function basicAuthHeader(serverKey) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

function createStableCustomId(seedPrefix, index) {
  const stamp = Date.now().toString(36).slice(-6);
  const nonce = Math.random().toString(36).slice(2, 7);
  // Keep entropy early to avoid username collisions from runtime truncation.
  return `quizzy_${stamp}${nonce}_${seedPrefix}${index}`;
}

function isTransientRpcError(error) {
  const text = String(error && error.message ? error.message : error).toLowerCase();
  if (!text) return false;
  return text.includes('rate limit')
    || text.includes('timeout')
    || text.includes('temporar')
    || text.includes('concurrent')
    || text.includes('already been completed')
    || text.includes('is not in progress');
}

function isIgnorableStartError(error) {
  const text = String(error && error.message ? error.message : error).toLowerCase();
  return text.includes('already been completed')
    || text.includes('is not ready to start')
    || text.includes('not in progress')
    || text.includes('not a participant')
    || text.includes('both players must be ready');
}

function isRateLimitError(error) {
  const text = String(error && error.message ? error.message : error).toLowerCase();
  return text.includes('rate limit');
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
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[retry] ${label} failed on attempt ${attempt + 1}/${retries + 1}: ${error.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastError || new Error(`${label} failed`);
}

function pickHumanStarters(match, usersById) {
  const starters = [];
  const seen = new Set();
  if (!match) return starters;
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

class NakamaHarnessClient {
  constructor(baseUrl, serverKey) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.serverKey = serverKey;
    this.basicAuth = basicAuthHeader(serverKey);
  }

  async healthcheck() {
    return requestJson(`${this.baseUrl}/healthcheck`, {
      timeoutMs: HEALTHCHECK_TIMEOUT_MS,
    });
  }

  async authenticateCustom({ customId, username, vars = {}, create = true }) {
    const params = new URLSearchParams();
    params.set('create', create ? 'true' : 'false');
    if (username) {
      params.set('username', username);
    }
    const url = `${this.baseUrl}/v2/account/authenticate/custom?${params.toString()}`;
    const payload = {
      id: customId,
      vars,
    };
    const response = await requestJson(url, {
      method: 'POST',
      headers: {
        Authorization: this.basicAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
    await requestJson(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async rpc(token, rpcId, payload = {}) {
    const url = `${this.baseUrl}/v2/rpc/${encodeURIComponent(rpcId)}`;
    const hasPayload = payload !== null
      && payload !== undefined
      && !(typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 0);
    const payloadText = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    const response = await requestJson(url, {
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

async function ensureAdminSession(client) {
  const adminTelegramId = resolveAdminTelegramId();
  const adminToken = String(process.env.ADMIN_LOGIN_TOKEN || '').trim();
  if (!adminTelegramId) {
    throw new Error('ADMIN_TELEGRAM_IDS is required for E2E smoke test');
  }
  if (!adminToken) {
    throw new Error('ADMIN_LOGIN_TOKEN is required for E2E smoke test');
  }

  const admin = await client.authenticateCustom({
    customId: `admin_token_${adminTelegramId}`,
    create: true,
    vars: { adminToken },
  });
  const verify = await client.rpc(admin.token, 'admin_verify_session', {});
  if (!verify || verify.valid !== true) {
    throw new Error('admin_verify_session returned invalid=false');
  }
  return {
    ...admin,
    telegramId: adminTelegramId,
    adminInfo: verify.adminInfo || null,
  };
}

async function createBridgeUsers(client, count, prefix) {
  const users = [];
  for (let i = 0; i < count; i += 1) {
    const customId = createStableCustomId(prefix, i + 1);
    const displayName = `E2E ${prefix.toUpperCase()} ${i + 1}`;
    const user = await withRetry(
      () => client.authenticateCustom({
        customId,
        create: true,
        vars: {},
      }),
      `authenticate user ${customId}`,
      { retries: 3, shouldRetry: isTransientRpcError }
    );
    users.push({
      ...user,
      displayName,
    });
  }
  return users;
}

function trackBridgeUsers(registry, users) {
  if (!Array.isArray(registry) || !Array.isArray(users)) return;
  for (const user of users) {
    if (!user || !user.userId || !user.token) continue;
    registry.push({
      userId: String(user.userId),
      token: String(user.token),
      username: user.username ? String(user.username) : '',
      customId: user.customId ? String(user.customId) : '',
    });
  }
}

function shouldKeepBridgeUsers() {
  const raw = String(process.env.E2E_KEEP_USERS || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function dedupeBridgeUsers(records) {
  const byUserId = new Map();
  const source = Array.isArray(records) ? records : [];
  for (const record of source) {
    if (!record || !record.userId || !record.token) continue;
    byUserId.set(String(record.userId), record);
  }
  return Array.from(byUserId.values());
}

async function cleanupBridgeUsers(client, records, options = {}) {
  const keepUsers = options.keepUsers === true;
  const users = dedupeBridgeUsers(records);
  const summary = {
    created: users.length,
    keepUsers,
    attempted: 0,
    deleted: 0,
    failed: 0,
    failedUsers: [],
  };
  if (keepUsers || users.length === 0) {
    return summary;
  }

  summary.attempted = users.length;
  for (const user of users) {
    try {
      await withRetry(
        () => client.deleteAccount(user.token),
        `delete account ${user.userId}`,
        { retries: 2, shouldRetry: isTransientRpcError }
      );
      summary.deleted += 1;
    } catch (error) {
      var finalError = error;
      if (user.customId) {
        try {
          const refreshed = await withRetry(
            () => client.authenticateCustom({
              customId: user.customId,
              create: false,
              vars: {},
            }),
            `reauth account ${user.userId}`,
            { retries: 1, shouldRetry: isTransientRpcError }
          );
          await withRetry(
            () => client.deleteAccount(refreshed.token),
            `delete account (refreshed) ${user.userId}`,
            { retries: 2, shouldRetry: isTransientRpcError }
          );
          summary.deleted += 1;
          continue;
        } catch (refreshError) {
          finalError = refreshError;
        }
      }
      const errorMessage = String(finalError && finalError.message ? finalError.message : finalError);
      summary.failed += 1;
      if (summary.failedUsers.length < 25) {
        summary.failedUsers.push({
          userId: user.userId,
          username: user.username || null,
          customId: user.customId || null,
          error: errorMessage,
        });
      }
      console.warn(`[cleanup] failed to delete bridge user ${user.userId}: ${errorMessage}`);
    }
  }
  return summary;
}

function buildTournamentCreatePayload({
  name,
  bracketSize,
  botPolicy,
  category,
  format = 'single_elimination',
  seedingMode = 'mmr',
  questionCount = 5,
  timePerQuestionMs = 12_000,
  bestOfByRound,
  grandFinalReset = false,
}) {
  const now = Date.now();
  return {
    name,
    description: `E2E tournament smoke: ${name}`,
    format,
    seedingMode,
    bracketSize,
    minMmr: 0,
    maxMmr: 5000,
    questionCount,
    timePerQuestionMs,
    registrationStart: new Date(now - 2 * 60_000).toISOString(),
    registrationEnd: new Date(now + 30 * 60_000).toISOString(),
    tournamentStart: new Date(now + 60 * 60_000).toISOString(),
    allowSpectators: true,
    category: category || null,
    botPolicy: botPolicy || undefined,
    bestOfByRound: bestOfByRound || undefined,
    grandFinalReset: grandFinalReset === true,
  };
}

function pickParentCategory(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return null;
  const byId = new Map();
  const byParent = new Map();
  for (const cat of categories) {
    if (!cat || !cat.id || !cat.categoryKey) continue;
    byId.set(cat.id, cat);
  }
  for (const cat of categories) {
    if (!cat || !cat.parentId || !cat.categoryKey) continue;
    if (!byParent.has(cat.parentId)) {
      byParent.set(cat.parentId, []);
    }
    byParent.get(cat.parentId).push(cat);
  }

  for (const [parentId, children] of byParent.entries()) {
    const parent = byId.get(parentId);
    if (!parent || !parent.categoryKey) continue;
    const eligibleChild = children.find((child) => (child.questionCount || 0) > 0) || children[0];
    if (eligibleChild) {
      return {
        parentCategoryKey: parent.categoryKey,
        childCategoryKey: eligibleChild.categoryKey,
      };
    }
  }
  return null;
}

async function registerUsers(client, tournamentId, users) {
  for (const user of users) {
    await withRetry(
      () => client.rpc(user.token, 'register_for_tournament', { tournamentId }),
      `register ${user.userId}`,
      { retries: 4, shouldRetry: isTransientRpcError }
    );
  }
}

async function reportInProgressMatch(client, admin, match, label) {
  const winnerId = pickWinnerUserId(match);
  if (!winnerId) return false;
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
  return true;
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
      if (isRateLimitError(error)) {
        return { rateLimited: true };
      }
      if (!isIgnorableReadyError(error)) {
        throw error;
      }
    }
  }
  return { rateLimited: false };
}

async function progressTournamentToCompletion(client, admin, users, tournamentId, label, options = {}) {
  const concurrentReports = options.concurrentReports === true;
  const pauseResumeOnce = options.pauseResumeOnce === true;
  const reportReadyFallback = options.reportReadyFallback === true;
  const invokeCronOnIdle = options.invokeCronOnIdle === true;
  const idleLimit = Number.isFinite(options.idleLimit) ? Number(options.idleLimit) : 120;
  const loopSleepMs = Number.isFinite(options.loopSleepMs) ? Number(options.loopSleepMs) : LOOP_SLEEP_MS;
  const usersById = new Map(users.map((u) => [u.userId, u]));
  let startedMatches = 0;
  let reportedMatches = 0;
  let idleCycles = 0;
  let pauseResumeDone = false;
  let lastSnapshot = null;

  for (let loop = 0; loop < MAX_TOURNAMENT_LOOPS; loop += 1) {
    const details = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const tournamentStatus = details && details.tournament ? String(details.tournament.status || '') : '';
    if (tournamentStatus === 'completed') {
      return {
        status: tournamentStatus,
        startedMatches,
        reportedMatches,
        loops: loop + 1,
      };
    }
    if (tournamentStatus === 'cancelled') {
      throw new Error(`${label}: tournament unexpectedly cancelled`);
    }

    const matches = Array.isArray(details && details.matches) ? details.matches : [];
    const readyMatches = matches.filter((m) => m && m.status === 'ready');
    const inProgressMatches = matches.filter((m) => m && m.status === 'in_progress');
    const bracketStatus = {};
    for (const match of matches) {
      if (!match) continue;
      const key = `${String(match.bracketType || 'winners')}:${String(match.status || 'unknown')}`;
      bracketStatus[key] = (bracketStatus[key] || 0) + 1;
    }
    lastSnapshot = {
      tournamentStatus,
      totalMatches: matches.length,
      readyMatches: readyMatches.length,
      inProgressMatches: inProgressMatches.length,
      bracketStatus,
    };
    let actions = 0;

    if (pauseResumeOnce && !pauseResumeDone && readyMatches.length > 0 && inProgressMatches.length === 0) {
      await withRetry(
        () => client.rpc(admin.token, 'admin_pause_tournament', { tournamentId }),
        `${label} pause tournament`,
        { retries: 3, shouldRetry: isTransientRpcError }
      );
      await withRetry(
        () => client.rpc(admin.token, 'admin_resume_tournament', { tournamentId }),
        `${label} resume tournament`,
        { retries: 3, shouldRetry: isTransientRpcError }
      );
      pauseResumeDone = true;
      actions += 1;
    }

    let sawRateLimit = false;
    for (const match of readyMatches) {
      const starters = pickHumanStarters(match, usersById);
      if (starters.length === 0) continue;

      const readyResult = await markReadyForMatch(client, tournamentId, match, starters, label);
      if (readyResult.rateLimited) {
        sawRateLimit = true;
        continue;
      }

      for (const starter of starters) {
        try {
          const startResponse = await withRetry(
            () => client.rpc(starter.token, 'start_tournament_match', { matchId: match.id }),
            `${label} start match ${match.id}`,
            { retries: 2, shouldRetry: isTransientRpcError }
          );
          if (startResponse && startResponse.matchId) {
            actions += 1;
            if (!startResponse.alreadyInProgress) {
              startedMatches += 1;
            }
          }
        } catch (error) {
          if (isRateLimitError(error)) {
            sawRateLimit = true;
            continue;
          }
          if (!isIgnorableStartError(error)) {
            throw error;
          }
        }
      }
    }

    const refreshed = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const refreshedMatches = Array.isArray(refreshed && refreshed.matches) ? refreshed.matches : [];
    const liveMatches = refreshedMatches.filter((m) => m && m.status === 'in_progress');

    if (concurrentReports && liveMatches.length > 1) {
      const outcomes = await Promise.allSettled(
        liveMatches.map((match) => reportInProgressMatch(client, admin, match, label))
      );
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          throw outcome.reason;
        }
        if (outcome.value) {
          actions += 1;
          reportedMatches += 1;
        }
      }
    } else {
      for (const match of liveMatches) {
        const reported = await reportInProgressMatch(client, admin, match, label);
        if (reported) {
          actions += 1;
          reportedMatches += 1;
        }
      }
    }

    if (reportReadyFallback) {
      const readyFallbackMatches = refreshedMatches.filter((m) => m && m.status === 'ready');
      for (const match of readyFallbackMatches) {
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
            `${label} report-ready-fallback ${match.id}`,
            { retries: 3, shouldRetry: isTransientRpcError }
          );
          actions += 1;
          reportedMatches += 1;
        } catch (error) {
          if (isRateLimitError(error) || isIgnorableStartError(error)) {
            sawRateLimit = true;
            continue;
          }
          throw error;
        }
      }
    }

    if (actions === 0) {
      idleCycles += 1;
      if (sawRateLimit) {
        await sleep(1_000);
        continue;
      }
      if (invokeCronOnIdle && idleCycles > 0 && idleCycles % 20 === 0) {
        try {
          await client.rpc(admin.token, '_cron_tournament_status_sync', {});
          await client.rpc(admin.token, '_cron_tournament_noshow_check', {});
        } catch (cronError) {
          // Cron RPCs are best-effort in E2E diagnostics.
          console.warn(`[e2e] ${label}: cron nudge failed at idle=${idleCycles}: ${cronError.message}`);
        }
      }
      if (idleCycles > idleLimit) {
        throw new Error(`${label}: no tournament progress for ${idleCycles} consecutive polls; snapshot=${JSON.stringify(lastSnapshot)}`);
      }
      await sleep(loopSleepMs);
    } else {
      idleCycles = 0;
      await sleep(120);
    }
  }

  throw new Error(`${label}: tournament did not complete within ${MAX_TOURNAMENT_LOOPS} loops`);
}

async function cleanupTournament(client, admin, tournamentId) {
  if (!tournamentId) return;
  try {
    const details = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const status = details && details.tournament ? String(details.tournament.status || '') : '';
    if (status === 'in_progress') {
      await client.rpc(admin.token, 'admin_cancel_tournament', { tournamentId });
    }
  } catch (error) {
    console.warn(`[cleanup] failed to inspect/cancel tournament ${tournamentId}: ${error.message}`);
  }

  try {
    await client.rpc(admin.token, 'admin_delete_tournament', { tournamentId });
  } catch (error) {
    console.warn(`[cleanup] failed to delete tournament ${tournamentId}: ${error.message}`);
  }
}

async function runScenarioAllHumans(client, admin, bridgeUsersRegistry) {
  const users = await createBridgeUsers(client, 8, 'h');
  trackBridgeUsers(bridgeUsersRegistry, users);
  const tournamentName = `E2E All Humans ${Date.now()}`;
  const createResponse = await client.rpc(admin.token, 'admin_create_tournament', buildTournamentCreatePayload({
    name: tournamentName,
    bracketSize: 8,
  }));
  const tournamentId = createResponse.tournamentId;
  if (!tournamentId) {
    throw new Error('Scenario all-humans failed: admin_create_tournament returned empty tournamentId');
  }

  try {
    await registerUsers(client, tournamentId, users);
    await client.rpc(admin.token, 'admin_start_tournament', { tournamentId });
    const outcome = await progressTournamentToCompletion(client, admin, users, tournamentId, 'all-humans');
    if (outcome.status !== 'completed') {
      throw new Error(`Scenario all-humans expected completed status, got ${outcome.status}`);
    }
    return {
      scenario: 'all_humans',
      tournamentId,
      users: users.length,
      ...outcome,
    };
  } finally {
    await cleanupTournament(client, admin, tournamentId);
  }
}

async function runScenarioBotFill(client, admin, bridgeUsersRegistry) {
  const users = await createBridgeUsers(client, 2, 'b');
  trackBridgeUsers(bridgeUsersRegistry, users);
  const tournamentName = `E2E Bot Fill ${Date.now()}`;
  const createResponse = await client.rpc(admin.token, 'admin_create_tournament', buildTournamentCreatePayload({
    name: tournamentName,
    bracketSize: 8,
    botPolicy: {
      enabled: true,
      fillOnStart: true,
      includeBotsInRewards: false,
    },
  }));
  const tournamentId = createResponse.tournamentId;
  if (!tournamentId) {
    throw new Error('Scenario bot-fill failed: admin_create_tournament returned empty tournamentId');
  }

  try {
    await registerUsers(client, tournamentId, users);
    await client.rpc(admin.token, 'admin_start_tournament', { tournamentId });

    const details = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const participants = Array.isArray(details && details.participants) ? details.participants : [];
    const botCount = participants.filter((p) => p && p.isBot === true).length;
    if (botCount <= 0) {
      throw new Error('Scenario bot-fill expected at least one bot participant');
    }
    if (details && details.tournament && typeof details.tournament.registeredCount === 'number') {
      if (details.tournament.registeredCount !== details.tournament.bracketSize) {
        throw new Error(`Scenario bot-fill expected registeredCount=${details.tournament.bracketSize}, got ${details.tournament.registeredCount}`);
      }
    }

    const outcome = await progressTournamentToCompletion(client, admin, users, tournamentId, 'bot-fill');
    if (outcome.status !== 'completed') {
      throw new Error(`Scenario bot-fill expected completed status, got ${outcome.status}`);
    }
    return {
      scenario: 'bot_fill',
      tournamentId,
      users: users.length,
      botCountObserved: botCount,
      ...outcome,
    };
  } finally {
    await cleanupTournament(client, admin, tournamentId);
  }
}

async function runScenarioParentCategory(client, admin, bridgeUsersRegistry) {
  const catResponse = await client.rpc(admin.token, 'admin_list_categories', { includeInactive: false });
  const categories = Array.isArray(catResponse && catResponse.categories) ? catResponse.categories : [];
  const parentPick = pickParentCategory(categories);
  if (!parentPick) {
    console.warn('[e2e] Skipping parent-category scenario: no parent categories with children found.');
    return null;
  }

  const users = await createBridgeUsers(client, 8, 'p');
  trackBridgeUsers(bridgeUsersRegistry, users);
  const tournamentName = `E2E Parent Category ${Date.now()}`;
  const createResponse = await client.rpc(admin.token, 'admin_create_tournament', buildTournamentCreatePayload({
    name: tournamentName,
    bracketSize: 8,
    category: parentPick.parentCategoryKey,
  }));
  const tournamentId = createResponse.tournamentId;
  if (!tournamentId) {
    throw new Error('Scenario parent-category failed: admin_create_tournament returned empty tournamentId');
  }

  try {
    await registerUsers(client, tournamentId, users);
    await client.rpc(admin.token, 'admin_start_tournament', { tournamentId });
    const outcome = await progressTournamentToCompletion(client, admin, users, tournamentId, 'parent-category');
    if (outcome.status !== 'completed') {
      throw new Error(`Scenario parent-category expected completed status, got ${outcome.status}`);
    }
    return {
      scenario: 'parent_category',
      tournamentId,
      users: users.length,
      parentCategoryKey: parentPick.parentCategoryKey,
      sampleChildCategoryKey: parentPick.childCategoryKey,
      ...outcome,
    };
  } finally {
    await cleanupTournament(client, admin, tournamentId);
  }
}

async function runScenarioDoubleEliminationStress(client, admin, bridgeUsersRegistry) {
  const users = await createBridgeUsers(client, 10, 'd');
  trackBridgeUsers(bridgeUsersRegistry, users);
  const tournamentName = `E2E Double Stress ${Date.now()}`;
  const createResponse = await client.rpc(admin.token, 'admin_create_tournament', buildTournamentCreatePayload({
    name: tournamentName,
    format: 'double_elimination',
    seedingMode: 'random_opening_round',
    bracketSize: 16,
    questionCount: 3,
    timePerQuestionMs: 8_000,
    bestOfByRound: {
      opening: 1,
      winners: { 1: 1, 2: 3, 3: 3, 4: 5 },
      losers: { 1: 1, 2: 1, 3: 3, 4: 3, 5: 3, 6: 5 },
      grand_final: 5,
      default: 1,
    },
    grandFinalReset: true,
    botPolicy: {
      enabled: true,
      fillOnStart: true,
      includeBotsInRewards: false,
    },
  }));
  const tournamentId = createResponse.tournamentId;
  if (!tournamentId) {
    throw new Error('Scenario double-stress failed: admin_create_tournament returned empty tournamentId');
  }

  try {
    await registerUsers(client, tournamentId, users);
    await client.rpc(admin.token, 'admin_start_tournament', { tournamentId });

    const details = await client.rpc(admin.token, 'get_tournament_details', { tournamentId });
    const participants = Array.isArray(details && details.participants) ? details.participants : [];
    const botCount = participants.filter((p) => p && p.isBot === true).length;
    if (botCount <= 0) {
      throw new Error('Scenario double-stress expected at least one bot participant');
    }
    const matches = Array.isArray(details && details.matches) ? details.matches : [];
    const hasLosersMatches = matches.some((m) => m && String(m.bracketType || '').toLowerCase() === 'losers');
    if (!hasLosersMatches) {
      throw new Error('Scenario double-stress expected losers bracket matches');
    }

    const outcome = await progressTournamentToCompletion(
      client,
      admin,
      users,
      tournamentId,
      'double-stress',
      {
        concurrentReports: true,
        pauseResumeOnce: true,
        reportReadyFallback: true,
        invokeCronOnIdle: true,
        idleLimit: 240,
        loopSleepMs: 1_000,
      }
    );
    if (outcome.status !== 'completed') {
      throw new Error(`Scenario double-stress expected completed status, got ${outcome.status}`);
    }
    return {
      scenario: 'double_elimination_stress',
      tournamentId,
      users: users.length,
      botCountObserved: botCount,
      ...outcome,
    };
  } finally {
    await cleanupTournament(client, admin, tournamentId);
  }
}

async function main() {
  const rootDir = process.cwd();
  loadEnvFile(path.join(rootDir, '.env'));

  const baseUrl = resolveBaseUrl();
  const serverKey = resolveServerKey();
  const client = new NakamaHarnessClient(baseUrl, serverKey);

  console.log(`[e2e] Nakama base URL: ${baseUrl}`);
  console.log('[e2e] Waiting for healthcheck...');
  await client.healthcheck();

  const admin = await ensureAdminSession(client);
  console.log(`[e2e] Admin authenticated (telegramId=${admin.telegramId}, userId=${admin.userId})`);
  const keepBridgeUsers = shouldKeepBridgeUsers();
  const createdBridgeUsers = [];
  const scenarios = [];
  let runError = null;
  let bridgeCleanupSummary = {
    created: 0,
    keepUsers: keepBridgeUsers,
    attempted: 0,
    deleted: 0,
    failed: 0,
    failedUsers: [],
  };

  try {
    const scenarioA = await runScenarioAllHumans(client, admin, createdBridgeUsers);
    scenarios.push(scenarioA);
    console.log(`[e2e] Scenario all-humans completed: started=${scenarioA.startedMatches}, reported=${scenarioA.reportedMatches}`);

    const scenarioB = await runScenarioBotFill(client, admin, createdBridgeUsers);
    scenarios.push(scenarioB);
    console.log(`[e2e] Scenario bot-fill completed: bots=${scenarioB.botCountObserved}, started=${scenarioB.startedMatches}, reported=${scenarioB.reportedMatches}`);

    const scenarioC = await runScenarioParentCategory(client, admin, createdBridgeUsers);
    if (scenarioC) {
      scenarios.push(scenarioC);
      console.log(`[e2e] Scenario parent-category completed: started=${scenarioC.startedMatches}, reported=${scenarioC.reportedMatches}`);
    }

    const scenarioD = await runScenarioDoubleEliminationStress(client, admin, createdBridgeUsers);
    scenarios.push(scenarioD);
    console.log(`[e2e] Scenario double-stress completed: bots=${scenarioD.botCountObserved}, started=${scenarioD.startedMatches}, reported=${scenarioD.reportedMatches}`);

    await client.healthcheck();
  } catch (error) {
    runError = error;
  } finally {
    try {
      bridgeCleanupSummary = await cleanupBridgeUsers(client, createdBridgeUsers, {
        keepUsers: keepBridgeUsers,
      });
      if (bridgeCleanupSummary.keepUsers) {
        console.log(`[e2e] Bridge user cleanup skipped (E2E_KEEP_USERS=true). created=${bridgeCleanupSummary.created}`);
      } else {
        console.log(`[e2e] Bridge user cleanup completed: created=${bridgeCleanupSummary.created}, deleted=${bridgeCleanupSummary.deleted}, failed=${bridgeCleanupSummary.failed}`);
      }
    } catch (cleanupError) {
      const message = cleanupError && cleanupError.message ? cleanupError.message : String(cleanupError);
      bridgeCleanupSummary = {
        ...bridgeCleanupSummary,
        keepUsers: keepBridgeUsers,
        error: message,
      };
      console.warn('[cleanup] bridge user cleanup failed: ' + message);
      if (!runError) {
        runError = cleanupError;
      }
    }
  }

  if (runError) {
    throw runError;
  }

  const summary = {
    success: true,
    baseUrl,
    checkedAt: new Date().toISOString(),
    bridgeUsers: bridgeCleanupSummary,
    scenarios,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[e2e] FAILED:', error && error.stack ? error.stack : error);
  process.exit(1);
});
