import { and, count, eq, asc } from 'drizzle-orm'
import { user } from '../db/schema'
import { coinTransaction, rewardConfiguration, type RewardActivityType } from '../db/schema/economy'
import { db } from './db'
import { awardCoins } from './coinService'

const REFERRAL_ACTIVITY: RewardActivityType = 'verified_friend_referral'
const MAX_REWARDED_REFERRALS = 3

export function getRewardAmount(activityType: RewardActivityType): number {
  const configuration = db
    .select({ coinAmount: rewardConfiguration.coinAmount })
    .from(rewardConfiguration)
    .where(eq(rewardConfiguration.activityType, activityType))
    .get()

  if (!configuration) {
    throw createError({ statusCode: 404, statusMessage: 'Reward configuration not found' })
  }

  return configuration.coinAmount
}

export function getRewardConfigurations() {
  return db
    .select({
      activityType: rewardConfiguration.activityType,
      coinAmount: rewardConfiguration.coinAmount,
    })
    .from(rewardConfiguration)
    .orderBy(asc(rewardConfiguration.activityType))
    .all()
}

export function grantActivityReward(
  userId: string,
  activityType: RewardActivityType,
  referenceId: string
): { awarded: boolean; amount: number } {
  if (!referenceId.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'A referenceId is required' })
  }

  return db.transaction(
    (tx) => {
      const configuration = tx
        .select({ coinAmount: rewardConfiguration.coinAmount })
        .from(rewardConfiguration)
        .where(eq(rewardConfiguration.activityType, activityType))
        .get()

      if (!configuration) {
        throw createError({ statusCode: 404, statusMessage: 'Reward configuration not found' })
      }

      if (activityType === REFERRAL_ACTIVITY) {
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
          .from(coinTransaction)
          .where(
            and(eq(coinTransaction.userId, userId), eq(coinTransaction.reason, REFERRAL_ACTIVITY))
          )
          .all()

        if ((referralCount?.value ?? 0) >= MAX_REWARDED_REFERRALS) {
          return { awarded: false, amount: 0 }
        }
      }

      const awarded = awardCoins(userId, configuration.coinAmount, activityType, referenceId, tx)

      return { awarded, amount: awarded ? configuration.coinAmount : 0 }
    },
    { behavior: 'immediate' }
  )
}
