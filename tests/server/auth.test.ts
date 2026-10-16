// @vitest-environment node
//
// Integration tests for authentication: the real Better Auth config
// (server/utils/auth.ts) behind the real API gateway (server/middleware/auth.ts),
// driven with real HTTP requests.
//
// Still true to the baseline (docs/testing.md): no .env, no database file, no
// real email. The database is in-memory SQLite with the project's migrations
// applied, and nodemailer is mocked so every "sent" email is captured instead.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import {
  createApp,
  createRouter,
  createError,
  defineEventHandler,
  getHeader,
  toWebHandler,
  toWebRequest,
} from 'h3'

// Runs before any import below: env.ts reads process.env at load (and skips
// validation under Vitest), and db.ts opens DATABASE_URL at load.
const { sendMail } = vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: ':memory:',
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    BETTER_AUTH_URL: 'http://localhost:3000',
    EMAIL_HOST: 'smtp.test',
    EMAIL_USER: 'test',
    EMAIL_PASS: 'test',
    EMAIL_FROM: 'noreply@test',
  })
  return { sendMail: vi.fn(async () => ({})) }
})

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}))

const BASE = 'http://localhost:3000'
const PASSWORD = 'correct-horse-battery'

let request: (path: string, init?: RequestInit) => Promise<Response>
let auth: typeof import('../../server/utils/auth').auth
let db: typeof import('../../server/utils/db').db
let schema: typeof import('../../server/db/schema')

beforeAll(async () => {
  // The gateway relies on Nitro's auto-imports; provide the same h3 functions.
  vi.stubGlobal('defineEventHandler', defineEventHandler)
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('getHeader', getHeader)

  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  ;({ db } = await import('../../server/utils/db'))
  migrate(db, { migrationsFolder: 'drizzle' })

  ;({ auth } = await import('../../server/utils/auth'))
  schema = await import('../../server/db/schema')
  const gateway = (await import('../../server/middleware/auth')).default

  // The same shape as the running app: the gateway in front of every route,
  // Better Auth mounted like server/api/auth/[...all].ts, a public health route,
  // and one protected route that reports who the gateway decided the caller is.
  const router = createRouter()
    .use(
      '/api/auth/**',
      defineEventHandler((event) => auth.handler(toWebRequest(event)))
    )
    .get(
      '/api/health',
      defineEventHandler(() => ({ ok: true }))
    )
    .get(
      '/api/me',
      defineEventHandler((event) => ({
        email: event.context.user?.email,
        hasSession: Boolean(event.context.session),
      }))
    )

  const app = createApp().use(gateway).use(router)
  const handler = toWebHandler(app)
  request = (path, init) => handler(new Request(BASE + path, init))
})

beforeEach(() => {
  sendMail.mockClear()
})

// Better Auth rejects POSTs whose Origin is not the app's own URL (CSRF).
function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, ...headers },
    body: JSON.stringify(body),
  })
}

// Turns a response's Set-Cookie headers into a Cookie request header.
function cookieFrom(res: Response) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

// The verification link from the most recent email sent to `to`.
function verificationLinkSentTo(to: string) {
  const mail = sendMail.mock.calls
    .map(([m]) => m as { to: string; html: string })
    .findLast((m) => m.to === to)
  const href = mail?.html.match(/href="([^"]+)"/)?.[1]
  if (!href) throw new Error(`No verification email sent to ${to}`)
  return href.replace(BASE, '')
}

async function findUser(email: string) {
  return db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, email) })
}

// Signs a fresh user up and verifies them; returns their session cookie.
async function createVerifiedUser(email: string) {
  await post('/api/auth/sign-up/email', { name: 'Test User', email, password: PASSWORD })
  const res = await request(verificationLinkSentTo(email))
  return cookieFrom(res)
}

async function getJwt(cookie: string) {
  const res = await request('/api/auth/token', { headers: { cookie } })
  return ((await res.json()) as { token: string }).token
}

function decodeClaims(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString())
}

describe('UTD email restriction', () => {
  it.each(['someone@gmail.com', 'someone@evilutdallas.edu', 'someone@utdallas.edu.co'])(
    'rejects sign-up with %s and sends nothing',
    async (email) => {
      const res = await post('/api/auth/sign-up/email', { name: 'X', email, password: PASSWORD })

      expect(res.status).toBe(400)
      expect(await findUser(email)).toBeUndefined()
      expect(sendMail).not.toHaveBeenCalled()
    }
  )

  it('blocks changing an existing user to a non-UTD email', async () => {
    await createVerifiedUser('changer@utdallas.edu')
    const user = await findUser('changer@utdallas.edu')
    const { internalAdapter } = await auth.$context

    await expect(
      internalAdapter.updateUser(user!.id, { email: 'changer@gmail.com' })
    ).rejects.toThrow(/utdallas\.edu/)
    expect((await findUser('changer@utdallas.edu'))?.email).toBe('changer@utdallas.edu')
  })
})

