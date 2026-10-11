import { eq, sql } from 'drizzle-orm'
import { db } from '~~/server/utils/db'
import { coinTransactions } from '~~/server/db/schema'

// Balance is never stored: it's the sum of the user's ledger rows (0 if none).
export function getCoinBalance(userId: string) {
  const row = db
    .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)` })
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .get()

  return row?.balance ?? 0
}
