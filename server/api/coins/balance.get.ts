import { requireUser } from '~~/server/utils/session'
import { getCoinBalance } from '~~/server/utils/coinService'

export default defineEventHandler((event) => {
  const user = requireUser(event)
  return { balance: getCoinBalance(user.id) }
})
