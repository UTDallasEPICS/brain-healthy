import { and, count, eq, isNull } from 'drizzle-orm'
import {
  coinTransactions,
  referrals,
  rewardRules,
  user,
  type REWARD_ACTION_CODES,
} from '../db/schema'
import type { RewardActivityType } from '../db/schema/economy'
import { db } from './db'
import { awardCoins } from './coinService'

const ACTION_CODE_BY_ACTIVITY = {
  individual_quest_completion: 'QUEST_COMPLETE',
  qr_event_check_in: 'EVENT_PARTICIPATION',
  social_engagement: 'SOCIAL_NUDGE',
  verified_friend_referral: 'VERIFIED_REFERRAL',
} as const satisfies Record<RewardActivityType, (typeof REWARD_ACTION_CODES)[number]>

const REWARD_REASON_BY_ACTIVITY = {
  individual_quest_completion: 'Quest completed',
  qr_event_check_in: 'Campus event check-in',
  social_engagement: 'Social engagement',
  verified_friend_referral: 'Verified friend referral',
} as const satisfies Record<RewardActivityType, string>

export const MAX_REWARDED_REFERRALS = 3

/** A database handle or an open transaction. */
export type RewardWriter = Pick<typeof db, 'select' | 'insert' | 'update'>

function findRewardRule(reader: RewardWriter, activityType: RewardActivityType) {
  return reader
    .select({
      id: rewardRules.id,
      coinAmount: rewardRules.coinAmount,
      enabled: rewardRules.enabled,
    })
    .from(rewardRules)
    .where(eq(rewardRules.actionCode, ACTION_CODE_BY_ACTIVITY[activityType]))
    .get()
}

// Missing (404) and switched off (409) are different problems for a caller: the
// first is a seeding/config bug, the second is a deliberate admin decision.
function requireEnabledRule(reader: RewardWriter, activityType: RewardActivityType) {
  const rule = findRewardRule(reader, activityType)
  if (!rule) {
    throw createError({ statusCode: 404, statusMessage: 'Reward configuration not found' })
  }
  if (!rule.enabled) {
    throw createError({ statusCode: 409, statusMessage: 'This reward is currently disabled' })
  }
  return rule
}

export function getRewardAmount(activityType: RewardActivityType): number {
  return requireEnabledRule(db, activityType).coinAmount
}

export function getRewardConfigurations() {
  const rules = db
    .select({
      actionCode: rewardRules.actionCode,
      coinAmount: rewardRules.coinAmount,
      enabled: rewardRules.enabled,
    })
    .from(rewardRules)
    .all()

  return Object.entries(ACTION_CODE_BY_ACTIVITY).flatMap(([activityType, actionCode]) => {
    const rule = rules.find((candidate) => candidate.actionCode === actionCode)
    return rule
      ? [
          {
            activityType: activityType as RewardActivityType,
            coinAmount: rule.coinAmount,
            enabled: rule.enabled,
          },
        ]
      : []
  })
}

/**
 * A referral pays only when `userId` really invited `invitedUserId` and that
 * student has verified their UTD email. The referral is marked qualified even
 * when the inviter is already at the cap — it is recorded, just not paid.
 *
 * Returns false when the inviter has already been paid for the maximum.
 */
function qualifyReferral(tx: RewardWriter, userId: string, invitedUserId: string): boolean {
  const referral = tx
    .select({ id: referrals.id })
    .from(referrals)
    .innerJoin(user, eq(user.id, referrals.invitedUserId))
    .where(
      and(
        eq(referrals.inviterId, userId),
        eq(referrals.invitedUserId, invitedUserId),
        eq(user.emailVerified, true)
      )
    )
    .get()

  if (!referral) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Referral rewards require a verified user you invited',
    })
  }

  tx.update(referrals)
    .set({ qualifiedAt: new Date() })
    .where(and(eq(referrals.id, referral.id), isNull(referrals.qualifiedAt)))
    .run()

  const [rewarded] = tx
    .select({ value: count() })
    .from(coinTransactions)
    .where(
      and(
        eq(coinTransactions.userId, userId),
        eq(coinTransactions.transactionType, 'referral_reward')
      )
    )
    .all()

  return (rewarded?.value ?? 0) < MAX_REWARDED_REFERRALS
}

/**
 * Award the configured coins for one qualifying activity. `referenceId`
 * identifies that activity (for referrals, the invited user's id); claiming the
 * same one twice returns `{ awarded: false }` and moves no coins.
 *
 * Pass `writer` to run inside the caller's transaction, so the reward commits
 * or rolls back together with the caller's own writes.
 *
 * A missing rule always throws 404 — that is a configuration bug, never skipped.
 */
export function grantActivityReward(
  userId: string,
  activityType: RewardActivityType,
  referenceId: string,
  {
    writer,
    skipIfDisabled = false,
  }: {
    writer?: RewardWriter
    /** Return `{ awarded: false }` for a switched-off reward instead of throwing 409. */
    skipIfDisabled?: boolean
  } = {}
): { awarded: boolean; amount: number } {
  if (!referenceId.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'A referenceId is required' })
  }

  const grant = (tx: RewardWriter) => {
    if (skipIfDisabled && findRewardRule(tx, activityType)?.enabled === false) {
      return { awarded: false, amount: 0 }
    }

    const rule = requireEnabledRule(tx, activityType)

    if (activityType === 'verified_friend_referral' && !qualifyReferral(tx, userId, referenceId)) {
      return { awarded: false, amount: 0 }
    }

    const awarded = awardCoins(
      userId,
      rule.coinAmount,
      REWARD_REASON_BY_ACTIVITY[activityType],
      `reward:${activityType}:${referenceId}`,
      {
        transactionType:
          activityType === 'verified_friend_referral' ? 'referral_reward' : 'activity_reward',
        rewardRuleId: rule.id,
        writer: tx,
      }
    )

    return { awarded, amount: awarded ? rule.coinAmount : 0 }
  }

  // 'immediate' takes the write lock up front, so the referral count and the
  // award that depends on it cannot interleave with a concurrent grant.
  return writer ? grant(writer) : db.transaction(grant, { behavior: 'immediate' })
}
