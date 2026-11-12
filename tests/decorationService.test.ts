// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { coinTransactions } from '../server/db/schema/economy'
import { decorItems, houses, userItems } from '../server/db/schema/house'
import { user } from '../server/db/schema/auth'
import { db } from '../server/utils/db'
import {
  getDecorations,
  getUserInventory,
  purchaseDecoration,
  updateEquippedDecoration,
} from '../server/utils/decorationService'

vi.mock('../server/utils/db', async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { readFileSync } = await import('node:fs')
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  for (const migrationFile of [
    'drizzle/0000_classy_bloodstorm.sql',
    'drizzle/0001_eager_dracula.sql',
    'drizzle/0002_quick_psylocke.sql',
    'drizzle/0003_calm_house_decorations.sql',
  ]) {
    const migration = readFileSync(`${process.cwd()}/${migrationFile}`, 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.exec(statement)
    }
  }
  return { db: drizzle(sqlite) }
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

  it('rejects insufficient balances and duplicate non-repeatable purchases', () => {
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
    expect(() => purchaseDecoration('user-1', 'plant')).toThrow('Decoration already owned')
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
    expect(() => updateEquippedDecoration('someone-else', 'owned-plant', true)).toThrow(
      'House not found'
    )
  })
})
