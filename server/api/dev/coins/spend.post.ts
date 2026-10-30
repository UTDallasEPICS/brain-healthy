import { z } from 'zod'
import { requireDevUser } from '~~/server/utils/devTools'
import { getCoinBalance, spendCoins } from '~~/server/utils/coinService'

const bodySchema = z.object({
  amount: z.number().int().min(0),
  reason: z.string().min(1),
  referenceId: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const user = requireDevUser(event)
  const { amount, reason, referenceId } = await readValidatedBody(event, bodySchema.parse)
  const applied = spendCoins(user.id, amount, reason, referenceId)
  return { applied, balance: getCoinBalance(user.id) }
})
