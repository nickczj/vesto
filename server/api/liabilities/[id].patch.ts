import { liabilityCreateSchema, liabilityPatchSchema } from '~~/shared/validation/schemas'
import { getLiabilityById, updateLiability } from '~~/server/services/repository'
import { parseBodyWithSchema, parseRouteId } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  const id = parseRouteId(event)
  const existing = getLiabilityById(id)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'liability not found' })
  }

  const patch = await parseBodyWithSchema(event, liabilityPatchSchema)
  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, message: 'patch payload must include at least one field' })
  }

  const merged = liabilityCreateSchema.parse({
    ...existing,
    ...patch,
  })

  return updateLiability(id, merged)
})
