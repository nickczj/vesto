# Vesto v2

Balance-sheet-first personal finance tracker built with Nuxt 4.

## Highlights
- One ledger-style balance sheet: net-worth headline, section subtotals, sorted table.
- Dual-currency valuation (native, USD, SGD) on every row; `unpriced` rows are excluded, never zeroed.
- Nightly valuation history with a trend chart and read-time drawdown.
- Local SQLite record ownership for assets/liabilities.
- `vesto-go` integration for live quotes, provider health and FX for every held
  currency, with USD/SGD as the headline pair.
- Manual CRUD dialogs, an Excel export, and per-device view settings.
- 45-second auto-refresh while the tab is visible, plus manual refresh.
- Consistent daily SQLite snapshots, an encrypted off-site copy, and HTTP Basic auth in production.

## Documentation
- [AGENTS.md](./AGENTS.md)
- [Requirements](./docs/requirements.md)
- [Architecture](./docs/architecture.md)
- [API Gaps](./docs/api-gaps.md)

## Prerequisites
- Node.js 26 (`.nvmrc`)
- npm 10+
- Optional: running `vesto-go` backend for live prices (`NUXT_VESTO_GO_BASE_URL`)

## Setup
```bash
nvm use
npm ci
npm run dev
```

App runs on [http://localhost:3000](http://localhost:3000).

The SQLite schema is migrated automatically on server start. After editing
`server/database/schema.ts`, run `npm run db:generate` and commit the generated
migration under `server/database/migrations/`.

## Environment Variables
- `NUXT_DATABASE_PATH` (default: `./data/vesto-v2.db`)
- `NUXT_VESTO_GO_BASE_URL` (default: `http://localhost:8080`)
- `NUXT_AUTH_USER` (default: `vesto`) and `NUXT_AUTH_PASSWORD` — HTTP Basic auth.
  Production returns 503 until a password is configured; `/api/healthz` stays public.
- `BACKUP_RETENTION_DAYS` (default: `14`) and `BACKUP_INTERVAL_SECS` (default: `86400`)
  for the NAS backup service.
- `SNAPSHOT_APP_URL` (default: `http://vesto-v2:3000`), `SNAPSHOT_HOUR_SGT`
  (default: `8`), `SNAPSHOT_RETRY_MINUTES` (default: `120`),
  `SNAPSHOT_RETRY_INTERVAL_SECS` (default: `600`) and
  `SNAPSHOT_REQUEST_TIMEOUT_SECS` (default: `30`) for the valuation snapshot
  sidecar.

## Main APIs
- `GET /api/balance-sheet?refresh=never|stale|always`
- `GET/POST/PATCH/DELETE /api/assets`
- `GET/POST/PATCH/DELETE /api/liabilities`
- `GET /api/sources?refresh=stale|always` — proxy for vesto-go provider health
- `GET /api/instruments/resolve?symbol=&market=` — ticker lookup for the add/edit dialog
- `GET /api/history?days=365` — daily valuation history and read-time drawdown
- `POST /api/snapshots` — authenticated, idempotent daily capture
- `GET /api/healthz`

## Backups
The NAS stack runs a `backup` service that writes consistent daily snapshots
with SQLite's online backup API (a plain file copy is unsafe in WAL mode), and an
`offsite` service that copies those snapshots to Cloudflare R2 with restic. The
off-site service reads `../.env.offsite` and reports every run to Home Assistant.
See [deploy/RUNBOOK.md](./deploy/RUNBOOK.md) for setup, the restore procedure and
the alert meanings.

## History
The `snapshot` sidecar calls the authenticated `POST /api/snapshots` endpoint
once per SGT day at 08:00 and retries for up to two hours. The app computes the
same balance sheet the page shows and writes one `valuation_history` row per
date; repeated calls are idempotent. Complete days are final unless
`?force=always` is used. There is no backfill, so the series starts on the first
day the sidecar runs. Portfolio drawdown is computed read-time from the series
and is never stored.

## Testing
```bash
npm test          # unit
npm run typecheck
npm run test:e2e  # builds, then runs Playwright against ./data/e2e.db
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
2. Create deploy, data and backup directories:
   ```bash
   mkdir -p /srv/vesto-v2/deploy /srv/vesto-v2/data /srv/vesto-v2/backups
   ```
3. Place runtime env file at `/srv/vesto-v2/.env` (copy from `.env.example` and fill real values).
   `NUXT_AUTH_PASSWORD` is required; the deploy script refuses to run with it unset or `change_me`.
4. Ensure deploy user can run Docker and SSH login from GitHub Actions key is allowed.
5. Configure your existing NAS reverse proxy to route `finance.nickczj.com` to `${APP_PORT}` and keep Tailscale/private access policy enabled.

Important runtime env notes:
- `APP_PORT` is host/NAS port exposed to the reverse proxy (for example `43000`).
- `APP_CONTAINER_PORT` is the container port Docker maps to (default `3000`).
- `APP_BIND_IP` defaults to `0.0.0.0`. Set it to `127.0.0.1` only after the reverse proxy
  reaches the container over the shared `traefik` Docker network; otherwise the route breaks.
- `SHARED_DOCKER_NETWORK` should match `vesto-go` (default `vesto-shared`) for container-to-container DNS.
- `HOST` should be `0.0.0.0` and `PORT` should match `APP_CONTAINER_PORT`.
- `NUXT_DATABASE_PATH` should be `/data/vesto-v2.db` for persistent SQLite storage.
- `NUXT_VESTO_GO_BASE_URL` can use shared Docker DNS (`http://vesto-api:8080`) when both stacks are on `SHARED_DOCKER_NETWORK`.
- `NUXT_AUTH_USER` / `NUXT_AUTH_PASSWORD` protect every route except `/api/healthz` and static assets.
- `BACKUP_RETENTION_DAYS` (default `14`) and `BACKUP_INTERVAL_SECS` (default `86400`) control snapshots.
  The off-site copy reads R2 credentials from `.env.offsite`; see `deploy/offsite.env.example`.

### Deploy behavior
- Pulls and starts `ghcr.io/<owner>/vesto-v2:sha-<commit>` plus the `backup`, `snapshot` and `offsite` sidecars.
- Persists SQLite data under `${NAS_DEPLOY_PATH}/data` and snapshots under `${NAS_DEPLOY_PATH}/backups`.
- Performs bounded health check on `http://127.0.0.1:${APP_PORT}/api/healthz` (public).
- Automatically rolls back to previous image tag if health check fails.
- Restore procedure: [deploy/RUNBOOK.md](./deploy/RUNBOOK.md).
