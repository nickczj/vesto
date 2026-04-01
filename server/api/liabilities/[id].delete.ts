import { deleteLiability, getLiabilityById } from '~~/server/services/repository'
import { parseRouteId } from '~~/server/utils/http'

export default defineEventHandler((event) => {
  const id = parseRouteId(event)
  const existing = getLiabilityById(id)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'liability not found' })
  }

  deleteLiability(id)

  return {
    ok: true,
    id,
  }
})
