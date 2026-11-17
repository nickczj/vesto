# AGENTS.md

## Project
- Name: `vesto-v2`
- Type: single-user personal finance frontend
- Goal: balance-sheet-first asset/liability tracking with dual-currency valuation (`USD` + `SGD`).

## Product Rules
1. Primary screen is a concise grouped balance sheet table.
2. Net worth is always derived as `total assets - total liabilities` in both USD and SGD.
3. `vesto-go` is market-data only in v1 (quotes + FX). Portfolio records stay in Nuxt SQLite.
4. v1 supports `USD` and `SGD` only.
5. Daily valuation history is captured once per SGT day at 08:00. There is no
   backfill; a missed day is a permanent hole. Portfolio drawdown is a read-time
   view over that series, not a separate service or alert.

## Data Ownership
- Nuxt SQLite tables:
  - `asset_entries`
  - `liability_entries`
  - `app_settings`
  - `valuation_history` (one row per SGT date; captured by the `snapshot` sidecar)
- External backend (`vesto-go`) provides:
  - `POST /v1/quotes/latest/batch`
  - `GET /api/market/fx?base=USD&quote=SGD`

## Asset/Liability Model
- Asset kinds: `investment`, `cpf`, `cash_savings`, `manual`
- CPF buckets: `OA`, `SA`, `MA`, `RA`
- Liability types: `loan`, `credit_card`, `other`
- Investment valuation modes:
  - `live_preferred`: use live quote, fallback to manual price
  - `manual_only`: always use manual price. These holdings are excluded from
    the quote batch entirely — a quote could never be used, and fetching one
    only adds an upstream call and a currency-mismatch warning.
- Investment price fields:
  - `costBasisUnitPrice`: purchase cost per unit; the only input to P&L.
  - `manualPrice`: fallback unit price, used only when no usable live quote exists.
  - A holding has one fixed `currency`; a quote in a different currency is ignored with a warning.

## FX Valuation Contract
- Canonical FX fetch is `USD->SGD`.
- Derive `SGD->USD` by inversion `1 / usdToSgd`.
- Every row carries native amount and converted USD/SGD amounts.

## API Contract (Nuxt)
- `GET /api/balance-sheet?refresh=never|stale|always`
- `GET/POST/PATCH/DELETE /api/assets`
- `GET/POST/PATCH/DELETE /api/liabilities`
- `GET /api/sources?refresh=stale|always` — BFF proxy for vesto-go `/v1/sources`.
  It passes the markets the portfolio holds so out-of-scope providers report
  `not_applicable` rather than looking dead. The browser never calls vesto-go.
- `GET /api/history?days=365` — daily valuation series plus read-time drawdown.
- `POST /api/snapshots` — authenticated, idempotent capture for the current SGT
  date. `?force=always` overwrites a complete day; normal retries may only
  improve an incomplete one.
- `GET /api/healthz` (public; everything else requires HTTP Basic auth in production)

## UI Contract
- Desktop-first grouped table sections:
  - Investments
  - CPF
  - Cash/Savings
  - Liabilities
- Include section subtotals and global net-worth row.
- Auto-refresh every 45s only while document is visible.
- Manual refresh is always available.
- Use modal forms for CRUD.
- The header has one provider-status chip. It reports provider health; row
  valuation state stays in the table. The chip is diagnostic, not a dashboard.
- The Source column shows `provider · valuation-state` when a quote supplied
  the price (`yahoo_scrape · live`), and just the state otherwise.
- The net-worth history card sits above the table. It plots complete days only,
  shows SGD as the headline, and reports drawdown from the running peak at read
  time. Incomplete days are counted but excluded from the chart and drawdown.
- Say that history starts when the series starts and cannot be backfilled.
- View preferences live in the header `View` popover: density, KPI card count,
  primary currency, section visibility, sticky header and sticky name column.
  The existing Source/Native column toggles use the same store.
- Preferences are per device: `localStorage` is the source of truth, mirrored to
  a small cookie so SSR renders the same first paint. Never move them to
  `app_settings`; there is one Basic-auth identity and no user accounts.
- Section visibility only filters table rows. The KPI cards and table totals
  stay full-portfolio, and the page must say so when a section is hidden.
- Do not expose the 45s poll interval as a free-form setting. It is also the
  server cache TTL.
- Excel export stays complete; it does not mirror the current view.

## Auth & Backup
- HTTP Basic auth is enforced by `server/middleware/auth.ts`; `/api/healthz` stays public for deploys.
- Production fails closed (503) when `NUXT_AUTH_PASSWORD` is unset.
- The NAS `backup` service writes consistent SQLite snapshots; restore with `deploy/restore-db.sh`.
- The NAS `snapshot` service calls authenticated `POST /api/snapshots` daily at
  08:00 SGT and retries for up to two hours. It has no volume and owns no data.
  Its startup catch-up only runs once the 08:00 SGT cut-off has passed: a row
  captured earlier holds intraday prices, and because a priced row is complete
  the scheduled run would then skip the day entirely.
- The Mac mini pulls a verified off-host copy twice daily with `deploy/backup-pull.sh`; off-site replication is still pending.

## Engineering Notes
- Keep server-side valuation deterministic and testable.
- Treat partial quote failures as non-fatal; fallback to manual/book values and emit warnings.
- The SQLite schema lives in `server/database/schema.ts`. After changing it, run
  `npm run db:generate` and commit the generated migration under
  `server/database/migrations/`. Migrations run at startup.
- Valuation history uses the same `buildBalanceSheet('always')` path as the page;
  do not duplicate valuation logic in the snapshot script or in SQL.
- `as_of_date` is the SGT calendar date (UTC+8, no DST). A complete day is final
  unless `force=always`; incomplete days may be improved by retries. Because a
  fully priced row counts as complete, nothing may capture before the cut-off —
  `hasReachedCutoff` in `scripts/snapshot-schedule.mjs` owns that rule.
- Drawdown is computed at read time over complete days only. Never store it and
  never let an incomplete day set a peak.
- Do not add raw DDL to plugins. `manual_unit_price` was dropped in
  `0002_drop_manual_unit_price.sql`; new code reads `cost_basis_unit_price` and
  `manual_price` only.
- Preserve strict validation with `zod` at API boundaries.

## Dependencies and Security
- Apply minor/patch updates with `npm update` and `npm audit fix` (never
  `--force`), then run `npm test`, `npm run typecheck` and `npm run build`.
- `npm run audit:prod` fails on high/critical production advisories. `xlsx` is
  the one documented exception: it writes exports from self-authored data, and
  no untrusted workbooks are parsed.
- Dependabot opens grouped minor/patch PRs weekly; major upgrades
  (`@tanstack/vue-table`, `vitest`, `better-sqlite3`) are separate, deliberate
  changes.
- The security workflow runs the production audit on PRs, `main` pushes and
  weekly. It does not replace the deploy workflow's tests.
