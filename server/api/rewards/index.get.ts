import { requireUser } from '~~/server/utils/session'
import { getRewardConfigurations } from '~~/server/utils/rewardService'

export default defineEventHandler((event) => {
  requireUser(event)
  return getRewardConfigurations()
})
