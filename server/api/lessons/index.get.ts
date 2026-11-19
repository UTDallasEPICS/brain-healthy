import { requireUser } from '~~/server/utils/session'
import { getAvailableLessons } from '~~/server/utils/lessonService'

// All lessons in order, each flagged with whether the caller has passed its quiz.
export default defineEventHandler((event) => {
  const user = requireUser(event)
  return getAvailableLessons(user.id)
})
