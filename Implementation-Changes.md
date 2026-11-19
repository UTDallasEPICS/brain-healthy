# Implementation Changes

A running record of what was changed for each task file, why, and how it was verified. One
section per task, in the order they were done.

---

## 1. Coin Economy (`Coin-Economy.md`)

**Status before:** partly implemented. `getCoinBalance` worked; `awardCoins` existed with a
different signature and no way to record a reason; `getCoinTransactions`, `spendCoins`, both
API endpoints, and the tests did not exist.

### Database

| File                                               | Change                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `server/db/schema/economy.ts`                      | Added a `reason` column to `coin_transactions`                       |
| `drizzle/0003_curly_mimic.sql`                     | Generated migration: `ALTER TABLE coin_transactions ADD reason text` |
| `drizzle/meta/0003_snapshot.json`, `_journal.json` | Drizzle metadata for the new migration                               |

The migration is purely additive (no table rebuild), so no existing data is at risk. `reason` is
nullable only so rows written before it existed stay valid; the service always sets it.

Run `pnpm db:migrate` to apply it to a local `dev.db`.

### Service — `server/utils/coinService.ts`

| Function                                                    | Behaviour                                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `getCoinBalance(userId)`                                    | Sum of the user's ledger rows (unchanged)                                                                                                     |
| `getCoinTransactions(userId, { limit, offset })`            | **New.** id, amount, transaction type, reason, date — newest first                                                                            |
| `awardCoins(userId, amount, reason, referenceId, options?)` | **Re-signed to match the spec.** Adds a positive ledger row. Returns `false` (no coins moved) if `referenceId` was already used               |
| `spendCoins(userId, amount, reason, referenceId, options?)` | **New.** Adds a negative ledger row. Throws `409 Insufficient coins` if the user can't afford it. Returns `false` on a repeated `referenceId` |

`options` is `{ transactionType, rewardRuleId, writer }`. `writer` lets a caller pass its own
open transaction so the coin movement commits or rolls back together with the caller's other
writes — this is what quest completion will use.

**How the spec's rules are guaranteed:**

- **Atomic balance + record:** the ledger _is_ the balance (no separate balance column to
  drift). `spendCoins` reads the balance and writes the debit inside one `immediate` SQLite
  transaction, so two concurrent spends cannot both see the pre-debit balance.
- **No negative balances:** the balance check happens inside that transaction; on failure
  nothing is written.
- **No duplicate rewards:** `referenceId` is stored as the ledger's unique `source_key`.
  Retrying with the same id never moves coins twice. A spend that reuses a `referenceId`
  belonging to another user is rejected with `409`.
- **Input validation:** amount must be a non-negative integer; `reason` and `referenceId` must
  be non-blank (`400` otherwise).
- All functions are synchronous — Drizzle transactions on better-sqlite3 silently lose
  atomicity if their callback awaits.

### API endpoints

| Route                         | Response                                                                    |
| ----------------------------- | --------------------------------------------------------------------------- |
| `GET /api/coins/balance`      | `{ balance }`                                                               |
| `GET /api/coins/transactions` | Array of `{ id, amount, transactionType, reason, createdAt }`, newest first |

Both require a signed-in user (`401` otherwise) and only ever read the caller's own ledger — the
user id comes from the session, never from the request.

### Added beyond the spec

- **Pagination** on the history endpoint: `?limit=` (default 50, max 100) and `?offset=`.
  Invalid values return `400`. Without this the response grows unbounded with the ledger.
- **Stable ordering:** `created_at` has one-second resolution, so ties are broken by insert
  order.
