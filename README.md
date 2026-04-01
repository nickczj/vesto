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
