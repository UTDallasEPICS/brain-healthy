// The append-only coin ledger. Reward amounts and action codes live in
// reward_rules (activities.ts); each movement records the amount actually used.

import { relations, sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { user } from './auth'
import { rewardRules } from './activities'

export const rewardActivityTypes = [
  'individual_quest_completion',
  'qr_event_check_in',
  'social_engagement',
  'verified_friend_referral',
] as const

export type RewardActivityType = (typeof rewardActivityTypes)[number]

export const TRANSACTION_TYPES = ['activity_reward', 'referral_reward', 'purchase'] as const

export const coinTransactions = sqliteTable(
  'coin_transactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rewardRuleId: text('reward_rule_id').references(() => rewardRules.id, {
      onDelete: 'set null',
    }),
    amount: integer('amount').notNull(),
    transactionType: text('transaction_type', { enum: TRANSACTION_TYPES }).notNull(),
    // Human-readable explanation shown in the user's history. Nullable only so
    // rows written before this column existed stay valid; coinService always sets it.
    reason: text('reason'),
    sourceKey: text('source_key').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('coin_transactions_user_idx').on(t.userId, t.createdAt),
    index('coin_transactions_rule_idx').on(t.rewardRuleId),
    check(
      'coin_transactions_type_check',
      sql`transaction_type in ('activity_reward', 'referral_reward', 'purchase')`
    ),
  ]
)

export const coinTransactionsRelations = relations(coinTransactions, ({ one }) => ({
  user: one(user, { fields: [coinTransactions.userId], references: [user.id] }),
  rewardRule: one(rewardRules, {
    fields: [coinTransactions.rewardRuleId],
    references: [rewardRules.id],
  }),
}))

export const selectCoinTransactionSchema = createSelectSchema(coinTransactions)
export const insertCoinTransactionSchema = createInsertSchema(coinTransactions)
