#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseDotEnv(filePath) {
  const parsed = {};
  if (!existsSync(filePath)) {
    return parsed;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

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

async function callTelegramApi(botToken, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Telegram API ${method} returned non-JSON response.`);
  }

  if (!response.ok || !data.ok) {
    const details = data && data.description ? data.description : response.statusText;
    throw new Error(`Telegram API ${method} failed: ${details}`);
  }

  return data.result;
}

function normalizeBotUsername(username) {
  return String(username || '').trim().replace(/^@/, '');
}

function getEnvValue(env, key, fallback = '') {
  const value = env[key];
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim();
}

const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env');
const fileEnv = parseDotEnv(envPath);
const env = { ...fileEnv, ...process.env };

const botToken = getEnvValue(env, 'TELEGRAM_BOT_TOKEN');
if (!botToken) {
  console.error('Missing TELEGRAM_BOT_TOKEN. Set it in .env or process env.');
  process.exit(1);
}

const originUrl = getEnvValue(env, 'TELEGRAM_TUNNEL_ORIGIN', 'http://localhost:5200');
const menuText = getEnvValue(env, 'TELEGRAM_MENU_BUTTON_TEXT', 'Open Quiz');
const skipMenuButton = getEnvValue(env, 'TELEGRAM_SKIP_MENU_BUTTON', 'false').toLowerCase() === 'true';

console.log(`Starting Cloudflare quick tunnel for ${originUrl} ...`);

const cloudflared = spawn(
  'cloudflared',
  ['tunnel', '--url', originUrl],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

let tunnelConfigured = false;
let tunnelUrl = '';

async function configureTelegram(publicUrl) {
  if (tunnelConfigured) return;
  tunnelConfigured = true;
  tunnelUrl = publicUrl;

  console.log(`Detected tunnel URL: ${publicUrl}`);

  try {
    const me = await callTelegramApi(botToken, 'getMe', {});
    const botUsername = normalizeBotUsername(me && me.username ? me.username : '');
    const botId = typeof me?.id === 'number' ? me.id : 0;

    if (!skipMenuButton) {
      await callTelegramApi(botToken, 'setChatMenuButton', {
        menu_button: {
          type: 'web_app',
          text: menuText,
          web_app: {
            url: publicUrl,
          },
        },
      });
      console.log(`Telegram menu button updated to ${publicUrl}`);
    } else {
      console.log('Skipping Telegram menu button update (TELEGRAM_SKIP_MENU_BUTTON=true).');
    }

    if (botUsername) {
      console.log(`Bot URL: https://t.me/${botUsername}`);
      console.log(`Mini App launch hint: open the bot and tap the menu button.`);
      console.log(`Optional deep link: https://t.me/${botUsername}?startapp=quiz`);
    }

    if (botId > 0) {
      console.log('Build-time client env values:');
      console.log(`  VITE_TELEGRAM_BOT_ID=${botId}`);
      if (botUsername) {
        console.log(`  VITE_TELEGRAM_BOT_USERNAME=${botUsername}`);
      }
    }

    console.log('Tunnel is live. Press Ctrl+C to stop.');
  } catch (error) {
    console.error(String(error));
    console.error('Tunnel is running, but Telegram bot configuration failed.');
    console.error(`Use this URL manually in BotFather: ${publicUrl}`);
  }
}

function checkForTunnelUrl(chunk) {
  const text = chunk.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (match && match[0]) {
    void configureTelegram(match[0]);
  }
}

cloudflared.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  checkForTunnelUrl(chunk);
});

cloudflared.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  checkForTunnelUrl(chunk);
});

cloudflared.on('error', (error) => {
  console.error(String(error));
  console.error('Failed to start cloudflared. Install cloudflared and ensure it is on PATH.');
  process.exit(1);
});

cloudflared.on('exit', (code, signal) => {
  if (signal) {
    console.log(`cloudflared stopped (${signal}).`);
    process.exit(0);
  }

  if (!tunnelConfigured) {
    console.error('cloudflared exited before a tunnel URL was detected.');
  }

  process.exit(code ?? 1);
});

function shutdown() {
  if (cloudflared.exitCode === null && !cloudflared.killed) {
    if (process.platform === 'win32') {
      cloudflared.kill('SIGTERM');
    } else {
      cloudflared.kill('SIGINT');
    }
  }
}

process.on('SIGINT', () => {
  if (tunnelUrl) {
    console.log(`Stopping tunnel ${tunnelUrl} ...`);
  }
  shutdown();
});

process.on('SIGTERM', () => {
  shutdown();
});
