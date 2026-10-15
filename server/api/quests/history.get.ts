import { getQuestHistory } from '../../utils/questService'

export default defineEventHandler(async (event) => {
  const user = event.context.user

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  return await getQuestHistory(user.id)
})
