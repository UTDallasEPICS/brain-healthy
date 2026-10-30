// @vitest-environment node
//
// Configurable rewards: the reward service (server/utils/rewardService.ts) and
// GET /api/rewards. Runs against in-memory SQLite with the project's real
// migrations applied — no .env, no database file.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createError, createRouter, defineEventHandler, toWebHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { coinTransactions, referrals, rewardRules, user } from '../server/db/schema'
import { db } from '../server/utils/db'
import { getCoinBalance } from '../server/utils/coinService'
import {
  getRewardAmount,
  getRewardConfigurations,
  grantActivityReward,
} from '../server/utils/rewardService'

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

const defaults = [
  { actionCode: 'QUEST_COMPLETE', coinAmount: 1, enabled: true },
  { actionCode: 'EVENT_PARTICIPATION', coinAmount: 5, enabled: true },
  { actionCode: 'SOCIAL_NUDGE', coinAmount: 5, enabled: false },
  { actionCode: 'VERIFIED_REFERRAL', coinAmount: 30, enabled: true },
] as const

function addInvitedFriend(id: string, { verified = true, invitedBy = 'user-1' } = {}) {
  db.insert(user)
    .values({ id, name: id, email: `${id}@utdallas.edu`, emailVerified: verified })
    .run()
  db.insert(referrals).values({ inviterId: invitedBy, invitedUserId: id }).run()
}

beforeEach(() => {
  db.delete(coinTransactions).run()
  db.delete(referrals).run()
  db.delete(rewardRules).run()
  db.delete(user).run()
  db.insert(user)
    .values([
      { id: 'user-1', name: 'Test User', email: 'user@utdallas.edu' },
      { id: 'user-2', name: 'Other User', email: 'other@utdallas.edu' },
    ])
    .run()
  db.insert(rewardRules)
    .values([...defaults])
    .run()
})

describe('reward configuration', () => {
  it('lists every activity type with its amount and enabled flag', () => {
    expect(getRewardConfigurations()).toEqual([
      { activityType: 'individual_quest_completion', coinAmount: 1, enabled: true },
      { activityType: 'qr_event_check_in', coinAmount: 5, enabled: true },
      { activityType: 'social_engagement', coinAmount: 5, enabled: false },
      { activityType: 'verified_friend_referral', coinAmount: 30, enabled: true },
    ])
  })

  it('reads amounts from SQLite, so a database change takes effect without code changes', () => {
    expect(getRewardAmount('individual_quest_completion')).toBe(1)

    db.update(rewardRules)
      .set({ coinAmount: 9 })
      .where(eq(rewardRules.actionCode, 'QUEST_COMPLETE'))
      .run()

    expect(getRewardAmount('individual_quest_completion')).toBe(9)
    expect(grantActivityReward('user-1', 'individual_quest_completion', 'quest-1')).toEqual({
      awarded: true,
      amount: 9,
    })
  })

  it('distinguishes a disabled reward (409) from a missing one (404)', () => {
    expect(() => getRewardAmount('social_engagement')).toThrow('currently disabled')
    expect(() => grantActivityReward('user-1', 'social_engagement', 'hug-1')).toThrow(
      'currently disabled'
    )

    db.delete(rewardRules).where(eq(rewardRules.actionCode, 'QUEST_COMPLETE')).run()
    expect(() => getRewardAmount('individual_quest_completion')).toThrow(
      'Reward configuration not found'
    )
  })
})

describe('grantActivityReward', () => {
  it('awards the configured amount through the coin ledger, with a reason', () => {
    expect(grantActivityReward('user-1', 'qr_event_check_in', 'event-check-in-123')).toEqual({
      awarded: true,
      amount: 5,
    })

    expect(getCoinBalance('user-1')).toBe(5)
    expect(db.select().from(coinTransactions).get()).toMatchObject({
      reason: 'Campus event check-in',
      transactionType: 'activity_reward',
    })
  })

  it('prevents duplicate claims for the same activity', () => {
    grantActivityReward('user-1', 'qr_event_check_in', 'event-check-in-123')
    expect(grantActivityReward('user-1', 'qr_event_check_in', 'event-check-in-123')).toEqual({
      awarded: false,
      amount: 0,
    })
    expect(getCoinBalance('user-1')).toBe(5)
  })

  it('skips a disabled reward when asked to, but never a missing one', () => {
    expect(
      grantActivityReward('user-1', 'social_engagement', 'hug-1', { skipIfDisabled: true })
    ).toEqual({ awarded: false, amount: 0 })
    expect(getCoinBalance('user-1')).toBe(0)

    db.delete(rewardRules).where(eq(rewardRules.actionCode, 'QUEST_COMPLETE')).run()
    expect(() =>
      grantActivityReward('user-1', 'individual_quest_completion', 'quest-1', {
        skipIfDisabled: true,
      })
    ).toThrow('Reward configuration not found')
  })

  it('requires a referenceId', () => {
    expect(() => grantActivityReward('user-1', 'qr_event_check_in', ' ')).toThrow(
      'A referenceId is required'
    )
  })

  it('rolls back with the caller transaction', () => {
    expect(() =>
      db.transaction((tx) => {
        grantActivityReward('user-1', 'individual_quest_completion', 'quest-1', { writer: tx })
        throw new Error('later step failed')
      })
    ).toThrow('later step failed')

    expect(getCoinBalance('user-1')).toBe(0)
  })
})

