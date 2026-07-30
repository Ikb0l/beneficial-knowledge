# Setup Guide - Beneficial Knowledge

This guide matches the current repo layout and scripts.

## Prerequisites
- Node.js 20+
- Docker Desktop
- Git

Optional:
- Cloudflared for Telegram Mini App testing

## 1) Configure environment
1. Copy `.env.example` to `.env`.
2. Fill required values (Telegram bot token, Nakama keys, admin IDs).
3. Set client bot metadata:
   - `VITE_TELEGRAM_BOT_ID` (numeric bot id)
   - `VITE_TELEGRAM_BOT_USERNAME` (bot username without `@`)

Local development notes:
- You can set `ALLOW_INSECURE_TELEGRAM_AUTH=true` for local testing only.
- For Telegram Web App in a browser, use tunnels (see step 5).

## 2) Install dependencies
```
npm run install:all
```

## 3) Build server bundle
The Nakama runtime loads `server/build/index.js`.
```
npm run server:build
```

## 4) Start backend services
```
npm run docker:up
```
This now runs app SQL migrations from `server/migrations` before Nakama starts.

## 5) Start apps
```
npm run dev:client
npm run dev:admin
```

## 6) Development workflow
- To rebuild runtime code: `npm run server:watch` then `npm run docker:restart`.
- To apply app migrations manually (without restart): `npm run db:migrate`.
- Seed questions: `npm run db:seed`.

## 7) Telegram testing
Recommended one-command setup:
```
npm run tunnel:telegram
```
This starts a Cloudflare quick tunnel for `http://localhost:5200`, then configures your bot menu button WebApp URL automatically.

Manual tunnel commands:
```
npm run tunnel:client
npm run tunnel:admin
npm run tunnel:nakama
```
If you do not use `tunnel:telegram`, set the client tunnel URL manually in BotFather.

## Services and ports (default)
- Client: http://localhost:5200
- Admin (dev): http://localhost:3001
- Nakama HTTP: http://localhost:7350
- Nakama Console: http://localhost:7351
- Postgres: localhost:5432
- Redis: localhost:6379
- Client (prod default): http://localhost:80 (override with `CLIENT_WEB_PORT`)
- Admin (prod default): http://localhost:3002 (override with `ADMIN_WEB_PORT`)
- Nakama API (prod default): http://localhost:7350 (override with `NAKAMA_API_PORT`)

## Troubleshooting
- If Nakama fails to load runtime code, confirm `server/build/index.js` exists.
- If auth fails in dev, verify `ALLOW_INSECURE_TELEGRAM_AUTH` and `TELEGRAM_BOT_TOKEN`.
- If categories are empty, create them in the admin dashboard.
- If Telegram web login button fails in browser mode, verify `VITE_TELEGRAM_BOT_ID` and `VITE_TELEGRAM_BOT_USERNAME`.

## 8) Production deploy automation
Generate a hardened deploy env file (auto-fills strong secrets and bot metadata):
```
npm run prod:prepare
```

Run full production deploy:
```
npm run prod:deploy -- -Domain your.domain.com
```

Run deploy and automatically launch Telegram tunnel for production client:
```
npm run prod:deploy:telegram -- -Domain your.domain.com
```

This command automatically:
- creates `.env.production.ready`
- enforces `ALLOW_INSECURE_TELEGRAM_AUTH=false`
- runs `server/scripts/check-env-security.ps1`
- builds the Nakama runtime bundle
- starts `docker/docker-compose.prod.yml` with `--build` (includes admin UI service)
- keeps generated production secrets stable between deploys
- disables direct Nakama SSL by default unless `NAKAMA_DIRECT_SSL_ENABLED=true`

Cloudflare named tunnel production mode:
- set `CLOUDFLARE_TUNNEL_ENABLED=true` in `.env.production` (or `.env.production.ready`)
- set `CLOUDFLARE_TUNNEL_TOKEN=<your_tunnel_token>`
- deploy normally with `npm run prod:deploy -- -Domain your.domain.com`
- deploy script will enable compose profile `tunnel` and bind client/admin/api to localhost by default

Optional dry-run (prepare + security check only):
```
powershell -ExecutionPolicy Bypass -File scripts/deploy-production.ps1 -PrepareOnly
```

## 9) Ubuntu VPS direct deployment (no Cloudflare tunnel)

If DNS `app/admin/api.your-domain.com` points to VPS and you want direct low-latency hosting:

1. Bootstrap VPS packages (Docker, Node 20, cloudflared optional):
```
sudo bash scripts/bootstrap-ubuntu-vps.sh
```

2. Set direct mode env (no tunnel) in `.env.production`:
- `CLOUDFLARE_TUNNEL_ENABLED=false`
- `CLIENT_BIND_ADDRESS=127.0.0.1`
- `ADMIN_BIND_ADDRESS=127.0.0.1`
- `NAKAMA_BIND_ADDRESS=127.0.0.1`
- `CLIENT_WEB_PORT=8080`
- keep `ADMIN_WEB_PORT=3002`, `NAKAMA_API_PORT=7350`

3. Deploy stack on Linux:
```
bash scripts/deploy-production.sh --domain your-domain.com
```

4. Configure HTTPS reverse proxy with Caddy:
```
bash scripts/setup-caddy-reverse-proxy.sh your-domain.com
```

This maps:
- `https://app.your-domain.com` -> client
- `https://admin.your-domain.com` -> admin
- `https://api.your-domain.com` -> Nakama API

## 10) One-command VPS deploy from local machine

If you keep code on your local PC and want to deploy to VPS over SSH:

1. Prepare local production env file (`.env.production`) with real values.
2. Run:
```
npm run prod:deploy:vps -- --host <vps-ip> --user ubuntu --domain your-domain.com --bootstrap --setup-caddy
```

What it does:
- syncs project files to VPS via `rsync`
- uploads `.env.production` to VPS project folder
- optionally bootstraps Docker/Node/cloudflared on VPS (`--bootstrap`)
- installs server build deps (`npm --prefix server ci`)
- runs `scripts/deploy-production.sh --domain your-domain.com`
- optionally configures Caddy HTTPS reverse proxy (`--setup-caddy`)

Useful flags:
- `--identity ~/.ssh/id_ed25519` for custom SSH key
- `--port 22` for custom SSH port
- `--remote-dir /opt/beneficial-knowledge` to change VPS target directory
- `--no-env-copy` if `.env.production` already exists on VPS
- `--prepare-only` to only generate/check env and skip docker start

Exclude list:
- `scripts/rsync-excludes.txt` is the canonical list of paths/files that should not be deployed.
- Use the same entries in IntelliJ Deployment -> Excluded Paths for consistent behavior.


