import { assetCreateSchema, assetPatchSchema } from '~~/shared/validation/schemas'
import { getAssetById, updateAsset } from '~~/server/services/repository'
import { parseBodyWithSchema, parseRouteId } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  const id = parseRouteId(event)
  const existing = getAssetById(id)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'asset not found' })
  }

  const patch = await parseBodyWithSchema(event, assetPatchSchema)
  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, message: 'patch payload must include at least one field' })
  }

  const merged = assetCreateSchema.parse({
    ...existing,
    ...patch,
  })

  return updateAsset(id, merged)
})
