import 'dotenv/config'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
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

const REWARD_RULE_SEEDS = [
  { actionCode: 'QUEST_COMPLETE', coinAmount: 1, enabled: true },
  { actionCode: 'EVENT_PARTICIPATION', coinAmount: 5, enabled: true },
  { actionCode: 'SOCIAL_NUDGE', coinAmount: 5, enabled: false },
  { actionCode: 'VERIFIED_REFERRAL', coinAmount: 30, enabled: true },
] as const

// Starter wellness quests. Fixed ids keep re-seeding idempotent and let the
// content be edited in the database without a duplicate appearing next run.
const QUEST_SEEDS = [
  {
    id: 'seed-quest-hydration',
    title: 'Hydration check-in',
    description: 'Drink a full glass of water and check in.',
    recurrence: 'daily',
  },
  {
    id: 'seed-quest-screen-break',
    title: 'Screen-time break',
    description: 'Put your phone away for one hour without checking it.',
    recurrence: 'daily',
  },
  {
    id: 'seed-quest-stress-check-in',
    title: 'Stress check-in',
    description: 'Pause, take three slow breaths, and notice how you are feeling today.',
    recurrence: 'daily',
  },
  {
    id: 'seed-quest-screen-free-evening',
    title: 'Screen-free evening',
    description: 'Spend one evening this week without recreational screens.',
    recurrence: 'weekly',
  },
  {
    id: 'seed-quest-intro-lesson',
    title: 'Intro to stress quests',
    description: 'Learn how small daily habits support brain health.',
    recurrence: 'once',
  },
] as const

function seedRewardRules() {
  for (const rule of REWARD_RULE_SEEDS) {
    db.insert(schema.rewardRules).values(rule).onConflictDoNothing().run()
  }
}

function seedQuests() {
  const questRule = db
    .select({ id: schema.rewardRules.id })
    .from(schema.rewardRules)
    .where(eq(schema.rewardRules.actionCode, 'QUEST_COMPLETE'))
    .get()

  if (!questRule) {
    throw new Error('QUEST_COMPLETE reward rule is missing; cannot seed quests.')
  }

  for (const quest of QUEST_SEEDS) {
    db.insert(schema.activities)
      .values({
        ...quest,
        rewardRuleId: questRule.id,
        activityType: 'quest',
        evidenceType: 'self_report',
      })
      .onConflictDoNothing()
      .run()
  }
}

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

  seedRewardRules()
  seedQuests()
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
