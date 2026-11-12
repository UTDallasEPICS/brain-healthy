import { requireUser } from '~~/server/utils/session'
import { getPublicHouse } from '~~/server/utils/houseService'

// GET /api/house/:userId — another student's house, public fields only.
export default defineEventHandler((event) => {
  requireUser(event)

  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  return getPublicHouse(userId)
})