describe('referral rewards', () => {
  it('limits a user to three rewarded verified referrals', () => {
    for (const id of ['friend-1', 'friend-2', 'friend-3']) {
      addInvitedFriend(id)
      expect(grantActivityReward('user-1', 'verified_friend_referral', id)).toEqual({
        awarded: true,
        amount: 30,
      })
    }

    addInvitedFriend('friend-4')
    expect(grantActivityReward('user-1', 'verified_friend_referral', 'friend-4')).toEqual({
      awarded: false,
      amount: 0,
    })
    expect(getCoinBalance('user-1')).toBe(90)
  })

  it('marks the referral qualified, even when the inviter is over the cap', () => {
    for (const id of ['friend-1', 'friend-2', 'friend-3', 'friend-4']) {
      addInvitedFriend(id)
      grantActivityReward('user-1', 'verified_friend_referral', id)
    }

    const unqualified = db
      .select()
      .from(referrals)
      .all()
      .filter((r) => !r.qualifiedAt)
    expect(unqualified).toEqual([])
  })

  it('pays a referral only once', () => {
    addInvitedFriend('friend-1')
    grantActivityReward('user-1', 'verified_friend_referral', 'friend-1')
    expect(grantActivityReward('user-1', 'verified_friend_referral', 'friend-1')).toEqual({
      awarded: false,
      amount: 0,
    })
    expect(getCoinBalance('user-1')).toBe(30)
  })

  it.each([
    ['an unverified invitee', () => addInvitedFriend('friend-1', { verified: false })],
    [
      'someone invited by another user',
      () => addInvitedFriend('friend-1', { invitedBy: 'user-2' }),
    ],
    [
      'a verified user who was never invited',
      () =>
        db
          .insert(user)
          .values({
            id: 'friend-1',
            name: 'friend-1',
            email: 'friend-1@utdallas.edu',
            emailVerified: true,
          })
          .run(),
    ],
    ['a user that does not exist', () => {}],
  ])('rejects %s', (_, setup) => {
    setup()
    expect(() => grantActivityReward('user-1', 'verified_friend_referral', 'friend-1')).toThrow(
      'Referral rewards require a verified user you invited'
    )
    expect(getCoinBalance('user-1')).toBe(0)
  })

  it('rejects a self-referral', () => {
    expect(() => grantActivityReward('user-1', 'verified_friend_referral', 'user-1')).toThrow(
      'Referral rewards require a verified user you invited'
    )
  })
})

describe('GET /api/rewards', () => {
  let request: (asUser?: string) => Promise<Response>

  beforeAll(async () => {
    const rewards = (await import('../server/api/rewards/index.get')).default

    // Stands in for server/middleware/auth.ts: a test header picks the caller.
    const app = createApp()
      .use(
        defineEventHandler((event) => {
          const id = event.headers.get('x-test-user')
          if (id) event.context.user = { id } as never
        })
      )
      .use(createRouter().get('/api/rewards', rewards))
    const handler = toWebHandler(app)

    request = (asUser) =>
      handler(
        new Request('http://localhost/api/rewards', {
          headers: asUser ? { 'x-test-user': asUser } : {},
        })
      )
  })

  it('returns 401 without a signed-in user', async () => {
    expect((await request()).status).toBe(401)
  })

  it('returns each activity type with its coin amount and whether it is enabled', async () => {
    const response = await request('user-1')
    expect(response.status).toBe(200)
    expect(await response.json()).toContainEqual({
      activityType: 'social_engagement',
      coinAmount: 5,
      enabled: false,
    })
  })
})
