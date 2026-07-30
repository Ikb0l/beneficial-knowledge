# Beneficial Knowledge — Real-Time Quiz Battles

A real-time multiplayer quiz platform accessible via Telegram Mini App and web browser. Players compete head-to-head in quiz matches, participate in tournament brackets, earn MMR (matchmaking rating), and climb rank tiers. Built on Nakama game server for real-time WebSocket gameplay.

## Features

### Core Gameplay
- **Real-time 1v1 matches** — WebSocket-based with countdown timers and live score reveal
- **Multiple question types** — MCQ, True/False, True/False/Not Given, Heading Match, Yes/No/Not Given
- **Passage-based questions** — IELTS reading comprehension style with source passages
- **MMR matchmaking** — Glicko-based rating per category with progressive range expansion
- **Practice mode** — Play against bots when no human opponent is available

### Tournament System
- **Single & double elimination** brackets with MMR-based seeding
- **Best-of series** per round (1, 3, or 5 games)
- **Grand final bracket reset** (double elimination)
- **Auto-fill with bots** when participant count is insufficient
- **Registration windows** with MMR range eligibility
- **Ready check system** — 60s timeout, no-show forfeit, auto-advancement
- **Spectator mode** for live tournament matches
- **Full admin lifecycle** — create, start, pause, cancel, disqualify, forfeit, shuffle seeds

### Ranking & Progression
- MMR per category and global
- Rank tiers with configurable thresholds
- Seasonal leaderboards with configurable seasons
- Question-level statistical tracking

### Social Features
- Friends system — send/accept/reject requests, see online status
- Friend challenges — direct match invitations
- Block/unblock users
- Profile with match history

### Monetization
- Donations with donor leaderboard
- Telegram Stars payments (in-app purchases)
- Referral codes for user acquisition

### Admin Panel
- Dashboard with operational snapshots
- Question CRUD, bulk import/export, cache management
- User management with MMR adjustment and bans
- Tournament lifecycle management
- Season and rank tier configuration
- AI question generation from source packs
- Home page content composer (banners, sections, featured items)
- Analytics — retention cohorts, engagement, question performance, tournament stats
- RBAC with admin levels and capabilities
- Full audit log

## Tech Stack

| Layer | Technology |
|--------|------------|
| Game Server | Nakama 3.21.1 (Heroic Labs) + TypeScript runtime (~35K lines) |
| Client | React 18, TypeScript, Vite 7, Tailwind CSS, Zustand, Framer Motion |
| Admin | React 18, TypeScript, Vite 7, TanStack Query, Recharts, Zod |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| i18n | English, Uzbek (i18next) |
| Audio | Howler.js |
| Error Tracking | Sentry (optional) |

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+

### Setup

```bash
# 1. Install dependencies
npm run install:all

# 2. Build the Nakama server bundle
npm run server:build

# 3. Start backend services (PostgreSQL, Redis, Nakama)
npm run docker:up

# 4. Apply migrations
npm run db:migrate

# 5. Seed questions (IELTS Cambridge 9-20)
npm run db:seed

# 6. Start client dev server (port 5200)
npm run dev:client

# 7. Start admin dev server (port 3001)
npm run dev:admin
```

For iterative development:
```bash
npm run server:watch      # Watch TypeScript changes
npm run docker:restart    # Restart Nakama container
```

For Telegram Mini App testing:
```bash
npm run tunnel:telegram   # Start Cloudflare tunnel
```

Set `ALLOW_INSECURE_TELEGRAM_AUTH=true` in your `.env` for local testing.

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | PostgreSQL 15 |
| `redis` | 6379 | Redis 7 (with AOF persistence) |
| `nakama` | 7350 (HTTP), 7351 (Console), 7349 (gRPC) | Game server |
| `client` | 80 (prod) / 5200 (dev) | Player-facing React app |
| `admin` | 3002 (prod) / 3001 (dev) | Admin panel |
| `tournament-cron` | — | Periodic tournament maintenance |
| `cloudflared` | — | Optional Cloudflare tunnel |
| `prometheus` | 9090 | Optional monitoring |

## Environment Variables

Create a `.env` file. Key variables:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Database password (required) |
| `NAKAMA_SERVER_KEY` | Server key for WebSocket auth, min 32 chars |
| `NAKAMA_HTTP_KEY` | HTTP API key, min 32 chars |
| `NAKAMA_CONSOLE_PASSWORD` | Nakama console password, min 16 chars |
| `NAKAMA_SESSION_ENCRYPTION_KEY` | Session encryption key, min 32 chars |
| `NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY` | Refresh session key |
| `REDIS_PASSWORD` | Redis password (required in production, min 16 chars) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for Mini App auth |
| `ADMIN_TELEGRAM_IDS` | Comma-separated admin Telegram user IDs |
| `WEB_AUTH_PEPPER` | Password hashing pepper, min 32 chars |
| `AI_SECRETS_ENCRYPTION_KEY` | AI provider secrets encryption key |
| `VITE_NAKAMA_HOST` / `VITE_NAKAMA_KEY` | Client connection config |

The `scripts/prepare-production-env.mjs` script auto-generates strong secrets for any weak/missing values.

## Authentication

