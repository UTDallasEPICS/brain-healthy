// The coin ledger. Snake_case columns; see the note at the top of auth.ts.

import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { relations, sql } from 'drizzle-orm'
import { user } from './auth'
import { rewardRules } from './activities'

export const TRANSACTION_TYPES = ['activity_reward', 'referral_reward', 'purchase'] as const

/**
 * Append-only history of every coin movement. A student's balance is
 * SUM(amount) over their rows — earnings positive, spending negative.
 *
 * `source_key` is the idempotency guard and the single most important column
 * here: its unique index is what makes "the same submission cannot pay twice"
 * true even if the calling code is wrong. Format:
 *
 *   submission:<submissionId>   an approved activity
 *   referral:<referralId>       a qualifying referral
 *   purchase:<userItemId>       a shop purchase (amount is negative)
 *
 * `amount` stores what was actually awarded, so editing a reward rule later
 * never rewrites past transactions.
 */
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
    sourceKey: text('source_key').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // Every balance lookup and ledger page is scoped to one user.
    index('coin_transactions_user_idx').on(t.userId, t.createdAt),
    index('coin_transactions_rule_idx').on(t.rewardRuleId),
    check(
      'coin_transactions_type_check',
      sql`transaction_type in ('activity_reward', 'referral_reward', 'purchase')`
    ),
    // Deliberately no `amount <> 0` constraint: reward_rules permits a
    // coin_amount of 0, so a rule tuned to zero must still be able to record
    // that an action happened.
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
