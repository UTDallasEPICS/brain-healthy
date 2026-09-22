# Belonging Blocks — Implementation Plan

How the proposed database schema lands on this codebase (Nuxt 4 + Better Auth 1.6.23 +
Drizzle 0.45 + better-sqlite3 12). Written against the repo as of commit `fa62c88`.

**Sections 2 and 3 are the "what is actually changing" summary** — the old schema vs. the
proposed one, and every existing file the change touches. Sections 4 onward are the build plan.

---

## 1. What exists today

| Area         | File                                        | State                                                                                                                       |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Schema       | `server/db/schema.ts`                       | Only the 4 Better Auth tables (`user`, `session`, `account`, `verification`) + drizzle-zod select/insert schemas. 76 lines. |
| DB client    | `server/utils/db.ts`                        | Singleton `better-sqlite3` connection, cached on `globalThis` in dev. **No `PRAGMA foreign_keys`.**                         |
| Auth         | `server/utils/auth.ts`                      | `betterAuth()` + `emailOTP` plugin + Nodemailer. **No domain restriction, no `databaseHooks`, no role field.**              |
| API gateway  | `server/middleware/auth.ts`                 | 401s every `/api/*` request except `/api/auth/*` and `/api/health`; attaches `event.context.user`.                          |
| Route helper | `server/utils/session.ts`                   | `requireUser(event)` → typed non-null user or 401.                                                                          |
| Client guard | `app/middleware/auth.global.ts`             | Global redirect: no session → `/auth`; session on `/auth` → `/`.                                                            |
| File upload  | `server/api/users/upload.post.ts`           | Writes to `UPLOAD_STORAGE_PATH/users/<id>/images/<uuid>`, extensionless.                                                    |
| File serve   | `server/api/users/[id]/profile.get.ts`      | Streams file, MIME sniffed from magic bytes via `file-type`.                                                                |
| Pages        | `app/pages/auth.vue`, `app/pages/index.vue` | OTP login form; a "dashboard" that is really a user list + avatar upload. Template demo code.                               |
| Migrations   | `drizzle/0000_classy_bloodstorm.sql`        | One applied migration. `dev.db` exists locally and is gitignored.                                                           |
| Tests        | `vitest.config.ts`, `tests/nuxt/`           | Nuxt-environment component tests only. `include` is `tests/nuxt/**/*.test.ts`.                                              |
| Requirements | `requirements.md`                           | Team tracks a REQ-F / REQ-NF matrix. New work is expected to append rows.                                                   |

**Bottom line:** everything below table 4 of the proposal is net-new. Tables 1–4 already exist
and should not be redesigned — only extended.

---

## 2. Schema diff — repo today vs. proposal

### 2.1 Table inventory

| #   | Table               | In repo today    | Action                        |
| --- | ------------------- | ---------------- | ----------------------------- |
| 1   | `user`              | Yes — 7 columns  | **Modify** (+4 columns, §2.3) |
| 2   | `session`           | Yes — 8 columns  | **Modify** (+1 column, §2.3)  |
| 3   | `account`           | Yes — 13 columns | Unchanged                     |
| 4   | `verification`      | Yes — 6 columns  | Unchanged                     |
| 5   | `reward_rules`      | —                | **New**                       |
| 6   | `activities`        | —                | **New**                       |
| 7   | `submissions`       | —                | **New**                       |
| 8   | `submission_photos` | —                | **New**                       |
| 9   | `houses`            | —                | **New**                       |
| 10  | `decor_items`       | —                | **New**                       |
| 11  | `user_items`        | —                | **New**                       |
| 12  | `coin_transactions` | —                | **New**                       |
| 13  | `friendships`       | —                | **New**                       |
| 14  | `invite_codes`      | —                | **New**                       |
| 15  | `referrals`         | —                | **New**                       |

Net: **4 tables kept, 11 tables added, 0 dropped, 0 renamed.** No existing column is removed or
retyped. This is a purely additive migration, which is why phase ordering (§12) can be relaxed —
nothing in the new schema can corrupt existing auth data.

### 2.2 The proposal's tables 1–4 are a _subset_, not a target state

This is the easiest thing to get wrong when reading the proposal. It lists 6 columns for `user`,
but the repo has 7, and Better Auth requires all of them. The proposal says so in its own note
("Retain the complete Better Auth schema generated for the project's configuration") — the
column lists are there to explain relationships, not to define what to build.

Columns the repo has that the proposal does not list, **all of which stay**:

