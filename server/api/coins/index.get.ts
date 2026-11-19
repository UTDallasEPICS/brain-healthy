import { requireUser } from '~~/server/utils/session'
import { getCoinSummary } from '~~/server/utils/coinService'

export default defineEventHandler((event) => getCoinSummary(requireUser(event).id))
