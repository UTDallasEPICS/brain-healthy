import { desc, eq, sql } from 'drizzle-orm'
import { db } from '~~/server/utils/db'
import { coinTransactions } from '~~/server/db/schema'

export interface AwardCoinsInput {
  userId: string
  amount: number
  transactionType: 'activity_reward' | 'referral_reward'
  // submission:<id> or referral:<id> — unique, so the same source can't pay twice.
  sourceKey: string
  rewardRuleId?: string
}

export interface SpendCoinsInput {
  userId: string
  // Positive; stored as a negative amount.
  amount: number
  // purchase:<userItemId>
  sourceKey: string
}

// Callers always pass a positive whole number; the sign comes from award vs spend.
function assertPositiveInteger(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Amount must be a positive whole number' })
  }
}

// True when an insert hit the unique index on source_key. Checks `cause` too,
// in case Drizzle wraps the driver error.
function isDuplicateSourceKey(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.cause?.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

// Balance is never stored: it's the sum of the user's ledger rows (0 if none).
export function getCoinBalance(userId: string) {
  const row = db
    .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)` })
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .get()

  return row?.balance ?? 0
}

// Newest first. created_at only has one-second precision, so rowid (insertion
// order) breaks ties between rows written in the same second.
export function getCoinTransactions(userId: string) {
  return db
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .orderBy(desc(coinTransactions.createdAt), sql`rowid desc`)
    .all()
}

export type CoinWriter = Pick<typeof db, 'insert'>

// Records an earning. Throws 409 if this sourceKey was already used.
export function awardCoins(input: AwardCoinsInput, writer: CoinWriter = db) {
  assertPositiveInteger(input.amount)

  try {
    return writer.insert(coinTransactions).values(input).returning().get()
  } catch (err) {
    if (isDuplicateSourceKey(err)) {
      throw createError({ statusCode: 409, statusMessage: 'Already awarded' })
    }
    throw err
  }
}

// Records a spend. The balance check and the debit share one transaction, so two
// concurrent spends can't both see the old balance (plan §7.2). The callback must
// stay synchronous — no async/await inside db.transaction (plan §4.1).
export function spendCoins({ userId, amount, sourceKey }: SpendCoinsInput) {
  assertPositiveInteger(amount)

  try {
    return db.transaction((tx) => {
      const row = tx
        .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)` })
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, userId))
        .get()

      if ((row?.balance ?? 0) < amount) {
        throw createError({ statusCode: 409, statusMessage: 'Insufficient coins' })
      }

      return tx
        .insert(coinTransactions)
        .values({ userId, amount: -amount, transactionType: 'purchase', sourceKey })
        .returning()
        .get()
    })
  } catch (err) {
    if (isDuplicateSourceKey(err)) {
      throw createError({ statusCode: 409, statusMessage: 'Already recorded' })
    }
    throw err
  }
}
