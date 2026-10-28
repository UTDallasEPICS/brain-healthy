import { requireUser } from '~~/server/utils/session'
import { getCoinBalance } from '~~/server/utils/coinService'

// The signed-in user's coin balance. The user id comes only from the session,
// so there is no way to ask for someone else's balance.
export default defineEventHandler((event) => {
  const user = requireUser(event)

  return { balance: getCoinBalance(user.id) }
})
