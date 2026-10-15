import { getQuestById } from '../../utils/questService'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quest ID is required',
    })
  }

  const quest = getQuestById(id)

  if (!quest) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Quest not found',
    })
  }

  return quest
})
