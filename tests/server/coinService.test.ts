// @vitest-environment node
//
// Tests for the coin ledger service (server/utils/coinService.ts). See
// docs/coin-service.md for how the ledger works.
//
// Same baseline as auth.test.ts (docs/testing.md): no .env, no database file.
// Each run gets a fresh in-memory SQLite with the project's migrations applied,
// and every test creates its own users so tests never share a balance.

import { describe, it, expect, beforeAll, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getHeader,
  toWebHandler,
} from 'h3'

// Runs before the imports below: db.ts opens DATABASE_URL as soon as it loads.
vi.hoisted(() => {
  process.env.DATABASE_URL = ':memory:'
})

let db: typeof import('../../server/utils/db').db
let schema: typeof import('../../server/db/schema')
let coins: typeof import('../../server/utils/coinService')

beforeAll(async () => {
  // coinService uses Nitro's auto-imported createError; provide the real one.
  vi.stubGlobal('createError', createError)

  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  ;({ db } = await import('../../server/utils/db'))
  migrate(db, { migrationsFolder: 'drizzle' })

  schema = await import('../../server/db/schema')
  coins = await import('../../server/utils/coinService')
})

// Creates a brand-new user with no coins and returns their id.
let userCount = 0
function newUser() {
  userCount += 1
  return db
    .insert(schema.user)
    .values({ name: `Student ${userCount}`, email: `student${userCount}@utdallas.edu` })
    .returning()
    .get().id
}

// Runs `fn` and returns the HTTP status of the error it throws (undefined if
// it doesn't throw), so tests can check e.g. "this was refused with a 409".
function thrownStatus(fn: () => unknown) {
  try {
    fn()
  } catch (err) {
    return (err as { statusCode?: number }).statusCode
  }
  return undefined
}

// Counts every ledger row in the database, for every user. Comparing it before
// and after a refused call proves the call wrote nothing at all.
function totalRows() {
  return db.select().from(schema.coinTransactions).all().length
}

// Shortcut for the most common award in these tests.
function award(userId: string, amount: number, sourceKey: string) {
  return coins.awardCoins({ userId, amount, transactionType: 'activity_reward', sourceKey })
}

describe('getCoinBalance', () => {
  // A new student who has never earned anything has 0 coins, not an error.
  it('is 0 for a user with no transactions', () => {
    expect(coins.getCoinBalance(newUser())).toBe(0)
  })

  // Asking about a user who doesn't exist also gives 0 instead of crashing.
  it('is 0 for an id that matches no user', () => {
    expect(coins.getCoinBalance('no-such-user')).toBe(0)
  })
})

