import { and, count, eq } from 'drizzle-orm'
import { coinTransactions, rewardRules, user, type REWARD_ACTION_CODES } from '../db/schema'
import type { RewardActivityType } from '../db/schema/economy'
import { db } from './db'
import { awardCoins } from './coinService'

const ACTION_CODE_BY_ACTIVITY = {
  individual_quest_completion: 'QUEST_COMPLETE',
  qr_event_check_in: 'EVENT_PARTICIPATION',
  social_engagement: 'SOCIAL_NUDGE',
  verified_friend_referral: 'VERIFIED_REFERRAL',
} as const satisfies Record<RewardActivityType, (typeof REWARD_ACTION_CODES)[number]>

const MAX_REWARDED_REFERRALS = 3

function findRewardRule(actionCode: (typeof REWARD_ACTION_CODES)[number]) {
  return db
    .select({
      id: rewardRules.id,
      coinAmount: rewardRules.coinAmount,
      enabled: rewardRules.enabled,
    })
    .from(rewardRules)
    .where(eq(rewardRules.actionCode, actionCode))
    .get()
}

export function getRewardAmount(activityType: RewardActivityType): number {
  const rule = findRewardRule(ACTION_CODE_BY_ACTIVITY[activityType])
  if (!rule || !rule.enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Reward configuration not found' })
  }
  return rule.coinAmount
}

export function getRewardConfigurations() {
  const rules = db
    .select({ actionCode: rewardRules.actionCode, coinAmount: rewardRules.coinAmount })
    .from(rewardRules)
    .all()

  return Object.entries(ACTION_CODE_BY_ACTIVITY).flatMap(([activityType, actionCode]) => {
    const rule = rules.find((candidate) => candidate.actionCode === actionCode)
    return rule
      ? [{ activityType: activityType as RewardActivityType, coinAmount: rule.coinAmount }]
      : []
  })
}

export function grantActivityReward(
  userId: string,
  activityType: RewardActivityType,
  referenceId: string
): { awarded: boolean; amount: number } {
  if (!referenceId.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'A referenceId is required' })
  }

  const actionCode = ACTION_CODE_BY_ACTIVITY[activityType]
  return db.transaction(
    (tx) => {
      const rule = tx
        .select({
          id: rewardRules.id,
          coinAmount: rewardRules.coinAmount,
          enabled: rewardRules.enabled,
        })
        .from(rewardRules)
        .where(eq(rewardRules.actionCode, actionCode))
        .get()

      if (!rule || !rule.enabled) {
        throw createError({ statusCode: 404, statusMessage: 'Reward configuration not found' })
      }

      if (activityType === 'verified_friend_referral') {
        const verifiedFriend = tx
          .select({ id: user.id })
          .from(user)
          .where(and(eq(user.id, referenceId), eq(user.emailVerified, true)))
          .get()

        if (!verifiedFriend || referenceId === userId) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Referral rewards require a different, verified user',
          })
        }

        const [referralCount] = tx
          .select({ value: count() })
          .from(coinTransactions)
          .where(
            and(
              eq(coinTransactions.userId, userId),
              eq(coinTransactions.transactionType, 'referral_reward')
            )
          )
          .all()

        if ((referralCount?.value ?? 0) >= MAX_REWARDED_REFERRALS) {
          return { awarded: false, amount: 0 }
        }
      }

      const sourceKey = `reward:${activityType}:${referenceId}`
      const transactionType =
        activityType === 'verified_friend_referral' ? 'referral_reward' : 'activity_reward'
      const awarded = awardCoins(userId, rule.coinAmount, rule.id, sourceKey, transactionType, tx)

      return { awarded, amount: awarded ? rule.coinAmount : 0 }
    },
    { behavior: 'immediate' }
  )
}
