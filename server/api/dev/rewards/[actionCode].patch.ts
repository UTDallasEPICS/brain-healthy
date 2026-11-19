import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { REWARD_ACTION_CODES, rewardRules } from '~~/server/db/schema'
import { db } from '~~/server/utils/db'
import { requireDevUser } from '~~/server/utils/devTools'
import { getRewardConfigurations } from '~~/server/utils/rewardService'

const bodySchema = z
  .object({
    coinAmount: z.number().int().min(0).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((body) => body.coinAmount !== undefined || body.enabled !== undefined, {
    message: 'Provide coinAmount and/or enabled',
  })

const paramSchema = z.enum(REWARD_ACTION_CODES)

// Edits a reward rule the way an admin would in the database, to show that
// amounts change without a code change.
export default defineEventHandler(async (event) => {
  requireDevUser(event)
  const parsed = paramSchema.safeParse(getRouterParam(event, 'actionCode'))
  if (!parsed.success) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown reward action code' })
  }
  const changes = await readValidatedBody(event, bodySchema.parse)

  db.update(rewardRules).set(changes).where(eq(rewardRules.actionCode, parsed.data)).run()
  return getRewardConfigurations()
})
