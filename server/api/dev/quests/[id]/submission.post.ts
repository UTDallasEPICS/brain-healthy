import { z } from 'zod'
import { submissions } from '~~/server/db/schema'
import { db } from '~~/server/utils/db'
import { requireDevUser } from '~~/server/utils/devTools'
import { getQuestCompletionStatus } from '~~/server/utils/questService'

const bodySchema = z.object({
  status: z.enum(['pending', 'rejected']),
  now: z.coerce.date().optional(),
})

// Puts this period's submission into a state only photo review could produce
// today, to test that pending blocks completion and rejected can be redone.
export default defineEventHandler(async (event) => {
  const user = requireDevUser(event)
  const { status, now = new Date() } = await readValidatedBody(event, bodySchema.parse)
  const questId = getRouterParam(event, 'id') ?? ''
  const current = getQuestCompletionStatus(user.id, questId, now)

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Quest not found' })
  }

  const values = { status, submittedAt: now, reviewedAt: status === 'rejected' ? now : null }
  db.insert(submissions)
    .values({ ...values, userId: user.id, activityId: questId, periodKey: current.periodKey })
    .onConflictDoUpdate({
      target: [submissions.userId, submissions.activityId, submissions.periodKey],
      set: values,
    })
    .run()

  return getQuestCompletionStatus(user.id, questId, now)
})
