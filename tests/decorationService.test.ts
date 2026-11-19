// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { coinTransactions } from '../server/db/schema/economy'
import { decorItems, houses, userItems } from '../server/db/schema/house'
import { user } from '../server/db/schema/auth'
import { db } from '../server/utils/db'
import {
  ensureHouse,
  getDecorations,
  getHouse,
  getUserInventory,
  purchaseDecoration,
  updateEquippedDecoration,
} from '../server/utils/decorationService'

vi.mock('../server/utils/db', async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: 'drizzle' })
  return { db }
})

describe('decorationService', () => {
  beforeEach(() => {
    db.delete(userItems).run()
    db.delete(coinTransactions).run()
    db.delete(houses).run()
    db.delete(decorItems).run()
    db.delete(user).run()
    db.insert(user).values({ id: 'user-1', name: 'Test User', email: 'user@example.com' }).run()
    db.insert(houses)
      .values({ id: 'house-1', userId: 'user-1', name: 'My House', baseAssetKey: 'house/base' })
      .run()
    db.insert(decorItems)
      .values([
        {
          id: 'plant',
          name: 'Plant',
          description: 'Green and leafy',
          category: 'plant',
          priceCoins: 10,
          assetKey: 'plant',
        },
        {
          id: 'lamp',
          name: 'Lamp',
          description: 'A warm light',
          category: 'lighting',
          priceCoins: 20,
          assetKey: 'lamp',
          repeatable: true,
        },
      ])
      .run()
  })

  it('lists active decorations with descriptions and prices', () => {
    expect(getDecorations()).toEqual([
      { id: 'lamp', name: 'Lamp', description: 'A warm light', priceCoins: 20, assetKey: 'lamp' },
      {
        id: 'plant',
        name: 'Plant',
        description: 'Green and leafy',
        priceCoins: 10,
        assetKey: 'plant',
      },
    ])
  })

  it('purchases atomically, deducting coins and adding inventory', () => {
    db.insert(coinTransactions)
      .values({
        userId: 'user-1',
        amount: 30,
        transactionType: 'activity_reward',
        sourceKey: 'earned',
      })
      .run()
    expect(purchaseDecoration('user-1', 'plant')?.itemId).toBe('plant')
    expect(
      db
        .select({ amount: coinTransactions.amount })
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, 'user-1'))
        .all()
        .reduce((sum, row) => sum + row.amount, 0)
    ).toBe(20)
    expect(getUserInventory('user-1')).toMatchObject([
      { decorationId: 'plant', purchasePriceCoins: 10, equipped: false },
    ])
  })

  it('rejects insufficient balances and allows buying the same item again', () => {
    expect(() => purchaseDecoration('user-1', 'plant')).toThrow('Insufficient coins')
    expect(db.select().from(userItems).all()).toHaveLength(0)
    db.insert(coinTransactions)
      .values({
        userId: 'user-1',
        amount: 50,
        transactionType: 'activity_reward',
        sourceKey: 'earned',
      })
      .run()
    purchaseDecoration('user-1', 'plant')
    purchaseDecoration('user-1', 'plant')
    expect(db.select().from(userItems).all()).toHaveLength(2)
  })

  it('equips and unequips an owned copy and rejects another user’s copy', () => {
    db.insert(userItems)
      .values({ id: 'owned-plant', userId: 'user-1', itemId: 'plant', purchasePriceCoins: 10 })
      .run()
    expect(updateEquippedDecoration('user-1', 'owned-plant', true)).toEqual({
      id: 'owned-plant',
      equipped: true,
    })
    expect(getUserInventory('user-1')[0]?.equipped).toBe(true)
    updateEquippedDecoration('user-1', 'owned-plant', false)
    expect(getUserInventory('user-1')[0]?.equipped).toBe(false)
    db.insert(user).values({ id: 'user-2', name: 'Other', email: 'other@example.com' }).run()
    expect(() => updateEquippedDecoration('user-2', 'owned-plant', true)).toThrow(
      'Owned decoration not found'
    )
  })

  it('creates a house automatically for a user who has none', () => {
    db.insert(user).values({ id: 'user-2', name: 'New', email: 'new@example.com' }).run()
    expect(db.select().from(houses).where(eq(houses.userId, 'user-2')).all()).toHaveLength(0)
    expect(getHouse('user-2')).toMatchObject({
      name: 'My cozy home',
      baseAssetKey: 'decor/cozy-room',
      decorations: [],
    })
    const first = ensureHouse('user-2')
    expect(ensureHouse('user-2').id).toBe(first.id)
    expect(db.select().from(houses).where(eq(houses.userId, 'user-2')).all()).toHaveLength(1)
  })

  it('creates a house when purchasing or equipping for a user with none', () => {
    db.insert(user).values({ id: 'user-3', name: 'Buyer', email: 'buyer@example.com' }).run()
    db.insert(coinTransactions)
      .values({ userId: 'user-3', amount: 10, transactionType: 'activity_reward', sourceKey: 'e' })
      .run()
    const owned = purchaseDecoration('user-3', 'plant')!
    expect(db.select().from(houses).where(eq(houses.userId, 'user-3')).all()).toHaveLength(1)
    db.delete(houses).where(eq(houses.userId, 'user-3')).run()
    expect(updateEquippedDecoration('user-3', owned.id, true).equipped).toBe(true)
    expect(db.select().from(houses).where(eq(houses.userId, 'user-3')).all()).toHaveLength(1)
  })
})
