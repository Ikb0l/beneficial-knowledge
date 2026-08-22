# Beneficial Knowledge

Real-time quiz battles for Telegram Mini App and web, powered by Nakama.

## Repo layout
- `client/`: Player-facing app (React + Vite)
- `admin/`: Admin dashboard (React + Vite)
- `server/`: Nakama TypeScript runtime, migrations, scripts
- `docker/`: Dev/prod compose files, cron helper, optional Prometheus
- `docs/`: API and ops runbooks

## Quick start (dev)
1. Copy `.env.example` to `.env` and fill required values.
2. Install dependencies:
   - `npm run install:all`
3. Build the Nakama runtime bundle:
   - `npm run server:build`
4. Start backend services:
   - `npm run docker:up`
5. Start apps:
   - `npm run dev:client`
   - `npm run dev:admin`

Tips:
- For server changes, run `npm run server:watch` and then `npm run docker:restart`.
- Run app SQL migrations manually with `npm run db:migrate` when needed.
- Seed questions via `npm run db:seed`.
- Telegram Mini App tunnel + menu button setup: `npm run tunnel:telegram`.
- Manual tunnels (advanced): `npm run tunnel:client`, `npm run tunnel:admin`, `npm run tunnel:nakama`.

## Production
- `docker/docker-compose.prod.yml` runs Postgres, Redis, Nakama, client, admin, cron, and optional Prometheus.
- `server/production.yml` is the production Nakama config (JSON logs, metrics on port 9100).
- Build the server bundle before deploying: `npm run server:build`.
- Validate production secrets before deploy: `npm run env:check:prod`.
- Keep `ALLOW_INSECURE_TELEGRAM_AUTH=false` in production.
- Auto-prepare a hardened deploy env file: `npm run prod:prepare`.
- One-command production deploy (prepare env, security check, build, docker up): `npm run prod:deploy -- -Domain your.domain.com`.
- Production client UI runs on `http://localhost:80` by default (override with `CLIENT_WEB_PORT`).
- Production admin UI runs on `http://localhost:3002` by default (override with `ADMIN_WEB_PORT`).
- Nakama API is exposed on `http://localhost:7350` by default (override with `NAKAMA_API_PORT`).
- Optional Cloudflare named tunnel mode:
  - set `CLOUDFLARE_TUNNEL_ENABLED=true`
  - set `CLOUDFLARE_TUNNEL_TOKEN=<your_tunnel_token>`
  - deploy with `npm run prod:deploy -- -Domain your.domain.com`
  - when enabled, deploy script starts compose profile `tunnel` and binds app/admin/api to `127.0.0.1` by default for safer VPS exposure
- One-command production deploy + Telegram tunnel setup: `npm run prod:deploy:telegram -- -Domain your.domain.com`.
- Dry run without docker deploy: `powershell -ExecutionPolicy Bypass -File scripts/deploy-production.ps1 -PrepareOnly`.
- Ubuntu/Linux deploy helpers:
  - bootstrap VPS dependencies: `sudo bash scripts/bootstrap-ubuntu-vps.sh`
  - prepare+deploy on Linux: `bash scripts/deploy-production.sh --domain your.domain.com`
  - optional direct HTTPS reverse-proxy (no Cloudflare tunnel): `bash scripts/setup-caddy-reverse-proxy.sh your.domain.com`
  - deploy from your local machine via SSH+rsync: `npm run prod:deploy:vps -- --host <vps-ip> --domain your.domain.com --bootstrap --setup-caddy`
  - clean full refresh deploy (backup + rebuild + migrations + recreate + health checks): `npm run prod:deploy:vps:clean -- --host <vps-ip> --user <ssh-user> --remote-dir /opt/quizup/beneficial-knowledge`
    - with password auth: `SSHPASS='your_password' npm run prod:deploy:vps:clean -- --host <vps-ip> --user <ssh-user>`

## Scripts (root)
- `npm run dev:client` / `npm run dev:admin`
- `npm run dev:server` (docker-compose dev stack)
- `npm run server:build` / `npm run server:watch`
- `npm run docker:up` / `npm run docker:down` / `npm run docker:restart`
- `npm run db:migrate` / `npm run db:seed`
- `npm run check` (lint + server type-check)
- `npm run test:server` (server automated tests)
- `npm run test:e2e:tournament` (live tournament smoke against running Nakama)
- `npm run test:production` (full production-style test pipeline)
- `npm run tunnel:telegram` (starts Cloudflare quick tunnel to client and updates Telegram bot menu button)
- `npm run prod:prepare` (generates `.env.production.ready` with strong secrets and bot metadata)
- `npm run prod:deploy` (deploys prod stack via `docker/docker-compose.prod.yml` using `.env.production.ready`)
- `npm run prod:deploy:telegram` (runs prod deploy, then starts Telegram tunnel for `http://localhost:80`)
- `npm run prod:deploy:vps -- --host <ip> --domain your.domain.com` (syncs code to VPS and deploys remotely)
- `npm run prod:deploy:vps:clean -- --host <ip> --user <ssh-user>` (clean refresh deploy with rollback backup and health checks)

## Docs
- Tournament RPCs: `docs/API.md`
- Ops runbooks: `docs/ops/OPERATIONS.md`
- Cloudflare tunnel production: `docs/ops/CLOUDFLARE_TUNNEL_PROD.md`
- Tournament ops checks: `docs/ops/TOURNAMENT_PROD_CHECKS.md`
- Alerting guidance: `docs/ops/TOURNAMENT_ALERTING.md`
- CI and testing plan: `docs/CI_TESTING_PLAN.md`

## Notes
- Do not enable `ALLOW_INSECURE_TELEGRAM_AUTH` outside local development.
- Direct Nakama SSL is disabled by default in env generation (`NAKAMA_DIRECT_SSL_ENABLED=false`) unless you provide cert paths.
- Telegram and web auth use custom Nakama auth; see `server/src/main/auth-telegram.ts` and `server/src/main/web-auth.ts`.
- Client Telegram deep links use `VITE_TELEGRAM_BOT_USERNAME` (without `@`).



