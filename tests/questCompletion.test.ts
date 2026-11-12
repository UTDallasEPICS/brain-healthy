// @vitest-environment node
//
// Quest completion and coin rewards: completeQuest / getQuestCompletionStatus
// (server/utils/questService.ts) and POST /api/quests/:id/complete. Runs
// against in-memory SQLite with the project's real migrations applied — no
// .env, no database file.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getRouterParam,
  toWebHandler,
} from 'h3'
import { eq } from 'drizzle-orm'
import { activities, coinTransactions, rewardRules, submissions, user } from '../server/db/schema'
import { db } from '../server/utils/db'
import { getCoinBalance, getCoinTransactions } from '../server/utils/coinService'
import { periodKeyFor } from '../server/utils/period'
import {
  completeQuest,
  getQuestById,
  getQuestCompletionStatus,
  getQuestHistory,
  isQuestEligible,
} from '../server/utils/questService'

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
vi.stubGlobal('getRouterParam', getRouterParam)

// Seeded by migration 0001.
const QUEST_RULE = 'seed-rule-quest-complete'
const EVENT_RULE = 'seed-rule-event-participation'

// Wednesday 2026-10-28, noon in Dallas (CDT, UTC-5). Whole seconds, because
// timestamps are stored at one-second resolution.
const NOW = new Date('2026-10-28T17:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

function addQuest(
  id: string,
  recurrence: 'daily' | 'weekly' | 'once',
  extra: Partial<typeof activities.$inferInsert> = {}
) {
  db.insert(activities)
    .values({
      id,
      rewardRuleId: QUEST_RULE,
      title: id,
      description: `${id} description`,
      activityType: 'quest',
      evidenceType: 'self_report',
      recurrence,
      ...extra,
    })
    .run()
}

const submissionsFor = (questId: string) =>
  db.select().from(submissions).where(eq(submissions.activityId, questId)).all()

/** Asserts `fn` throws an h3 error with this status and message. */
function expectError(fn: () => unknown, statusCode: number, message: string) {
  try {
    fn()
  } catch (error) {
    expect(error).toMatchObject({ statusCode, statusMessage: expect.stringContaining(message) })
    return
  }
  throw new Error('Expected an error')
}

beforeEach(() => {
  db.delete(coinTransactions).run()
  db.delete(submissions).run()
  db.delete(activities).run()
  db.delete(user).run()
  db.insert(rewardRules)
    .values({ id: QUEST_RULE, actionCode: 'QUEST_COMPLETE', coinAmount: 1, enabled: true })
    .onConflictDoUpdate({ target: rewardRules.id, set: { coinAmount: 1, enabled: true } })
    .run()
  db.insert(user)
    .values([
      { id: 'user-1', name: 'User One', email: 'one@utdallas.edu' },
      { id: 'user-2', name: 'User Two', email: 'two@utdallas.edu' },
    ])
    .run()
  addQuest('hydration', 'daily')
  addQuest('screen-free-evening', 'weekly')
  addQuest('intro-lesson', 'once')
})

describe('completeQuest', () => {
  it('records the completion and awards the configured coins', () => {
    expect(completeQuest('user-1', 'hydration', NOW)).toEqual({
      questId: 'hydration',
      status: 'completed',
      periodKey: '2026-10-28',
      completedAt: NOW,
      coinsEarned: 1,
      balance: 1,
    })

    expect(submissionsFor('hydration')).toEqual([
      expect.objectContaining({ userId: 'user-1', periodKey: '2026-10-28', status: 'approved' }),
    ])
    expect(getCoinTransactions('user-1')).toEqual([
      expect.objectContaining({
        amount: 1,
        transactionType: 'activity_reward',
        reason: 'Quest completed',
      }),
    ])
  })

  it('updates completion history and status', () => {
    completeQuest('user-1', 'hydration', NOW)

    expect(getQuestHistory('user-1')).toEqual([
      { questId: 'hydration', name: 'hydration', frequency: 'daily', completedAt: NOW },
    ])
    expect(isQuestEligible('user-1', 'hydration', NOW)).toBe(false)
    expect(getQuestCompletionStatus('user-1', 'hydration', NOW)).toEqual({
      questId: 'hydration',
      frequency: 'daily',
      periodKey: '2026-10-28',
      submissionStatus: 'approved',
      completed: true,
      eligible: false,
      available: true,
      completedAt: NOW,
    })
  })

  it('awards whatever amount is configured in the database', () => {
    db.update(rewardRules).set({ coinAmount: 3 }).where(eq(rewardRules.id, QUEST_RULE)).run()

    expect(getQuestById('hydration')!.rewardAmount).toBe(3)
    expect(completeQuest('user-1', 'hydration', NOW)).toMatchObject({ coinsEarned: 3, balance: 3 })
  })

  it('still records the habit, for 0 coins, while the quest reward is switched off', () => {
    db.update(rewardRules).set({ enabled: false }).where(eq(rewardRules.id, QUEST_RULE)).run()

    expect(completeQuest('user-1', 'hydration', NOW)).toMatchObject({
      status: 'completed',
      coinsEarned: 0,
      balance: 0,
    })
    expect(submissionsFor('hydration')).toHaveLength(1)
    expect(getCoinTransactions('user-1')).toEqual([])
  })

  it("does not affect another user's status or balance", () => {
    completeQuest('user-1', 'hydration', NOW)

    expect(isQuestEligible('user-2', 'hydration', NOW)).toBe(true)
    expect(completeQuest('user-2', 'hydration', NOW)).toMatchObject({ coinsEarned: 1, balance: 1 })
    expect(getCoinBalance('user-1')).toBe(1)
  })
})

describe('duplicate prevention', () => {
  it('rejects a second completion in the same period and pays nothing extra', () => {
    completeQuest('user-1', 'hydration', NOW)
    expectError(
      () => completeQuest('user-1', 'hydration', NOW),
      409,
      'already completed for this period'
    )

    expect(submissionsFor('hydration')).toHaveLength(1)
    expect(getCoinBalance('user-1')).toBe(1)
  })

  it('daily quests can be completed again the next campus day', () => {
    completeQuest('user-1', 'hydration', NOW)
    // 11:59pm the same day in Dallas — still today.
    expectError(
      () => completeQuest('user-1', 'hydration', new Date('2026-10-29T04:59:00Z')),
      409,
      'already completed'
    )
    // Midnight in Dallas.
    expect(completeQuest('user-1', 'hydration', new Date('2026-10-29T05:00:00Z'))).toMatchObject({
      periodKey: '2026-10-29',
      balance: 2,
    })
  })

  it('weekly quests can be completed again the next ISO week', () => {
    completeQuest('user-1', 'screen-free-evening', NOW)
    expectError(() => completeQuest('user-1', 'screen-free-evening', days(4)), 409, 'already')
    expect(completeQuest('user-1', 'screen-free-evening', days(5))).toMatchObject({
      periodKey: '2026-W45',
      balance: 2,
    })
  })

  it('one-time quests can never be completed again', () => {
    completeQuest('user-1', 'intro-lesson', NOW)
    expectError(() => completeQuest('user-1', 'intro-lesson', days(400)), 409, 'already')
    expect(getCoinBalance('user-1')).toBe(1)
  })

  it('rejects a quest awaiting review', () => {
    db.insert(submissions)
      .values({
        userId: 'user-1',
        activityId: 'hydration',
        periodKey: periodKeyFor('daily', NOW),
        status: 'pending',
      })
      .run()

    expectError(() => completeQuest('user-1', 'hydration', NOW), 409, 'awaiting review')
  })

  it('reopens a rejected submission instead of adding a second row', () => {
    db.insert(submissions)
      .values({
        userId: 'user-1',
        activityId: 'hydration',
        periodKey: periodKeyFor('daily', NOW),
        status: 'rejected',
        reviewedBy: 'user-2',
        submittedAt: days(-0.1),
        reviewedAt: days(-0.05),
      })
      .run()

    expect(completeQuest('user-1', 'hydration', NOW)).toMatchObject({
      coinsEarned: 1,
      completedAt: NOW,
    })
    expect(submissionsFor('hydration')).toEqual([
      expect.objectContaining({ status: 'approved', reviewedBy: null, reviewedAt: NOW }),
    ])
  })
})

describe('invalid requests', () => {
  it('404s for unknown ids, events, and inactive quests', () => {
    addQuest('campus-event', 'once', { activityType: 'event', rewardRuleId: EVENT_RULE })
    addQuest('retired', 'daily', { active: false })

    for (const id of ['missing', 'campus-event', 'retired']) {
      expectError(() => completeQuest('user-1', id, NOW), 404, 'Quest not found')
    }
    expect(getCoinBalance('user-1')).toBe(0)
  })

  it('400s for a quest that needs photo evidence', () => {
    addQuest('photo-quest', 'daily', { evidenceType: 'photo' })
    expectError(() => completeQuest('user-1', 'photo-quest', NOW), 400, 'photo evidence')
    expect(submissionsFor('photo-quest')).toEqual([])
  })

  it('409s outside the quest window', () => {
    addQuest('not-started', 'daily', { startsAt: days(1) })
    addQuest('ended', 'daily', { endsAt: days(-1) })

    for (const id of ['not-started', 'ended']) {
      expectError(() => completeQuest('user-1', id, NOW), 409, 'not available')
      expect(submissionsFor(id)).toEqual([])
    }
  })
})

describe('atomicity', () => {
  it('saves neither the completion nor the coins when the reward step fails', () => {
    // A quest whose rule is not QUEST_COMPLETE lets that rule be deleted (the
    // foreign key would otherwise block it), which makes the reward step throw.
    addQuest('orphan', 'daily', { rewardRuleId: EVENT_RULE })
    db.delete(activities).where(eq(activities.rewardRuleId, QUEST_RULE)).run()
    db.delete(rewardRules).where(eq(rewardRules.id, QUEST_RULE)).run()

    expectError(() => completeQuest('user-1', 'orphan', NOW), 404, 'Reward configuration not found')

    expect(submissionsFor('orphan')).toEqual([])
    expect(getCoinTransactions('user-1')).toEqual([])
  })
})

describe('getQuestCompletionStatus', () => {
  it('reports a not-yet-attempted quest', () => {
    expect(getQuestCompletionStatus('user-1', 'screen-free-evening', NOW)).toEqual({
      questId: 'screen-free-evening',
      frequency: 'weekly',
      periodKey: '2026-W44',
      submissionStatus: null,
      completed: false,
      eligible: true,
      available: true,
      completedAt: null,
    })
  })

  it('returns undefined for an unknown quest', () => {
    expect(getQuestCompletionStatus('user-1', 'missing', NOW)).toBeUndefined()
  })
})

describe('POST /api/quests/:id/complete', () => {
  let request: (questId: string, asUser?: string) => Promise<Response>

  beforeAll(async () => {
    const complete = (await import('../server/api/quests/[id]/complete.post')).default

    // Stands in for server/middleware/auth.ts: a test header picks the caller.
    const app = createApp()
      .use(
        defineEventHandler((event) => {
          const id = event.headers.get('x-test-user')
          if (id) event.context.user = { id } as never
        })
      )
      .use(createRouter().post('/api/quests/:id/complete', complete))
    const handler = toWebHandler(app)

    request = (questId, asUser) =>
      handler(
        new Request(`http://localhost/api/quests/${questId}/complete`, {
          method: 'POST',
          headers: asUser ? { 'x-test-user': asUser } : {},
        })
      )
  })

  it('returns 401 without a signed-in user, and changes nothing', async () => {
    expect((await request('hydration')).status).toBe(401)
    expect(submissionsFor('hydration')).toEqual([])
  })

  it('returns the completion status, coins earned, and new balance', async () => {
    const response = await request('hydration', 'user-1')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      questId: 'hydration',
      status: 'completed',
      coinsEarned: 1,
      balance: 1,
    })
  })

  it('returns 409 on a duplicate and 404 for an unknown quest', async () => {
    await request('hydration', 'user-1')

    expect((await request('hydration', 'user-1')).status).toBe(409)
    expect((await request('missing', 'user-1')).status).toBe(404)
  })
})
