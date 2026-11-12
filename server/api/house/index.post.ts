import { requireUser } from '~~/server/utils/session'
import { createHouse } from '~~/server/utils/houseService'

// POST /api/house — create the signed-in user's house with the default
// configuration. Returns 409 if they already have one.
export default defineEventHandler((event) => {
  const user = requireUser(event)

  const house = createHouse(user.id)
  setResponseStatus(event, 201)

  return {
    id: house.id,
    ownerId: house.userId,
    name: house.name,
    baseAssetKey: house.baseAssetKey,
    createdAt: house.createdAt,
    decorations: [],
  }
})
