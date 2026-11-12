import type { H3Event } from 'h3'
import { requireUser } from './session'

// The /api/dev/* routes back the test console at app/pages/dev/economy.vue.
// They set up states the real API cannot reach yet — spending coins, simulated
// referrals, pending/rejected submissions, a simulated clock — so every coin,
// reward, and quest rule can be exercised by hand.
//
// They exist only under `nuxt dev`: import.meta.dev is false in a production
// build (and under Vitest), so every one of these routes answers 404 there.
export function requireDevUser(event: H3Event) {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return requireUser(event)
}

// The initial reward values (as in migration 0001 and server/db/seed.ts), so
// the console can undo its own reward-rule edits.
export const DEFAULT_REWARD_RULES = [
  { actionCode: 'QUEST_COMPLETE', coinAmount: 1, enabled: true },
  { actionCode: 'EVENT_PARTICIPATION', coinAmount: 5, enabled: true },
  { actionCode: 'SOCIAL_NUDGE', coinAmount: 5, enabled: false },
  { actionCode: 'VERIFIED_REFERRAL', coinAmount: 30, enabled: true },
] as const

// Invitees created by POST /api/dev/referrals, so reset can find and remove them.
export const DEV_INVITEE_EMAIL_PREFIX = 'dev-invitee-'
