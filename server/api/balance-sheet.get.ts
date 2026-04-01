import { refreshModeSchema } from '~~/shared/validation/schemas'
import { buildBalanceSheet } from '~~/server/services/balance-sheet'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requested = typeof query.refresh === 'string' ? query.refresh : 'stale'
  const parsed = refreshModeSchema.safeParse(requested)

  const mode = parsed.success ? parsed.data : 'stale'
  return await buildBalanceSheet(mode)
})
