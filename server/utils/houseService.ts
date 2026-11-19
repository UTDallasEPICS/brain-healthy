import { eq } from 'drizzle-orm'
import { houses } from '../db/schema'
import { db } from './db'
import { getPlacedDecorations } from './decorationService'

/**
 * Returns the decorations currently placed in the user's house, using the same
 * query as the owner's own house view. Items sitting in the inventory
 * (placed_house_id is null) are not included.
 */
export function getHouseDecorations(userId: string, houseId: string) {
  return getPlacedDecorations(userId, houseId)
}

/**
 * The publicly viewable version of a user's house: what another student sees.
 * Leaves out private details such as coins, what the owner paid for each item
 * and when the house was created. Never creates a house for another user.
 */
export function getPublicHouse(userId: string) {
  const house = db.select().from(houses).where(eq(houses.userId, userId)).get()
  if (!house) {
    throw createError({ statusCode: 404, statusMessage: 'House not found' })
  }

  return {
    id: house.id,
    ownerId: house.userId,
    name: house.name,
    baseAssetKey: house.baseAssetKey,
    decorations: getHouseDecorations(userId, house.id),
  }
}
