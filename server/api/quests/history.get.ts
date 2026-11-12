import { z } from 'zod'
import { requireUser } from '~~/server/utils/session'
import { getQuestHistory, MAX_QUEST_HISTORY_LIMIT } from '~~/server/utils/questService'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_QUEST_HISTORY_LIMIT).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// Newest first. Only ever the caller's own completions.
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const query = await getValidatedQuery(event, querySchema.parse)
  return getQuestHistory(user.id, query)
})
