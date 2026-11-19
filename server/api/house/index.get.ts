import { requireUser } from '~~/server/utils/session'
import { getHouse } from '~~/server/utils/decorationService'

export default defineEventHandler((event) => getHouse(requireUser(event).id))
