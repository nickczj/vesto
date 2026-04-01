import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

export function parseBodyWithSchema<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  return readBody(event).then((body) => {
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      const message = parsed.error.issues.map(issue => issue.message).join('; ')
      throw createError({ statusCode: 400, message })
    }

    return parsed.data
  })
}

export function parseRouteId(event: H3Event, paramName = 'id'): number {
  const raw = getRouterParam(event, paramName)
  const id = Number(raw)

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: `${paramName} must be a positive integer` })
  }

  return id
}