| Table          | Columns not listed in the proposal                                                                                                       | Why they must stay                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `user`         | `image`                                                                                                                                  | Better Auth field; actively used by `upload.post.ts`, `profile.get.ts`, `index.vue` |
| `session`      | `createdAt`, `updatedAt`, `ipAddress`, `userAgent`                                                                                       | Better Auth writes these on every sign-in                                           |
| `account`      | `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `createdAt`, `updatedAt` | Better Auth's adapter expects the full model                                        |
| `verification` | `createdAt`, `updatedAt`                                                                                                                 | Same                                                                                |

**Nothing in tables 1–4 gets deleted.** If a migration is ever generated that drops any of
these, the migration is wrong — stop and regenerate.

### 2.3 The only modifications to existing tables

Both come from adding the Better Auth `admin` plugin, which is how we get a reviewer role
(§6.4). The plugin contributes its own columns
(`node_modules/better-auth/dist/plugins/admin/admin.d.mts:875-900`):

| Table     | Added column     | Type              | Note                                                  |
| --------- | ---------------- | ----------------- | ----------------------------------------------------- |
| `user`    | `role`           | TEXT              | Defaults to `'user'`; reviewers get `'admin'`         |
| `user`    | `banned`         | INTEGER (bool)    | Comes with the plugin; usable for conduct enforcement |
| `user`    | `banReason`      | TEXT, nullable    |                                                       |
| `user`    | `banExpires`     | INTEGER, nullable |                                                       |
| `session` | `impersonatedBy` | TEXT, nullable    | Plugin's admin-impersonation support                  |

Five columns, not one. They arrive as a package — the plugin cannot be adopted à la carte — so
the migration for phase 1 touches `user` and `session`, and that is the _only_ time this project
alters a Better Auth table.

If the team would rather not carry the ban/impersonate columns, the alternative is a hand-rolled
`role` column via Better Auth's `user.additionalFields`. That is one column instead of five, but
then `requireAdmin` and any future moderation are all hand-written. Recommend the plugin.

### 2.4 Convention differences between the old and new tables

The two halves of the schema will not look alike, on purpose:

|                   | Tables 1–4 (Better Auth)                                                                    | Tables 5–15 (ours)                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Column naming     | `camelCase` (`emailVerified`, `createdAt`)                                                  | `snake_case` (`reward_rule_id`, `created_at`)                                                                                                                      |
| Why               | Better Auth's Drizzle adapter maps model fields to these exact names — renaming breaks auth | Matches the proposal, and is the normal SQL convention                                                                                                             |
| Drizzle var names | `user`, `session`, `account`, `verification`                                                | `rewardRules`, `activities`, `submissions`, `submissionPhotos`, `houses`, `decorItems`, `userItems`, `coinTransactions`, `friendships`, `inviteCodes`, `referrals` |

Conventions that carry over unchanged from the old schema — new tables must match these, not
invent their own:

- **IDs:** `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())`
- **Timestamps:** `integer(..., { mode: 'timestamp' })` — seconds, returned as a JS `Date`
- **Booleans:** `integer(..., { mode: 'boolean' })` — the proposal's "INTEGER 0 or 1"
- **Cascades:** `.references(() => user.id, { onDelete: 'cascade' })`
- **Zod:** a `createSelectSchema` / `createInsertSchema` pair per table at the bottom of the file

### 2.5 What we are adding that the proposal does not specify

None of these contradict the proposal; they are the details a written schema leaves out and an
implementation cannot.

| Addition                                  | Where                                            | Why                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| ~10 indexes on FKs and query paths        | all new tables                                   | The proposal names PK/FK/unique but no indexes. Without them the reviewer queue and house render do full scans. Detail in §5.2 |
| `check()` constraints on enum-ish columns | `activities`, `submissions`, `coin_transactions` | SQLite has no enum type. Drizzle's TS `{ enum: [...] }` is compile-time only                                                   |
| `friendships.pair_key` (new column)       | `friendships`                                    | SQLite cannot express "unique unordered pair". A stored sorted key + unique index can (§5.2)                                   |
| `user.role` etc.                          | `user`, `session`                                | §2.3 — the proposal has `reviewed_by` but no notion of who may review                                                          |
| Fixed `period_key` format + timezone      | `submissions`                                    | Proposal says "date for a daily activity"; does not say which timezone. Must be pinned (§5.2)                                  |
| Fixed `source_key` format                 | `coin_transactions`                              | Proposal gives one example (`submission:123`); the full grammar needs pinning (§5.2)                                           |

### 2.6 Proposal rules that are _not_ schema at all

Worth separating out, because they look like schema requirements but land entirely in
application code — and therefore need tests rather than constraints:

| Rule                                                          | Where it actually lives                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| "up to three rewarded referrals per inviter"                  | `server/utils/referrals.ts`, counted inside the reward transaction (§7.3) |
| "create one house per student after email verification"       | Better Auth `databaseHooks.user.create.after` (§6.3)                      |
| "students can place items only in their own house"            | Route-level ownership check on `/api/house/items/:id/place`               |
| "balance is the sum of transaction amounts"                   | A `SUM()` query, not a stored column (§5.2)                               |
| "award coins only after approval"                             | The review route; no schema expresses it                                  |
| "the team must decide how photo submissions will be reviewed" | Still undecided — §14                                                     |

---

## 3. What in the existing code this impacts

### 3.1 File-by-file

| File                                   | Today                                                       | Change                                                                                    | Breaking?                                                |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `server/db/schema.ts`                  | 4 tables, 76 lines                                          | Becomes `server/db/schema/` directory (§5.1)                                              | No — import paths still resolve                          |
| `server/utils/db.ts`                   | Opens the connection                                        | `+ pragma('foreign_keys = ON')`, `+ pragma('journal_mode = WAL')`                         | No                                                       |
| `server/utils/auth.ts`                 | `emailOTP` only                                             | `+ admin` plugin, `+ databaseHooks` (domain gate, onboarding), `+ disableSignUp: false`   | **Yes** — see 3.2                                        |
| `server/utils/env.ts`                  | 7 required vars                                             | Any new required var must be registered here or it silently goes missing                  | No                                                       |
| `server/utils/session.ts`              | `requireUser`                                               | `+ requireAdmin`                                                                          | No                                                       |
| `server/middleware/auth.ts`            | 401 gateway                                                 | None required; its `H3EventContext` type picks up `role` automatically from `auth.$Infer` | No                                                       |
| `server/db/seed.ts`                    | Seeds one demo user                                         | Rewritten: reward rules, activities, decor catalog, UTD test user                         | **Yes** — see 3.2                                        |
| `server/api/users/index.get.ts`        | Returns **every** user's name + email to any signed-in user | Restrict or replace (3.3)                                                                 | **Yes**                                                  |
| `server/api/users/upload.post.ts`      | Avatar upload                                               | Logic extracted to `server/utils/storage.ts`; 3 defects fixed (§8)                        | No — behavior preserved                                  |
| `server/api/users/[id]/profile.get.ts` | Streams avatar                                              | Path-traversal guard added (§8)                                                           | No                                                       |
| `app/utils/auth-client.ts`             | `emailOTPClient()`                                          | `+ adminClient()` to mirror the server plugin                                             | No                                                       |
| `app/middleware/auth.global.ts`        | Session redirect                                            | `+ /admin/*` requires role `admin`                                                        | No                                                       |
| `app/pages/index.vue`                  | User list + avatar modal                                    | Replaced by the student home (§9)                                                         | Intentional                                              |
| `app/app.vue`                          | Brand reads "Nuxt Template"                                 | Rebrand + real nav                                                                        | **Yes** — see 3.2                                        |
| `tests/nuxt/app-shell.test.ts`         | Asserts brand text `'Nuxt Template'`                        | Must update in the same PR as `app.vue`                                                   | **Yes**                                                  |
| `vitest.config.ts`                     | `tests/nuxt/**` only, `nuxt` env                            | `+` a `node`-env project for `tests/server/**`                                            | No                                                       |
| `drizzle.config.ts`                    | `schema: './server/db/schema.ts'`                           | → `'./server/db/schema/index.ts'`                                                         | No                                                       |
| `.env.example` / `.env`                | `UPLOAD_STORAGE_PATH=public/images`                         | → a non-public path (§8)                                                                  | **Yes** — existing avatars won't resolve at the old path |
| `.gitignore`                           | ignores `/dev.db`                                           | `+ /dev.db-wal`, `+ /dev.db-shm` (created by WAL mode)                                    | No                                                       |
| `README.md`                            | "Login requires an email that already exists"               | Rewrite for self-sign-up                                                                  | No                                                       |
| `requirements.md`                      | 14 REQ rows                                                 | `+` 10 rows (§13); REQ-F-06's wording needs revisiting given 3.3                          | No                                                       |

### 3.2 The four things that actually break

**1. The seeded user stops working.** `server/db/seed.ts` creates `seeded-user@email.com`, and
the README tells you to log in as `email@example.com`. Once the UTD domain gate lands (phase 1),
neither can sign in. Anyone whose local flow depends on that account is blocked until the seed is
updated in the same PR.

**2. `tests/nuxt/app-shell.test.ts` fails the moment `app.vue` is rebranded.** It asserts
`brandLink.text()).toContain('Nuxt Template')`. CI runs `pnpm test` on every PR
(`.github/workflows/test.yml`), so this fails the build. Trivial to fix — just don't let it
surprise anyone mid-review.

**3. Changing `UPLOAD_STORAGE_PATH` orphans existing avatars.** Files already written under
`public/images/users/<id>/images/<uuid>` are addressed by a relative path stored in `user.image`.
Point the root elsewhere and those rows dangle. At this stage the only affected data is local dev
avatars, so the answer is "ignore it" — but it must be done _before_ real photo data exists, not
after.

**4. Adding the `admin` plugin migrates two Better Auth tables.** The only migration in this
project that alters `user` and `session`. Review that generated SQL especially carefully — SQLite
`ALTER TABLE` limitations sometimes push Drizzle into a table-rebuild, and a rebuild of `user` is
the one migration that could lose account data.

### 3.3 A privacy problem the new schema surfaces

`server/api/users/index.get.ts` returns **every registered user's name and email** to any
signed-in user, and `app/pages/index.vue` renders them. In a template demo that is harmless. In
an app whose proposal explicitly says to "avoid storing stress scores, private journal content or
other unnecessary personal information," shipping a full campus email directory to every student
contradicts the intent — and `friendships` gives us a proper scope for who may see whom.

Recommendation: replace it with a friends-scoped endpoint plus a search-by-invite-code lookup, and
revise REQ-F-06's wording, whose "non-sensitive fields" claim no longer holds once the user base
is real students rather than test rows. This is a small change but it should be deliberate rather
than inherited.

### 3.4 Deployment and infrastructure impact

Three of these are easy to miss because they live in CI rather than in the app.

**The migration Lambda bundle only zips certain paths.** `.github/workflows/deploy.yml` packages
`package.json pnpm-lock.yaml tsconfig.json drizzle.config.ts drizzle/ server/db/` and ships that
to a Lambda. Splitting `schema.ts` into `server/db/schema/` stays inside `server/db/`, so the
bundle still works — **but any schema or seed file placed outside `server/db/` will migrate fine
locally and fail in stage/prod.** Keep everything the migration needs under `server/db/`.

**Reward rules will not exist in production unless `SEED_MIGRATION` is `true`.** The same workflow
passes `"seed": ${{ vars.SEED_MIGRATION == 'true' }}` to the Lambda. Because `awardCoins` reads
the coin amount out of `reward_rules`, an unseeded production database does not error — it just
awards nothing, silently. Set that repository variable before the first deploy, and keep the seed
idempotent so leaving it on is safe.

**Uploaded files do not survive a deploy.** The `Dockerfile` deployment stage copies only
`/app/.output`, and ECS replaces the task on every deploy (`--force-new-deployment`). Anything
written to the container filesystem — today's avatars, tomorrow's submission photos — is gone on
the next release. This is already true for avatars; it becomes a real problem when photos are the
evidence a coin award was based on. The team needs to decide between an EFS mount and S3 before
phase 4 ships. Worth noting `.gitignore` already ignores `.data`, so `.data/uploads` is a safe
local default regardless of which way that decision goes.

### 3.5 What is _not_ affected

Useful for scoping reviews: `server/api/health.ts`, `server/middleware/auth.ts`'s logic,
`app/pages/auth.vue`'s OTP flow, `nuxt.config.ts`, `eslint.config.mjs`, `Dockerfile`,
`.github/workflows/test.yml`, and the deploy workflows all keep working untouched. The auth
gateway in particular already protects every route we are about to add — new endpoints are
authenticated by default with no middleware change.

---

## 4. Hard technical constraints discovered in this stack

These shape the design, so they come before the schema work.

### 4.1 Drizzle transactions on better-sqlite3 are **synchronous**

`node_modules/drizzle-orm/better-sqlite3/session.d.ts:28`

```ts
transaction<T>(transaction: (tx: BetterSQLiteTransaction<...>) => T, config?): T
```

The callback is **not** async. `await db.transaction(async (tx) => ...)` silently breaks
atomicity — the outer transaction commits before the inner awaits resolve. Four of the
proposal's "one database transaction" requirements depend on getting this right
(approval + reward, purchase, referral cap, onboarding).

**Rule for this project:** inside any `db.transaction(...)` callback, use only the synchronous
Drizzle terminators — `.get()`, `.all()`, `.run()`, `.returning().all()` — and never `await`.
Do all async work (file I/O, email, validation) _before_ opening the transaction.

```ts
// server/utils/economy.ts
export function awardCoins(userId: string, ruleId: string, sourceKey: string) {
  return db.transaction((tx) => {
    const rule = tx.select().from(rewardRules).where(eq(rewardRules.id, ruleId)).get()
    if (!rule?.enabled) throw createError({ statusCode: 409, statusMessage: 'Reward disabled' })
    tx.insert(coinTransactions)
      .values({
        userId,
        rewardRuleId: ruleId,
        amount: rule.coinAmount,
        transactionType: 'activity_reward',
        sourceKey,
      })
      .run()
  })
}
```

Note the asymmetry with Better Auth: its `databaseHooks` _are_ async. So an onboarding hook is
`async`, but the transaction it opens inside itself is not. A lint rule, or at minimum a
code-review checklist item, should catch `async (tx) =>`.

### 4.2 Foreign keys, and what actually needed turning on

**Correction to an earlier draft of this document:** it claimed `better-sqlite3` leaves foreign
keys off. It does not. Verified on the pinned version — a connection that sets no pragmas at all
reports `foreign_keys = 1`:

```
better-sqlite3 default foreign_keys = 1   (better-sqlite3 12.11.1)
```

So FK enforcement was already active for the app. What the new schema actually adds is the
_declarations_ — the FK clauses and CHECK constraints on the 11 new tables, which is where the
real safety comes from.

Setting the pragma explicitly is still worth doing: it is per-connection and not stored in the
file, so it would vanish silently under a different driver, a raw `Database` opened elsewhere, or
a change in the library's defaults. It makes the guarantee ours rather than the library's.

WAL is the setting that genuinely changes behaviour — SQLite defaults to `delete` journalling.
Add both to `server/utils/db.ts` **and** `server/db/seed.ts` (separate connection):

```ts
const sqlite = new Database(connectionString)
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('journal_mode = WAL') // fewer writer-lock errors under concurrent writes
```

WAL mode also creates `dev.db-wal` / `dev.db-shm` alongside the database — add both to
`.gitignore`, which currently lists only `/dev.db`.

### 4.3 Timestamp convention

Existing tables use `integer(..., { mode: 'timestamp' })` — that is **seconds**, and Drizzle
hands back a JS `Date`. Every new timestamp column must use the same mode so the codebase has
one convention. Do not mix in `timestamp_ms`.

### 4.4 Better Auth owns tables 1–4

Covered in §2.2 and §2.4: keep the camelCase column names, keep every column the proposal
omitted, and touch these tables only for the `admin` plugin migration.

---

## 5. Schema work

### 5.1 Split the schema file

11 new tables + relations + Zod schemas would push `server/db/schema.ts` past 500 lines. Split
it into a directory — staying under `server/db/` so the deploy Lambda bundle still picks it up
(§3.4):

```
server/db/schema/
  auth.ts        # tables 1-4, moved verbatim from schema.ts
  activities.ts  # reward_rules, activities, submissions, submission_photos
  house.ts       # houses, decor_items, user_items
  economy.ts     # coin_transactions
  social.ts      # friendships, invite_codes, referrals
  index.ts       # re-export * from each
```

`drizzle.config.ts` → `schema: './server/db/schema/index.ts'`.

The three API routes that do `import { user } from '../../db/schema'`, and
`server/utils/db.ts`'s `import * as schema from '../db/schema'`, all resolve to `index.ts`
unchanged — no import rewrites needed.

### 5.2 Per-table notes (deltas from the proposal, not a restatement of it)

**`reward_rules`** — `action_code` is the natural key; still keep a TEXT id PK for FK stability.
Type it as `text('action_code', { enum: ['QUEST_COMPLETE', 'EVENT_PARTICIPATION', 'SOCIAL_NUDGE', 'VERIFIED_REFERRAL'] })`
so TypeScript narrows it. Seeded, never user-created.

**`activities`** — `activity_type`, `evidence_type`, and `recurrence` each become
`text(..., { enum: [...] })` plus a SQL `check()` constraint (`drizzle-orm/sqlite-core` exports
`check()` — confirmed present at 0.45). The TS enum alone gives no database-level guarantee; use
both. Add `index('activities_active_idx').on(t.active, t.activityType)` — the student-facing
feed filters on exactly that.

**`submissions`** — the composite uniqueness rule is the load-bearing constraint:

```ts
uniqueIndex('submissions_user_activity_period_idx').on(t.userId, t.activityId, t.periodKey)
```

Plus `index('submissions_status_idx').on(t.status, t.submittedAt)` for the reviewer queue, and
`index('submissions_user_idx').on(t.userId)`.

The `period_key` format must be pinned now and written down: `YYYY-MM-DD` in
**America/Chicago** (campus local time), or the literal string `once`. Computing it in UTC means
the daily quest rolls over at 7pm local — a real bug, not a nitpick. Put the helper in
`server/utils/period.ts` and unit-test it across a DST boundary.

**`submission_photos`** — `storage_key` is the relative path under `UPLOAD_STORAGE_PATH`,
matching the existing `users/<id>/images/<uuid>` shape. Add
`index('submission_photos_submission_idx').on(t.submissionId)`; cascade-delete from
`submissions`.

**`houses`** — `user_id` unique FK. Created by a Better Auth `databaseHooks` after-create hook
(§6.3), not by application code scattered across routes.

**`user_items`** — `placed_house_id` is nullable (null = inventory). "Students can place items
only in their own house" cannot be expressed as an FK; it is an application check plus a test.
Add `index('user_items_user_idx').on(t.userId)` and
`index('user_items_placed_idx').on(t.placedHouseId)` — rendering a house queries the latter.

**`coin_transactions`** — the idempotency workhorse. `source_key` unique is what makes double
approval or double purchase safe. Key format, fixed now: `submission:<id>` / `referral:<id>` /
`purchase:<userItemId>`. Add `index('coin_transactions_user_idx').on(t.userId)`.

> **Balance cost:** balance = `SUM(amount)` over the user's rows. Correct, and fine at
> semester scale. If a user's ledger grows past a few thousand rows it becomes the hot path on
> every page load; the fix then is a cached balance column updated inside the same transaction,
> not a different ledger design. Ship the SUM, note the escape hatch.

**`friendships`** — SQLite cannot express "unique unordered pair" with a plain unique index. Add
a stored `pair_key` TEXT column that the application sets to
`[requesterId, recipientId].sort().join(':')`, with
`uniqueIndex('friendships_pair_idx').on(t.pairKey)`. That single index enforces both "no
duplicates" and "no reverse duplicate" atomically at the database level. Self-requests are
blocked by a `check()` on `requester_id <> recipient_id`.

**`invite_codes`** — codes must avoid ambiguous characters (no `0/O`, `1/I/l`) since students
type them. 8 characters from a ~30-character alphabet. Generate-and-retry on unique violation,
max 5 attempts.

**`referrals`** — `invited_user_id` unique is what enforces "one inviter per student". The
3-referral cap is **not** expressible as a constraint; see §7.3.

### 5.3 Zod schemas

Follow the existing pattern (`createSelectSchema` / `createInsertSchema` per table at the bottom
of each schema file). These become the API body validators — do not hand-write parallel Zod
objects inside route handlers.

---

## 6. Auth changes

### 6.1 UTD domain restriction (server-side, three places)

The proposal says to validate on the server "including during sign-up and email changes". One
check is not enough, because Better Auth has several entry points:

1. **`sendVerificationOTP`** in `server/utils/auth.ts` — reject before an email is ever sent, so
   the app is not an open relay for arbitrary addresses.
2. **`databaseHooks.user.create.before`** — the authoritative gate; blocks user creation no
   matter which flow reached it.
3. **`databaseHooks.user.update.before`** — blocks changing to a non-UTD address later.

```ts
// server/utils/email-domain.ts
const ALLOWED_DOMAINS = ['utdallas.edu']

export function isUtdEmail(email: string) {
  const at = email.lastIndexOf('@')
  return at !== -1 && ALLOWED_DOMAINS.includes(email.slice(at + 1).toLowerCase())
}
```

Exact match on the domain, lowercased — not `endsWith`, which also accepts
`someone@evilutdallas.edu`. Unit-test that case explicitly.

**Open question for the team:** the proposal says _exactly_ `utdallas.edu`. UTD also issues
`@student.utdallas.edu` in some contexts. Confirm with the partner before launch; keeping the
list in one array makes it a one-line change.

### 6.2 Enable self-sign-up

The README documents login-only against pre-seeded users. Set `disableSignUp: false` explicitly
on the `emailOTP` plugin (the option exists —
`node_modules/better-auth/dist/plugins/email-otp/types.d.mts:47`) rather than relying on the
default, and verify manually that a brand-new `@utdallas.edu` address can complete OTP and land
on `/`. Update the README's "How to Login" section in the same PR; it is currently wrong for
this app.

`user.name` is non-null. OTP sign-up does not collect a name, so either default it to the email
local-part in the create hook or add a one-field onboarding step. Recommend the hook default
plus an editable display name later.

### 6.3 Onboarding side effects in one hook

`databaseHooks.user.create.after` becomes the single place that runs, in one synchronous
transaction:

1. Create the student's `houses` row.
2. Generate their `invite_codes` row.
3. If a pending invite code is present, create the `referrals` row and run qualification (§7.3).

Doing this in a hook rather than in a route means no sign-in path can skip it.

### 6.4 Reviewer / admin role — **gap in the proposal**

`submissions.reviewed_by` is an FK to `user.id`, but nothing in the schema says _which_ users may
review. Without that, either any student can approve photos or approval is unimplementable.

Recommendation: add the Better Auth `admin` plugin (present at
`node_modules/better-auth/dist/plugins/admin/`), then add `requireAdmin(event)` alongside the
existing `requireUser(event)` in `server/utils/session.ts`. The column cost is five columns
across `user` and `session` — see §2.3, which also covers the one-column alternative.

**Decision the team still owes:** the proposal itself flags that "the team must decide how photo
submissions will be reviewed." The schema supports all three options (manual queue, auto-approve
with spot checks, trusted reviewer) — only route logic differs. This plan assumes **manual
review by an admin role**; if that changes, only the submission and review routes change, not
the schema.

---

## 7. Server module layout

New business logic goes in `server/utils/`, called by thin route handlers — matching how
`session.ts` and `db.ts` are already used.

```
server/utils/
  email-domain.ts   # isUtdEmail
  period.ts         # periodKeyFor(activity, now) in America/Chicago
  economy.ts        # awardForSubmission, purchaseItem, balanceFor   <- all sync-tx
  referrals.ts      # attachReferral, qualifyReferral                <- sync-tx, cap enforced
  storage.ts        # writeUpload / resolveUpload — extracted from upload.post.ts
```

### 7.1 API surface

| Route                                 | Method   | Notes                                                                          |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `/api/activities`                     | GET      | Active activities + this user's submission status for the current period       |
| `/api/submissions`                    | POST     | Creates submission; self-report → approve + award in one tx; photo → `pending` |
| `/api/submissions/:id/photos`         | POST     | Multipart upload via `storage.ts`; owner only, only while `pending`            |
| `/api/submissions/:id/photo/:photoId` | GET      | Streams the file; owner or admin only                                          |
| `/api/admin/submissions`              | GET      | Review queue, `status = 'pending'`                                             |
| `/api/admin/submissions/:id/review`   | POST     | approve/reject; approve awards coins in the same tx                            |
| `/api/house`                          | GET      | The user's house + placed `user_items` joined to `decor_items`                 |
| `/api/house/items/:id/place`          | PATCH    | Position/rotation; ownership check                                             |
| `/api/shop`                           | GET      | Active `decor_items` + the user's balance                                      |
| `/api/shop/purchase`                  | POST     | Balance check + debit + grant, **one tx**                                      |
| `/api/coins`                          | GET      | Balance + recent ledger                                                        |
| `/api/friends`                        | GET/POST | List / request                                                                 |
| `/api/friends/:id`                    | PATCH    | accept / decline                                                               |
| `/api/invite`                         | GET      | The user's code                                                                |

All of these are already protected by `server/middleware/auth.ts` — no middleware change needed
unless a public invite-code preview page is wanted, which would need a new entry in
`PUBLIC_PREFIXES`.

### 7.2 Purchase, atomically

```ts
export function purchaseItem(userId: string, itemId: string) {
  return db.transaction((tx) => {
    const item = tx
      .select()
      .from(decorItems)
      .where(and(eq(decorItems.id, itemId), eq(decorItems.active, true)))
      .get()
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Item unavailable' })

    const { balance } = tx
      .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)` })
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, userId))
      .get()!
    if (balance < item.priceCoins) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient coins' })
    }

    const userItemId = crypto.randomUUID()
    tx.insert(userItems)
      .values({ id: userItemId, userId, itemId, purchasePriceCoins: item.priceCoins })
      .run()
    tx.insert(coinTransactions)
      .values({
        userId,
        amount: -item.priceCoins,
        transactionType: 'purchase',
        sourceKey: `purchase:${userItemId}`,
      })
      .run()

    return userItemId
  })
}
```

The balance read and the debit sit in the same transaction, so two concurrent purchases cannot
both observe the pre-debit balance. WAL mode plus SQLite's write locking serializes them.

### 7.3 Referral cap, atomically

The cap is "3 **rewarded** referrals per inviter" — enforce it by counting inside the same
transaction that writes the reward, not by a pre-check:

```ts
export function qualifyReferral(referralId: string) {
  return db.transaction((tx) => {
    const ref = tx.select().from(referrals).where(eq(referrals.id, referralId)).get()
    if (!ref || ref.qualifiedAt) return // idempotent

    const { rewarded } = tx
      .select({ rewarded: sql<number>`count(*)` })
      .from(coinTransactions)
      .where(
        and(
          eq(coinTransactions.userId, ref.inviterId),
          eq(coinTransactions.transactionType, 'referral_reward')
        )
      )
      .get()!

    tx.update(referrals).set({ qualifiedAt: new Date() }).where(eq(referrals.id, referralId)).run()

    if (rewarded >= 3) return // qualified, but over cap
    const rule = tx
      .select()
      .from(rewardRules)
      .where(eq(rewardRules.actionCode, 'VERIFIED_REFERRAL'))
      .get()
    if (!rule?.enabled) return

    tx.insert(coinTransactions)
      .values({
        userId: ref.inviterId,
        rewardRuleId: rule.id,
        amount: rule.coinAmount,
        transactionType: 'referral_reward',
        sourceKey: `referral:${referralId}`,
      })
      .run()
  })
}
```

The `source_key` unique index is the backstop: even if the counting logic were wrong, the same
referral can never pay twice. Note the cap counts `transaction_type = 'referral_reward'` rows,
not `referrals` rows — so a referral that qualifies while over the cap stays recorded but
unpaid, which is what the proposal describes.

---

## 8. Photo storage

Reuse the existing pattern rather than introducing a second one: extract the write/serve logic
out of `server/api/users/upload.post.ts` into `server/utils/storage.ts`, and have both the
avatar route and the new submission-photo route call it.

Three defects in the current template code get fixed during that extraction — they matter more
once photos are user-submitted evidence:

1. `upload.post.ts:47` awaits callback-style `fs.writeFile`, which returns nothing — the handler
   responds before the bytes are on disk. Use `fs/promises`.
2. `[id]/profile.get.ts` joins `UPLOAD_STORAGE_PATH` with a database-sourced path without
   normalizing; validate that the resolved path stays inside the storage root before streaming.
3. Neither route validates content type or size. For submission photos, enforce via `file-type`
   magic bytes (already a dependency) — `image/jpeg|png|webp` only — plus a size cap. Store the
   sniffed type in `submission_photos.mime_type`, never the client-supplied one.

Photos are evidence tied to a student's participation, so the serve route must check
`submission.user_id === currentUser.id || isAdmin` before streaming. That is deliberately
stricter than the existing avatar route.

**`UPLOAD_STORAGE_PATH` defaults to `public/images`, which Nuxt serves statically with no auth
check at all.** Change the default to a non-public directory (`.data/uploads`, already gitignored)
in `.env.example` and in `storage.ts` before any submission photo is stored, or every photo is
publicly enumerable. See §3.4 for the separate question of whether local disk is the right target
in production at all.

---

## 9. Frontend

Nuxt UI v4 is already wired. `app/pages/index.vue` is template demo code (a user list) and gets
replaced, not extended.

```
app/pages/
  index.vue         # home: balance, today's quests, house preview
  house.vue         # house canvas + inventory drawer
  shop.vue          # decor catalog, purchase
  activities/[id].vue
  friends.vue
  invite.vue
  admin/review.vue  # gated on role
app/composables/
  useBalance.ts     # shared coin balance, refreshed after award/purchase
```

`app/middleware/auth.global.ts` needs one addition: `/admin/*` requires the admin role, not just
a session. `app/utils/auth-client.ts` needs `adminClient()` added so the client plugin list
mirrors the server's.

---

## 10. Migrations and seed

1. Write the schema files → `pnpm db:generate` → review the generated SQL **by hand** before
   committing. Drizzle's SQLite differ rebuilds tables for some changes; confirm there is no
   `DROP TABLE` against the four auth tables (§2.2), and scrutinise the `admin`-plugin migration
   in particular (§3.2).
2. `pnpm db:migrate` locally.
3. Extend `server/db/seed.ts`: add `sqlite.pragma('foreign_keys = ON')`, and keep it idempotent
   (it already checks before inserting the demo user — follow that shape):
   - the four `reward_rules` rows with the proposal's initial values;
   - a handful of `activities` covering both `quest`/`event` and `self_report`/`photo`;
   - a starter `decor_items` catalog.

   Seeding reward rules is **required**, not optional — `awardCoins` reads the amount from that
   table, so an unseeded database awards nothing. In stage/prod this depends on the
   `SEED_MIGRATION` repository variable (§3.4).

4. Replace the `seeded-user@email.com` demo user with a `@utdallas.edu` test account, since the
   domain check will now reject the old one.

`.github/workflows/deploy.yml` already runs build → migrate → push → deploy (REQ-NF-03), so
migrations ship safely with no pipeline change — subject to the bundle-path constraint in §3.4.

---

## 11. Testing

`vitest.config.ts` currently includes only `tests/nuxt/**` and runs in the `nuxt` environment.
The economy logic is plain Node + SQLite and should not pay that cost, so add a second test
project with `environment: 'node'` and `include: ['tests/server/**/*.test.ts']`.