- **Readable reasons for rewards:** `rewardService.ts` now passes a reason per activity type
  ("Quest completed", "Campus event check-in", "Social engagement", "Verified friend
  referral").

### Other files touched

| File                            | Change                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/utils/rewardService.ts` | Updated to the new `awardCoins` signature                                                                                                                |
| `tests/rewardService.test.ts`   | Its in-memory DB now applies migrations with Drizzle's migrator instead of a hand-maintained file list, which would have silently skipped migration 0003 |

### Tests — `tests/coinService.test.ts` (18 new)

Earning; duplicate awards; invalid input; spending; spending the exact balance; overspending
writes nothing; duplicate spends; a `referenceId` owned by another user; never spending another
user's coins; rollback inside a caller's transaction; empty history; newest-first ordering,
per-user scoping and pagination; endpoints return `401` signed out, only the caller's data
signed in, and `400` on a bad `limit`.

**Verification:** full suite 46/46 passing; `pnpm lint`, `pnpm typecheck`, and Prettier clean.

---

## 2. Configurable Reward System (`Reward-System.md`)

**Status before:** mostly implemented. Reward amounts already lived in `reward_rules` (seeded by
migration `0001` and `server/db/seed.ts`), `getRewardAmount`, `getRewardConfigurations`,
`grantActivityReward`, and `GET /api/rewards` existed, and duplicate claims and the 3-referral
cap were enforced. Four defects needed fixing.

### Fixes — `server/utils/rewardService.ts`

| #   | Problem                                                                                                                                                                                                   | Fix                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `getRewardConfigurations` / `GET /api/rewards` ignored `enabled`, so it advertised "social engagement: 5 coins" even though granting it fails                                                             | Each entry now includes `enabled`                                                                                                                                                                         |
| 2   | **Security:** a referral reward was paid for _any_ verified user — the `referrals` table was never checked, so a caller could claim 30 coins for someone they never invited. `qualified_at` was never set | `grantActivityReward` now requires a `referrals` row where the user is the inviter and the invitee is verified, and sets `qualified_at`. A referral past the cap is still marked qualified, just not paid |
| 3   | `grantActivityReward` always opened its own transaction, so quest completion could not save the completion and its coins atomically                                                                       | New optional `{ writer }` argument runs it inside the caller's transaction                                                                                                                                |
| 4   | A missing rule and a switched-off rule both returned `404`                                                                                                                                                | Missing → `404 Reward configuration not found`; disabled → `409 This reward is currently disabled`                                                                                                        |

`MAX_REWARDED_REFERRALS` (3) is now exported so other code and tests use the same value.

### Unchanged (already met the spec)

- Reward values are read from SQLite on every call; changing a row takes effect with no code
  change.
- Initial values: quest 1, QR event check-in 5, social engagement 5 (disabled until that
  feature exists), verified referral 30.
- Duplicate claims are blocked by the ledger's unique `source_key`
  (`reward:<activityType>:<referenceId>`); a given friend can only ever pay out once.
- The referral count and the award run in one `immediate` transaction, so concurrent grants
  cannot both slip under the cap.

### API — `GET /api/rewards`

Response is now `[{ activityType, coinAmount, enabled }]`. Requires sign-in (`401` otherwise).

### Tests — `tests/rewardService.test.ts` (rewritten, 17 tests)

Switched to the plain Node test environment (like `tests/coinService.test.ts`) and kept every
original case. Added: database changes take effect without code changes; disabled vs. missing
rules; the reward lands in the ledger with its reason; blank `referenceId`; rollback inside a
caller's transaction; referrals are marked qualified even over the cap; a referral pays once;
rejection of an unverified invitee, someone invited by another user, a verified user who was
never invited, a non-existent user, and a self-referral; `GET /api/rewards` returns `401` signed
out and includes `enabled` signed in.

**Verification:** full suite 59/59 passing; `pnpm lint`, `pnpm typecheck`, and Prettier clean on
all touched files.

### Note for later tasks

Nothing calls `grantActivityReward('verified_friend_referral', …)` yet. The friend-invite feature
will need to create the `referrals` row at sign-up (via an invite code) and call this once the
invitee verifies their email.

---

## 3. Quest Retrieval and Habit Tracking (`Quest-Retrieval-Habit-Tracking.md`)

**Status before:** not implemented. The `activities` and `submissions` tables existed, but
there was no quest service, no quest endpoints, no sample quests, and no period-key helper —
and the schema allowed only `daily` and `once`, not the spec's `weekly`.

### How quests map onto the existing schema

No new tables. A **quest** is an `activities` row with `activity_type = 'quest'`; a
**completion** is a `submissions` row. The existing unique index on
`(user_id, activity_id, period_key)` is what limits a student to one completion per period.

Per period, a quest is:

- **completed** — an `approved` submission exists;
- **eligible** — the quest is active and inside its optional `starts_at`/`ends_at` window, and
  no `pending` or `approved` submission exists. A `rejected` one can be resubmitted.

### Database

| File                                               | Change                                                 |
| -------------------------------------------------- | ------------------------------------------------------ |
| `server/db/schema/activities.ts`                   | `RECURRENCES` and its CHECK constraint gain `'weekly'` |
| `drizzle/0004_military_thing.sql`                  | Migration — **hand-edited**, see below                 |
| `drizzle/meta/0004_snapshot.json`, `_journal.json` | Drizzle metadata                                       |

**Data-loss bug in the generated migration (caught and fixed).** SQLite can only change a CHECK
constraint by rebuilding the table. Drizzle's generated rebuild relies on
`PRAGMA foreign_keys=OFF`, but the migrator runs migrations inside a transaction, where that
pragma does nothing. Tested on a database with data: `DROP TABLE activities` cascaded and
**deleted every row in `submissions`** (and therefore `submission_photos`).

The hand-edited migration copies `submissions` and `submission_photos` aside into
constraint-free tables, rebuilds `activities`, then restores them. Verified with foreign keys
both **on and off**: every row survives byte-identical, foreign keys still point at the right
tables and are enforced, `weekly` is accepted, invalid values are still rejected, indexes are
recreated, and no temporary tables are left behind.

> **For future migrations:** any Drizzle-generated SQLite table rebuild (`__new_<table>` +
> `DROP TABLE`) on a table that has `ON DELETE CASCADE` children will silently delete the
> children's rows. Review generated SQL for this pattern before committing.

### Period keys — `server/utils/period.ts` (new)

`periodKeyFor(recurrence, now)` is the single place a `period_key` is built:

| Frequency | Key          | Rolls over                                   |
| --------- | ------------ | -------------------------------------------- |
| daily     | `2026-10-28` | Midnight, campus time                        |
| weekly    | `2026-W44`   | Monday midnight, campus time (ISO 8601 week) |
| once      | `once`       | Never                                        |

Campus time is `America/Chicago`. Using UTC would make daily quests reset at 6–7pm in Dallas.
Daylight-saving changes and ISO week-year boundaries (e.g. 2027-01-01 is in `2026-W53`) are
handled and tested.

### Service — `server/utils/questService.ts` (new)

| Function                                     | Behaviour                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `getAvailableQuests(userId, now?)`           | Active, in-window quests with `completed` / `eligible` for the current period         |
| `getQuestById(questId)`                      | Quest details, or `undefined` for unknown ids, events, or inactive quests             |
| `getQuestHistory(userId, { limit, offset })` | Approved quest completions, newest first                                              |
| `isQuestEligible(userId, questId, now?)`     | Frequency rule check; `false` for unknown, inactive, not-yet-started, or ended quests |
| `getQuestForUser(userId, questId, now?)`     | **Added beyond the spec:** details plus status — powers `GET /api/quests/:id`         |

`now` is injectable so tests can pin the clock. The reward amount is read from the quest's own
`reward_rules` row (so it is configurable, per the Reward System) and shown as `0` while that
reward is disabled.

### API endpoints

All require sign-in (`401` otherwise) and only read the caller's own data.

| Route                     | Response                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /api/quests`         | `[{ id, name, description, frequency, rewardAmount, contentUrl, completed, eligible }]`                      |
| `GET /api/quests/:id`     | One quest, same shape; `404 Quest not found` for unknown/inactive ids                                        |
| `GET /api/quests/history` | `[{ questId, name, frequency, completedAt }]`, newest first; `?limit=` (≤100) / `?offset=`, `400` if invalid |

### Sample quests — `server/db/seed.ts`

`pnpm db:seed` now adds five self-report quests, all paying the `QUEST_COMPLETE` reward:
Hydration check-in, Screen-time break, Stress check-in (daily); Screen-free evening (weekly);
Intro to stress quests (one-time). Fixed ids keep it idempotent — verified by running the seed
twice on a freshly migrated database (still exactly 5 quests).

### Added beyond the spec

- `eligible` alongside `completed` in the list and detail responses, so the UI can disable a
  quest that is pending review or outside its window — not just completed ones.
- `contentUrl` in quest responses, for the micro-lesson content the brief says will be supplied.
- Pagination on history, matching `/api/coins/transactions`.
- Start/end windows are respected, so time-limited quests work with no further changes.

### Other changes

- Renamed `MAX_HISTORY_LIMIT` to `MAX_COIN_HISTORY_LIMIT` / `MAX_QUEST_HISTORY_LIMIT`. Nitro
  auto-imports every export in `server/utils/`, so two modules exporting the same name
  collided (Nitro warned and silently picked one).

### Tests — `tests/questService.test.ts` (24 new)

Period keys: campus vs. UTC date, both DST transitions, Sunday→Monday week rollover, ISO
week-year boundaries, `once`. Service: list contents and shape; events, inactive, and
out-of-window quests excluded; per-user status; configurable/disabled reward amount; daily,
weekly and one-time rules; pending blocks, rejected allows resubmission; details and `undefined`
cases; eligibility edge cases; history ordering, filtering (approved quests only, own user),
pagination, empty. Endpoints: `401` on all three, list, detail, `404`, history not shadowed by
`/:id`, `400` on a bad `limit`.

**Verification:** full suite 83/83 passing; `pnpm lint`, `pnpm typecheck`, and Prettier clean on
all touched files.

### Note for the next task

Nothing writes `submissions` yet — Quest Completion will. It should build the period key with
`periodKeyFor`, and rely on the unique index (not only `isQuestEligible`) to reject a second
completion, since two simultaneous requests can both pass a pre-check.

---

## 4. Quest Completion and Coin Rewards (`Quest-Completion-Coin-Rewards.md`)

**Status before:** not implemented. The pieces it depends on (coin ledger, reward service, quest
retrieval) were done in sections 1–3; nothing wrote `submissions` or connected quests to coins.

### Service — `server/utils/questService.ts`

| Function                                          | Behaviour                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `completeQuest(userId, questId, now?)`            | **New.** Validates, records the completion, awards coins — all in one transaction       |
| `getQuestCompletionStatus(userId, questId, now?)` | **New.** `{ periodKey, submissionStatus, completed, eligible, available, completedAt }` |
| `isQuestEligible(userId, questId, now?)`          | Unchanged from section 3; used by the status logic                                      |

`completeQuest`, in a single `immediate` SQLite transaction:

1. Looks up the quest — `404 Quest not found` for unknown ids, events, or inactive quests.
2. Rejects photo-evidence quests — `400` (photo upload and review is a separate feature; all
   seeded quests are self-report).
3. Checks the current period — `409` if outside the quest's start/end window, already completed,
   or awaiting review.
4. Saves the submission as `approved` (self-report needs no review). A previously **rejected**
   submission for the same period is reopened rather than duplicated, since the unique index
   allows one row per period.
5. Awards coins with `grantActivityReward(userId, 'individual_quest_completion',
'submission:<id>', { writer: tx })`, which reads the amount from `reward_rules`.

It returns `{ questId, status: 'completed', periodKey, completedAt, coinsEarned, balance }`.

**How the acceptance criteria are guaranteed:**

- **No partial updates:** the submission and the coin ledger row are written in one
  transaction. If the reward step fails, the completion is rolled back too. Verified by a test
  that also fails when the transaction is removed.
- **No duplicate rewards in a period:** the write lock is taken _before_ the eligibility check,
  so two simultaneous requests cannot both pass it; the `(user_id, activity_id, period_key)`
  unique index and the ledger's unique `source_key` (`reward:…:submission:<id>`) are backstops.
- **Configured amount:** read from the database on every completion.

### API — `POST /api/quests/:id/complete`

Requires sign-in (`401`). Responds `200` with the result above; `404` / `400` / `409` as listed.

### Design decisions

| Decision                                                                                                                  | Why                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The `rewardAmount` shown by `GET /api/quests` now comes from the `QUEST_COMPLETE` rule, not each quest's `reward_rule_id` | The spec has completion pay through `grantActivityReward('individual_quest_completion')`, which always uses `QUEST_COMPLETE`. Reading both from the same rule means the amount a student is shown is always the amount they receive. (`activities.reward_rule_id` is still stored.) |
| A switched-off quest reward still records the completion, with `coinsEarned: 0`                                           | Habit tracking should keep working if an admin pauses coin rewards. Added a `skipIfDisabled` option to `grantActivityReward` for this; a _missing_ rule still throws `404`, since that is a configuration bug.                                                                      |
| Photo-evidence quests are rejected with `400`                                                                             | Completing one needs an upload + review flow, which is out of this task's scope.                                                                                                                                                                                                    |

### Other files touched

| File                                      | Change                                       |
| ----------------------------------------- | -------------------------------------------- |
| `server/utils/rewardService.ts`           | `grantActivityReward` gains `skipIfDisabled` |
| `server/api/quests/[id]/complete.post.ts` | New endpoint                                 |
| `tests/rewardService.test.ts`             | +1 test for `skipIfDisabled`                 |

### Tests — `tests/questCompletion.test.ts` (20 new)

Successful completion (submission, ledger row and reason, response shape); history and status
updated; configured amount honoured; disabled reward still records the habit for 0 coins; users
are independent; same-period duplicates rejected with no extra coins; daily (campus midnight),
weekly (ISO week), and one-time rules through completion; pending blocks; rejected is reopened
as one row; `404` for unknown/event/inactive, `400` for photo quests, `409` outside the window;
atomic rollback when the reward step fails; `getQuestCompletionStatus`; endpoint `401` (nothing
written), `200` body, `409` duplicate, `404` unknown.

**Verification:** full suite 104/104 passing; `pnpm lint`, `pnpm typecheck` (exit 0), and
Prettier clean on all touched files.

---

## Summary — all four tasks

| Task                             | Before          | Result                                                            |
| -------------------------------- | --------------- | ----------------------------------------------------------------- |
| Coin Economy                     | Partial         | Ledger service, 2 endpoints, `reason` column, 18 tests            |
| Configurable Reward System       | Mostly done     | 4 defects fixed (incl. a referral-reward security gap), 18 tests  |
| Quest Retrieval & Habit Tracking | Not implemented | Weekly support, period keys, 3 endpoints, sample quests, 24 tests |
| Quest Completion & Coin Rewards  | Not implemented | Atomic completion + reward, 1 endpoint, 20 tests                  |

Tests went from 28 to 104. Two migrations were added (`0003`, `0004`); `0004` was hand-edited to
fix a data-loss bug in Drizzle's generated SQL. To pick everything up locally:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
```

---

## 5. Test console UI (dev only)

A page for exercising every feature above by hand, against the real API and your local
database: **`/dev/economy`** (also linked as **Test console** in the header under `pnpm dev`).

### How to run it

1. In `.env`, set `SEED_USER_PASSWORD` to any password you like (it is empty by default). The
   seeded user is pre-verified, so no email is needed — the `.env.example` email settings are
   placeholders and cannot send verification links.
2. Run:

   ```bash
   pnpm install
   pnpm db:migrate
   pnpm db:seed      # reward rules, 5 sample quests, and the seeded user
   pnpm dev
   ```

3. Open <http://localhost:3000/auth> and sign in as `seeded-user@utdallas.edu` with that
   password.
4. Open <http://localhost:3000/dev/economy> and click **Run all checks**.

### What is on the page

| Panel                    | What it does                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Automated checks**     | Resets your test data, then runs 24 checks covering every acceptance criterion in sections 1–4, showing pass/fail and details per step. Stops at the first failure.                        |
| **Quests**               | Every quest with frequency, reward, and status (completed / eligible / blocked). Complete, view details, or mark the current period's submission pending or rejected.                      |
| **Simulated time**       | A clock (`+1 day`, `+7 days`, or any date) so daily / weekly / one-time rules can be tested without waiting. Status and Complete use it; "Real time" switches back.                        |
| **Quest history**        | `GET /api/quests/history`.                                                                                                                                                                 |
| **Coins**                | Award and spend forms with a `referenceId` (reuse one to see duplicate prevention; overspend to see the `409`), and the transaction history with a `limit` control.                        |
| **Reward configuration** | Edit any reward's amount or enabled flag (writes `reward_rules` directly — no code change), grant activity rewards, and simulate inviting verified / unverified friends to test the 3-cap. |
| **Request log**          | Every request the page makes — method, path, status, request body, and response JSON.                                                                                                      |
| **Reset my test data**   | Clears your coins, quest completions, and test invitees, and restores the default reward values.                                                                                           |

### Dev-only helper endpoints — `server/api/dev/`

The console needs to reach states the real API cannot create yet, so it uses these helpers
alongside the real endpoints:

| Route                                 | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `POST /api/dev/coins/award`, `/spend` | Call `awardCoins` / `spendCoins` directly (no shop exists yet)           |
| `POST /api/dev/rewards/grant`         | Call `grantActivityReward` (QR check-in, social, referral)               |
| `PATCH /api/dev/rewards/:actionCode`  | Edit a reward rule, as an admin would in the database                    |
| `POST /api/dev/referrals`             | Create a test invitee + referral row (no invite flow exists yet)         |
| `GET /api/dev/quests?now=`            | `GET /api/quests` at a simulated time                                    |
| `POST /api/dev/quests/:id/complete`   | `POST /api/quests/:id/complete` at a simulated time                      |
| `POST /api/dev/quests/:id/submission` | Mark the current period pending / rejected (photo review does not exist) |
| `POST /api/dev/reset`                 | Clear your test data and restore default reward values                   |

**Safety:** every one goes through `requireDevUser()` (`server/utils/devTools.ts`), which
returns `404` unless `import.meta.dev` — i.e. only under `pnpm dev`, never in a production build.
They still require sign-in and act only on the caller's own data (reward rules are shared, so
editing or resetting those affects everyone on that dev database). The page itself also 404s
outside dev, and the header link is hidden. `tests/devTools.test.ts` proves all nine routes
answer `404` outside dev mode without touching the database.

### Files

| File                        | Change                                        |
| --------------------------- | --------------------------------------------- |
| `app/pages/dev/economy.vue` | New — the console                             |
| `app/app.vue`               | Dev-only "Test console" link in the header    |
| `server/utils/devTools.ts`  | New — `requireDevUser`, default reward values |
| `server/api/dev/**`         | New — 9 helper routes                         |
| `tests/devTools.test.ts`    | New — 9 tests                                 |

### Verification

- Started `pnpm dev` against a freshly migrated and seeded scratch database, signed in as the
  seeded user, and confirmed the page server-renders and the real and dev endpoints respond.
- Replayed the console's full "Run all checks" request sequence and assertions against that
  running server: **24/24 passed**.
- Not verified: clicking through the page in a real browser (the Chrome extension was not
  connected), so client-side interactions are untested beyond compiling and server rendering.
- Full suite 113/113 passing; `pnpm lint`, `pnpm typecheck`, and Prettier clean.
