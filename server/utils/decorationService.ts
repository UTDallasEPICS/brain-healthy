import { and, asc, eq } from 'drizzle-orm'
import { decorItems, houses, userItems } from '../db/schema/house'
import { db } from './db'
import { getCoinBalance, spendCoins } from './coinService'

export function getDecorations() {
  return db
    .select({
      id: decorItems.id,
      name: decorItems.name,
      description: decorItems.description,
      priceCoins: decorItems.priceCoins,
      assetKey: decorItems.assetKey,
    })
    .from(decorItems)
    .where(eq(decorItems.active, true))
    .orderBy(asc(decorItems.name))
    .all()
}

export function getShop(userId: string) {
  return { coins: getCoinBalance(userId), decorations: getDecorations() }
}

type HouseWriter = Pick<typeof db, 'insert' | 'select'>

export const DEFAULT_HOUSE_NAME = 'My cozy home'
export const DEFAULT_HOUSE_ASSET_KEY = 'decor/cozy-room'

/**
 * Returns the user's house, creating it on first use. The unique user_id column
 * makes concurrent calls safe: the loser's insert is ignored and re-selects.
 */
export function ensureHouse(userId: string, writer: HouseWriter = db) {
  const find = () =>
    writer
      .select({ id: houses.id, name: houses.name, baseAssetKey: houses.baseAssetKey })
      .from(houses)
      .where(eq(houses.userId, userId))
      .get()
  const existing = find()
  if (existing) return existing
  writer
    .insert(houses)
    .values({ userId, name: DEFAULT_HOUSE_NAME, baseAssetKey: DEFAULT_HOUSE_ASSET_KEY })
    .onConflictDoNothing({ target: houses.userId })
    .run()
  return find()!
}

export function getHouse(userId: string) {
  const house = ensureHouse(userId)
  const placed = db
    .select({
      id: userItems.id,
      decorationId: decorItems.id,
      name: decorItems.name,
      assetKey: decorItems.assetKey,
      positionX: userItems.positionX,
      positionY: userItems.positionY,
      rotation: userItems.rotation,
    })
    .from(userItems)
    .innerJoin(decorItems, eq(userItems.itemId, decorItems.id))
    .where(and(eq(userItems.userId, userId), eq(userItems.placedHouseId, house.id)))
    .orderBy(asc(userItems.acquiredAt), asc(userItems.id))
    .all()
  // Placed items must have a stored position. A render-time fallback based on list
  // order shifts every other item whenever one is put away.
  placed.forEach((item, index) => {
    if (item.positionX === null || item.positionY === null) {
      item.positionX = item.positionX ?? defaultSpot(index).x
      item.positionY = item.positionY ?? defaultSpot(index).y
      db.update(userItems)
        .set({ positionX: item.positionX, positionY: item.positionY })
        .where(eq(userItems.id, item.id))
        .run()
    }
  })
  return { ...house, coins: getCoinBalance(userId), decorations: placed }
}

function defaultSpot(index: number) {
  return { x: 20 + ((index * 17) % 60), y: 68 + (Math.floor((index * 17) / 60) % 3) * 8 }
}

export function purchaseDecoration(userId: string, decorationId: string) {
  return db.transaction(
    (tx) => {
      const item = tx
        .select()
        .from(decorItems)
        .where(and(eq(decorItems.id, decorationId), eq(decorItems.active, true)))
        .get()
      if (!item) throw createError({ statusCode: 404, statusMessage: 'Decoration not found' })

      ensureHouse(userId, tx)

      spendCoins(
        userId,
        item.priceCoins,
        `Purchased ${item.name}`,
        `decoration:${userId}:${decorationId}:${crypto.randomUUID()}`,
        { writer: tx }
      )
      const [ownedItem] = tx
        .insert(userItems)
        .values({
          userId,
          itemId: decorationId,
          purchasePriceCoins: item.priceCoins,
        })
        .returning()
        .all()
      return ownedItem
    },
    { behavior: 'immediate' }
  )
}

export function getUserInventory(userId: string) {
  return db
    .select({
      id: userItems.id,
      decorationId: decorItems.id,
      name: decorItems.name,
      assetKey: decorItems.assetKey,
      description: decorItems.description,
      priceCoins: decorItems.priceCoins,
      purchasePriceCoins: userItems.purchasePriceCoins,
      equipped: userItems.placedHouseId,
      acquiredAt: userItems.acquiredAt,
    })
    .from(userItems)
    .innerJoin(decorItems, eq(userItems.itemId, decorItems.id))
    .where(eq(userItems.userId, userId))
    .all()
    .map(({ equipped, ...item }) => ({ ...item, equipped: equipped !== null }))
}

export function updateEquippedDecoration(
  userId: string,
  decorationId: string,
  equipped: boolean,
  placement?: { positionX?: number; positionY?: number; rotation?: number }
) {
  return db.transaction(
    (tx) => {
      const house = ensureHouse(userId, tx)
      const owned = tx
        .select({ id: userItems.id })
        .from(userItems)
        .where(and(eq(userItems.id, decorationId), eq(userItems.userId, userId)))
        .get()
      if (!owned)
        throw createError({ statusCode: 404, statusMessage: 'Owned decoration not found' })
      const slots = tx
        .select({ id: userItems.id })
        .from(userItems)
        .where(and(eq(userItems.userId, userId), eq(userItems.placedHouseId, house.id)))
        .all().length
      const spot = defaultSpot(slots)
      const current = tx
        .select({ x: userItems.positionX, y: userItems.positionY })
        .from(userItems)
        .where(eq(userItems.id, decorationId))
        .get()
      const fill =
        equipped && (current?.x == null || current?.y == null)
          ? { positionX: spot.x, positionY: spot.y }
          : {}
      tx.update(userItems)
        .set({ placedHouseId: equipped ? house.id : null, ...fill, ...placement })
        .where(and(eq(userItems.id, decorationId), eq(userItems.userId, userId)))
        .run()
      return { id: decorationId, equipped }
    },
    { behavior: 'immediate' }
  )
}
