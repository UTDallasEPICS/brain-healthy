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
  { actionCode: 'LESSON_COMPLETE', coinAmount: 5, enabled: true },
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
  {
    id: 'seed-quest-sleep-lesson',
    title: 'Sleep and your brain',
    description: 'Watch the sleep lesson and pass its quiz.',
    recurrence: 'once',
  },
] as const

// Placeholder lessons until the client provides real videos. Each question
// lists its options with the correct one first; seedLessons stores the flag.
const LESSON_SEEDS = [
  {
    id: 'seed-lesson-stress',
    activityId: 'seed-quest-intro-lesson',
    title: 'Managing everyday stress',
    description: 'A short guided breathing exercise and why it calms the nervous system.',
    videoUrl: 'https://www.youtube.com/watch?v=inpok4MKVLM',
    questions: [
      [
        'Slow, deep breathing mainly helps by…',
        'Calming the nervous system',
        'Raising heart rate',
        'Increasing caffeine absorption',
      ],
      [
        'A good first step when you feel stressed is to…',
        'Pause and notice how you feel',
        'Ignore it completely',
        'Skip your next meal',
      ],
      [
        'Short daily habits are effective because…',
        'Small actions add up over time',
        'They only work once',
        'They replace sleep',
      ],
      [
        'Which is a healthy stress-relief habit?',
        'A short walk outside',
        'Scrolling until 3am',
        'Skipping water all day',
      ],
      [
        'How often should you check in on your stress?',
        'Regularly, like once a day',
        'Never',
        'Only during finals',
      ],
    ],
  },
  {
    id: 'seed-lesson-sleep',
    activityId: 'seed-quest-sleep-lesson',
    title: 'Sleep and your brain',
    description: 'How sleep supports memory, focus, and mood.',
    videoUrl: 'https://www.youtube.com/watch?v=5MuIMqhT8DM',
    questions: [
      [
        'Sleep helps the brain by…',
        'Consolidating memories',
        'Erasing everything learned',
        'Stopping all activity',
      ],
      ['How much sleep do most young adults need?', '7–9 hours', '3–4 hours', '12–14 hours'],
      [
        'Which habit improves sleep quality?',
        'A consistent bedtime',
        'Screens right before bed',
        'Late-night caffeine',
      ],
      [
        'Pulling an all-nighter before an exam usually…',
        'Hurts recall and focus',
        'Doubles memory',
        'Has no effect',
      ],
      [
        'A good wind-down routine might include…',
        'Dim lights and no screens',
        'An intense workout at midnight',
        'Energy drinks',
      ],
    ],
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

function seedLessons() {
  LESSON_SEEDS.forEach(({ questions, ...lesson }, lessonIndex) => {
    db.insert(schema.lessons)
      .values({ ...lesson, sortOrder: lessonIndex })
      .onConflictDoNothing()
      .run()

    questions.forEach(([prompt, correct, ...wrong], questionIndex) => {
      // Rotate where the correct option lands so it isn't always first.
      const options: string[] = [...wrong]
      options.splice(questionIndex % (wrong.length + 1), 0, correct)
      const questionId = `${lesson.id}-q${questionIndex + 1}`
      db.insert(schema.quizQuestions)
        .values({ id: questionId, lessonId: lesson.id, prompt, sortOrder: questionIndex })
        .onConflictDoNothing()
        .run()

      options.forEach((label, optionIndex) => {
        db.insert(schema.quizAnswerOptions)
          .values({
            id: `${questionId}-o${optionIndex + 1}`,
            questionId,
            label,
            isCorrect: label === correct,
          })
          .onConflictDoNothing()
          .run()
      })
    })
  })
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
  seedLessons()
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
