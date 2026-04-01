import { deleteAsset, getAssetById } from '~~/server/services/repository'
import { parseRouteId } from '~~/server/utils/http'

export default defineEventHandler((event) => {
  const id = parseRouteId(event)
  const existing = getAssetById(id)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'asset not found' })
  }

  deleteAsset(id)

  return {
    ok: true,
    id,
  }
})
