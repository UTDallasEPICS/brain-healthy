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

export function getHouse(userId: string) {
  const house = db
    .select({ id: houses.id, name: houses.name, baseAssetKey: houses.baseAssetKey })
    .from(houses)
    .where(eq(houses.userId, userId))
    .get()
  if (!house) throw createError({ statusCode: 404, statusMessage: 'House not found' })
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
    .all()
  return { ...house, coins: getCoinBalance(userId), decorations: placed }
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

      if (!item.repeatable) {
        const owned = tx
          .select({ id: userItems.id })
          .from(userItems)
          .where(and(eq(userItems.userId, userId), eq(userItems.itemId, decorationId)))
          .get()
        if (owned) throw createError({ statusCode: 409, statusMessage: 'Decoration already owned' })
      }

      const [house] = tx
        .select({ id: houses.id })
        .from(houses)
        .where(eq(houses.userId, userId))
        .all()
      if (!house) throw createError({ statusCode: 404, statusMessage: 'House not found' })

      spendCoins(
        userId,
        item.priceCoins,
        `decoration:${userId}:${decorationId}:${crypto.randomUUID()}`,
        tx
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
      const [house] = tx
        .select({ id: houses.id })
        .from(houses)
        .where(eq(houses.userId, userId))
        .all()
      if (!house) throw createError({ statusCode: 404, statusMessage: 'House not found' })
      const owned = tx
        .select({ id: userItems.id })
        .from(userItems)
        .where(and(eq(userItems.id, decorationId), eq(userItems.userId, userId)))
        .get()
      if (!owned)
        throw createError({ statusCode: 404, statusMessage: 'Owned decoration not found' })
      tx.update(userItems)
        .set({ placedHouseId: equipped ? house.id : null, ...placement })
        .where(and(eq(userItems.id, decorationId), eq(userItems.userId, userId)))
        .run()
      return { id: decorationId, equipped }
    },
    { behavior: 'immediate' }
  )
}