These run against an in-memory SQLite (`new Database(':memory:')` plus the migration SQL), so
REQ-NF-06 still holds — no `.env`, no database file, no network:

| Test                                                                                        | Proves                   |
| ------------------------------------------------------------------------------------------- | ------------------------ |
| `isUtdEmail` accepts `a@utdallas.edu`, rejects `a@evilutdallas.edu` and `a@utdallas.edu.co` | §6.1                     |
| `periodKeyFor` at 11pm Chicago, including a DST-change date                                 | §5.2                     |
| Double-approving one submission inserts exactly one ledger row                              | `source_key` idempotency |
| Purchase with balance < price leaves ledger and `user_items` untouched                      | §7.2 atomicity           |
| The 4th referral qualifies but does not pay                                                 | §7.3 cap                 |
| Placing an item in another user's house is rejected                                         | `user_items` rule        |
| A reverse-direction friend request is rejected                                              | `pair_key` index         |

CI (`.github/workflows/test.yml`) runs `pnpm test` unchanged. Remember that the existing
`tests/nuxt/app-shell.test.ts` needs updating when `app.vue` is rebranded (§3.2).

---

## 12. Phased delivery

Sized so each phase is a reviewable PR that leaves `dev` working.

| #   | Scope                                                                                                           | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| 0   | FK + WAL pragmas, `.gitignore`, schema-file split (no new tables), `email-domain.ts` + tests, README login fix  | —          |
| 1   | `admin` plugin migration, UTD restriction in all three auth hooks, self-sign-up, `requireAdmin`, seed user swap | 0          |
| 2   | Schema for tables 5–8 + 12, migration, reward-rule & activity seed, `economy.ts` + tests                        | 1          |
| 3   | Activity list + self-report submission end to end (no photos yet), balance display, home page rebrand           | 2          |
| 4   | `storage.ts` extraction incl. the three fixes, non-public upload path, photo submission + admin review queue    | 3          |
| 5   | Schema for tables 9–11, house + shop + purchase transaction, placement                                          | 2          |
| 6   | Schema for tables 13–15, invite codes, referral qualification + cap, friends, `users/index.get.ts` scoping      | 1          |
| 7   | Requirement-matrix rows, docs, WPR update                                                                       | all        |

