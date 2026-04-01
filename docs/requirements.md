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
- One-off migration path from legacy `vesto` SQLite data.

## API Requirements
- Nuxt APIs:
  - `GET /api/balance-sheet?refresh=never|stale|always`
  - `GET/POST/PATCH/DELETE /api/assets`
  - `GET/POST/PATCH/DELETE /api/liabilities`
  - `POST /api/migrations/vesto-v1/import`
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
- Partial upstream failures must degrade gracefully (manual/book fallback).
- Snapshot-only v1; no historical performance analytics.
- Desktop-first responsive UI.
