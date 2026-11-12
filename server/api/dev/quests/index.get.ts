import { z } from 'zod'
import { requireDevUser } from '~~/server/utils/devTools'
import { getAvailableQuests } from '~~/server/utils/questService'

const querySchema = z.object({ now: z.coerce.date().optional() })

// GET /api/quests, as seen at a simulated time.
export default defineEventHandler(async (event) => {
  const user = requireDevUser(event)
  const { now } = await getValidatedQuery(event, querySchema.parse)
  return getAvailableQuests(user.id, now)
})
