// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { getCoinBalance } from '../server/utils/coinService'
import { coinTransactions } from '../server/db/schema/economy'
import { rewardRules, user } from '../server/db/schema'
import { db } from '../server/utils/db'
import {
  getRewardAmount,
  getRewardConfigurations,
  grantActivityReward,
} from '../server/utils/rewardService'

vi.stubGlobal('createError', createError)

vi.mock('../server/utils/db', async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { readFileSync } = await import('node:fs')
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

  return { db: drizzle(sqlite) }
})

const defaults = [
  { actionCode: 'QUEST_COMPLETE', coinAmount: 1, enabled: true },
  { actionCode: 'EVENT_PARTICIPATION', coinAmount: 5, enabled: true },
  { actionCode: 'SOCIAL_NUDGE', coinAmount: 5, enabled: false },
  { actionCode: 'VERIFIED_REFERRAL', coinAmount: 30, enabled: true },
] as const

describe('rewardService', () => {
  beforeEach(() => {
    db.delete(coinTransactions).run()
    db.delete(rewardRules).run()
    db.delete(user).run()
    db.insert(user).values({ id: 'user-1', name: 'Test User', email: 'user@example.com' }).run()
    db.insert(rewardRules)
      .values([...defaults])
      .run()
  })

  it('reads reward amounts and configurations from SQLite', () => {
    expect(getRewardAmount('individual_quest_completion')).toBe(1)
    expect(getRewardConfigurations()).toEqual([
      { activityType: 'individual_quest_completion', coinAmount: 1 },
      { activityType: 'qr_event_check_in', coinAmount: 5 },
      { activityType: 'social_engagement', coinAmount: 5 },
      { activityType: 'verified_friend_referral', coinAmount: 30 },
    ])

    db.update(rewardRules)
      .set({ coinAmount: 9 })
      .where(eq(rewardRules.actionCode, 'QUEST_COMPLETE'))
      .run()

    expect(getRewardAmount('individual_quest_completion')).toBe(9)
  })

  it('awards the configured amount and prevents duplicate activity claims', () => {
    expect(grantActivityReward('user-1', 'qr_event_check_in', 'event-check-in-123')).toEqual({
      awarded: true,
      amount: 5,
    })
    expect(grantActivityReward('user-1', 'qr_event_check_in', 'event-check-in-123')).toEqual({
      awarded: false,
      amount: 0,
    })
  })

  it('writes a ledger record through the object-based coin service', () => {
    grantActivityReward('user-1', 'individual_quest_completion', 'quest-1')
    expect(getCoinBalance('user-1')).toBe(1)
    const rows = db.select().from(coinTransactions).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: 'user-1',
      amount: 1,
      transactionType: 'activity_reward',
      sourceKey: 'reward:individual_quest_completion:quest-1',
      rewardRuleId: expect.any(String),
    })
  })

  it('does not swallow invalid amounts or write a ledger row', () => {
    db.update(rewardRules)
      .set({ coinAmount: 0 })
      .where(eq(rewardRules.actionCode, 'QUEST_COMPLETE'))
      .run()
    expect(() => grantActivityReward('user-1', 'individual_quest_completion', 'bad-quest')).toThrow(
      'Amount must be a positive whole number'
    )
    expect(getCoinBalance('user-1')).toBe(0)
  })

  it('limits a user to three rewarded verified referrals', () => {
    for (const id of ['friend-1', 'friend-2', 'friend-3']) {
      db.insert(user)
        .values({ id, name: id, email: `${id}@example.com`, emailVerified: true })
        .run()
      expect(grantActivityReward('user-1', 'verified_friend_referral', id)).toEqual({
        awarded: true,
        amount: 30,
      })
    }

    db.insert(user)
      .values({
        id: 'friend-4',
        name: 'friend-4',
        email: 'friend-4@example.com',
        emailVerified: true,
      })
      .run()
    expect(grantActivityReward('user-1', 'verified_friend_referral', 'friend-4')).toEqual({
      awarded: false,
      amount: 0,
    })
  })

  it('rejects a referral that does not point to a different verified user', () => {
    expect(() =>
      grantActivityReward('user-1', 'verified_friend_referral', 'unverified-user')
    ).toThrow('Referral rewards require a different, verified user')
    expect(() => grantActivityReward('user-1', 'verified_friend_referral', 'user-1')).toThrow(
      'Referral rewards require a different, verified user'
    )
  })
})
