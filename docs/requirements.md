# Vesto v2 Requirements

## Goal
Build a single-user personal finance application that presents a full balance sheet in one concise table and computes net worth in both USD and SGD.

## Functional Requirements
- Track assets and liabilities with CRUD workflows.
- Assets must support:
  - `investment`
  - `cpf` (`OA`, `SA`, `MA`, `RA`)
  - `cash_savings`
  - `manual`
- Liabilities must support:
  - `loan`
  - `credit_card`
  - `other`
- Investments must support valuation modes:
  - `live_preferred`
  - `manual_only`
- Dual-currency display is mandatory:
  - native amount
  - USD amount
  - SGD amount
- Auto-refresh every 45 seconds while page is visible.
- Manual refresh button.
- One valuation row per SGT day at 08:00, captured by a sidecar through
  `POST /api/snapshots`; a trend chart and read-time drawdown over complete days.
  No backfill, and no intraday series.
- Legacy v1 data was already imported; the endpoint was removed in Phase 2.

## API Requirements
- Nuxt APIs:
  - `GET /api/balance-sheet?refresh=never|stale|always`
  - `GET/POST/PATCH/DELETE /api/assets`
  - `GET/POST/PATCH/DELETE /api/liabilities`
- Legacy v1 import was a one-off and its endpoint was removed in Phase 2.
- External API dependencies (`vesto-go`):
  - `POST /v1/quotes/latest/batch`
  - `GET /api/market/fx?base=USD&quote=SGD`

## Validation Requirements
- Currency enum restricted to `USD`, `SGD`.
- Investment create/update requires `symbol`, `quantity`, and `valuationMode`.
- CPF requires `cpfBucket`.
- Liability requires positive `outstandingAmount`.
- Monetary values are non-negative at input boundaries.

## Non-Functional Requirements
- Deterministic server-side valuation logic.
- Partial upstream failures must degrade gracefully: fall back to a manual price
  when one exists, otherwise mark the row `unpriced`. Never zero, never 1:1 FX.
- The daily series is captured forward only. There is no intraday history, no
  backfill and no benchmark comparison.
- Desktop-first responsive UI.
