import { z } from 'zod'
import { rewardActivityTypes } from '~~/server/db/schema/economy'
import { requireDevUser } from '~~/server/utils/devTools'
import { getCoinBalance } from '~~/server/utils/coinService'
import { grantActivityReward } from '~~/server/utils/rewardService'

const bodySchema = z.object({
  activityType: z.enum(rewardActivityTypes),
  referenceId: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const user = requireDevUser(event)
  const { activityType, referenceId } = await readValidatedBody(event, bodySchema.parse)
  const result = grantActivityReward(user.id, activityType, referenceId)
  return { ...result, balance: getCoinBalance(user.id) }
})
