import type { RECURRENCES } from '../db/schema'

export type Recurrence = (typeof RECURRENCES)[number]

// Periods follow campus-local time. Computing them in UTC would roll a daily
// quest over at 6–7pm in Dallas, which students would see as a bug.
export const CAMPUS_TIME_ZONE = 'America/Chicago'

const campusDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const pad = (n: number) => String(n).padStart(2, '0')

/** The calendar date on campus at `now`. */
function campusDate(now: Date) {
  const parts = Object.fromEntries(
    campusDateFormat.formatToParts(now).map((part) => [part.type, part.value])
  )
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
}

/** ISO 8601 week (weeks start Monday; week 1 contains the year's first Thursday). */
function isoWeek(year: number, month: number, day: number) {
  // Plain calendar arithmetic on a UTC date — no time zone involved past this point.
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday) // the Thursday of this week
  const weekYear = date.getUTCFullYear()
  const week = Math.ceil(((date.getTime() - Date.UTC(weekYear, 0, 1)) / 86_400_000 + 1) / 7)
  return { weekYear, week }
}

/**
 * The submissions.period_key for an activity completed at `now`:
 * - daily:  'YYYY-MM-DD' (campus date)
 * - weekly: 'YYYY-Www'   (campus ISO week, e.g. '2026-W44')
 * - once:   'once'
 *
 * This is the only place a period key may be built — the unique index on
 * (user_id, activity_id, period_key) is what limits completions, so every
 * write and every lookup must agree on the format.
 */
export function periodKeyFor(recurrence: Recurrence, now: Date = new Date()): string {
  if (recurrence === 'once') {
    return 'once'
  }

  const { year, month, day } = campusDate(now)

  if (recurrence === 'daily') {
    return `${year}-${pad(month)}-${pad(day)}`
  }

  const { weekYear, week } = isoWeek(year, month, day)
  return `${weekYear}-W${pad(week)}`
}
