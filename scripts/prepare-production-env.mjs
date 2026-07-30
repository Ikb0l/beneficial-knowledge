#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REQUIRED_KEYS = [
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'REDIS_PASSWORD',
  'NAKAMA_SERVER_KEY',
  'NAKAMA_HTTP_KEY',
  'NAKAMA_CONSOLE_USERNAME',
  'NAKAMA_CONSOLE_PASSWORD',
  'NAKAMA_CONSOLE_SIGNING_KEY',
  'NAKAMA_SESSION_ENCRYPTION_KEY',
  'NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY',
  'TELEGRAM_BOT_TOKEN',
  'ADMIN_TELEGRAM_IDS',
  'WEB_AUTH_PEPPER',
  'AI_SECRETS_ENCRYPTION_KEY',
];

const MIN_LENGTH = {
  POSTGRES_PASSWORD: 16,
  REDIS_PASSWORD: 16,
  NAKAMA_SERVER_KEY: 32,
  NAKAMA_HTTP_KEY: 32,
  NAKAMA_CONSOLE_PASSWORD: 16,
  NAKAMA_CONSOLE_SIGNING_KEY: 32,
  NAKAMA_SESSION_ENCRYPTION_KEY: 32,
  NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY: 32,
  WEB_AUTH_PEPPER: 32,
  AI_SECRETS_ENCRYPTION_KEY: 32,
};

const SECRET_KEYS = new Set(Object.keys(MIN_LENGTH));

const WEAK_PATTERNS = [
  'changeme',
  'change_me',
  'your_',
  'example',
  'local',
  'dev_',
  'password',
  'admin123',
  '123456',
  'qwerty',
  'test',
];

const PLACEHOLDER_PATTERNS = [
  'change_me',
  'changeme',
  'your-',
  'your_',
  'example',
];

const DEFAULTS = {
  POSTGRES_DB: 'nakama',
  POSTGRES_USER: 'nakama_prod',
  NAKAMA_CONSOLE_USERNAME: 'admin',
  WEB_SESSION_TTL_MINUTES: '30',
  ALLOW_INSECURE_TELEGRAM_AUTH: 'false',
  NAKAMA_DIRECT_SSL_ENABLED: 'false',
  CLOUDFLARE_TUNNEL_ENABLED: 'false',
  VITE_NAKAMA_PORT: '7350',
  VITE_NAKAMA_SSL: 'true',
  VITE_USE_PROXY: 'true',
  VITE_APP_VERSION: '1.0.0',
  CLIENT_BIND_ADDRESS: '0.0.0.0',
  ADMIN_BIND_ADDRESS: '0.0.0.0',
  NAKAMA_BIND_ADDRESS: '0.0.0.0',
  ADMIN_WEB_PORT: '3002',
  CLIENT_WEB_PORT: '80',
  NAKAMA_API_PORT: '7350',
};

const OUTPUT_KEY_ORDER = [
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'REDIS_PASSWORD',
  'NAKAMA_SERVER_KEY',
  'NAKAMA_HTTP_KEY',
  'NAKAMA_CONSOLE_USERNAME',
  'NAKAMA_CONSOLE_PASSWORD',
  'NAKAMA_CONSOLE_SIGNING_KEY',
  'NAKAMA_SESSION_ENCRYPTION_KEY',
  'NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY',
  'NAKAMA_DIRECT_SSL_ENABLED',
  'NAKAMA_SSL_CERTIFICATE',
  'NAKAMA_SSL_PRIVATE_KEY',
  'CLOUDFLARE_TUNNEL_ENABLED',
  'CLOUDFLARE_TUNNEL_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'ADMIN_TELEGRAM_IDS',
  'ADMIN_LOGIN_TOKEN',
  'ALLOW_INSECURE_TELEGRAM_AUTH',
  'WEB_AUTH_PEPPER',
  'AI_SECRETS_ENCRYPTION_KEY',
  'WEB_SESSION_TTL_MINUTES',
  'VITE_NAKAMA_HOST',
  'VITE_NAKAMA_PORT',
  'VITE_NAKAMA_KEY',
  'VITE_NAKAMA_SSL',
  'VITE_USE_PROXY',
  'VITE_TELEGRAM_BOT_ID',
  'VITE_TELEGRAM_BOT_USERNAME',
  'VITE_SENTRY_DSN',
  'VITE_SENTRY_DEV',
  'VITE_APP_VERSION',
  'CLIENT_BIND_ADDRESS',
  'ADMIN_BIND_ADDRESS',
  'NAKAMA_BIND_ADDRESS',
  'ADMIN_WEB_PORT',
  'CLIENT_WEB_PORT',
  'NAKAMA_API_PORT',
  'DOMAIN_NAME',
  'PROMETHEUS_ENABLED',
  'GRAFANA_ADMIN_PASSWORD',
];