Phases 5 and 6 are independent of each other and of 3–4 once phase 2 lands, so they can run in
parallel across team members.

---

## 13. Requirements to append to `requirements.md`

Following the existing matrix format, mapped to GitHub issues rather than source files (per that
file's own instruction for project-specific requirements):

| ID        | Description                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------- |
| REQ-F-08  | Only `@utdallas.edu` addresses can sign up or change their email; enforced server-side         |
| REQ-F-09  | A student can self-register without a pre-seeded database row                                  |
| REQ-F-10  | A house and an invite code are created exactly once per verified student                       |
| REQ-F-11  | A student may submit an activity at most once per period; resubmission allowed after rejection |
| REQ-F-12  | Photo evidence is readable only by its submitter and reviewers                                 |
| REQ-F-13  | Approval awards coins exactly once per submission, in a single transaction                     |
| REQ-F-14  | A purchase checks balance, debits, and grants in a single transaction                          |
| REQ-F-15  | An inviter is rewarded for at most 3 qualifying referrals                                      |
| REQ-NF-08 | SQLite foreign-key enforcement is on for every application connection                          |
| REQ-NF-09 | No stress scores, journal content, or other non-essential personal data is stored              |

REQ-F-06's existing wording ("returns only non-sensitive fields") should also be revisited — see
§3.3.

---

## 14. Open decisions (blocking the phases noted)

1. **Photo review model** — manual admin queue is assumed. Blocks phase 4. _(Flagged in the
   proposal itself.)_
2. **Allowed email domains** — exactly `utdallas.edu`, or also `student.utdallas.edu`? Blocks
   phase 1.
3. **Who is an admin** — seeded from an email list, or promoted manually via Studio? Blocks
   phase 4.
4. **Period timezone** — America/Chicago assumed. Blocks phase 2.
5. **Where uploaded photos actually live in production** — EFS mount or S3 (§3.4). Blocks
   phase 4 going to stage.
6. **`SOCIAL_NUDGE` rule** — seed it with `enabled = 0` now, so the ledger's rule FK is stable
   when the feature lands.

---

## 15. Risks

- **The synchronous-transaction constraint (§4.1) is the highest-risk item.** An `async (tx)`
  callback looks correct, passes a happy-path test, and silently loses atomicity. Mitigation:
  the §11 tests that assert _nothing_ was written on the failure path, plus an explicit
  review-checklist item.
- **The `public/images` default (§8)** would expose every submission photo. Must change before
  phase 4 ships, not after.
- **Ephemeral container storage (§3.4)** means photos can vanish on deploy while the coin awards
  they justified remain. Decide the storage target before, not after, students upload anything.
- **The `admin`-plugin migration (§3.2)** is the only one that rewrites `user`. Read the
  generated SQL.
- **SQLite write concurrency** — every award and purchase takes a write lock. Fine at
  campus-pilot scale; WAL mode and short transactions keep it that way. If the pilot grows, the
  migration path is Postgres, which Drizzle makes a dialect change rather than a rewrite.
