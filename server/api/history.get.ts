import { historyDaysSchema } from '~~/shared/validation/schemas'
import { readValuationHistory } from '~~/server/services/history'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const parsed = historyDaysSchema.safeParse(query.days)
  return readValuationHistory(parsed.success ? parsed.data : 365)
})
