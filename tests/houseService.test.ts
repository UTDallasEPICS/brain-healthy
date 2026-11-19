// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { decorItems, houses, userItems } from '../server/db/schema/house'
import { user } from '../server/db/schema/auth'
import { db } from '../server/utils/db'
import { getHouseDecorations, getPublicHouse } from '../server/utils/houseService'

vi.stubGlobal('createError', createError)

// Run the real migrations so the schema matches production.
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

describe('houseService', () => {
  beforeEach(() => {
    db.delete(userItems).run()
    db.delete(decorItems).run()
    db.delete(houses).run()
    db.delete(user).run()
    db.insert(user)
      .values([
        { id: 'user-1', name: 'User One', email: 'one@utdallas.edu' },
        { id: 'user-2', name: 'User Two', email: 'two@utdallas.edu' },
      ])
      .run()
    db.insert(houses)
      .values({ id: 'house-1', userId: 'user-1', name: 'My House', baseAssetKey: 'house/base' })
      .run()
    db.insert(decorItems)
      .values([
        { id: 'lamp', name: 'Lamp', category: 'furniture', priceCoins: 10, assetKey: 'lamp' },
        { id: 'plant', name: 'Plant', category: 'nature', priceCoins: 5, assetKey: 'plant' },
      ])
      .run()
    db.insert(userItems)
      .values([
        {
          id: 'owned-lamp',
          userId: 'user-1',
          itemId: 'lamp',
          purchasePriceCoins: 10,
          placedHouseId: 'house-1',
          positionX: 1,
          positionY: 2,
          rotation: 90,
        },
        // Still in inventory: must not show up.
        { id: 'owned-plant', userId: 'user-1', itemId: 'plant', purchasePriceCoins: 5 },
      ])
      .run()
  })

  it('returns only decorations placed in the house, not inventory items', () => {
    expect(getHouseDecorations('user-1', 'house-1')).toEqual([
      {
        id: 'owned-lamp',
        decorationId: 'lamp',
        name: 'Lamp',
        assetKey: 'lamp',
        positionX: 1,
        positionY: 2,
        rotation: 90,
      },
    ])
  })

  it('shows only placed decorations in the public view', () => {
    const publicHouse = getPublicHouse('user-1')

    expect(publicHouse.decorations.map((d) => d.id)).toEqual(['owned-lamp'])
  })

  it('hides private fields in the public view', () => {
    const publicHouse = getPublicHouse('user-1')

    expect(Object.keys(publicHouse).sort()).toEqual(
      ['baseAssetKey', 'decorations', 'id', 'name', 'ownerId'].sort()
    )
    expect(publicHouse).toMatchObject({
      id: 'house-1',
      ownerId: 'user-1',
      name: 'My House',
      baseAssetKey: 'house/base',
    })
    expect(publicHouse).not.toHaveProperty('coins')
    expect(publicHouse).not.toHaveProperty('createdAt')
    for (const decoration of publicHouse.decorations) {
      expect(decoration).not.toHaveProperty('priceCoins')
      expect(decoration).not.toHaveProperty('purchasePriceCoins')
    }
  })

  it('throws 404 for a user with no house and does not create one', () => {
    expect(() => getPublicHouse('user-2')).toThrow('House not found')
    expect(db.select().from(houses).all()).toHaveLength(1)
  })
})
