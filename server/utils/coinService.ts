import { desc, eq, sql } from 'drizzle-orm'
import { coinTransactions, type TRANSACTION_TYPES } from '../db/schema/economy'
import { db } from './db'

// The coin ledger is append-only: every earning is a positive row, every spend
// a negative row, and the balance is their sum. Nothing here updates or deletes
// a ledger row.
//
// `referenceId` becomes the row's unique source_key, so it must identify the
// one real-world event the coins are for (e.g. `purchase:<userItemId>`).
// Retrying with the same referenceId never moves coins twice.
//
// All functions are synchronous on purpose: Drizzle transactions on
// better-sqlite3 lose atomicity if their callback awaits.

type TransactionType = (typeof TRANSACTION_TYPES)[number]

/** A database handle or an open transaction. */
export type CoinWriter = Pick<typeof db, 'insert' | 'select'>

export interface CoinMovementOptions {
  /** Defaults to 'activity_reward' for awards and 'purchase' for spends. */
  transactionType?: TransactionType
  rewardRuleId?: string | null
  /**
   * Pass the caller's transaction so the coin movement commits or rolls back
   * together with the caller's other writes.
   */
  writer?: CoinWriter
}

export interface CoinTransactionRecord {
  id: string
  amount: number
  transactionType: TransactionType
  reason: string | null
  createdAt: Date
}

const DEFAULT_COIN_HISTORY_LIMIT = 50
export const MAX_COIN_HISTORY_LIMIT = 100

function assertValidMovement(amount: number, reason: string, referenceId: string) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Coin amount must be a non-negative integer',
    })
  }
  if (!reason.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'A reason is required' })
  }
  if (!referenceId.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'A referenceId is required' })
  }
}

function balanceOf(reader: CoinWriter, userId: string): number {
  const [result] = reader
    .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)` })
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .all()

  return result?.balance ?? 0
}

/** Return the user's ledger balance. Earnings are positive; spends are negative. */
export function getCoinBalance(userId: string): number {
  return balanceOf(db, userId)
}

/** Return the user's ledger, newest first. */
export function getCoinTransactions(
  userId: string,
  { limit = DEFAULT_COIN_HISTORY_LIMIT, offset = 0 }: { limit?: number; offset?: number } = {}
): CoinTransactionRecord[] {
  return (
    db
      .select({
        id: coinTransactions.id,
        amount: coinTransactions.amount,
        transactionType: coinTransactions.transactionType,
        reason: coinTransactions.reason,
        createdAt: coinTransactions.createdAt,
      })
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, userId))
      // created_at has one-second resolution; rowid breaks ties in insert order.
      .orderBy(desc(coinTransactions.createdAt), desc(sql`rowid`))
      .limit(Math.min(Math.max(limit, 1), MAX_COIN_HISTORY_LIMIT))
      .offset(Math.max(offset, 0))
      .all()
  )
}

/**
 * Add coins and record the transaction. Returns false, without moving coins,
 * when this referenceId was already recorded.
 */
export function awardCoins(
  userId: string,
  amount: number,
  reason: string,
  referenceId: string,
  {
    transactionType = 'activity_reward',
    rewardRuleId = null,
    writer = db,
  }: CoinMovementOptions = {}
): boolean {
  assertValidMovement(amount, reason, referenceId)

  const result = writer
    .insert(coinTransactions)
    .values({ userId, amount, reason, rewardRuleId, sourceKey: referenceId, transactionType })
    .onConflictDoNothing({ target: coinTransactions.sourceKey })
    .run()

  return result.changes > 0
}

/**
 * Deduct coins and record the transaction. Throws 409 when the user cannot
 * afford it. Returns false, without moving coins, when this referenceId was
 * already recorded for this user.
 */
export function spendCoins(
  userId: string,
  amount: number,
  reason: string,
  referenceId: string,
  { transactionType = 'purchase', rewardRuleId = null, writer }: CoinMovementOptions = {}
): boolean {
  assertValidMovement(amount, reason, referenceId)

  const spend = (tx: CoinWriter) => {
    const existing = tx
      .select({ userId: coinTransactions.userId })
      .from(coinTransactions)
      .where(eq(coinTransactions.sourceKey, referenceId))
      .get()

    if (existing) {
      if (existing.userId !== userId) {
        throw createError({ statusCode: 409, statusMessage: 'referenceId is already in use' })
      }
      return false
    }

    // Read and debit inside one write transaction, so two concurrent spends
    // cannot both see the pre-debit balance.
    if (balanceOf(tx, userId) < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient coins' })
    }

    tx.insert(coinTransactions)
      .values({
        userId,
        amount: -amount,
        reason,
        rewardRuleId,
        sourceKey: referenceId,
        transactionType,
      })
      .run()

    return true
  }

  // A caller-supplied transaction already holds the write lock; otherwise take
  // it up front ('immediate') rather than upgrading from a read lock mid-way.
  return writer ? spend(writer) : db.transaction(spend, { behavior: 'immediate' })
}
