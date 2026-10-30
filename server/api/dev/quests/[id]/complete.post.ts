import { z } from 'zod'
import { requireDevUser } from '~~/server/utils/devTools'
import { completeQuest } from '~~/server/utils/questService'

const bodySchema = z.object({ now: z.coerce.date().optional() })

// POST /api/quests/:id/complete at a simulated time, to test period rollover.
export default defineEventHandler(async (event) => {
  const user = requireDevUser(event)
  const { now } = await readValidatedBody(event, bodySchema.parse)
  return completeQuest(user.id, getRouterParam(event, 'id') ?? '', now)
})
