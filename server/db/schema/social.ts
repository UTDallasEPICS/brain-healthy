// Friendships, invite codes, and referrals.
// Snake_case columns; see the note at the top of auth.ts.

import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { relations, sql } from 'drizzle-orm'
import { user } from './auth'

export const FRIENDSHIP_STATUSES = ['pending', 'accepted', 'declined'] as const

/**
 * The shared identifier for a pair of students, independent of who sent the
 * request. Sorting the two ids before joining is what makes A→B and B→A produce
 * the same key, which is what lets a single unique index reject a duplicate
 * request in either direction.
 *
 * This is the only place this key may be built. The database enforces
 * uniqueness on the value, but it cannot check that the value was derived
 * correctly — so every write path must call this function rather than
 * constructing the string itself.
 */
export function friendshipPairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

/**
 * A friend request and, once accepted, the friendship itself.
 *
 * Self-requests are blocked by a check constraint; duplicates in either
 * direction are blocked by the unique index on pair_key.
 */
export const friendships = sqliteTable(
  'friendships',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    requesterId: text('requester_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Always friendshipPairKey(requesterId, recipientId).
    pairKey: text('pair_key').notNull(),
    status: text('status', { enum: FRIENDSHIP_STATUSES }).notNull().default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    respondedAt: integer('responded_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('friendships_pair_idx').on(t.pairKey),
    index('friendships_requester_idx').on(t.requesterId),
    // Listing a student's incoming requests.
    index('friendships_recipient_idx').on(t.recipientId, t.status),
    check('friendships_no_self_check', sql`requester_id <> recipient_id`),
    check('friendships_status_check', sql`status in ('pending', 'accepted', 'declined')`),
  ]
)

/**
 * One referral code per student, created alongside their house by the Better
 * Auth user-create hook. Many new students can use the same code.
 *
 * created_at is not in the original schema proposal; it is added for
 * consistency with every other table here and costs nothing.
 */
export const inviteCodes = sqliteTable('invite_codes', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  // .unique() already creates the index that code lookups use, so there is
  // no separate index on this column.
  code: text('code').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

/**
 * Who invited whom.
 *
 * The unique constraint on invited_user_id is what enforces "one inviter per
 * student". `qualified_at` is set once the invited student's UTD email is
 * verified.
 *
 * The three-rewarded-referrals cap is NOT expressible here — a referral beyond
 * the cap is still recorded, just unpaid. That limit is enforced by counting
 * referral_reward rows inside the transaction that writes the reward.
 */
export const referrals = sqliteTable(
  'referrals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    invitedUserId: text('invited_user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    qualifiedAt: integer('qualified_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('referrals_inviter_idx').on(t.inviterId),
    check('referrals_no_self_check', sql`inviter_id <> invited_user_id`),
  ]
)

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  requester: one(user, {
    fields: [friendships.requesterId],
    references: [user.id],
    relationName: 'friendshipRequester',
  }),
  recipient: one(user, {
    fields: [friendships.recipientId],
    references: [user.id],
    relationName: 'friendshipRecipient',
  }),
}))

export const inviteCodesRelations = relations(inviteCodes, ({ one }) => ({
  owner: one(user, { fields: [inviteCodes.userId], references: [user.id] }),
}))

export const referralsRelations = relations(referrals, ({ one }) => ({
  inviter: one(user, {
    fields: [referrals.inviterId],
    references: [user.id],
    relationName: 'referralInviter',
  }),
  invitedUser: one(user, {
    fields: [referrals.invitedUserId],
    references: [user.id],
    relationName: 'referralInvitee',
  }),
}))

export const selectFriendshipSchema = createSelectSchema(friendships)
export const insertFriendshipSchema = createInsertSchema(friendships)
export const selectInviteCodeSchema = createSelectSchema(inviteCodes)
export const insertInviteCodeSchema = createInsertSchema(inviteCodes)
export const selectReferralSchema = createSelectSchema(referrals)
export const insertReferralSchema = createInsertSchema(referrals)
