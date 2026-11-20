# AGENTS.md

## Project
- Name: `vesto-v2`
- Type: single-user personal finance frontend
- Goal: balance-sheet-first asset/liability tracking with dual-currency valuation (`USD` + `SGD`).

## Product Rules
1. Primary screen is a concise grouped balance sheet table.
2. Net worth is always derived as `total assets - total liabilities` in both USD and SGD.
3. `vesto-go` is market-data only (quotes + FX + provider health). Portfolio records stay in Nuxt SQLite.
4. Vesto supports `USD`, `SGD` and `HKD` only. `asset_entries.currency` is
   the holding's **quotation currency**; USD and SGD remain the only totals
   currencies. Adding another currency is a deliberate change: the type, the
   SQLite `CHECK`, the symbol map, FX coverage and tests all move together.
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
  - `POST /api/market/fx/batch?quote=SGD` — the BFF asks for every currency the
    sheet holds. `sgdPerUnit` is the rate table; USD is the pivot.

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
  - A holding has one fixed `currency`: the currency its price is quoted in. A
  quote in a different currency is ignored with a warning rather than changing
  the row's currency. Changing the currency in the edit dialog does **not**
  convert the stored cost basis or manual price; the form requires an explicit
  confirmation.

## FX Valuation Contract
- Canonical FX fetch is a single batch of SGD-quoted pairs for every currency
  the sheet holds, plus USD. SGD itself is never fetched.
- Store `sgdPerUnit`: SGD per one unit of each currency. `usdToSgd` is
  `sgdPerUnit.USD`; derive `sgdToUsd` by inversion.
- Every row carries native amount and converted USD/SGD amounts.
- A missing rate makes rows in that currency `unpriced`. Never fall back to 1:1,
  and never let a missing optional pair hide the USD/SGD totals.

## API Contract (Nuxt)
- `GET /api/balance-sheet?refresh=never|stale|always`
- `GET/POST/PATCH/DELETE /api/assets`
- `GET/POST/PATCH/DELETE /api/liabilities`
- `GET /api/sources?refresh=stale|always` — BFF proxy for vesto-go `/v1/sources`.
  It passes the markets the portfolio holds so out-of-scope providers report
  `not_applicable` rather than looking dead. The browser never calls vesto-go.
  When vesto-go is unreachable it answers 200 with an empty stale snapshot
  (`isStale: true`, no sources); a diagnostic chip is not worth a 5xx.
- `GET /api/instruments/resolve?symbol=&market=` — BFF proxy for vesto-go
  `/v1/quotes/latest`, used by the add/edit dialog to resolve a ticker before
  saving. It returns a status and a plain sentence; a provider outage does not
  block a save.
- `GET /api/history?days=365` — daily valuation series plus read-time drawdown.
  Each point also carries `netWorthExCpfUsd`/`netWorthExCpfSgd`; rows captured
  before the column existed are null and are never backfilled.
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
- The header has one market-data chip. It reports how the page's last call to
  vesto-go went and when prices last arrived; its panel reports provider
  health. Row valuation state stays in the table. The chip is diagnostic, not
  a dashboard. When no provider status has ever been read, the panel says so
  and reuses the balance sheet's outage state instead of failing a request.
- The Source column shows `provider · valuation-state` when a quote supplied
  the price (`yahoo_scrape · live`), and just the state otherwise.
- Currency is chosen from the supported list in the add/edit dialogs. Changing
  an existing row's currency warns first: the stored cost basis and manual price
  are read as the new currency and are not converted.
- The Ccy column shows the native currency and, when the row has a market, a
  short venue label (`HKD · HKEX`). The add/edit dialog prefills the currency
  from a newly resolved ticker and warns when an existing row's currency
  differs from the quote, because the quote would be ignored.
- The P&L column is **price P&L**: the holding's native price change converted
  at today's FX. It is not the SGD return since purchase; the column and the
  return are labelled `Price gain/loss (SGD)` and `Price return`, and their
  tooltips say FX movement since purchase is excluded. Do not add a
  cost-basis FX rate: true SGD return needs lots and acquisition dates.
