import { getQuestHistory } from '~~/server/utils/questService'
import { requireUser } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  return await getQuestHistory(user.id)
})