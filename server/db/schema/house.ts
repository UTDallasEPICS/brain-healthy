// Each student's house, the decoration catalog, and the copies students own.
// Snake_case columns; see the note at the top of auth.ts.

import { sqliteTable, text, integer, real, index, check } from 'drizzle-orm/sqlite-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { relations, sql } from 'drizzle-orm'
import { user } from './auth'

/**
 * One house per student, created by the Better Auth user-create hook so no
 * sign-in path can skip it. The unique constraint on user_id is what makes
 * "one per student" a database guarantee rather than a convention.
 */
export const houses = sqliteTable('houses', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  baseAssetKey: text('base_asset_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

/** The shop catalog. One row here can be owned by many students. */
export const decorItems = sqliteTable(
  'decor_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    category: text('category').notNull(),
    priceCoins: integer('price_coins').notNull(),
    assetKey: text('asset_key').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    index('decor_items_active_idx').on(t.active, t.category),
    check('decor_items_price_check', sql`price_coins >= 0`),
  ]
)

/**
 * One row per owned copy of a decoration.
 *
 * A null placed_house_id means the copy is sitting in the student's inventory.
 * purchase_price_coins records what was actually paid, so repricing the catalog
 * never rewrites history.
 *
 * Note: "a student may only place items in their own house" cannot be expressed
 * as a foreign key — placed_house_id and user_id are independent references. It
 * is enforced in the route that sets placed_house_id, and covered by a test.
 */
export const userItems = sqliteTable(
  'user_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => decorItems.id, { onDelete: 'restrict' }),
    placedHouseId: text('placed_house_id').references(() => houses.id, { onDelete: 'set null' }),
    purchasePriceCoins: integer('purchase_price_coins').notNull(),
    positionX: real('position_x'),
    positionY: real('position_y'),
    rotation: real('rotation'),
    acquiredAt: integer('acquired_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('user_items_user_idx').on(t.userId),
    // Rendering a house reads every item placed in it.
    index('user_items_placed_idx').on(t.placedHouseId),
    index('user_items_item_idx').on(t.itemId),
    check('user_items_price_check', sql`purchase_price_coins >= 0`),
  ]
)

export const housesRelations = relations(houses, ({ one, many }) => ({
  owner: one(user, { fields: [houses.userId], references: [user.id] }),
  placedItems: many(userItems),
}))

export const decorItemsRelations = relations(decorItems, ({ many }) => ({
  ownedCopies: many(userItems),
}))

export const userItemsRelations = relations(userItems, ({ one }) => ({
  owner: one(user, { fields: [userItems.userId], references: [user.id] }),
  item: one(decorItems, { fields: [userItems.itemId], references: [decorItems.id] }),
  placedHouse: one(houses, { fields: [userItems.placedHouseId], references: [houses.id] }),
}))

export const selectHouseSchema = createSelectSchema(houses)
export const insertHouseSchema = createInsertSchema(houses)
export const selectDecorItemSchema = createSelectSchema(decorItems)
export const insertDecorItemSchema = createInsertSchema(decorItems)
export const selectUserItemSchema = createSelectSchema(userItems)
export const insertUserItemSchema = createInsertSchema(userItems)
