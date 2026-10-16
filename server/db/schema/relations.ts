// The `user` relation set lives here rather than in auth.ts because it reaches
// into every other schema file, and declaring it there would create an import
// cycle (auth.ts -> activities.ts -> auth.ts).
//
// Where two relations point at the same table, `relationName` disambiguates
// them and must match the name used on the other side.

import { relations } from 'drizzle-orm'
import { user, session, account } from './auth'
import { submissions } from './activities'
import { houses, userItems } from './house'
import { coinTransactions } from './economy'
import { friendships, inviteCodes, referrals } from './social'

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),

  submissions: many(submissions, { relationName: 'submitter' }),
  reviewedSubmissions: many(submissions, { relationName: 'reviewer' }),

  house: one(houses),
  items: many(userItems),

  coinTransactions: many(coinTransactions),

  sentFriendRequests: many(friendships, { relationName: 'friendshipRequester' }),
  receivedFriendRequests: many(friendships, { relationName: 'friendshipRecipient' }),

  inviteCode: one(inviteCodes),
  referralsMade: many(referrals, { relationName: 'referralInviter' }),
  // At most one, guaranteed by the unique index on referrals.invited_user_id.
  // The non-owning side of a named one-to-one still has to spell out the
  // columns; relationName alone is not enough for Drizzle to resolve it.
  referredBy: one(referrals, {
    fields: [user.id],
    references: [referrals.invitedUserId],
    relationName: 'referralInvitee',
  }),
}))
