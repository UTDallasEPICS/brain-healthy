import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { activities, rewardRules, submissions, type SUBMISSION_STATUSES } from '../db/schema'
import { db } from './db'
import { getCoinBalance } from './coinService'
import { periodKeyFor, type Recurrence } from './period'
import { grantActivityReward } from './rewardService'

// Quests are the `activities` rows with activity_type = 'quest'; a student's
// completion of one is a `submissions` row keyed by the quest's current period
// (see server/utils/period.ts).
//
// Per period, a quest is:
// - completed: an approved submission exists
// - eligible:  the quest is live and no pending or approved submission exists.
//              A rejected submission can be resubmitted, so it does not block.

type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]

export interface Quest {
  id: string
  name: string
  description: string
  frequency: Recurrence
  /** Coins a completion earns now; 0 while the quest reward is switched off. */
  rewardAmount: number
  contentUrl: string | null
}

export interface QuestWithStatus extends Quest {
  completed: boolean
  eligible: boolean
}

export interface QuestCompletionStatus {
  questId: string
  frequency: Recurrence
  /** The period this status applies to, e.g. '2026-10-28', '2026-W44', or 'once'. */
  periodKey: string
  /** This period's submission status, or null if the user has not attempted it. */
  submissionStatus: SubmissionStatus | null
  completed: boolean
  eligible: boolean
  /** Inside the quest's optional start/end window. */
  available: boolean
  completedAt: Date | null
}

export interface QuestCompletionResult {
  questId: string
  status: 'completed'
  periodKey: string
  completedAt: Date
  coinsEarned: number
  balance: number
}

export interface QuestHistoryEntry {
  questId: string
  name: string
  frequency: Recurrence
  completedAt: Date
}

const DEFAULT_QUEST_HISTORY_LIMIT = 50
export const MAX_QUEST_HISTORY_LIMIT = 100

const questColumns = {
  id: activities.id,
  name: activities.title,
  description: activities.description,
  frequency: activities.recurrence,
  rewardAmount: sql<number>`case when ${rewardRules.enabled} then ${rewardRules.coinAmount} else 0 end`,
  contentUrl: activities.contentUrl,
  evidenceType: activities.evidenceType,
  startsAt: activities.startsAt,
  endsAt: activities.endsAt,
}

type QuestRow = Quest & {
  evidenceType: (typeof activities.$inferSelect)['evidenceType']
  startsAt: Date | null
  endsAt: Date | null
}

// The amount shown comes from the same rule completeQuest pays from
// (QUEST_COMPLETE, via grantActivityReward), so what a student is promised and
// what they receive cannot drift apart. The left join keeps quests listed, at
// 0 coins, even if that rule is missing.
function questQuery() {
  return db
    .select(questColumns)
    .from(activities)
    .leftJoin(rewardRules, eq(rewardRules.actionCode, 'QUEST_COMPLETE'))
    .$dynamic()
}

const isQuest = and(eq(activities.activityType, 'quest'), eq(activities.active, true))

/** Inside its optional start/end window. */
function isLive(quest: Pick<QuestRow, 'startsAt' | 'endsAt'>, now: Date) {
  return (!quest.startsAt || quest.startsAt <= now) && (!quest.endsAt || now < quest.endsAt)
}

function isEligible(available: boolean, status: SubmissionStatus | null | undefined) {
  return available && status !== 'approved' && status !== 'pending'
}

function toQuest({
  evidenceType: _evidenceType,
  startsAt: _startsAt,
  endsAt: _endsAt,
  ...quest
}: QuestRow): Quest {
  return quest
}

/**
 * The user's submission statuses for these quests in each quest's current
 * period, keyed by quest id.
 */
function currentStatuses(userId: string, quests: QuestRow[], now: Date) {
  if (quests.length === 0) {
    return new Map<string, SubmissionStatus>()
  }

  const keyByQuest = new Map(quests.map((q) => [q.id, periodKeyFor(q.frequency, now)]))
  const rows = db
    .select({
      questId: submissions.activityId,
      periodKey: submissions.periodKey,
      status: submissions.status,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        inArray(submissions.activityId, [...keyByQuest.keys()]),
        // The three key formats cannot collide, so filtering on the set is safe;
        // the exact per-quest match happens below.
        inArray(submissions.periodKey, [...new Set(keyByQuest.values())])
      )
    )
    .all()

  return new Map(
    rows.filter((r) => keyByQuest.get(r.questId) === r.periodKey).map((r) => [r.questId, r.status])
  )
}

function withStatus(
  quest: QuestRow,
  status: SubmissionStatus | undefined,
  now: Date
): QuestWithStatus {
  return {
    ...toQuest(quest),
    completed: status === 'approved',
    eligible: isEligible(isLive(quest, now), status),
  }
}

/** Every quest currently on offer, with this user's status for its current period. */
export function getAvailableQuests(userId: string, now: Date = new Date()): QuestWithStatus[] {
  const quests = questQuery()
    .where(isQuest)
    .orderBy(activities.title)
    .all()
    .filter((quest) => isLive(quest, now))

  const statuses = currentStatuses(userId, quests, now)
  return quests.map((quest) => withStatus(quest, statuses.get(quest.id), now))
}

function findQuest(questId: string): QuestRow | undefined {
  return questQuery()
    .where(and(isQuest, eq(activities.id, questId)))
    .get()
}

/** A quest's details, or undefined if no active quest has this id. */
export function getQuestById(questId: string): Quest | undefined {
  const quest = findQuest(questId)
  return quest && toQuest(quest)
}

/** A quest's details plus this user's status for its current period. */
export function getQuestForUser(
  userId: string,
  questId: string,
  now: Date = new Date()
): QuestWithStatus | undefined {
  const quest = findQuest(questId)
  return quest && withStatus(quest, currentStatuses(userId, [quest], now).get(quest.id), now)
}

