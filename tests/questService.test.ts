// @vitest-environment node
//
// Quest retrieval and habit tracking: period keys (server/utils/period.ts), the
// quest service (server/utils/questService.ts), and the endpoints under
// server/api/quests/. Runs against in-memory SQLite with the project's real
// migrations applied — no .env, no database file.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getRouterParam,
  getValidatedQuery,
  toWebHandler,
} from 'h3'
import { eq } from 'drizzle-orm'
import { activities, rewardRules, submissions, user } from '../server/db/schema'
import { db } from '../server/utils/db'
import { periodKeyFor } from '../server/utils/period'
import {
  getAvailableQuests,
  getQuestById,
  getQuestForUser,
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
vi.stubGlobal('getValidatedQuery', getValidatedQuery)

// Seeded by migration 0001.
const QUEST_RULE = 'seed-rule-quest-complete'
const EVENT_RULE = 'seed-rule-event-participation'

// Wednesday 2026-10-28, noon in Dallas (CDT, UTC-5).
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

function submit(
  questId: string,
  at: Date,
  { status = 'approved' as 'pending' | 'approved' | 'rejected', userId = 'user-1' } = {}
) {
  const quest = db.select().from(activities).where(eq(activities.id, questId)).get()!
  db.insert(submissions)
    .values({
      userId,
      activityId: questId,
      periodKey: periodKeyFor(quest.recurrence, at),
      status,
      submittedAt: at,
      reviewedAt: status === 'pending' ? null : at,
    })
    .run()
}

const status = (questId: string, now = NOW) => {
  const quest = getQuestForUser('user-1', questId, now)!
  return { completed: quest.completed, eligible: quest.eligible }
}

beforeEach(() => {
  db.delete(submissions).run()
  db.delete(activities).run()
  db.delete(user).run()
  db.update(rewardRules)
    .set({ coinAmount: 1, enabled: true })
    .where(eq(rewardRules.id, QUEST_RULE))
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

describe('periodKeyFor', () => {
  it('uses the campus (America/Chicago) date, not the UTC date', () => {
    // 11:30pm Tuesday in Dallas is already Wednesday in UTC.
    expect(periodKeyFor('daily', new Date('2026-10-28T04:30:00Z'))).toBe('2026-10-27')
    expect(periodKeyFor('daily', new Date('2026-10-28T05:30:00Z'))).toBe('2026-10-28')
  })

  it('stays correct across the daylight-saving change', () => {
    // DST ends 2026-11-01 at 2am: midnight is UTC-5 before, UTC-6 after.
    expect(periodKeyFor('daily', new Date('2026-11-01T04:59:00Z'))).toBe('2026-10-31')
    expect(periodKeyFor('daily', new Date('2026-11-01T05:00:00Z'))).toBe('2026-11-01')
    expect(periodKeyFor('daily', new Date('2026-11-02T05:59:00Z'))).toBe('2026-11-01')
    expect(periodKeyFor('daily', new Date('2026-11-02T06:00:00Z'))).toBe('2026-11-02')
    // DST starts 2026-03-08: midnight is UTC-6 before, UTC-5 after.
    expect(periodKeyFor('daily', new Date('2026-03-08T05:59:00Z'))).toBe('2026-03-07')
    expect(periodKeyFor('daily', new Date('2026-03-08T06:00:00Z'))).toBe('2026-03-08')
  })

  it('uses ISO weeks that roll over at campus midnight Sunday→Monday', () => {
    expect(periodKeyFor('weekly', NOW)).toBe('2026-W44')
    // Sunday 2026-11-01, 11:59pm CST → still week 44; Monday 12:00am → week 45.
    expect(periodKeyFor('weekly', new Date('2026-11-02T05:59:00Z'))).toBe('2026-W44')
    expect(periodKeyFor('weekly', new Date('2026-11-02T06:00:00Z'))).toBe('2026-W45')
  })

  it('assigns year-boundary days to the right ISO week-year', () => {
    expect(periodKeyFor('weekly', new Date('2026-01-01T18:00:00Z'))).toBe('2026-W01')
    expect(periodKeyFor('weekly', new Date('2027-01-01T18:00:00Z'))).toBe('2026-W53')
    expect(periodKeyFor('weekly', new Date('2025-12-29T18:00:00Z'))).toBe('2026-W01')
  })

  it("returns 'once' for one-time activities", () => {
    expect(periodKeyFor('once', NOW)).toBe('once')
  })
})

describe('getAvailableQuests', () => {
  it('lists active quests with name, description, frequency, reward, and status', () => {
    expect(getAvailableQuests('user-1', NOW)).toEqual([
      {
        id: 'hydration',
        name: 'hydration',
        description: 'hydration description',
        frequency: 'daily',
        rewardAmount: 1,
        contentUrl: null,
        completed: false,
        eligible: true,
      },
      expect.objectContaining({ id: 'intro-lesson', frequency: 'once' }),
      expect.objectContaining({ id: 'screen-free-evening', frequency: 'weekly' }),
    ])
  })

  it('leaves out events, inactive quests, and quests outside their window', () => {
    addQuest('campus-event', 'once', { activityType: 'event', rewardRuleId: EVENT_RULE })
    addQuest('retired', 'daily', { active: false })
    addQuest('not-started', 'daily', { startsAt: days(1) })
    addQuest('ended', 'daily', { endsAt: days(-1) })
    addQuest('in-window', 'daily', { startsAt: days(-1), endsAt: days(1) })

    expect(getAvailableQuests('user-1', NOW).map((q) => q.id)).toEqual([
      'hydration',
      'in-window',
      'intro-lesson',
      'screen-free-evening',
    ])
  })

  it("marks only this user's completions in the current period", () => {
    submit('hydration', NOW)
    submit('intro-lesson', NOW, { userId: 'user-2' })

    const quests = Object.fromEntries(getAvailableQuests('user-1', NOW).map((q) => [q.id, q]))
    expect(quests.hydration).toMatchObject({ completed: true, eligible: false })
    expect(quests['intro-lesson']).toMatchObject({ completed: false, eligible: true })
  })

  it('reads the reward amount from the database, and shows 0 while it is disabled', () => {
    db.update(rewardRules).set({ coinAmount: 3 }).where(eq(rewardRules.id, QUEST_RULE)).run()
    expect(getAvailableQuests('user-1', NOW)[0]!.rewardAmount).toBe(3)

    db.update(rewardRules).set({ enabled: false }).where(eq(rewardRules.id, QUEST_RULE)).run()
    expect(getAvailableQuests('user-1', NOW)[0]!.rewardAmount).toBe(0)
  })
})

describe('frequency rules', () => {
  it('daily: one completion per campus day', () => {
    submit('hydration', NOW)
    expect(status('hydration')).toEqual({ completed: true, eligible: false })
    // 11:59pm the same day in Dallas.
    expect(status('hydration', new Date('2026-10-29T04:59:00Z'))).toEqual({
      completed: true,
      eligible: false,
    })
    // Midnight: a new day.
    expect(status('hydration', new Date('2026-10-29T05:00:00Z'))).toEqual({
      completed: false,
      eligible: true,
    })
  })

  it('weekly: one completion per ISO week', () => {
    submit('screen-free-evening', NOW)
    // Sunday of the same week.
    expect(status('screen-free-evening', days(4))).toEqual({ completed: true, eligible: false })
    // Following Monday.
    expect(status('screen-free-evening', days(5))).toEqual({ completed: false, eligible: true })
  })

  it('once: never again after completion', () => {
    submit('intro-lesson', NOW)
    expect(status('intro-lesson', days(400))).toEqual({ completed: true, eligible: false })
  })

  it('a pending submission blocks a second one but is not yet completed', () => {
    submit('hydration', NOW, { status: 'pending' })
    expect(status('hydration')).toEqual({ completed: false, eligible: false })
  })

  it('a rejected submission can be resubmitted', () => {
    submit('hydration', NOW, { status: 'rejected' })
    expect(status('hydration')).toEqual({ completed: false, eligible: true })
  })
})

describe('getQuestById / isQuestEligible', () => {
  it('returns quest details including the reward amount', () => {
    expect(getQuestById('screen-free-evening')).toEqual({
      id: 'screen-free-evening',
      name: 'screen-free-evening',
      description: 'screen-free-evening description',
      frequency: 'weekly',
      rewardAmount: 1,
      contentUrl: null,
    })
  })

  it('returns undefined for unknown ids, events, and inactive quests', () => {
    addQuest('campus-event', 'once', { activityType: 'event', rewardRuleId: EVENT_RULE })
    addQuest('retired', 'daily', { active: false })

    expect(getQuestById('missing')).toBeUndefined()
    expect(getQuestById('campus-event')).toBeUndefined()
    expect(getQuestById('retired')).toBeUndefined()
  })

  it('is not eligible for unknown, not-yet-started, or ended quests', () => {
    addQuest('not-started', 'daily', { startsAt: days(1) })
    addQuest('ended', 'daily', { endsAt: days(-1) })

    expect(isQuestEligible('user-1', 'hydration', NOW)).toBe(true)
    expect(isQuestEligible('user-1', 'missing', NOW)).toBe(false)
    expect(isQuestEligible('user-1', 'not-started', NOW)).toBe(false)
    expect(isQuestEligible('user-1', 'ended', NOW)).toBe(false)
  })
})

describe('getQuestHistory', () => {
  it('lists approved quest completions, newest first, scoped to the user', () => {
    addQuest('campus-event', 'once', { activityType: 'event', rewardRuleId: EVENT_RULE })
    submit('hydration', days(-2))
    submit('intro-lesson', days(-1))
    submit('hydration', NOW)
    submit('screen-free-evening', NOW, { status: 'pending' })
    submit('campus-event', NOW)
    submit('hydration', NOW, { userId: 'user-2' })

    expect(getQuestHistory('user-1')).toEqual([
      { questId: 'hydration', name: 'hydration', frequency: 'daily', completedAt: NOW },
      { questId: 'intro-lesson', name: 'intro-lesson', frequency: 'once', completedAt: days(-1) },
      { questId: 'hydration', name: 'hydration', frequency: 'daily', completedAt: days(-2) },
    ])
  })

  it('paginates', () => {
    for (const n of [-3, -2, -1]) submit('hydration', days(n))

    expect(getQuestHistory('user-1', { limit: 2 }).map((h) => h.completedAt)).toEqual([
      days(-1),
      days(-2),
    ])
    expect(getQuestHistory('user-1', { limit: 2, offset: 2 }).map((h) => h.completedAt)).toEqual([
      days(-3),
    ])
  })

  it('is empty for a user with no completions', () => {
    expect(getQuestHistory('user-1')).toEqual([])
  })
})

describe('GET /api/quests/*', () => {
  let request: (path: string, asUser?: string) => Promise<Response>

  beforeAll(async () => {
    const list = (await import('../server/api/quests/index.get')).default
    const detail = (await import('../server/api/quests/[id].get')).default
    const history = (await import('../server/api/quests/history.get')).default

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
          .get('/api/quests', list)
          .get('/api/quests/history', history)
          .get('/api/quests/:id', detail)
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
    for (const path of ['/api/quests', '/api/quests/hydration', '/api/quests/history']) {
      expect((await request(path)).status).toBe(401)
    }
  })

  it('lists quests with their status', async () => {
    const quests = await (await request('/api/quests', 'user-1')).json()
    expect(quests).toHaveLength(3)
    expect(quests[0]).toMatchObject({ id: 'hydration', completed: false, eligible: true })
  })

  it('returns quest details, or 404 for an unknown id', async () => {
    const response = await request('/api/quests/intro-lesson', 'user-1')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: 'intro-lesson',
      frequency: 'once',
      rewardAmount: 1,
    })

    expect((await request('/api/quests/missing', 'user-1')).status).toBe(404)
  })

  it("returns the caller's history, and 400 for an invalid limit", async () => {
    submit('hydration', NOW)
    submit('hydration', NOW, { userId: 'user-2' })

    const history = await (await request('/api/quests/history', 'user-1')).json()
    expect(history).toEqual([
      {
        questId: 'hydration',
        name: 'hydration',
        frequency: 'daily',
        completedAt: NOW.toISOString(),
      },
    ])

    expect((await request('/api/quests/history?limit=0', 'user-1')).status).toBe(400)
  })
})
