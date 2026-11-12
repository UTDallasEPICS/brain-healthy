import { requireUser } from '~~/server/utils/session'
import { getHouseDecorations, getUserHouse } from '~~/server/utils/houseService'

// GET /api/house — the signed-in user's own house plus its placed decorations.
export default defineEventHandler((event) => {
  const user = requireUser(event)

  const house = getUserHouse(user.id)
  if (!house) {
    throw createError({ statusCode: 404, statusMessage: 'House not found' })
  }

  return {
    id: house.id,
    ownerId: house.userId,
    name: house.name,
    baseAssetKey: house.baseAssetKey,
    createdAt: house.createdAt,
    decorations: getHouseDecorations(user.id),
  }
})
