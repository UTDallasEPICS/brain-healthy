import { getQuestById } from '~~/server/utils/questService'
import { requireUser } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  requireUser(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quest ID is required',
    })
  }

  const quest = await getQuestById(id)

  if (!quest) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Quest not found',
    })
  }

  return quest
})