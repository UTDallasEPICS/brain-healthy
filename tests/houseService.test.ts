import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decorItems, houses, user, userItems } from '../server/db/schema'
import { db } from '../server/utils/db'
import {
  DEFAULT_HOUSE_CONFIG,
  createHouse,
  getHouseDecorations,
  getPublicHouse,
  getUserHouse,
} from '../server/utils/houseService'

// Same in-memory SQLite setup as rewardService.test.ts: run the real
// migrations so the unique constraint on houses.user_id is the one in prod.
vi.mock('../server/utils/db', async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { readFileSync } = await import('node:fs')
  const schema = await import('../server/db/schema')
  const sqlite = new Database(':memory:')

  sqlite.pragma('foreign_keys = ON')
  for (const migrationFile of [
    'drizzle/0000_classy_bloodstorm.sql',
    'drizzle/0001_eager_dracula.sql',
    'drizzle/0002_quick_psylocke.sql',
  ]) {
    const migration = readFileSync(`${process.cwd()}/${migrationFile}`, 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.exec(statement)
    }
  }

  return { db: drizzle(sqlite, { schema }) }
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
  })

  it('creates a house with the default configuration', () => {
    const house = createHouse('user-1')

    expect(house.userId).toBe('user-1')
    expect(house.name).toBe(DEFAULT_HOUSE_CONFIG.name)
    expect(house.baseAssetKey).toBe(DEFAULT_HOUSE_CONFIG.baseAssetKey)
    expect(getUserHouse('user-1')).toEqual(house)
  })

  it('does not let a user create a second house', () => {
    createHouse('user-1')

    expect(() => createHouse('user-1')).toThrow('User already has a house')
    expect(db.select().from(houses).all()).toHaveLength(1)
  })

  it('rejects creating a house for a user that does not exist', () => {
    expect(() => createHouse('no-such-user')).toThrow('User not found')
  })

  it('returns undefined when the user has no house yet', () => {
    expect(getUserHouse('user-1')).toBeUndefined()
    expect(getHouseDecorations('user-1')).toEqual([])
  })

  it('returns only decorations placed in the house, not inventory items', () => {
    const house = createHouse('user-1')
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
          placedHouseId: house.id,
          positionX: 1,
          positionY: 2,
          rotation: 90,
        },
        // Still in inventory: should not show up.
        { id: 'owned-plant', userId: 'user-1', itemId: 'plant', purchasePriceCoins: 5 },
      ])
      .run()

    expect(getHouseDecorations('user-1')).toEqual([
      {
        userItemId: 'owned-lamp',
        itemId: 'lamp',
        name: 'Lamp',
        category: 'furniture',
        assetKey: 'lamp',
        positionX: 1,
        positionY: 2,
        rotation: 90,
      },
    ])
  })

  it("returns only public fields for another user's house", () => {
    const house = createHouse('user-2')

    const publicHouse = getPublicHouse('user-2')

    expect(publicHouse).toEqual({
      id: house.id,
      ownerId: 'user-2',
      name: DEFAULT_HOUSE_CONFIG.name,
      baseAssetKey: DEFAULT_HOUSE_CONFIG.baseAssetKey,
      decorations: [],
    })
    expect(publicHouse).not.toHaveProperty('createdAt')
  })

  it("throws 404 when looking up a house that doesn't exist", () => {
    expect(() => getPublicHouse('user-2')).toThrow('House not found')
  })
})
