import { listAssets } from '~~/server/services/repository'

export default defineEventHandler(() => {
  return {
    items: listAssets(),
  }
})
