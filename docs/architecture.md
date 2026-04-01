# Vesto v2 Architecture

## High-Level
- Frontend: Nuxt 4 + Nuxt UI.
- Backend-for-frontend: Nitro server routes within the same Nuxt app.
- Persistence: local SQLite through `better-sqlite3` + `drizzle-orm` schema.
- Market and FX data: read from `vesto-go`.

## Subsystems
- `server/database/*`: schema and connection management.
- `server/services/*`:
  - valuation, FX conversion, subtotal/net-worth aggregation
  - legacy migration import logic
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
- If quote fetch fails for a row:
  - use manual unit price when available
  - otherwise use book/native amount
  - annotate warning in response
- If FX fetch fails:
  - reuse recent in-memory FX snapshot if present
  - otherwise fall back to identity rate with warning

## Refresh Modes
- `never`: use cached snapshots only; do not call external APIs.
- `stale`: refresh only when snapshot cache is missing/expired.
- `always`: force external fetch attempts for current symbols + FX.
