import { z } from 'zod'
import { requireUser } from '~~/server/utils/session'
import { submitQuiz } from '~~/server/utils/lessonService'

const bodySchema = z.object({ answers: z.record(z.string(), z.string()) })

// Grades the caller's answers on the server and awards coins on their first pass.
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { answers } = await readValidatedBody(event, bodySchema.parse)
  return submitQuiz(user.id, getRouterParam(event, 'id') ?? '', answers)
})
