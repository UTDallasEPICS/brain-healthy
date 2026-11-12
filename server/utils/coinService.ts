import { eq, sql } from 'drizzle-orm'
import { coinTransactions, type TRANSACTION_TYPES } from '../db/schema/economy'
import { db } from './db'

type TransactionType = (typeof TRANSACTION_TYPES)[number]
export type CoinWriter = Pick<typeof db, 'insert' | 'select'>

/** Append one ledger entry for a source; the unique source key makes retries safe. */
export function awardCoins(
  userId: string,
  amount: number,
  rewardRuleId: string,
  sourceKey: string,
  transactionType: TransactionType,
  writer: CoinWriter = db
): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('Coin award amount must be a non-negative integer.')
  }

  const result = writer
    .insert(coinTransactions)
    .values({ userId, amount, rewardRuleId, sourceKey, transactionType })
    .onConflictDoNothing()
    .run()

  return result.changes > 0
}

/** Return the user's ledger balance. Earnings are positive; purchases are negative. */
export function getCoinBalance(userId: string): number {
  const [result] = db
    .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)` })
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .all()

  return result?.balance ?? 0
}

/** Return the current balance and latest ledger entries for the authenticated user. */
export function getCoinSummary(userId: string, limit = 20) {
  const transactions = db
    .select({
      id: coinTransactions.id,
      amount: coinTransactions.amount,
      transactionType: coinTransactions.transactionType,
      createdAt: coinTransactions.createdAt,
    })
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .orderBy(sql`${coinTransactions.createdAt} desc`)
    .limit(limit)
    .all()
  return { balance: getCoinBalance(userId), transactions }
}

/** Record a purchase debit after checking the ledger balance in the same transaction. */
export function spendCoins(
  userId: string,
  amount: number,
  sourceKey: string,
  writer: CoinWriter = db
): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('Coin spend amount must be a non-negative integer.')
  }
  const [result] = writer
    .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)` })
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .all()
  if ((result?.balance ?? 0) < amount) {
    throw createError({ statusCode: 400, statusMessage: 'Insufficient coins' })
  }
  const inserted = writer
    .insert(coinTransactions)
    .values({ userId, amount: -amount, rewardRuleId: null, sourceKey, transactionType: 'purchase' })
    .onConflictDoNothing()
    .run()
  if (inserted.changes === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Purchase already recorded' })
  }
  return true
}
