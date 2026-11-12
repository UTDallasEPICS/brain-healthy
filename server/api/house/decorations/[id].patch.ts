import { requireUser } from '~~/server/utils/session'
import { updateEquippedDecoration } from '~~/server/utils/decorationService'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<{
    equipped?: unknown
    positionX?: unknown
    positionY?: unknown
    rotation?: unknown
  }>(event)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Decoration ID is required' })
  if (typeof body?.equipped !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'equipped must be a boolean' })
  }
  for (const key of ['positionX', 'positionY'] as const) {
    const value = body[key]
    if (
      value !== undefined &&
      (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)
    ) {
      throw createError({ statusCode: 400, statusMessage: `${key} must be between 0 and 100` })
    }
  }
  if (
    body.rotation !== undefined &&
    (typeof body.rotation !== 'number' ||
      !Number.isFinite(body.rotation) ||
      body.rotation < -360 ||
      body.rotation > 360)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'rotation must be between -360 and 360' })
  }
  const placement = {
    ...(body.positionX === undefined ? {} : { positionX: body.positionX as number }),
    ...(body.positionY === undefined ? {} : { positionY: body.positionY as number }),
    ...(body.rotation === undefined ? {} : { rotation: body.rotation as number }),
  }
  return updateEquippedDecoration(requireUser(event).id, id, body.equipped, placement)
})
