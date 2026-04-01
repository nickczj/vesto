import { assetCreateSchema } from '~~/shared/validation/schemas'
import { createAsset } from '~~/server/services/repository'
import { parseBodyWithSchema } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  const input = await parseBodyWithSchema(event, assetCreateSchema)
  return createAsset(input)
})