/**
 * Whether the user may complete this quest right now under its frequency rule.
 * False for unknown, inactive, or out-of-window quests.
 */
export function isQuestEligible(userId: string, questId: string, now: Date = new Date()): boolean {
  return getQuestForUser(userId, questId, now)?.eligible ?? false
}

function completionStatusOf(userId: string, quest: QuestRow, now: Date) {
  const periodKey = periodKeyFor(quest.frequency, now)
  const submission = db
    .select({
      id: submissions.id,
      status: submissions.status,
      submittedAt: submissions.submittedAt,
      reviewedAt: submissions.reviewedAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        eq(submissions.activityId, quest.id),
        eq(submissions.periodKey, periodKey)
      )
    )
    .get()

  const submissionStatus = submission?.status ?? null
  const available = isLive(quest, now)
  const status: QuestCompletionStatus = {
    questId: quest.id,
    frequency: quest.frequency,
    periodKey,
    submissionStatus,
    completed: submissionStatus === 'approved',
    eligible: isEligible(available, submissionStatus),
    available,
    completedAt:
      submission?.status === 'approved' ? (submission.reviewedAt ?? submission.submittedAt) : null,
  }

  return { status, submission }
}

/** The user's completion status for a quest's current period, or undefined if no such quest. */
export function getQuestCompletionStatus(
  userId: string,
  questId: string,
  now: Date = new Date()
): QuestCompletionStatus | undefined {
  const quest = findQuest(questId)
  return quest && completionStatusOf(userId, quest, now).status
}

/**
 * Record a quest completion for the current period and award its coins in one
 * transaction: either both are saved or neither is.
 *
 * Throws 404 for an unknown or inactive quest, 400 for a quest that needs photo
 * evidence (not supported here yet), and 409 when the quest is outside its
 * window or already completed / awaiting review this period.
 *
 * If the quest reward is switched off, the completion is still recorded — the
 * habit still counts — and coinsEarned is 0.
 */
export function completeQuest(
  userId: string,
  questId: string,
  now: Date = new Date()
): QuestCompletionResult {
  // 'immediate' takes the write lock before the eligibility check, so two
  // simultaneous requests cannot both pass it. The unique index on
  // (user_id, activity_id, period_key) is the backstop.
  //
  // The read helpers use `db` rather than `tx`. With better-sqlite3 both are
  // the same connection, so those reads run inside this transaction.
  const completion = db.transaction(
    (tx) => {
      const quest = findQuest(questId)
      if (!quest) {
        throw createError({ statusCode: 404, statusMessage: 'Quest not found' })
      }
      if (quest.evidenceType !== 'self_report') {
        throw createError({
          statusCode: 400,
          statusMessage: 'This quest requires photo evidence and cannot be completed here',
        })
      }

      const { status, submission } = completionStatusOf(userId, quest, now)
      if (!status.available) {
        throw createError({
          statusCode: 409,
          statusMessage: 'This quest is not available right now',
        })
      }
      if (status.submissionStatus === 'approved') {
        throw createError({
          statusCode: 409,
          statusMessage: 'Quest already completed for this period',
        })
      }
      if (status.submissionStatus === 'pending') {
        throw createError({
          statusCode: 409,
          statusMessage: 'Quest already submitted and awaiting review',
        })
      }

      // Self-report needs no review, so it is approved on the spot. A rejected
      // submission is reopened rather than duplicated — the unique index allows
      // only one row per period.
      const values = { status: 'approved' as const, submittedAt: now, reviewedAt: now }
      const returning = { id: submissions.id, completedAt: submissions.reviewedAt }
      const saved = submission
        ? tx
            .update(submissions)
            .set({ ...values, reviewedBy: null })
            .where(eq(submissions.id, submission.id))
            .returning(returning)
            .get()
        : tx
            .insert(submissions)
            .values({ ...values, userId, activityId: questId, periodKey: status.periodKey })
            .returning(returning)
            .get()

      // One reward per submission row and one row per period, so at most one
      // reward per period.
      const reward = grantActivityReward(
        userId,
        'individual_quest_completion',
        `submission:${saved.id}`,
        { writer: tx, skipIfDisabled: true }
      )

      return {
        questId,
        status: 'completed' as const,
        periodKey: status.periodKey,
        completedAt: saved.completedAt!,
        coinsEarned: reward.amount,
      }
    },
    { behavior: 'immediate' }
  )

  return { ...completion, balance: getCoinBalance(userId) }
}

/** The user's completed quests, newest first. */
export function getQuestHistory(
  userId: string,
  { limit = DEFAULT_QUEST_HISTORY_LIMIT, offset = 0 }: { limit?: number; offset?: number } = {}
): QuestHistoryEntry[] {
  const completedAt =
    sql<Date>`coalesce(${submissions.reviewedAt}, ${submissions.submittedAt})`.mapWith(
      submissions.submittedAt
    )

  return (
    db
      .select({
        questId: activities.id,
        name: activities.title,
        frequency: activities.recurrence,
        completedAt,
      })
      .from(submissions)
      .innerJoin(activities, eq(activities.id, submissions.activityId))
      .where(
        and(
          eq(submissions.userId, userId),
          eq(submissions.status, 'approved'),
          eq(activities.activityType, 'quest')
        )
      )
      // Timestamps have one-second resolution; rowid breaks ties in insert order.
      .orderBy(desc(completedAt), desc(sql`${submissions}.rowid`))
      .limit(Math.min(Math.max(limit, 1), MAX_QUEST_HISTORY_LIMIT))
      .offset(Math.max(offset, 0))
      .all()
  )
}
