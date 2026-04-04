# Vesto v2

Balance-sheet-first personal finance tracker built with Nuxt 4.

## Highlights
- Single grouped table for assets + liabilities + net worth.
- Dual-currency valuation (native, USD, SGD) on every row.
- Local SQLite record ownership for assets/liabilities.
- `vesto-go` integration for live quotes and USD/SGD FX.
- Manual CRUD flows with optimistic updates.
- 45-second auto-refresh while tab is visible + manual refresh.
- One-off idempotent import from legacy `vesto` SQLite data.

## Documentation
- [AGENTS.md](./AGENTS.md)
- [Requirements](./docs/requirements.md)
- [Architecture](./docs/architecture.md)
- [API Gaps](./docs/api-gaps.md)

## Prerequisites
- Node.js 20+
- npm 10+
- Optional: running `vesto-go` backend for live prices (`NUXT_VESTO_GO_BASE_URL`)

## Setup
```bash
npm install
npm run dev
```

App runs on [http://localhost:3000](http://localhost:3000).

## Environment Variables
- `NUXT_DATABASE_PATH` (default: `./data/vesto-v2.db`)
- `NUXT_VESTO_GO_BASE_URL` (default: `http://localhost:8080`)
- `NUXT_VESTO_V1_DB_PATH` (default: `/Users/nick/repo/vesto/data/Vesto.db`)

## Main APIs
- `GET /api/balance-sheet?refresh=never|stale|always`
- `GET/POST/PATCH/DELETE /api/assets`
- `GET/POST/PATCH/DELETE /api/liabilities`
- `POST /api/migrations/vesto-v1/import`
- `GET /api/healthz`

## Legacy Import
From UI: click **Import v1 Data**.

From CLI:
```bash
npm run db:import:v1
# or
npm run db:import:v1 -- /absolute/path/to/Vesto.db
```

## Testing
```bash
npm test
```

## Build
```bash
npm run build
npm run preview
```

## Deploy To NAS (GitHub Actions)
This repo includes an automated deploy workflow at `.github/workflows/deploy-nas.yml`:
- Trigger: push to `main` (and manual `workflow_dispatch`)
- Pipeline: `npm test` -> build/push image to GHCR -> SSH to NAS over Tailscale -> run `deploy/deploy.sh`

### Required GitHub secrets
- `NAS_HOST`
- `NAS_PORT`
- `NAS_USER`
- `NAS_SSH_KEY`
- `NAS_DEPLOY_PATH` (absolute path only, for example `/srv/vesto-v2`)
- `GHCR_USERNAME`
- `GHCR_TOKEN`
- `TS_OAUTH_CLIENT_ID`
- `TS_OAUTH_SECRET`

`NAS_HOST` should be the NAS Tailscale hostname/IP (for example `my-nas.your-tailnet.ts.net`), not a public internet IP.

### One-time NAS bootstrap
1. Install Docker Engine + Docker Compose plugin.
2. Create deploy and data directories:
   ```bash
   mkdir -p /srv/vesto-v2/deploy /srv/vesto-v2/data
   ```
3. Place runtime env file at `/srv/vesto-v2/.env` (copy from `.env.example` and fill real values).
4. Ensure deploy user can run Docker and SSH login from GitHub Actions key is allowed.
5. Configure your existing NAS reverse proxy to route `finance.nickczj.com` to `${APP_PORT}` and keep Tailscale/private access policy enabled.

Important runtime env notes:
- `APP_PORT` is host/NAS port exposed to the reverse proxy (for example `43000`).
- `APP_CONTAINER_PORT` is the container port Docker maps to (default `3000`).
- `HOST` should be `0.0.0.0` and `PORT` should match `APP_CONTAINER_PORT`.
- `NUXT_DATABASE_PATH` should be `/data/vesto-v2.db` for persistent SQLite storage.
- `NUXT_VESTO_GO_BASE_URL` should point to your private/proxied `vesto-go` URL.

### Deploy behavior
- Pulls and starts `ghcr.io/<owner>/vesto-v2:sha-<commit>`.
- Persists SQLite data under `${NAS_DEPLOY_PATH}/data`.
- Performs bounded health check on `http://127.0.0.1:${APP_PORT}/api/healthz`.
- Automatically rolls back to previous image tag if health check fails.
