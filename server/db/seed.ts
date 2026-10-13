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


const SAMPLE_QUESTS = [
  {
    title: 'Drink 8 glasses of water',
    description: 'Stay hydrated: drink at least 8 glasses of water today.',
    recurrence: 'daily',
  },
  {
    title: 'Limit screen time',
    description: 'Keep your non-school screen time under 2 hours today.',
    recurrence: 'daily',
  },
  {
    title: 'Complete a stress check-in',
    description: 'Take a minute to check in on how stressed you are feeling today.',
    recurrence: 'daily',
  },
] as const

async function seedQuests() {

  db.insert(schema.rewardRules)
    .values({ actionCode: 'QUEST_COMPLETE', coinAmount: 10 })
    .onConflictDoNothing({ target: schema.rewardRules.actionCode })
    .run()

  const rule = await db.query.rewardRules.findFirst({
    where: (r, { eq }) => eq(r.actionCode, 'QUEST_COMPLETE'),
  })

  if (!rule) {
    throw new Error('QUEST_COMPLETE reward rule is missing')
  }

  for (const quest of SAMPLE_QUESTS) {
    const existing = await db.query.activities.findFirst({
      where: (a, { and, eq }) => and(eq(a.title, quest.title), eq(a.activityType, 'quest')),
    })

    if (existing) continue

    db.insert(schema.activities)
      .values({
        ...quest,
        rewardRuleId: rule.id,
        activityType: 'quest',
        evidenceType: 'self_report',
      })
      .run()
  }

  console.log(`Sample quests ready (${SAMPLE_QUESTS.length}).`)
}

async function main() {
  console.log('Start seeding...')

  await seedUser()
  await seedQuests()

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
