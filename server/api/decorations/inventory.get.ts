import { requireUser } from '~~/server/utils/session'
import { getUserInventory } from '~~/server/utils/decorationService'

export default defineEventHandler((event) => getUserInventory(requireUser(event).id))
