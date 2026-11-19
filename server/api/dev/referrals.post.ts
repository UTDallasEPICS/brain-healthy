import { z } from 'zod'
import { referrals, user as userTable } from '~~/server/db/schema'
import { db } from '~~/server/utils/db'
import { DEV_INVITEE_EMAIL_PREFIX, requireDevUser } from '~~/server/utils/devTools'

const bodySchema = z.object({ verified: z.boolean().default(true) })

// Simulates "a student signed up with my invite code": creates an invitee and
// the referral row. Claim the reward with POST /api/dev/rewards/grant
// (activityType 'verified_friend_referral', referenceId = invitedUserId).
export default defineEventHandler(async (event) => {
  const user = requireDevUser(event)
  const { verified } = await readValidatedBody(event, bodySchema.parse)
  const invitedUserId = crypto.randomUUID()

  db.transaction((tx) => {
    tx.insert(userTable)
      .values({
        id: invitedUserId,
        name: 'Dev invitee',
        email: `${DEV_INVITEE_EMAIL_PREFIX}${invitedUserId}@utdallas.edu`,
        emailVerified: verified,
      })
      .run()
    tx.insert(referrals).values({ inviterId: user.id, invitedUserId }).run()
  })

  return { invitedUserId, verified }
})
