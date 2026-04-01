import { liabilityCreateSchema } from '~~/shared/validation/schemas'
import { createLiability } from '~~/server/services/repository'
import { parseBodyWithSchema } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  const input = await parseBodyWithSchema(event, liabilityCreateSchema)
  return createLiability(input)
})
