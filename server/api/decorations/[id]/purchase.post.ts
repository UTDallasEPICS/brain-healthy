import { requireUser } from '~~/server/utils/session'
import { purchaseDecoration } from '~~/server/utils/decorationService'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Decoration ID is required' })
  return purchaseDecoration(requireUser(event).id, id)
})
