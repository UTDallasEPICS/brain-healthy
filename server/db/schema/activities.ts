// Quests, events, and the evidence students submit for them.
//
// Columns here are snake_case (the Better Auth tables in auth.ts are not — see
// the note at the top of that file). IDs, timestamps, and booleans follow the
// conventions the auth tables already established: TEXT uuid PKs, integer
// timestamps in seconds, integers in boolean mode.
//
// The `{ enum: [...] }` options narrow the TypeScript type; the matching
// check() constraints enforce the same thing in the database, which the enum
// option alone does not do.

import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { relations, sql } from 'drizzle-orm'
import { user } from './auth'

export const REWARD_ACTION_CODES = [
  'QUEST_COMPLETE',
  'EVENT_PARTICIPATION',
  'SOCIAL_NUDGE',
  'VERIFIED_REFERRAL',
] as const

export const ACTIVITY_TYPES = ['quest', 'event'] as const
export const EVIDENCE_TYPES = ['self_report', 'photo'] as const
export const RECURRENCES = ['daily', 'once'] as const
export const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected'] as const

/**
 * Coin amounts per action, kept in the database so rewards can be retuned or
 * switched off without a code change. Seeded, never created by a user.
 *
 * SOCIAL_NUDGE ships with enabled = false until that feature exists.
 */
export const rewardRules = sqliteTable(
  'reward_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actionCode: text('action_code', { enum: REWARD_ACTION_CODES }).notNull().unique(),
    coinAmount: integer('coin_amount').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  () => [check('reward_rules_coin_amount_check', sql`coin_amount >= 0`)]
)

/**
 * A quest or campus event a student can complete.
 *
 * `recurrence` decides how submissions.period_key is built: 'daily' uses the
 * campus-local date, 'once' uses the literal string 'once'.
 */
export const activities = sqliteTable(
  'activities',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    rewardRuleId: text('reward_rule_id')
      .notNull()
      .references(() => rewardRules.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    activityType: text('activity_type', { enum: ACTIVITY_TYPES }).notNull(),
    evidenceType: text('evidence_type', { enum: EVIDENCE_TYPES }).notNull(),
    recurrence: text('recurrence', { enum: RECURRENCES }).notNull(),
    contentUrl: text('content_url'),
    startsAt: integer('starts_at', { mode: 'timestamp' }),
    endsAt: integer('ends_at', { mode: 'timestamp' }),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    // The student-facing feed filters on exactly this pair.
    index('activities_active_idx').on(t.active, t.activityType),
    index('activities_reward_rule_idx').on(t.rewardRuleId),
    check('activities_type_check', sql`activity_type in ('quest', 'event')`),
    check('activities_evidence_check', sql`evidence_type in ('self_report', 'photo')`),
    check('activities_recurrence_check', sql`recurrence in ('daily', 'once')`),
  ]
)

/**
 * A student's attempt at an activity.
 *
 * The (user_id, activity_id, period_key) unique index is the load-bearing
 * constraint: it is what stops a second submission for the same activity in the
 * same period. Resubmitting after a rejection therefore means UPDATEing this
 * row back to 'pending', not inserting another one.
 */
export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    activityId: text('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    // 'YYYY-MM-DD' in America/Chicago for daily activities, or 'once'.
    periodKey: text('period_key').notNull(),
    status: text('status', { enum: SUBMISSION_STATUSES }).notNull().default('pending'),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    submittedAt: integer('submitted_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('submissions_user_activity_period_idx').on(t.userId, t.activityId, t.periodKey),
    // The reviewer queue: pending submissions, oldest first.
    index('submissions_status_idx').on(t.status, t.submittedAt),
    index('submissions_user_idx').on(t.userId),
    index('submissions_activity_idx').on(t.activityId),
    check('submissions_status_check', sql`status in ('pending', 'approved', 'rejected')`),
  ]
)

/**
 * Metadata for a photo backing a submission. The image itself lives on disk (or
 * object storage) under `storage_key`; only the reference is stored here.
 *
 * `mime_type` must be written from server-side magic-byte detection, never from
 * the client-supplied content type.
 */
export const submissionPhotos = sqliteTable(
  'submission_photos',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedAt: integer('uploaded_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('submission_photos_submission_idx').on(t.submissionId),
    check('submission_photos_size_check', sql`size_bytes > 0`),
  ]
)

export const rewardRulesRelations = relations(rewardRules, ({ many }) => ({
  activities: many(activities),
}))

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  rewardRule: one(rewardRules, {
    fields: [activities.rewardRuleId],
    references: [rewardRules.id],
  }),
  submissions: many(submissions),
}))

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  user: one(user, {
    fields: [submissions.userId],
    references: [user.id],
    relationName: 'submitter',
  }),
  reviewer: one(user, {
    fields: [submissions.reviewedBy],
    references: [user.id],
    relationName: 'reviewer',
  }),
  activity: one(activities, { fields: [submissions.activityId], references: [activities.id] }),
  photos: many(submissionPhotos),
}))

export const submissionPhotosRelations = relations(submissionPhotos, ({ one }) => ({
  submission: one(submissions, {
    fields: [submissionPhotos.submissionId],
    references: [submissions.id],
  }),
}))

export const selectRewardRuleSchema = createSelectSchema(rewardRules)
export const insertRewardRuleSchema = createInsertSchema(rewardRules)
export const selectActivitySchema = createSelectSchema(activities)
export const insertActivitySchema = createInsertSchema(activities)
export const selectSubmissionSchema = createSelectSchema(submissions)
export const insertSubmissionSchema = createInsertSchema(submissions)
export const selectSubmissionPhotoSchema = createSelectSchema(submissionPhotos)
export const insertSubmissionPhotoSchema = createInsertSchema(submissionPhotos)
