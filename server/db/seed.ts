import 'dotenv/config'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { hashPassword } from 'better-auth/crypto'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!.replace('file:', '')
const sqlite = new Database(connectionString)
// Separate connection from server/utils/db.ts, so it needs the pragma too —
// otherwise seeded rows can reference records that do not exist.
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

// A verified UTD user that can sign in with email + password. The password comes
// from SEED_USER_PASSWORD rather than this file, because the deploy workflow can
// run the seed against stage/prod too — no environment gets a known password.
const SEED_USER_EMAIL = 'seeded-user@utdallas.edu'

async function seedUser() {
  const password = process.env.SEED_USER_PASSWORD

  if (!password) {
    console.log('SEED_USER_PASSWORD not set; skipping the seeded user.')
    return
  }

  const existingUser = await db.query.user.findFirst({
    where: (user, { eq }) => eq(user.email, SEED_USER_EMAIL),
  })

  if (existingUser) {
    console.log({ user: existingUser })
    return
  }

  // Same shape Better Auth writes on sign-up: the user, plus a 'credential'
  // account holding the password hash, keyed by the user's id.
  const hashed = await hashPassword(password)

  const created = db.transaction((tx) => {
    const [created] = tx
      .insert(schema.user)
      .values({
        email: SEED_USER_EMAIL,
        name: 'Sample Seeded User',
        emailVerified: true,
      })
      .returning()
      .all()

    tx.insert(schema.account)
      .values({
        accountId: created!.id,
        providerId: 'credential',
        userId: created!.id,
        password: hashed,
      })
      .run()

    return created
  })

  console.log({ user: created })
}

async function main() {
  console.log('Start seeding...')

  await seedUser()

  console.log('Seeding finished.')
}

main()
  .then(() => {
    sqlite.close()
  })
  .catch((e) => {
    console.error(e)
    sqlite.close()
    process.exit(1)
  })
