// @vitest-environment node
//
// Coin economy: the ledger service (server/utils/coinService.ts) and the two
// read endpoints under server/api/coins/. Runs against in-memory SQLite with
// the project's real migrations applied — no .env, no database file.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getValidatedQuery,
  toWebHandler,
} from 'h3'
import { coinTransactions, user } from '../server/db/schema'
import { db } from '../server/utils/db'
import {
  awardCoins,
  getCoinBalance,
  getCoinTransactions,
  spendCoins,
} from '../server/utils/coinService'

vi.mock('../server/utils/db', async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: 'drizzle' })
  return { db }
})

// Nitro auto-imports these in the running app.
vi.stubGlobal('createError', createError)
vi.stubGlobal('defineEventHandler', defineEventHandler)
vi.stubGlobal('getValidatedQuery', getValidatedQuery)

beforeEach(() => {
  db.delete(coinTransactions).run()
  db.delete(user).run()
  db.insert(user)
    .values([
      { id: 'user-1', name: 'User One', email: 'one@utdallas.edu' },
      { id: 'user-2', name: 'User Two', email: 'two@utdallas.edu' },
    ])
    .run()
})

describe('awardCoins', () => {
  it('adds coins and records amount, type, and reason', () => {
    expect(awardCoins('user-1', 5, 'Campus event check-in', 'event:1')).toBe(true)

    expect(getCoinBalance('user-1')).toBe(5)
    expect(getCoinTransactions('user-1')).toEqual([
      expect.objectContaining({
        amount: 5,
        transactionType: 'activity_reward',
        reason: 'Campus event check-in',
        createdAt: expect.any(Date),
      }),
    ])
  })

  it('does not award the same referenceId twice', () => {
    expect(awardCoins('user-1', 5, 'Campus event check-in', 'event:1')).toBe(true)
    expect(awardCoins('user-1', 5, 'Campus event check-in', 'event:1')).toBe(false)

    expect(getCoinBalance('user-1')).toBe(5)
    expect(getCoinTransactions('user-1')).toHaveLength(1)
  })

  it.each([
    [-1, 'reason', 'ref', 'non-negative integer'],
    [1.5, 'reason', 'ref', 'non-negative integer'],
    [1, '  ', 'ref', 'A reason is required'],
    [1, 'reason', '', 'A referenceId is required'],
  ])('rejects amount=%s reason=%j referenceId=%j', (amount, reason, ref, message) => {
    expect(() => awardCoins('user-1', amount, reason, ref)).toThrow(message)
    expect(getCoinTransactions('user-1')).toHaveLength(0)
  })
})

describe('spendCoins', () => {
  beforeEach(() => {
    awardCoins('user-1', 10, 'Quest completed', 'quest:1')
  })

  it('deducts coins and records a negative purchase entry', () => {
    expect(spendCoins('user-1', 4, 'Bought a lamp', 'purchase:1')).toBe(true)

    expect(getCoinBalance('user-1')).toBe(6)
    expect(getCoinTransactions('user-1')[0]).toMatchObject({
      amount: -4,
      transactionType: 'purchase',
      reason: 'Bought a lamp',
    })
  })

  it('allows spending the exact balance', () => {
    expect(spendCoins('user-1', 10, 'Bought a sofa', 'purchase:1')).toBe(true)
    expect(getCoinBalance('user-1')).toBe(0)
  })

  it('refuses to spend more than the balance and writes nothing', () => {
    expect(() => spendCoins('user-1', 11, 'Bought a sofa', 'purchase:1')).toThrow(
      'Insufficient coins'
    )

    expect(getCoinBalance('user-1')).toBe(10)
    expect(getCoinTransactions('user-1')).toHaveLength(1)
  })

  it('does not charge the same referenceId twice', () => {
    expect(spendCoins('user-1', 4, 'Bought a lamp', 'purchase:1')).toBe(true)
    expect(spendCoins('user-1', 4, 'Bought a lamp', 'purchase:1')).toBe(false)

    expect(getCoinBalance('user-1')).toBe(6)
  })

  it("refuses a referenceId that belongs to another user's transaction", () => {
    expect(() => spendCoins('user-2', 0, 'Free item', 'quest:1')).toThrow(
      'referenceId is already in use'
    )
  })

  it("never spends another user's coins", () => {
    expect(() => spendCoins('user-2', 1, 'Bought a lamp', 'purchase:1')).toThrow(
      'Insufficient coins'
    )
    expect(getCoinBalance('user-1')).toBe(10)
  })

  it('rolls back with the caller transaction', () => {
    expect(() =>
      db.transaction((tx) => {
        spendCoins('user-1', 4, 'Bought a lamp', 'purchase:1', { writer: tx })
        throw new Error('later step failed')
      })
    ).toThrow('later step failed')

    expect(getCoinBalance('user-1')).toBe(10)
  })
})