describe('sign-up and email verification', () => {
  const email = 'newstudent@utdallas.edu'

  it('creates an unverified user with a hashed password and emails a link', async () => {
    const res = await post('/api/auth/sign-up/email', {
      name: 'New Student',
      email,
      password: PASSWORD,
    })

    expect(res.status).toBe(200)
    // Not signed in until verified.
    expect(cookieFrom(res)).not.toContain('session_token')

    const user = await findUser(email)
    expect(user?.emailVerified).toBe(false)

    const account = await db.query.account.findFirst({
      where: (a, { eq }) => eq(a.userId, user!.id),
    })
    expect(account?.providerId).toBe('credential')
    expect(account?.password).toBeTruthy()
    expect(account?.password).not.toContain(PASSWORD)

    expect(sendMail).toHaveBeenCalledOnce()
    expect(verificationLinkSentTo(email)).toMatch(/^\/api\/auth\/verify-email\?token=/)
  })

  it('refuses sign-in before verification and sends a fresh link', async () => {
    const res = await post('/api/auth/sign-in/email', { email, password: PASSWORD })

    expect(res.status).toBe(403)
    expect(cookieFrom(res)).not.toContain('session_token')
    expect(sendMail).toHaveBeenCalledOnce()
  })

  it('verifies the email, signs the user in, and redirects to the app', async () => {
    await post('/api/auth/sign-in/email', { email, password: PASSWORD })
    const res = await request(verificationLinkSentTo(email))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    expect(cookieFrom(res)).toContain('session_token')
    expect((await findUser(email))?.emailVerified).toBe(true)
  })

  it('rejects a tampered verification link', async () => {
    const res = await request('/api/auth/verify-email?token=not-a-real-token')

    expect(res.status).not.toBe(302)
    expect(cookieFrom(res)).not.toContain('session_token')
  })
})

describe('sign-in', () => {
  const email = 'signin@utdallas.edu'

  beforeAll(async () => {
    await createVerifiedUser(email)
  })

  it('rejects a wrong password', async () => {
    const res = await post('/api/auth/sign-in/email', { email, password: 'wrong-password-123' })

    expect(res.status).toBe(401)
    expect(cookieFrom(res)).not.toContain('session_token')
  })

  it('signs in with the right password', async () => {
    const res = await post('/api/auth/sign-in/email', { email, password: PASSWORD })

    expect(res.status).toBe(200)
    expect(cookieFrom(res)).toContain('session_token')
  })
})

describe('API gateway', () => {
  const email = 'gateway@utdallas.edu'
  let cookie: string
  let jwt: string

  beforeAll(async () => {
    cookie = await createVerifiedUser(email)
    jwt = await getJwt(cookie)
  })

  it('lets public routes through without credentials', async () => {
    expect((await request('/api/health')).status).toBe(200)
    expect((await request('/api/auth/jwks')).status).toBe(200)
  })

  it('rejects a protected route without credentials', async () => {
    expect((await request('/api/me')).status).toBe(401)
  })

  it('accepts the session cookie', async () => {
    const res = await request('/api/me', { headers: { cookie } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email, hasSession: true })
  })

  it('issues a 15-minute JWT carrying only id, email, and name', async () => {
    const claims = decodeClaims(jwt)
    const user = await findUser(email)

    expect(claims.sub).toBe(user!.id)
    expect(claims.email).toBe(email)
    expect(claims.name).toBe('Test User')
    expect(claims.exp - claims.iat).toBe(15 * 60)
    expect(claims).not.toHaveProperty('image')
    expect(claims).not.toHaveProperty('role')
  })

  it('accepts a valid Bearer JWT', async () => {
    const res = await request('/api/me', { headers: { authorization: `Bearer ${jwt}` } })

    expect(res.status).toBe(200)
    // A JWT carries no session row.
    expect(await res.json()).toEqual({ email, hasSession: false })
  })

  it('rejects a JWT whose payload was altered', async () => {
    const [header, , signature] = jwt.split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...decodeClaims(jwt), sub: 'someone-else' })
    ).toString('base64url')

    const res = await request('/api/me', {
      headers: { authorization: `Bearer ${header}.${forged}.${signature}` },
    })

    expect(res.status).toBe(401)
  })

  it('rejects a malformed JWT', async () => {
    const res = await request('/api/me', { headers: { authorization: 'Bearer not-a-jwt' } })

    expect(res.status).toBe(401)
  })

  it('rejects a bad JWT even when a valid session cookie is also sent', async () => {
    const res = await request('/api/me', {
      headers: { authorization: 'Bearer not-a-jwt', cookie },
    })

    expect(res.status).toBe(401)
  })

  it('rejects a valid JWT whose user has been deleted', async () => {
    const doomedCookie = await createVerifiedUser('deleted@utdallas.edu')
    const doomedJwt = await getJwt(doomedCookie)
    const { eq } = await import('drizzle-orm')
    await db.delete(schema.user).where(eq(schema.user.email, 'deleted@utdallas.edu'))

    const res = await request('/api/me', { headers: { authorization: `Bearer ${doomedJwt}` } })

    expect(res.status).toBe(401)
  })
})
