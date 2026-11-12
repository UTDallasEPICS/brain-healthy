import { requireUser } from '~~/server/utils/session'
import { getShop } from '~~/server/utils/decorationService'

export default defineEventHandler((event) => getShop(requireUser(event).id))
