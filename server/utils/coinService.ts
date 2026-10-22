import { eq, sql } from 'drizzle-orm'
import { coinTransactions, type TRANSACTION_TYPES } from '../db/schema/economy'
import { db } from './db'

type TransactionType = (typeof TRANSACTION_TYPES)[number]
export type CoinWriter = Pick<typeof db, 'insert'>

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
