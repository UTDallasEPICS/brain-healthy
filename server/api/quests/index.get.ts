import { requireUser } from '~~/server/utils/session'
import { getAvailableQuests } from '~~/server/utils/questService'

// Every quest on offer, each marked completed / eligible for the caller's
// current period.
export default defineEventHandler((event) => {
  const user = requireUser(event)
  return getAvailableQuests(user.id)
})
