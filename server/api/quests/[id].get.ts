import { requireUser } from '~~/server/utils/session'
import { getQuestForUser } from '~~/server/utils/questService'

export default defineEventHandler((event) => {
  const user = requireUser(event)
  const quest = getQuestForUser(user.id, getRouterParam(event, 'id') ?? '')

  if (!quest) {
    throw createError({ statusCode: 404, statusMessage: 'Quest not found' })
  }

  return quest
})