describe('awardCoins', () => {
  // Giving a student 10 coins makes their balance 10, and the saved row
  // records exactly what happened.
  it('increases the balance and records a positive row', () => {
    const userId = newUser()

    const row = award(userId, 10, 'submission:a1')

    expect(coins.getCoinBalance(userId)).toBe(10)
    expect(row).toMatchObject({
      userId,
      amount: 10,
      transactionType: 'activity_reward',
      sourceKey: 'submission:a1',
      rewardRuleId: null,
    })
  })

  // Earning 10 and then 25 coins gives a balance of 35.
  it('adds up across several awards', () => {
    const userId = newUser()

    award(userId, 10, 'submission:b1')
    coins.awardCoins({
      userId,
      amount: 25,
      transactionType: 'referral_reward',
      sourceKey: 'referral:b2',
    })

    expect(coins.getCoinBalance(userId)).toBe(35)
  })

  // The same activity can't pay out twice. The second try is refused and the
  // student still has 10 coins, not 20.
  it('refuses the same sourceKey twice with a 409 and pays only once', () => {
    const userId = newUser()
    award(userId, 10, 'submission:dup')
    const rowsBefore = totalRows()

    expect(thrownStatus(() => award(userId, 10, 'submission:dup'))).toBe(409)

    expect(coins.getCoinBalance(userId)).toBe(10)
    expect(totalRows()).toBe(rowsBefore)
  })

  // One activity can't pay two different students either. Once Alice was paid
  // for it, Bob can't be paid for the same one.
  it('refuses a sourceKey already used by a different user', () => {
    const alice = newUser()
    const bob = newUser()
    award(alice, 10, 'submission:shared')

    expect(thrownStatus(() => award(bob, 10, 'submission:shared'))).toBe(409)
    expect(coins.getCoinBalance(bob)).toBe(0)
  })

  // Awards must be a positive whole number. Zero, negatives, fractions, and
  // "not a number" are all refused, and nothing is saved.
  it.each([0, -5, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects amount %s with a 400 and writes nothing',
    (amount) => {
      const userId = newUser()
      const rowsBefore = totalRows()

      expect(thrownStatus(() => award(userId, amount, `submission:bad-${amount}`))).toBe(400)
      expect(totalRows()).toBe(rowsBefore)
    }
  )
})

describe('spendCoins', () => {
  // Spending 30 of 100 coins leaves 70. The saved row shows -30, even though
  // the caller passed 30.
  it('decreases the balance and records a negative purchase row', () => {
    const userId = newUser()
    award(userId, 100, 'submission:c1')

    const row = coins.spendCoins({ userId, amount: 30, sourceKey: 'purchase:c2' })

    expect(coins.getCoinBalance(userId)).toBe(70)
    expect(row).toMatchObject({ amount: -30, transactionType: 'purchase' })
  })

  // A student may spend every coin they have, ending at exactly 0.
  it('allows spending the exact balance, down to 0', () => {
    const userId = newUser()
    award(userId, 50, 'submission:d1')

    coins.spendCoins({ userId, amount: 50, sourceKey: 'purchase:d2' })

    expect(coins.getCoinBalance(userId)).toBe(0)
  })

  // A student with 20 coins can't buy something that costs 21. The purchase
  // is refused, and nothing at all is saved, so they still have 20.
  it('refuses to overspend with a 409 and writes nothing', () => {
    const userId = newUser()
    award(userId, 20, 'submission:e1')
    const rowsBefore = totalRows()

    expect(
      thrownStatus(() => coins.spendCoins({ userId, amount: 21, sourceKey: 'purchase:e2' }))
    ).toBe(409)

    expect(coins.getCoinBalance(userId)).toBe(20)
    expect(totalRows()).toBe(rowsBefore)
  })

  // A student with 0 coins can't buy anything, not even something costing 1.
  it('refuses any spend from an empty balance', () => {
    const userId = newUser()

    expect(
      thrownStatus(() => coins.spendCoins({ userId, amount: 1, sourceKey: 'purchase:f1' }))
    ).toBe(409)
    expect(coins.getCoinBalance(userId)).toBe(0)
  })

  // Like double-clicking "Buy": the first purchase uses all 50 coins, so the
  // second one is refused instead of pushing the balance to -50.
  it('refuses a second spend once the first used up the coins', () => {
    const userId = newUser()
    award(userId, 50, 'submission:g1')

    coins.spendCoins({ userId, amount: 50, sourceKey: 'purchase:g2' })

    expect(
      thrownStatus(() => coins.spendCoins({ userId, amount: 50, sourceKey: 'purchase:g3' }))
    ).toBe(409)
    expect(coins.getCoinBalance(userId)).toBe(0)
  })

  // The same purchase can't be charged twice. The repeat is refused and the
  // student was only charged once (100 - 10 = 90).
  it('refuses a reused sourceKey with a 409 and charges only once', () => {
    const userId = newUser()
    award(userId, 100, 'submission:h1')
    coins.spendCoins({ userId, amount: 10, sourceKey: 'purchase:h2' })

    expect(
      thrownStatus(() => coins.spendCoins({ userId, amount: 10, sourceKey: 'purchase:h2' }))
    ).toBe(409)
    expect(coins.getCoinBalance(userId)).toBe(90)
  })

  // Spends must be a positive whole number too. Zero, negatives (which would
  // secretly add coins), and fractions are refused, and nothing is saved.
  it.each([0, -5, 2.5])('rejects amount %s with a 400 and writes nothing', (amount) => {
    const userId = newUser()
    award(userId, 100, `submission:i-${amount}`)
    const rowsBefore = totalRows()

    expect(
      thrownStatus(() => coins.spendCoins({ userId, amount, sourceKey: `purchase:i-${amount}` }))
    ).toBe(400)
    expect(totalRows()).toBe(rowsBefore)
  })
})

describe('getCoinTransactions', () => {
  // A new student's history is an empty list.
  it('is empty for a user with no transactions', () => {
    expect(coins.getCoinTransactions(newUser())).toEqual([])
  })

  // History shows the most recent first. These three happen within the same
  // second, so this also proves ties are still put in the right order.
  it('returns rows newest first, even within the same second', () => {
    const userId = newUser()
    award(userId, 10, 'submission:j1')
    award(userId, 20, 'submission:j2')
    coins.spendCoins({ userId, amount: 5, sourceKey: 'purchase:j3' })

    const keys = coins.getCoinTransactions(userId).map((t) => t.sourceKey)

    expect(keys).toEqual(['purchase:j3', 'submission:j2', 'submission:j1'])
  })

  // The date decides the order, not when the row was saved. A row dated an
  // hour ago comes last, even though it was saved last.
  it('orders by created_at before insertion order', () => {
    const userId = newUser()
    award(userId, 10, 'submission:k1')
    db.insert(schema.coinTransactions)
      .values({
        userId,
        amount: 5,
        transactionType: 'activity_reward',
        sourceKey: 'submission:k-old',
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      .run()

    const keys = coins.getCoinTransactions(userId).map((t) => t.sourceKey)

    expect(keys).toEqual(['submission:k1', 'submission:k-old'])
  })
})

describe('users only see their own coins', () => {
  // Alice and Bob each have their own coins. Alice's balance and history only
  // include her own rows, never Bob's, and the other way around.
  it("keeps one user's balance and history out of another's", () => {
    const alice = newUser()
    const bob = newUser()
    award(alice, 40, 'submission:l1')
    award(bob, 7, 'submission:l2')
    coins.spendCoins({ userId: alice, amount: 15, sourceKey: 'purchase:l3' })

    expect(coins.getCoinBalance(alice)).toBe(25)
    expect(coins.getCoinBalance(bob)).toBe(7)

    const aliceRows = coins.getCoinTransactions(alice)
    expect(aliceRows.map((t) => t.sourceKey)).toEqual(['purchase:l3', 'submission:l1'])
    expect(aliceRows.every((t) => t.userId === alice)).toBe(true)

    expect(coins.getCoinTransactions(bob).map((t) => t.sourceKey)).toEqual(['submission:l2'])
  })
})

// The real routes in server/api/coins/, called over HTTP. Signing in for real
// is covered by auth.test.ts, so a stand-in gateway takes its place here: it
// treats the `x-test-user` header as the signed-in user's id, just as the real
// gateway (server/middleware/auth.ts) sets event.context.user from a session.
describe('coin routes', () => {
  let get: (path: string, userId?: string) => Promise<Response>

  beforeAll(async () => {
    // The route files rely on Nitro's auto-imported defineEventHandler.
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    const balanceRoute = (await import('../../server/api/coins/balance.get')).default
    const transactionsRoute = (await import('../../server/api/coins/transactions.get')).default

    const fakeGateway = defineEventHandler((event) => {
      const userId = getHeader(event, 'x-test-user')
      if (userId) {
        const user = db.select().from(schema.user).where(eq(schema.user.id, userId)).get()
        Object.assign(event.context, { user })
      }
    })

    const router = createRouter()
      .get('/api/coins/balance', balanceRoute)
      .get('/api/coins/transactions', transactionsRoute)
    const handler = toWebHandler(createApp().use(fakeGateway).use(router))

    get = (path, userId) =>
      handler(
        new Request(`http://localhost:3000${path}`, {
          headers: userId ? { 'x-test-user': userId } : {},
        })
      )
  })

  // Someone who isn't signed in is turned away from both routes with a 401.
  it.each(['/api/coins/balance', '/api/coins/transactions'])(
    'refuses %s without a signed-in user',
    async (path) => {
      expect((await get(path)).status).toBe(401)
    }
  )

  // Alice and Bob each ask for their balance and each get only their own.
  it("returns the signed-in user's balance and nobody else's", async () => {
    const alice = newUser()
    const bob = newUser()
    award(alice, 30, 'submission:m1')
    award(bob, 5, 'submission:m2')

    const aliceRes = await get('/api/coins/balance', alice)
    const bobRes = await get('/api/coins/balance', bob)

    expect(aliceRes.status).toBe(200)
    expect(await aliceRes.json()).toEqual({ balance: 30 })
    expect(await bobRes.json()).toEqual({ balance: 5 })
  })

  // A new student who has never earned anything sees a balance of 0.
  it('returns 0 for a signed-in user with no coins', async () => {
    const res = await get('/api/coins/balance', newUser())

    expect(await res.json()).toEqual({ balance: 0 })
  })

  // Alice's history has only her rows, newest first, and each row has exactly
  // the agreed fields: the source key is shown as `reason`, and internal fields
  // like userId are left out.
  it("returns only the signed-in user's history, newest first", async () => {
    const alice = newUser()
    const bob = newUser()
    award(alice, 20, 'submission:n1')
    award(bob, 99, 'submission:n2')
    coins.spendCoins({ userId: alice, amount: 5, sourceKey: 'purchase:n3' })

    const res = await get('/api/coins/transactions', alice)
    const rows = (await res.json()) as Record<string, unknown>[]

    expect(res.status).toBe(200)
    expect(rows.map((r) => r.reason)).toEqual(['purchase:n3', 'submission:n1'])
    expect(rows[0]).toEqual({
      id: expect.any(String),
      amount: -5,
      transactionType: 'purchase',
      reason: 'purchase:n3',
      createdAt: expect.any(String),
    })
  })
})
