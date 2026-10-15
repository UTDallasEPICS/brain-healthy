import { getQuestById } from '../../utils/questService'

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

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