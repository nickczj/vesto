# Vesto v2 Architecture

## High-Level
- Frontend: Nuxt 4 + Nuxt UI.
- Backend-for-frontend: Nitro server routes within the same Nuxt app.
- Persistence: local SQLite through `better-sqlite3` + `drizzle-orm`. The schema
  and generated migrations live in `server/database/` and are applied at startup.
- Market and FX data: read from `vesto-go`.

## Subsystems
- `server/database/*`: schema and connection management.
- `server/services/*`:
  - `valuation.ts`: FX conversion, row valuation, subtotal/net-worth aggregation
  - `balance-sheet.ts`: the single valuation path used by the page and the snapshot
  - `history.ts` / `history-repository.ts`: daily series and read-time drawdown
  - `snapshot-cache.ts`: quote/FX persistence across restarts
- `server/utils/vesto-go.ts`: external HTTP client with timeout/retry.
- `server/api/*`: REST endpoints with `zod` validation.
- `app/components/*`: table + modal CRUD UI.
- `app/composables/useBalanceSheet.ts`: page state, polling, refresh controls.

## Data Flow
1. User creates/updates assets or liabilities.
2. Nuxt API validates request and writes SQLite rows.
3. Balance sheet endpoint reads rows.
4. For investment rows, endpoint fetches quote snapshots (batch).
5. Endpoint fetches canonical `USD->SGD` FX snapshot and derives inverse.
6. Service computes row-level native/USD/SGD values.
7. Service computes section totals, total assets, total liabilities, and net worth.
8. UI renders grouped table and totals.

## Error/Fallback Strategy
- If a quote fetch fails for a row:
  - use the manual price when the holding has one
  - otherwise mark the row `unpriced`; it contributes nothing to totals and is
    counted in `quoteSummary.unpriced`
  - never substitute `asset.amount` for an investment, and never report P&L as
    0.00 when the price did not come from a market quote
- A quote in a currency that is not the row's fixed currency is ignored with a
  warning; the row falls back rather than being relabelled
- If FX is unavailable:
  - reuse the persisted snapshot, marked stale
  - if none has ever been stored, render native amounts only with an "FX
    unavailable" banner. There is no 1:1 fallback and no partial total.

## Refresh Modes
- `never`: use cached snapshots only; do not call external APIs.
- `stale`: refresh only when snapshot cache is missing/expired.
- `always`: ask `vesto-go` for a refresh. It is a request, not a command;
  `vesto-go` may still answer from its cache. The page and the snapshot sidecar
  use it to mean "accept a network attempt".

The valuation snapshot sidecar calls the same `buildBalanceSheet('always')`
path; valuation logic never lives in the script or in SQL.
