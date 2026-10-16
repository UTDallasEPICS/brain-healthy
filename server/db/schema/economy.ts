import { relations } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '../schema'

export const rewardActivityTypes = [
  'individual_quest_completion',
  'qr_event_check_in',
  'social_engagement',
  'verified_friend_referral',
] as const

export type RewardActivityType = (typeof rewardActivityTypes)[number]

export const rewardConfiguration = sqliteTable('reward_configuration', {
  activityType: text('activityType').primaryKey(),
  coinAmount: integer('coinAmount').notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const coinTransaction = sqliteTable(
  'coin_transaction',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    type: text('type', { enum: ['earn', 'spend'] }).notNull(),
    reason: text('reason').notNull(),
    referenceId: text('referenceId'),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('coin_transaction_activity_unique').on(
      table.userId,
      table.reason,
      table.referenceId
    ),
    index('coin_transaction_user_created_idx').on(table.userId, table.createdAt),
  ]
)

export const coinTransactionRelations = relations(coinTransaction, ({ one }) => ({
  user: one(user, { fields: [coinTransaction.userId], references: [user.id] }),
}))
