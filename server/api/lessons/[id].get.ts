import { requireUser } from '~~/server/utils/session'
import { getLessonById, getLessonCompletionStatus } from '~~/server/utils/lessonService'

// One lesson with its quiz questions (no correct answers) and the caller's completion status.
export default defineEventHandler((event) => {
  const user = requireUser(event)
  const lessonId = getRouterParam(event, 'id') ?? ''
  return { ...getLessonById(lessonId), ...getLessonCompletionStatus(user.id, lessonId) }
})
