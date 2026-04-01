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
5. Snapshot-only v1 (no historical analytics in this repo).

## Data Ownership
- Nuxt SQLite tables:
  - `asset_entries`
  - `liability_entries`
  - `app_settings`
- External backend (`vesto-go`) provides:
  - `POST /v1/quotes/latest/batch`
  - `GET /api/market/fx?base=USD&quote=SGD`

## Asset/Liability Model
- Asset kinds: `investment`, `cpf`, `cash_savings`, `manual`
- CPF buckets: `OA`, `SA`, `MA`, `RA`
- Liability types: `loan`, `credit_card`, `other`
- Investment valuation modes:
  - `live_preferred`: use live quote, fallback to manual unit price
  - `manual_only`: always use manual unit price

## FX Valuation Contract
- Canonical FX fetch is `USD->SGD`.
- Derive `SGD->USD` by inversion `1 / usdToSgd`.
- Every row carries native amount and converted USD/SGD amounts.

## API Contract (Nuxt)
- `GET /api/balance-sheet?refresh=never|stale|always`
- `GET/POST/PATCH/DELETE /api/assets`
- `GET/POST/PATCH/DELETE /api/liabilities`
- `POST /api/migrations/vesto-v1/import`

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

## Migration Contract
- One-off importer reads legacy `vesto` SQLite data (`holdings`, `cpf_accounts`, `savings_accounts`, `loans`).
- Idempotency key pattern is `vesto-v1:<entity>:<id>`.

## Engineering Notes
- Keep server-side valuation deterministic and testable.
- Treat partial quote failures as non-fatal; fallback to manual/book values and emit warnings.
- Preserve strict validation with `zod` at API boundaries.
