import { z } from 'zod'
import { requireUser } from '~~/server/utils/session'
import { getCoinTransactions, MAX_COIN_HISTORY_LIMIT } from '~~/server/utils/coinService'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_COIN_HISTORY_LIMIT).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// Newest first. Only ever the caller's own ledger — the user id comes from the
// session, never from the request.
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const query = await getValidatedQuery(event, querySchema.parse)
  return getCoinTransactions(user.id, query)
})
