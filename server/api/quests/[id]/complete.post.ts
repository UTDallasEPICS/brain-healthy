import { completeQuest } from '~~/server/utils/questService'
import { requireUser } from '~~/server/utils/session'

export default defineEventHandler((event) => {
  const user = requireUser(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quest ID is required',
    })
  }

  return completeQuest(user.id, id)
})
