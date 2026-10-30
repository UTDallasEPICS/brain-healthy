// @vitest-environment node
//
// The /api/dev/* routes can award coins, edit reward rules, and delete data, so
// they must not exist outside `nuxt dev`. import.meta.dev is false here, as in
// a production build — so every one of them must answer 404, even for a
// signed-in user, and must do so before touching the database.

import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  type EventHandler,
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getRouterParam,
  getValidatedQuery,
  readValidatedBody,
  toWebHandler,
} from 'h3'

vi.mock('../server/utils/db', () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error('dev route touched the database outside dev mode')
      },
    }
  ),
}))

vi.stubGlobal('createError', createError)
vi.stubGlobal('defineEventHandler', defineEventHandler)
vi.stubGlobal('getRouterParam', getRouterParam)
vi.stubGlobal('getValidatedQuery', getValidatedQuery)
vi.stubGlobal('readValidatedBody', readValidatedBody)

// Each route with the path it is mounted at; imported statically because Vite
// cannot resolve a dynamic import whose variable spans directories.
const routes = [
  ['post', '/api/dev/coins/award', () => import('../server/api/dev/coins/award.post')],
  ['post', '/api/dev/coins/spend', () => import('../server/api/dev/coins/spend.post')],
  ['post', '/api/dev/rewards/grant', () => import('../server/api/dev/rewards/grant.post')],
  [
    'patch',
    '/api/dev/rewards/:actionCode',
    () => import('../server/api/dev/rewards/[actionCode].patch'),
  ],
  ['post', '/api/dev/referrals', () => import('../server/api/dev/referrals.post')],
  ['get', '/api/dev/quests', () => import('../server/api/dev/quests/index.get')],
  [
    'post',
    '/api/dev/quests/:id/complete',
    () => import('../server/api/dev/quests/[id]/complete.post'),
  ],
  [
    'post',
    '/api/dev/quests/:id/submission',
    () => import('../server/api/dev/quests/[id]/submission.post'),
  ],
  ['post', '/api/dev/reset', () => import('../server/api/dev/reset.post')],
] as const

describe('dev-only routes outside dev mode', () => {
  const handlers = new Map<string, EventHandler>()

  // The first import pulls in the schema and zod, which can outlast a test's
  // timeout on a cold run; hooks get the longer hookTimeout.
  beforeAll(async () => {
    for (const [, route, load] of routes) {
      handlers.set(route, (await load()).default)
    }
  })

  it.each(routes)('%s %s answers 404', async (method, route) => {
    const handler = handlers.get(route)!
    const path = route.replace(':actionCode', 'QUEST_COMPLETE').replace(':id', 'some-quest')
    const app = createApp()
      .use(
        defineEventHandler((event) => {
          event.context.user = { id: 'user-1' } as never
        })
      )
      .use(createRouter()[method](route, handler))

    const response = await toWebHandler(app)(
      new Request(`http://localhost${path}`, {
        method: method.toUpperCase(),
        headers: { 'content-type': 'application/json' },
        body: method === 'get' ? undefined : JSON.stringify({ amount: 1000 }),
      })
    )

    expect(response.status).toBe(404)
  })
})
