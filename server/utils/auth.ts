import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt } from 'better-auth/plugins/jwt'
import { db } from './db'
import { env } from './env'
import { isUtdEmail } from '../../shared/utils/email-domain'
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: 587,
  secure: false,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
})

function assertUtdEmail(email: string) {
  if (!isUtdEmail(email)) {
    throw new APIError('BAD_REQUEST', { message: 'A @utdallas.edu email address is required' })
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
  }),
  // Every user signs up with an email and password. The password is hashed by
  // Better Auth and stored on the user's 'credential' account row.
  emailAndPassword: {
    enabled: true,
    // Without this, anyone could claim any @utdallas.edu address. Sign-in is
    // refused until the link in the verification email has been opened.
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    // An unverified user who tries to sign in gets a fresh link, so a lost
    // email is not a dead end.
    sendOnSignIn: true,
    // Opening the link signs the user in, so they land on the app directly.
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: user.email,
        subject: 'Verify your email for brain-healthy',
        html: `<p>Click <a href="${url}">here</a> to verify your email address.</p>`,
      })
    },
  },
  // The UTD domain gate. Hooks rather than a check in one endpoint, so no
  // sign-up or email-change path can get around it.
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          assertUtdEmail(user.email)
        },
      },
      update: {
        async before(user) {
          if (user.email) {
            assertUtdEmail(user.email)
          }
        },
      },
    },
  },
  plugins: [
    // Issues short-lived (15 min) JWTs signed with a key pair stored in the
    // jwks table. A signed-in client gets one from GET /api/auth/token or the
    // `set-auth-jwt` header on get-session, and sends it as
    // `Authorization: Bearer <jwt>`; server/middleware/auth.ts verifies it.
    // Public keys are published at /api/auth/jwks.
    jwt({
      jwt: {
        // `sub` is always the user id. Keep the rest of the claims to what a
        // consumer needs — the default would include every user column.
        definePayload: ({ user }) => ({
          email: user.email,
          name: user.name,
        }),
      },
    }),
  ],
})
