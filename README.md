# Vesto v2

Balance-sheet-first personal finance tracker built with Nuxt 4.

## Highlights
- Single grouped table for assets + liabilities + net worth.
- Dual-currency valuation (native, USD, SGD) on every row.
- Local SQLite record ownership for assets/liabilities.
- `vesto-go` integration for live quotes and USD/SGD FX.
- Manual CRUD flows with optimistic updates.
- 45-second auto-refresh while tab is visible + manual refresh.
- Consistent daily SQLite snapshots and HTTP Basic auth in production.

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

## Main APIs
- `GET /api/balance-sheet?refresh=never|stale|always`
- `GET/POST/PATCH/DELETE /api/assets`
- `GET/POST/PATCH/DELETE /api/liabilities`
- `GET /api/sources?refresh=stale|always` — proxy for vesto-go provider health
- `GET /api/healthz`

## Backups
The NAS stack runs a `backup` service that writes consistent daily snapshots
with SQLite's online backup API (a plain file copy is unsafe in WAL mode).
See [deploy/RUNBOOK.md](./deploy/RUNBOOK.md) for the restore procedure.

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

### Deploy behavior
- Pulls and starts `ghcr.io/<owner>/vesto-v2:sha-<commit>` plus the `backup` sidecar.
- Persists SQLite data under `${NAS_DEPLOY_PATH}/data` and snapshots under `${NAS_DEPLOY_PATH}/backups`.
- Performs bounded health check on `http://127.0.0.1:${APP_PORT}/api/healthz` (public).
- Automatically rolls back to previous image tag if health check fails.
- Restore procedure: [deploy/RUNBOOK.md](./deploy/RUNBOOK.md).
