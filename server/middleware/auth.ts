import { eq } from 'drizzle-orm'
import { auth } from '~~/server/utils/auth'
import { db } from '~~/server/utils/db'
import { user } from '~~/server/db/schema'

// API paths that must stay reachable without a session. Better Auth's own
// endpoints (sign-up, sign-in, verify-email, get-session, token, jwks, etc.)
// live under /api/auth.
const PUBLIC_PREFIXES = ['/api/auth', '/api/health']

// Make the resolved session available to every downstream handler so routes
// can read event.context.user / event.context.session instead of calling
// auth.api.getSession() themselves. `session` is only set for cookie-based
// requests; a JWT carries no session row.
declare module 'h3' {
  interface H3EventContext {
    user?: typeof auth.$Infer.Session.user
    session?: typeof auth.$Infer.Session.session
  }
}

// Resolves `Authorization: Bearer <jwt>` to its user. Returns null when the
// token is invalid or expired, or its user no longer exists.
async function getJwtUser(token: string) {
  const { payload } = await auth.api.verifyJWT({ body: { token } })

  if (!payload) {
    return null
  }

  const [record] = await db.select().from(user).where(eq(user.id, payload.sub))

  return record ?? null
}

export default defineEventHandler(async (event) => {
  // Only guard server API routes. Page navigation and assets are handled by
  // the client route middleware (app/middleware/auth.global.ts).
  if (!event.path.startsWith('/api/')) {
    return
  }

  const pathname = event.path.split('?')[0] ?? event.path

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return
  }

  // A request that presents a JWT is judged on that JWT alone — a bad token is
  // a 401 even if a session cookie also came along.
  const authorization = getHeader(event, 'authorization')

  if (authorization?.startsWith('Bearer ')) {
    const jwtUser = await getJwtUser(authorization.slice('Bearer '.length))

    if (!jwtUser) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    event.context.user = jwtUser
    return
  }

  // Otherwise fall back to the session cookie the Nuxt app itself uses.
  const session = await auth.api.getSession({
    headers: event.headers,
  })

  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  event.context.user = session.user
  event.context.session = session.session
})
