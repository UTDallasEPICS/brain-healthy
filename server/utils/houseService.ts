import { eq } from 'drizzle-orm'
import { decorItems, houses, user, userItems } from '../db/schema'
import { db } from './db'

/**
 * What every new house starts with. Decorations are added later through the
 * shop/inventory issue, so a fresh house has no placed items.
 */
export const DEFAULT_HOUSE_CONFIG = {
  name: 'My House',
  baseAssetKey: 'house_basic',
} as const

/** A decoration currently placed in a house. */
export type HouseDecoration = {
  userItemId: string
  itemId: string
  name: string
  category: string
  assetKey: string
  positionX: number | null
  positionY: number | null
  rotation: number | null
}

/**
 * Creates the default house for a user.
 *
 * The unique index on houses.user_id is the real "one house per user" guard.
 * onConflictDoNothing turns a second attempt (even two requests racing each
 * other) into "no row inserted", which we report as 409 Conflict.
 */
export function createHouse(userId: string) {
  const owner = db.select({ id: user.id }).from(user).where(eq(user.id, userId)).get()
  if (!owner) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const created = db
    .insert(houses)
    .values({ userId, ...DEFAULT_HOUSE_CONFIG })
    .onConflictDoNothing({ target: houses.userId })
    .returning()
    .get()

  if (!created) {
    throw createError({ statusCode: 409, statusMessage: 'User already has a house' })
  }

  return created
}

/** Returns the user's house row, or undefined if they don't have one yet. */
export function getUserHouse(userId: string) {
  return db.select().from(houses).where(eq(houses.userId, userId)).get()
}

/**
 * Returns the decorations currently placed in the user's house. Items sitting
 * in the inventory (placed_house_id is null) are not included. Returns an
 * empty list if the user has no house.
 */
export function getHouseDecorations(userId: string): HouseDecoration[] {
  return db
    .select({
      userItemId: userItems.id,
      itemId: decorItems.id,
      name: decorItems.name,
      category: decorItems.category,
      assetKey: decorItems.assetKey,
      positionX: userItems.positionX,
      positionY: userItems.positionY,
      rotation: userItems.rotation,
    })
    .from(houses)
    .innerJoin(userItems, eq(userItems.placedHouseId, houses.id))
    .innerJoin(decorItems, eq(decorItems.id, userItems.itemId))
    .where(eq(houses.userId, userId))
    .all()
}

/**
 * The publicly viewable version of a user's house: what another student sees.
 * Leaves out private details such as what the owner paid for each item and
 * when the house was created.
 */
export function getPublicHouse(userId: string) {
  const house = getUserHouse(userId)
  if (!house) {
    throw createError({ statusCode: 404, statusMessage: 'House not found' })
  }

  return {
    id: house.id,
    ownerId: house.userId,
    name: house.name,
    baseAssetKey: house.baseAssetKey,
    decorations: getHouseDecorations(userId),
  }
}
