import { eq, sql } from 'drizzle-orm'
import { coinTransaction } from '../db/schema/economy'
import { db } from './db'

export type CoinWriter = Pick<typeof db, 'insert'>

/** Add an earning row once for a given reason/reference pair. */
export function awardCoins(
  userId: string,
  amount: number,
  reason: string,
  referenceId: string,
  writer: CoinWriter = db
): boolean {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Coin award amount must be a positive integer.')
  }

  const result = writer
    .insert(coinTransaction)
    .values({ userId, amount, type: 'earn', reason, referenceId })
    .onConflictDoNothing()
    .run()

  return result.changes > 0
}

/** Return the user's earned coins minus coins spent. */
export function getCoinBalance(userId: string): number {
  const [result] = db
    .select({
      balance: sql<number>`coalesce(sum(case when ${coinTransaction.type} = 'spend' then -${coinTransaction.amount} else ${coinTransaction.amount} end), 0)`,
    })
    .from(coinTransaction)
    .where(eq(coinTransaction.userId, userId))
    .all()

  return result?.balance ?? 0
}
