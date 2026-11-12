import { requireUser } from '~~/server/utils/session'
import { completeQuest } from '~~/server/utils/questService'

// Records the caller's completion of a quest for its current period and awards
// its coins. Responds with the coins earned and the caller's new balance.
export default defineEventHandler((event) => {
  const user = requireUser(event)
  return completeQuest(user.id, getRouterParam(event, 'id') ?? '')
})