function parseArgs(argv) {
  const options = {
    output: '.env.production.ready',
    domain: '',
    botToken: '',
    adminIds: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = i + 1 < argv.length ? argv[i + 1] : '';

    if (arg === '--output' && next) {
      options.output = next;
      i++;
      continue;
    }
    if (arg === '--domain' && next) {
      options.domain = next;
      i++;
      continue;
    }
    if (arg === '--bot-token' && next) {
      options.botToken = next;
      i++;
      continue;
    }
    if (arg === '--admin-ids' && next) {
      options.adminIds = next;
      i++;
      continue;
    }
  }

  return options;
}

function parseDotEnv(filePath) {
  const out = {};
  if (!existsSync(filePath)) {
    return out;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasPlaceholderValue(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isWeakValue(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return true;
  return WEAK_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function generateSecret(minLength) {
  const targetLength = Math.max(minLength, 48);
  while (true) {
    const candidate = randomBytes(targetLength).toString('base64url');
    if (candidate.length >= minLength) {
      return candidate.slice(0, targetLength);
    }
  }
}

function normalizeAdminIds(rawValue) {
  const parsed = normalizeString(rawValue)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^[0-9]+$/.test(item))
    .filter((item) => Number(item) > 0);
  return Array.from(new Set(parsed));
}

function enforceValue(env, key, value) {
  if (!normalizeString(env[key])) {
    env[key] = value;
  }
}

async function getBotMeta(botToken) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const data = await response.json();
  if (!response.ok || !data.ok || !data.result) {
    const details = data && data.description ? data.description : response.statusText;
    throw new Error(`Failed to fetch bot metadata: ${details}`);
  }
  return {
    id: String(data.result.id || ''),
    username: normalizeString(String(data.result.username || '')).replace(/^@/, ''),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const outputPath = path.resolve(rootDir, options.output);

  const envFromProduction = parseDotEnv(path.join(rootDir, '.env.production'));
  const envFromLocal = parseDotEnv(path.join(rootDir, '.env'));
  const envFromExistingOutput = parseDotEnv(outputPath);

  const env = {
    ...envFromLocal,
    ...envFromProduction,
    ...envFromExistingOutput,
    ...process.env,
  };

  if (options.botToken) {
    env.TELEGRAM_BOT_TOKEN = options.botToken;
  }
  if (options.adminIds) {
    env.ADMIN_TELEGRAM_IDS = options.adminIds;
  }

  for (const [key, value] of Object.entries(DEFAULTS)) {
    enforceValue(env, key, value);
  }

  if (options.domain) {
    const normalizedDomain = normalizeString(options.domain);
    if (!normalizedDomain) {
      throw new Error('Invalid --domain value');
    }
    env.DOMAIN_NAME = normalizedDomain;
    env.VITE_NAKAMA_HOST = normalizedDomain;
  }

  if (!normalizeString(env.VITE_NAKAMA_HOST) && normalizeString(env.DOMAIN_NAME)) {
    env.VITE_NAKAMA_HOST = normalizeString(env.DOMAIN_NAME);
  }

  if (!normalizeString(env.ADMIN_LOGIN_TOKEN)) {
    env.ADMIN_LOGIN_TOKEN = generateSecret(48);
  }

  const regenerated = [];
  for (const key of SECRET_KEYS) {
    const minLength = MIN_LENGTH[key];
    const currentValue = normalizeString(env[key]);
    const tooShort = !currentValue || currentValue.length < minLength;
    if (tooShort || isWeakValue(currentValue) || hasPlaceholderValue(currentValue)) {
      env[key] = generateSecret(minLength);
      regenerated.push(key);
    }
  }

  env.ALLOW_INSECURE_TELEGRAM_AUTH = 'false';
  const tunnelEnabled = normalizeString(env.CLOUDFLARE_TUNNEL_ENABLED).toLowerCase() === 'true';
  env.CLOUDFLARE_TUNNEL_ENABLED = tunnelEnabled ? 'true' : 'false';

  if (tunnelEnabled) {
    if (!normalizeString(env.CLOUDFLARE_TUNNEL_TOKEN)) {
      throw new Error('CLOUDFLARE_TUNNEL_TOKEN is required when CLOUDFLARE_TUNNEL_ENABLED=true.');
    }
    // Keep services private on the VPS when ingress is handled by cloudflared.
    env.CLIENT_BIND_ADDRESS = '127.0.0.1';
    env.ADMIN_BIND_ADDRESS = '127.0.0.1';
    env.NAKAMA_BIND_ADDRESS = '127.0.0.1';
  }

  const directSslEnabled = normalizeString(env.NAKAMA_DIRECT_SSL_ENABLED).toLowerCase() === 'true';
  if (!directSslEnabled) {
    env.NAKAMA_SSL_CERTIFICATE = '';
    env.NAKAMA_SSL_PRIVATE_KEY = '';
  } else if (!normalizeString(env.NAKAMA_SSL_CERTIFICATE) || !normalizeString(env.NAKAMA_SSL_PRIVATE_KEY)) {
    throw new Error('NAKAMA_DIRECT_SSL_ENABLED=true requires NAKAMA_SSL_CERTIFICATE and NAKAMA_SSL_PRIVATE_KEY.');
  }

  const botToken = normalizeString(env.TELEGRAM_BOT_TOKEN);
  if (!botToken || hasPlaceholderValue(botToken)) {
    throw new Error('TELEGRAM_BOT_TOKEN is required and must not be a placeholder.');
  }

  const adminIds = normalizeAdminIds(env.ADMIN_TELEGRAM_IDS);
  if (adminIds.length === 0) {
    throw new Error('ADMIN_TELEGRAM_IDS is required and must contain at least one numeric Telegram ID.');
  }
  env.ADMIN_TELEGRAM_IDS = adminIds.join(',');

  let botMeta = null;
  try {
    botMeta = await getBotMeta(botToken);
  } catch (error) {
    const existingBotId = normalizeString(env.VITE_TELEGRAM_BOT_ID);
    const existingBotUsername = normalizeString(env.VITE_TELEGRAM_BOT_USERNAME).replace(/^@/, '');
    if (!existingBotId || !existingBotUsername) {
      throw error;
    }
  }

  if (botMeta) {
    env.VITE_TELEGRAM_BOT_ID = botMeta.id;
    env.VITE_TELEGRAM_BOT_USERNAME = botMeta.username;
  }

  if (!normalizeString(env.VITE_TELEGRAM_BOT_ID)) {
    throw new Error('VITE_TELEGRAM_BOT_ID is required.');
  }

  if (!normalizeString(env.VITE_TELEGRAM_BOT_USERNAME)) {
    throw new Error('VITE_TELEGRAM_BOT_USERNAME is required.');
  }

  if (!normalizeString(env.VITE_NAKAMA_KEY) || hasPlaceholderValue(env.VITE_NAKAMA_KEY)) {
    env.VITE_NAKAMA_KEY = env.NAKAMA_SERVER_KEY;
  }

  for (const key of REQUIRED_KEYS) {
    const value = normalizeString(env[key]);
    if (!value) {
      throw new Error(`Missing required value for ${key}`);
    }
    const minLength = MIN_LENGTH[key];
    if (minLength && value.length < minLength) {
      throw new Error(`${key} is shorter than required minimum length (${minLength}).`);
    }
  }

  const lines = [];
  lines.push('# Auto-generated by scripts/prepare-production-env.mjs');
  lines.push(`# Generated at ${new Date().toISOString()}`);
  lines.push('');

  for (const key of OUTPUT_KEY_ORDER) {
    const value = env[key];
    if (typeof value === 'undefined') continue;
    lines.push(`${key}=${String(value)}`);
  }

  const additionalKeys = Object.keys(env)
    .filter((key) => key.startsWith('VITE_') || key.startsWith('NAKAMA_') || key.startsWith('POSTGRES_') || key.startsWith('REDIS_'))
    .filter((key) => !OUTPUT_KEY_ORDER.includes(key))
    .sort();

  for (const key of additionalKeys) {
    const value = env[key];
    if (typeof value === 'undefined' || value === '') continue;
    lines.push(`${key}=${String(value)}`);
  }

  lines.push('');
  writeFileSync(outputPath, lines.join('\n'), 'utf8');

  console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
  if (regenerated.length > 0) {
    console.log(`Regenerated secure values for: ${regenerated.join(', ')}`);
  } else {
    console.log('No secret regeneration was needed.');
  }
  console.log(`ADMIN_TELEGRAM_IDS=${env.ADMIN_TELEGRAM_IDS}`);
  console.log(`VITE_TELEGRAM_BOT_ID=${env.VITE_TELEGRAM_BOT_ID}`);
  console.log(`VITE_TELEGRAM_BOT_USERNAME=${env.VITE_TELEGRAM_BOT_USERNAME}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


