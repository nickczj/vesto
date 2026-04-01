import { z } from 'zod'
import { importFromLegacyVesto } from '~~/server/services/migration'
import { parseBodyWithSchema } from '~~/server/utils/http'

const importRequestSchema = z.object({
  sourcePath: z.string().trim().min(1).optional(),
}).default({})

export default defineEventHandler(async (event) => {
  const payload = await parseBodyWithSchema(event, importRequestSchema)
  return importFromLegacyVesto(payload.sourcePath)
})
