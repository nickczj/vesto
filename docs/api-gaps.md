# vesto-go API Gaps (v2 Frontend Perspective)

## Confirmed Current Scope
OpenAPI contract currently exposes:
- Quote endpoints (`/v1/quotes/latest`, `/v1/quotes/latest/batch`)
- FX endpoints (`/api/market/fx`, `/api/market/fx/batch`)

## Gaps for Full Portfolio Ownership
`vesto-go` does not currently expose portfolio record CRUD for:
- holdings/assets
- CPF account balances
- liabilities/loans

## v2 Mitigation
- Store portfolio records in Nuxt-owned SQLite (`asset_entries`, `liability_entries`).
- Keep integration boundary narrow:
  - call `vesto-go` only for market valuation inputs (quotes, FX)
- Keep migration-compatible fields (`externalId`) to support future backend ownership transfer.

## Path Prefix Inconsistency
`vesto-go` currently mixes endpoint prefixes:
- quotes: `/v1/...`
- FX: `/api/...`

v2 client normalizes this internally in a single service module to avoid leaking path inconsistencies into UI code.

## Forward-Compatible Backend Changes (Optional)
If `vesto-go` later becomes source-of-truth for portfolio records, preferred additions are:
- `/v1/assets` CRUD
- `/v1/liabilities` CRUD
- `/v1/balance-sheet` computed endpoint
- shared auth/user identity model