describe('getCoinBalance / getCoinTransactions', () => {
  it('is zero and empty for a user with no transactions', () => {
    expect(getCoinBalance('user-1')).toBe(0)
    expect(getCoinTransactions('user-1')).toEqual([])
  })

  it('returns history newest first, scoped to the user, and paginates', () => {
    awardCoins('user-1', 1, 'Quest completed', 'quest:1')
    awardCoins('user-1', 5, 'Campus event check-in', 'event:1')
    spendCoins('user-1', 2, 'Bought a lamp', 'purchase:1')
    awardCoins('user-2', 30, 'Verified friend referral', 'referral:1')

    expect(getCoinTransactions('user-1').map((t) => t.amount)).toEqual([-2, 5, 1])
    expect(getCoinTransactions('user-1', { limit: 2 }).map((t) => t.amount)).toEqual([-2, 5])
    expect(getCoinTransactions('user-1', { limit: 2, offset: 2 }).map((t) => t.amount)).toEqual([1])
    expect(getCoinBalance('user-1')).toBe(4)
    expect(getCoinBalance('user-2')).toBe(30)
  })
})

describe('GET /api/coins/*', () => {
  let request: (path: string, asUser?: string) => Promise<Response>

  beforeAll(async () => {
    const balance = (await import('../server/api/coins/balance.get')).default
    const transactions = (await import('../server/api/coins/transactions.get')).default

    // Stands in for server/middleware/auth.ts: a test header picks the caller.
    const app = createApp()
      .use(
        defineEventHandler((event) => {
          const id = event.headers.get('x-test-user')
          if (id) event.context.user = { id } as never
        })
      )
      .use(
        createRouter()
          .get('/api/coins/balance', balance)
          .get('/api/coins/transactions', transactions)
      )
    const handler = toWebHandler(app)

    request = (path, asUser) =>
      handler(
        new Request(`http://localhost${path}`, {
          headers: asUser ? { 'x-test-user': asUser } : {},
        })
      )
  })

  it('returns 401 without a signed-in user', async () => {
    expect((await request('/api/coins/balance')).status).toBe(401)
    expect((await request('/api/coins/transactions')).status).toBe(401)
  })

  it("returns only the caller's balance and history", async () => {
    awardCoins('user-1', 5, 'Campus event check-in', 'event:1')
    awardCoins('user-2', 30, 'Verified friend referral', 'referral:1')

    expect(await (await request('/api/coins/balance', 'user-1')).json()).toEqual({ balance: 5 })

    const history = await (await request('/api/coins/transactions', 'user-1')).json()
    expect(history).toEqual([
      expect.objectContaining({
        amount: 5,
        transactionType: 'activity_reward',
        reason: 'Campus event check-in',
      }),
    ])
  })

  it('rejects an invalid limit', async () => {
    expect((await request('/api/coins/transactions?limit=0', 'user-1')).status).toBe(400)
    expect((await request('/api/coins/transactions?limit=abc', 'user-1')).status).toBe(400)
  })
})