- **Telegram auth** — Login via Telegram Mini App widget, validated against bot token
- **Web auth** — Email/password with bcrypt + pepper hashing, referral codes
- **Admin auth** — Telegram ID check against `ADMIN_TELEGRAM_IDS` or `admin_users` table, with RBAC

## Match Flow

1. Player selects category, clicks "Find Match"
2. Matchmaker finds opponent by MMR proximity
3. Nakama creates authoritative match via `onMatchmakerMatched`
4. Match handler runs the game loop: countdown → question (with timer) → reveal → next question → end
5. Answers scored in real-time, scores revealed after each question
6. Match supports: surrender, disconnect grace period (60s), results
7. MMR and leaderboards updated on completion

## Tournament Flow

1. Admin creates tournament with config (format, bracket size, MMR range, timing)
2. Players register during registration window
3. Cron auto-starts when `tournament_start` arrives
4. Bracket generated, participants seeded by MMR
5. Each round: matches created → ready check → match → result → bracket advance
6. Grand final with optional bracket reset (double elimination)
7. Winners recorded, MMR updated

## Production Deployment

```bash
# Option A: Automated (Windows PowerShell)
npm run prod:prepare -- --domain your.domain.com --bot-token <token> --admin-ids <ids>
npm run prod:deploy -- -Domain your.domain.com

# Option B: Linux VPS with SSH+rsync
npm run prod:deploy:vps -- --host <vps-ip> --user ubuntu --domain your.domain.com --bootstrap

# Option C: Linux direct deploy
bash scripts/bootstrap-ubuntu-vps.sh
npm run prod:prepare
bash scripts/deploy-production.sh --domain your.domain.com
bash scripts/setup-caddy-reverse-proxy.sh your.domain.com
```

The production deploy pipeline:
1. Generates `.env.production.ready` with strong secrets
2. Enforces `ALLOW_INSECURE_TELEGRAM_AUTH=false`
3. Runs environment security checks
4. Builds Nakama server bundle, client, and admin
5. Starts `docker-compose.prod.yml` with `--build`
6. Optionally configures Caddy HTTPS proxy or Cloudflare tunnel

## Project Structure

```
beneficial-knowledge/
├── server/                      # Nakama TypeScript runtime
│   ├── src/
│   │   ├── main.ts              # Entry point — registers RPCs, hooks, match handler
│   │   ├── features/            # Tournament logic, game types, helpers
│   │   └── main/                # Match handlers, auth, cron, admin, config, web auth
│   ├── scripts/                 # Build bundle, seed questions
│   ├── migrations/              # Custom SQL migrations
│   ├── seeds/                   # IELTS question JSON files (Cambridge 9-20)
│   ├── local.yml                # Nakama dev config
│   └── production.yml           # Nakama prod config
├── client/                      # React player app
│   ├── src/
│   │   ├── App.tsx              # Main shell with tab navigation
│   │   ├── stores/              # gameStore, tournamentStore (Zustand)
│   │   └── lib/i18n/            # English + Uzbek translations
│   ├── nginx.conf               # Nginx config with Nakama WebSocket proxy
│   └── Dockerfile               # Multi-stage (Node → Nginx)
├── admin/                       # React admin panel
│   ├── src/
│   │   ├── App.tsx              # 20+ admin routes
│   │   └── lib/adminRoutes.ts   # Route definitions with RBAC capabilities
│   ├── nginx.conf
│   └── Dockerfile
├── docker/                      # Docker Compose files + prometheus + cron
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   ├── tournament-cron.sh
│   └── prometheus.yml
├── scripts/                     # Deploy, bootstrap, security check, test scripts
│   ├── prepare-production-env.mjs  # Generates hardened env
│   ├── deploy-production.sh        # Linux deploy
│   ├── deploy-vps-clean.sh         # Clean VPS deploy with rollback
│   ├── bootstrap-ubuntu-vps.sh     # Fresh VPS setup
│   ├── check-env-security.mjs      # Production security audit
│   ├── tournament-e2e-smoke.mjs    # E2E tournament test
│   └── tournament-128-bench.mjs    # 128-player load test
└── package.json
```

## Testing

```bash
# Tournament E2E smoke test
node scripts/tournament-e2e-smoke.mjs

# 128-player tournament benchmark
node scripts/tournament-128-bench.mjs

# Production env security check
node scripts/check-env-security.mjs
```

## Content

Seeded questions come from Cambridge IELTS books 9-20 in JSON format (`server/seeds/`). Question types: IELTS MCQ, True/False/Not Given, Yes/No/Not Given, and Heading Match — all passage-based reading comprehension.

## External Services

| Service | Purpose | Required? |
|---------|---------|-----------|
| **Telegram** | Mini App auth, push notifications | Yes |
| **Cloudflare Tunnel** | Ingress without public IP | Optional |
| **Sentry** | Error tracking | Optional |
| **Prometheus** | Game server metrics | Optional |

## How This Differs from School-Manag's Quiz Platform

This is a **standalone competitive gaming platform** designed for public matchmaking, tournaments, rankings, and social features. The school-manag quiz platform is a classroom-oriented tool integrated into the school system where teachers assign quizzes to students. Both use Nakama, but this project has the full tournament system, MMR matchmaking, seasons, social features, and monetization.
