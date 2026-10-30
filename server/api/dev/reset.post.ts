import { z } from 'zod'
import { and, eq, inArray, like } from 'drizzle-orm'
import {
  coinTransactions,
  referrals,
  rewardRules,
  submissions,
  user as userTable,
} from '~~/server/db/schema'
import { db } from '~~/server/utils/db'
import {
  DEFAULT_REWARD_RULES,
  DEV_INVITEE_EMAIL_PREFIX,
  requireDevUser,
} from '~~/server/utils/devTools'

const bodySchema = z.object({ restoreRewardRules: z.boolean().default(true) })

// Clears the caller's coins, quest completions, and console-made invitees, and
// (by default) puts the reward rules back to their initial values. Reward
// rules are shared, so that part affects every user of this dev database.
export default defineEventHandler(async (event) => {
  const user = requireDevUser(event)
  const { restoreRewardRules } = await readValidatedBody(event, bodySchema.parse)

  db.transaction((tx) => {
    tx.delete(coinTransactions).where(eq(coinTransactions.userId, user.id)).run()
    tx.delete(submissions).where(eq(submissions.userId, user.id)).run()

    const invitees = tx
      .select({ id: userTable.id })
      .from(referrals)
      .innerJoin(userTable, eq(userTable.id, referrals.invitedUserId))
      .where(
        and(eq(referrals.inviterId, user.id), like(userTable.email, `${DEV_INVITEE_EMAIL_PREFIX}%`))
      )
      .all()

    if (invitees.length > 0) {
      // Cascades to their referral rows.
      tx.delete(userTable)
        .where(
          inArray(
            userTable.id,
            invitees.map((i) => i.id)
          )
        )
        .run()
    }

    if (restoreRewardRules) {
      for (const { actionCode, ...values } of DEFAULT_REWARD_RULES) {
        tx.update(rewardRules).set(values).where(eq(rewardRules.actionCode, actionCode)).run()
      }
    }
  })

  return { ok: true }
})
