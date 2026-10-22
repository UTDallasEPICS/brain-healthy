import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '~~/server/utils/db'
import { activities, rewardRules, submissions } from '~~/server/db/schema'
import { getCoinBalance } from '~~/server/utils/coinService'
import { grantActivityReward } from '~~/server/utils/rewardService'

type Recurrence = (typeof activities.$inferSelect)['recurrence']

// A pending or approved submission means "done for this period".
// A rejected one can be resubmitted, so it doesn't count.
// (Waiting on confirmation from the issue author.)
const COUNTED_STATUSES: Array<'pending' | 'approved'> = ['pending', 'approved']

// Builds the same period_key the submissions table uses:
// 'YYYY-MM-DD' in Chicago time for daily quests, 'once' for one-time quests.
export function getPeriodKey(recurrence: Recurrence, now: Date = new Date()): string {
  if (recurrence === 'once') return 'once'
  // The en-CA locale formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

// Only active quests (not events)
const isActiveQuest = and(eq(activities.activityType, 'quest'), eq(activities.active, true))

const questFields = {
  id: activities.id,
  name: activities.title,
  description: activities.description,
  frequency: activities.recurrence,
}

// GET /api/quests — all quests + whether this user already did each one this period
export async function getAvailableQuests(userId: string, now: Date = new Date()) {
  const quests = await db.select(questFields).from(activities).where(isActiveQuest)
  if (quests.length === 0) return []

  const userSubs = await db
    .select({ activityId: submissions.activityId, periodKey: submissions.periodKey })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        inArray(submissions.status, COUNTED_STATUSES),
        inArray(submissions.activityId, quests.map((q) => q.id)),
      ),
    )

  const done = new Set(userSubs.map((s) => `${s.activityId}:${s.periodKey}`))

  return quests.map((q) => ({
    ...q,
    completedThisPeriod: done.has(`${q.id}:${getPeriodKey(q.frequency, now)}`),
  }))
}

// GET /api/quests/:id — one quest with its reward. Returns null if not found.
export async function getQuestById(questId: string) {
  const [quest] = await db
    .select({ ...questFields, coinAmount: rewardRules.coinAmount, rewardEnabled: rewardRules.enabled })
    .from(activities)
    .innerJoin(rewardRules, eq(activities.rewardRuleId, rewardRules.id))
    .where(and(eq(activities.id, questId), isActiveQuest))

  if (!quest) return null

  const { coinAmount, rewardEnabled, ...rest } = quest
  return { ...rest, reward: rewardEnabled ? coinAmount : 0 }
}

// GET /api/quests/history — this user's quest submissions, newest first
export async function getQuestHistory(userId: string) {
  return db
    .select({
      questId: submissions.activityId,
      questName: activities.title,
      status: submissions.status,
      completedAt: submissions.submittedAt,
    })
    .from(submissions)
    .innerJoin(activities, eq(submissions.activityId, activities.id))
    .where(and(eq(submissions.userId, userId), eq(activities.activityType, 'quest')))
    .orderBy(desc(submissions.submittedAt))
}

// Can this user complete this quest right now?
export async function isQuestEligible(userId: string, questId: string, now: Date = new Date()) {
  const [quest] = await db
    .select({ recurrence: activities.recurrence, startsAt: activities.startsAt, endsAt: activities.endsAt })
    .from(activities)
    .where(and(eq(activities.id, questId), isActiveQuest))

  if (!quest) return false
  if (quest.startsAt && now < quest.startsAt) return false
  if (quest.endsAt && now > quest.endsAt) return false

  const [existing] = await db
    .select({ status: submissions.status })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        eq(submissions.activityId, questId),
        eq(submissions.periodKey, getPeriodKey(quest.recurrence, now)),
      ),
    )

  return !existing || existing.status === 'rejected'
}
// This period's submission for a quest, or status null if the user hasn't
// submitted. Returns null if the quest doesn't exist or isn't active.
export async function getQuestCompletionStatus(
  userId: string,
  questId: string,
  now: Date = new Date(),
) {
  const [quest] = await db
    .select({ recurrence: activities.recurrence })
    .from(activities)
    .where(and(eq(activities.id, questId), isActiveQuest))

  if (!quest) return null

  const periodKey = getPeriodKey(quest.recurrence, now)
  const [existing] = await db
    .select({ status: submissions.status, submittedAt: submissions.submittedAt })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        eq(submissions.activityId, questId),
        eq(submissions.periodKey, periodKey),
      ),
    )

  return {
    questId,
    periodKey,
    status: existing?.status ?? null,
    submittedAt: existing?.submittedAt ?? null,
  }
}

// POST /api/quests/:id/complete — records the completion and awards coins in
// one transaction, so neither can be saved without the other. The checks mirror
// isQuestEligible but run inside the transaction, so two simultaneous requests
// can't both pass them. Must stay synchronous: no await inside db.transaction.
export function completeQuest(userId: string, questId: string, now: Date = new Date()) {
  const result = db.transaction(
    (tx) => {
      const quest = tx
        .select({
          recurrence: activities.recurrence,
          evidenceType: activities.evidenceType,
          startsAt: activities.startsAt,
          endsAt: activities.endsAt,
        })
        .from(activities)
        .where(and(eq(activities.id, questId), isActiveQuest))
        .get()

      if (!quest) {
        throw createError({ statusCode: 404, statusMessage: 'Quest not found' })
      }

      // Photo quests need a reviewer before coins are paid; that flow is separate.
      if (quest.evidenceType !== 'self_report') {
        throw createError({
          statusCode: 400,
          statusMessage: 'This quest requires a photo submission',
        })
      }

      if ((quest.startsAt && now < quest.startsAt) || (quest.endsAt && now > quest.endsAt)) {
        throw createError({ statusCode: 409, statusMessage: 'Quest is not available right now' })
      }

      const periodKey = getPeriodKey(quest.recurrence, now)
      const existing = tx
        .select({ id: submissions.id, status: submissions.status })
        .from(submissions)
        .where(
          and(
            eq(submissions.userId, userId),
            eq(submissions.activityId, questId),
            eq(submissions.periodKey, periodKey),
          ),
        )
        .get()

      if (existing && existing.status !== 'rejected') {
        throw createError({
          statusCode: 409,
          statusMessage: 'Quest already completed for this period',
        })
      }

      // The unique (user, activity, period) index means a rejected submission is
      // reused rather than a second row inserted.
      let submissionId: string
      if (existing) {
        tx.update(submissions)
          .set({ status: 'approved', submittedAt: now, reviewedBy: null, reviewedAt: null })
          .where(eq(submissions.id, existing.id))
          .run()
        submissionId = existing.id
      } else {
        submissionId = tx
          .insert(submissions)
          .values({ userId, activityId: questId, periodKey, status: 'approved', submittedAt: now })
          .returning({ id: submissions.id })
          .get().id
      }

      const reward = grantActivityReward(userId, 'individual_quest_completion', submissionId, tx)

      return { questId, periodKey, completed: true, coinsEarned: reward.amount }
    },
    { behavior: 'immediate' },
  )

  return { ...result, balance: getCoinBalance(userId) }
}
