// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getRouterParam,
  toWebHandler,
} from 'h3'
import { activities, coinTransactions, rewardRules, submissions, user } from '../server/db/schema'
import { db } from '../server/utils/db'
import { getCoinBalance } from '../server/utils/coinService'
import { completeQuest, getQuestCompletionStatus } from '../server/utils/questService'

vi.mock('../server/utils/db', async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { readFileSync } = await import('node:fs')
  const schema = await import('../server/db/schema')
  const sqlite = new Database(':memory:')

  sqlite.pragma('foreign_keys = ON')
  for (const migrationFile of [
    'drizzle/0000_classy_bloodstorm.sql',
    'drizzle/0001_eager_dracula.sql',
    'drizzle/0002_quick_psylocke.sql',
  ]) {
    const migration = readFileSync(`${process.cwd()}/${migrationFile}`, 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.exec(statement)
    }
  }

  return { db: drizzle(sqlite, { schema }) }
})

// 2026-10-22 noon in Chicago; the next day's key is 2026-10-23.
const TODAY = new Date('2026-10-22T17:00:00Z')
const TOMORROW = new Date('2026-10-23T17:00:00Z')

let request: (path: string, init?: RequestInit) => Promise<Response>

function addQuest(values: Partial<typeof activities.$inferInsert> = {}) {
  const rule = db
    .select({ id: rewardRules.id })
    .from(rewardRules)
    .where(eq(rewardRules.actionCode, 'QUEST_COMPLETE'))
    .get()!

  return db
    .insert(activities)
    .values({
      rewardRuleId: rule.id,
      title: 'Drink water',
      description: 'Drink 8 glasses of water.',
      activityType: 'quest',
      evidenceType: 'self_report',
      recurrence: 'daily',
      ...values,
    })
    .returning({ id: activities.id })
    .get().id
}

function ledgerRows() {
  return db.select().from(coinTransactions).where(eq(coinTransactions.userId, 'user-1')).all()
}

function submissionRows() {
  return db.select().from(submissions).where(eq(submissions.userId, 'user-1')).all()
}

beforeAll(async () => {
  // Server code relies on Nitro's auto-imports; provide the same h3 functions.
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('defineEventHandler', defineEventHandler)
  vi.stubGlobal('getRouterParam', getRouterParam)

  const { default: completeHandler } = await import('../server/api/quests/[id]/complete.post')

  // Stand-in for the auth gateway: an `x-test-user` header becomes the session user.
  const app = createApp()
  app.use(
    defineEventHandler((event) => {
      const id = event.headers.get('x-test-user')
      if (id) event.context.user = { id } as never
    })
  )
  app.use(createRouter().post('/api/quests/:id/complete', completeHandler))

  const handler = toWebHandler(app)
  request = (path, init) => handler(new Request(`http://localhost${path}`, init))
})

beforeEach(() => {
  db.delete(coinTransactions).run()
  db.delete(submissions).run()
  db.delete(activities).run()
  db.delete(rewardRules).run()
  db.delete(user).run()
  db.insert(user).values({ id: 'user-1', name: 'Test User', email: 'user@example.com' }).run()
  db.insert(rewardRules).values({ actionCode: 'QUEST_COMPLETE', coinAmount: 3 }).run()
})

