import { listLiabilities } from '~~/server/services/repository'

export default defineEventHandler(() => {
  return {
    items: listLiabilities(),
  }
})
