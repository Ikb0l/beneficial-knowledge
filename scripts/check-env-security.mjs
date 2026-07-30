#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
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

function parseArgs(argv) {
  const out = { envFile: '.env.production.ready' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = i + 1 < argv.length ? argv[i + 1] : '';
    if ((arg === '--env-file' || arg === '-f') && next) {
      out.envFile = next;
      i++;
      continue;
    }
  }
  return out;
}

function parseDotEnv(filePath) {
  const parsed = {};
  if (!existsSync(filePath)) return parsed;
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isWeak(value) {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return true;
  return WEAK_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function main() {
  const { envFile } = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const envPath = path.resolve(root, envFile);
  const env = parseDotEnv(envPath);

  if (!existsSync(envPath)) {
    console.error(`Env file not found: ${envPath}`);
    process.exit(1);
  }

  const missing = [];
  const weak = [];
  const tooShort = [];

  for (const key of REQUIRED_KEYS) {
    const value = normalize(env[key]);
    if (!value) {
      missing.push(key);
      continue;
    }
    const minLen = MIN_LENGTH[key];
    if (minLen && value.length < minLen) {
      tooShort.push(`${key} (<${minLen} chars)`);
    }
    if (isWeak(value)) {
      weak.push(`${key} (contains weak pattern)`);
    }
  }

  if (normalize(env.ALLOW_INSECURE_TELEGRAM_AUTH).toLowerCase() === 'true') {
    weak.push('ALLOW_INSECURE_TELEGRAM_AUTH must be false');
  }

  const adminIds = normalize(env.ADMIN_TELEGRAM_IDS);
  if (adminIds) {
    const items = adminIds.split(',').map((v) => v.trim()).filter(Boolean);
    const invalid = items.filter((v) => !/^\d+$/.test(v));
    if (invalid.length > 0) {
      weak.push(`ADMIN_TELEGRAM_IDS contains non-numeric values: ${invalid.join(', ')}`);
    }
  }

  if (missing.length === 0 && weak.length === 0 && tooShort.length === 0) {
    console.log('Environment security check: OK');
    process.exit(0);
  }

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
  }
  if (tooShort.length > 0) {
    console.error(`Values too short: ${tooShort.join(', ')}`);
  }
  if (weak.length > 0) {
    console.error(`Weak or insecure values: ${weak.join(', ')}`);
  }

  process.exit(1);
}

main();