describe('completeQuest', () => {
  it('records the completion and awards the configured coins', () => {
    const questId = addQuest()

    expect(completeQuest('user-1', questId, TODAY)).toEqual({
      questId,
      periodKey: '2026-10-22',
      completed: true,
      coinsEarned: 3,
      balance: 3,
    })

    const [submission] = submissionRows()
    expect(submission).toMatchObject({ activityId: questId, status: 'approved' })
    expect(ledgerRows()).toHaveLength(1)
    expect(ledgerRows()[0]).toMatchObject({
      amount: 3,
      sourceKey: `reward:individual_quest_completion:${submission!.id}`,
    })
  })

  it('rejects a second completion in the same period without paying again', () => {
    const questId = addQuest()
    completeQuest('user-1', questId, TODAY)

    expect(() => completeQuest('user-1', questId, TODAY)).toThrow(
      'Quest already completed for this period'
    )
    expect(submissionRows()).toHaveLength(1)
    expect(getCoinBalance('user-1')).toBe(3)
  })

  it('allows a daily quest again the next day', () => {
    const questId = addQuest()
    completeQuest('user-1', questId, TODAY)

    expect(completeQuest('user-1', questId, TOMORROW)).toMatchObject({
      periodKey: '2026-10-23',
      coinsEarned: 3,
      balance: 6,
    })
  })

  it('allows a one-time quest only once', () => {
    const questId = addQuest({ recurrence: 'once' })
    completeQuest('user-1', questId, TODAY)

    expect(() => completeQuest('user-1', questId, TOMORROW)).toThrow(
      'Quest already completed for this period'
    )
  })

  it('reuses a rejected submission instead of inserting a duplicate', () => {
    const questId = addQuest()
    db.insert(submissions)
      .values({
        userId: 'user-1',
        activityId: questId,
        periodKey: '2026-10-22',
        status: 'rejected',
      })
      .run()

    expect(completeQuest('user-1', questId, TODAY)).toMatchObject({ coinsEarned: 3 })
    expect(submissionRows()).toEqual([expect.objectContaining({ status: 'approved' })])
  })

  it('rejects unknown, inactive, and non-quest activities', () => {
    const inactive = addQuest({ active: false })
    const event = addQuest({ activityType: 'event' })

    for (const id of ['missing-quest', inactive, event]) {
      expect(() => completeQuest('user-1', id, TODAY)).toThrow('Quest not found')
    }
  })

  it('rejects photo quests and quests outside their availability window', () => {
    const photo = addQuest({ evidenceType: 'photo' })
    const ended = addQuest({ endsAt: new Date('2026-10-01T00:00:00Z') })

    expect(() => completeQuest('user-1', photo, TODAY)).toThrow('requires a photo submission')
    expect(() => completeQuest('user-1', ended, TODAY)).toThrow('Quest is not available right now')
    expect(submissionRows()).toHaveLength(0)
  })

  it('rolls back the completion when the reward cannot be granted', () => {
    const questId = addQuest()
    db.update(rewardRules).set({ enabled: false }).run()

    expect(() => completeQuest('user-1', questId, TODAY)).toThrow('Reward configuration not found')
    expect(submissionRows()).toHaveLength(0)
    expect(ledgerRows()).toHaveLength(0)
  })
})

describe('getQuestCompletionStatus', () => {
  it('reports the current period status', async () => {
    const questId = addQuest()

    expect(await getQuestCompletionStatus('user-1', questId, TODAY)).toMatchObject({
      periodKey: '2026-10-22',
      status: null,
    })

    completeQuest('user-1', questId, TODAY)
    expect(await getQuestCompletionStatus('user-1', questId, TODAY)).toMatchObject({
      status: 'approved',
    })
    expect(await getQuestCompletionStatus('user-1', 'missing-quest', TODAY)).toBeNull()
  })
})

describe('POST /api/quests/:id/complete', () => {
  it('completes the quest for the signed-in user', async () => {
    const questId = addQuest()
    const res = await request(`/api/quests/${questId}/complete`, {
      method: 'POST',
      headers: { 'x-test-user': 'user-1' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ completed: true, coinsEarned: 3, balance: 3 })
  })

  it('returns 409 on a duplicate submission', async () => {
    const questId = addQuest()
    const init = { method: 'POST', headers: { 'x-test-user': 'user-1' } }

    await request(`/api/quests/${questId}/complete`, init)
    const res = await request(`/api/quests/${questId}/complete`, init)

    expect(res.status).toBe(409)
    expect(ledgerRows()).toHaveLength(1)
  })

  it('returns 404 for an unknown quest', async () => {
    const res = await request('/api/quests/missing-quest/complete', {
      method: 'POST',
      headers: { 'x-test-user': 'user-1' },
    })

    expect(res.status).toBe(404)
  })

  it('returns 401 without a signed-in user', async () => {
    const res = await request(`/api/quests/${addQuest()}/complete`, { method: 'POST' })

    expect(res.status).toBe(401)
    expect(submissionRows()).toHaveLength(0)
  })
})