- Market codes are canonicalised in `shared/utils/markets.ts`; store `SEHK`,
  `LSE`, `AMS`, `SGX`, `NMS`, `NYQ` or `PCX`, not provider aliases such as
  `HKG`, `XLON` or `XAMS`.
- The Exchange field is optional and offers the canonical venues from
  `SUPPORTED_MARKETS` as a datalist. A resolved ticker adopts the provider's
  venue; an auto-filled venue is cleared when the ticker changes, while a
  manually typed venue is kept and a mismatch is shown with a one-click
  "Use NMS". An unrecognised code gets a soft warning, not a block. The Go
  service canonicalises the same aliases, so a new venue needs a row in both
  lists.
- The hero FX line names every non-USD/SGD currency the sheet holds, with its
  SGD rate. USD/SGD stays the headline pair and the only headline toggle.
- The net-worth history card sits beside the net-worth headline. It plots
  complete days only, shows SGD as the headline, and reports drawdown from the
  running peak at read time. Incomplete days are counted but excluded from the
  chart and drawdown.
- The history card plots one series at a time: **Total** or **Ex-CPF**. The
  Ex-CPF series starts at the first capture that has the column and cannot be
  backfilled. Drawdown stays on total net worth; the peak note follows the
  selected series. Only the chart series switches.
- The hero shows **Excluding CPF** as a secondary line under the assets and
  liabilities breakdown. It is `netWorth - sections.cpf` from the current
  sheet, follows the primary currency toggle, and never changes the headline,
  the history series default or the drawdown.
- Say that history starts when the series starts and cannot be backfilled.
- View preferences live in the header `View` popover: density, primary
  currency, privacy, section visibility, columns (Source/Native), sticky header
  and sticky name column. The column toggles use the same store.
- The header has a one-click `Hide values` / `Show values` toggle. It and the
  `Privacy` group in the View popover use the same `hideValues` preference.
- Privacy mode is a view preference, not a security boundary: `hideValues`
  masks every monetary and numeric value in the hero, table and history card
  with one fixed `••••` token. Holding names, symbols, currency codes, venues,
  providers and valuation states stay visible. The history chart, peak note and
  hero delta lines are not rendered; the card keeps a same-height placeholder.
  Mask at render time, never with CSS blur. Forms and Excel export stay
  complete: editing and exporting are explicit actions. `Reset` keeps the
  privacy setting.
- Preferences are per device: `localStorage` is the source of truth, mirrored to
  a small cookie so SSR renders the same first paint. Never move them to
  `app_settings`; there is one Basic-auth identity and no user accounts.
- Section visibility only filters table rows. The headline and table totals
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
- The Mac mini pulls a verified off-host copy twice daily with `deploy/backup-pull.sh`.
- The `offsite` service copies `backups/` to Cloudflare R2 daily with restic and
  reports every run to Home Assistant. It is the third copy and the only
  off-site one. It reads the snapshots, never the live database; see
  `deploy/RUNBOOK.md`.

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
- `npm run audit:prod` blocks on unique high/critical **advisories**, not on
  every package that inherits one. Exceptions live in
  `scripts/audit-gate-lib.mjs`, keyed by GHSA with a reason and a review date;
  the weekly run re-checks them. Current exceptions: `xlsx` (write-only export
  of self-authored data) and `picomatch` (build/router glob matching, no
  user-supplied patterns, not in the built server or client bundle, no patched
  version). Moderate/low findings are reported and left to Dependabot.
- Dependabot opens grouped minor/patch PRs weekly; major upgrades
  (`@tanstack/vue-table`, `vitest`, `better-sqlite3`) are separate, deliberate
  changes.
- The security workflow runs the production audit on PRs, `main` pushes and
  weekly. It does not replace the deploy workflow's tests.
- Pull requests run unit tests, typecheck and the Playwright suite in
  `.github/workflows/ci.yml`; `main` is still covered by the deploy workflow.
  The e2e suite builds first, then serves the built app on `./data/e2e.db` with
  a throwaway password and no `vesto-go`. Use the built server, not `nuxt dev`:
  dev does not hydrate an empty sheet cleanly, so the Add menu never opens.
