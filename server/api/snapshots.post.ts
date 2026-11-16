import { captureValuationSnapshot } from '~~/server/services/history'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const force = query.force === 'always'
  const result = await captureValuationSnapshot({ force })

  if (result.status === 'fx_unavailable') {
    throw createError({
      statusCode: 503,
      statusMessage: 'FX unavailable',
      message: 'No USD/SGD rate is available; the snapshot was not written.',
    })
  }

  if (result.status === 'created') {
    setResponseStatus(event, 201)
  }

  return result
})
