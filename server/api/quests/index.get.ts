import { getAvailableQuests } from '~~/server/utils/questService'
import { requireUser } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  return getAvailableQuests(user.id)
})