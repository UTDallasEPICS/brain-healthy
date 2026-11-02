import { requireUser } from '~~/server/utils/session'
import { getCoinTransactions } from '~~/server/utils/coinService'

// The signed-in user's coin history, newest first. Like the balance route, the
// user id comes only from the session.
export default defineEventHandler((event) => {
  const user = requireUser(event)

  return getCoinTransactions(user.id).map((t) => ({
    id: t.id,
    amount: t.amount,
    transactionType: t.transactionType,
    // The source key (e.g. submission:<id>) is what the coins were for.
    reason: t.sourceKey,
    createdAt: t.createdAt,
  }))
})
