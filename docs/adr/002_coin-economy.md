# ADR 002: Coin Economy — Ledger Service and Read-Only Coin API

- **Status:** Proposed (accepted when the PR for issue #3 merges into `dev`)
- **Deciders:** Ridwan Galib (@Ridwan644)
- **Date:** 2026-10-11
- **Issue:** #3 — Coin Economy: Awards, Spending, and Track Coins

> **How to use the service:** see [`docs/coin-service.md`](../coin-service.md). This ADR explains
> _what changed and why_.

---

## 1. Context & Problem Statement

Students earn coins for activities and referrals, and spend them in the shop. The database table for
this, `coin_transactions` in `server/db/schema/economy.ts`, already existed, but nothing read from or
wrote to it. Issue #3 asked for:

- reusable server functions to award coins, spend coins, and read a balance and history;
- two endpoints so a signed-in student can see their own balance and history;
- guarantees that nobody can overspend, and the same activity can't be rewarded twice.

Every later feature that moves coins (approving submissions, referrals, the shop) will call these
functions, so they needed to be safe and easy to call correctly.

### What this PR changes

| File                                   | Change | What it is                                                          |
| -------------------------------------- | ------ | ------------------------------------------------------------------- |
| `server/utils/coinService.ts`          | New    | `getCoinBalance`, `getCoinTransactions`, `awardCoins`, `spendCoins` |
| `server/api/coins/balance.get.ts`      | New    | `GET /api/coins/balance` → `{ balance }`                            |
| `server/api/coins/transactions.get.ts` | New    | `GET /api/coins/transactions` → history, newest first               |
| `tests/server/coinService.test.ts`     | New    | 29 tests for the service and both routes                            |
| `docs/coin-service.md`                 | New    | How the ledger works and how to call the service                    |
| `docs/adr/002_coin-economy.md`         | New    | This document                                                       |

**Not changed:** the database schema, migrations, the auth gateway, and any existing route or test.

---

## 2. Decision Drivers (Goals & Constraints)

- **No overspending,** even if a student double-clicks "Buy".
- **No double rewards:** one submission, referral, or purchase moves coins at most once.
- **Privacy:** a student can only ever see their own coins.
- **No schema change** unless truly necessary. The ledger table was already designed and migrated.
- **Constraint (plan §4.1):** with our SQLite driver, `db.transaction` callbacks must be
  **synchronous**. An `async` callback silently commits early and breaks atomicity.
- **Constraint:** Vitest only runs `tests/nuxt/**` and `tests/server/**`.

---

## 3. Options Considered

### 3a. Where the balance lives

**Option 1: a stored `balance` column**, updated on every award and spend.

- **Pros:** reading a balance is one lookup.
- **Cons:** two sources of truth (the column and the history) that a bug can pull apart; needs a
  schema change and migration.

**Option 2: no stored balance; it's `SUM(amount)` over the user's ledger rows.**

- **Pros:** the balance can't disagree with the history; full audit trail for free; already what
  the schema and the implementation plan (§7.2) specify; no migration.
- **Cons:** sums rows on every read. That's negligible here, since there are few rows per student
  and they're indexed by `user_id`.

### 3b. Function signatures

The issue suggested `awardCoins(userId, amount, reason, referenceId)`. The table has no `reason`
column; it has `transaction_type`, a unique `source_key`, and an optional `reward_rule_id`.

**Option 1: positional arguments,** mapped to the table. Closest to the issue, but `userId` and
`sourceKey` are both strings and easy to swap by accident.

**Option 2: one named object,** e.g. `awardCoins({ userId, amount, transactionType, sourceKey })`.
Every value is labeled at the call site, and TypeScript checks each field.

### 3c. The "reason" in transaction history

The issue asks each history row to include "amount, transaction type, reason, and date".

**Option 1: add a `reason` column.** Needs a schema change and a migration.

**Option 2: show `source_key` as `reason`.** It already records why coins moved
(e.g. `submission:<id>`). No schema change.

### 3d. What a duplicate does

**Option 1: return `{ awarded: false }`.** Easy for a caller to ignore by mistake.

**Option 2: throw a 409 error.** Matches the plan's "Insufficient coins" example; routes return the
right HTTP status automatically.

---

## 4. Decision & Justification

**Chosen:** 3a Option 2 (sum the ledger), 3b Option 2 (named object), 3c Option 2 (`source_key` as
`reason`), 3d Option 2 (409).

### Rationale

- **Ledger sum** keeps one source of truth and needs no schema change, matching what the team
  already designed. "Balance changes and transaction records are atomic" holds by construction,
  because adding a row _is_ the balance change.
- **Named objects** make the money-moving calls hard to get wrong, which matters because many future
  features will call them.
- **`source_key` as `reason`** meets the issue's requirement without a migration. The frontend can
  turn `submission:<id>` into friendly text. A dedicated column can still be added later.
- **409 on duplicates** makes "already paid" impossible to ignore, and nothing is written.

### How the guarantees are enforced

| Guarantee                     | Enforced by                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| No overspending               | `spendCoins` reads the balance and inserts the debit in **one synchronous transaction**     |
| No double reward or charge    | The database's **unique index on `source_key`**; the service turns a violation into a 409   |
| Valid amounts only            | Amount must be a positive whole number, otherwise 400; the function sets the sign           |
| Students see only their coins | Routes take the user id **only** from `requireUser(event)`, never from the URL or body      |
| Stable "newest first"         | Sort by `created_at`, then SQLite's `rowid` (rows in the same second still order correctly) |

### Error responses

| Status | When                                                           |
| ------ | -------------------------------------------------------------- |
| 400    | Amount is 0, negative, or not a whole number                   |
| 401    | Not signed in (from `requireUser`)                             |
| 409    | `Insufficient coins`, `Already awarded`, or `Already recorded` |

---

## 5. Consequences & Next Steps

### Positive Consequences

- Future features (submission approval, referrals, shop) have one safe way to move coins.
- Duplicate rewards and overspending are blocked by the database, not just by careful callers.
- 29 automated tests cover balances, awards, spends, refusals, ordering, and privacy. They run in
  `pnpm test` with an in-memory database, so they need no `.env` and no `dev.db`.

### Negative Consequences / Trade-offs

- The history's `reason` is a machine key (`submission:<id>`), not human text. The frontend needs to
  map it to a label.
- The test file's location differs from the issue (`tests/server/`, not `tests/`), because otherwise
  Vitest would silently skip it.
- The route tests use a stand-in gateway that marks a user as signed in via a test header. Real
  sign-in is already covered by `tests/server/auth.test.ts`.

### Rules for teammates

1. **Move coins only through `coinService.ts`.** Never insert into `coin_transactions` directly.
2. **Never write `async (tx) =>`** in a `db.transaction`, and never `await` inside one. Use
   `.get()`, `.all()`, `.run()`.
3. **Always pass a unique `sourceKey`:** `submission:<id>`, `referral:<id>`, or `purchase:<userItemId>`.
4. **Pass amounts as positive numbers.** `spendCoins({ amount: 50 })` stores −50.
5. **Handle the 409s.** In a route they become HTTP responses automatically. In other code, a 409
   from `awardCoins` means "already paid", not a crash.

### Setup notes (found during this work)

- **`better-sqlite3` "Could not locate the bindings file":** pnpm skipped its build step. Fix it
  without changing config:
  `cd node_modules/better-sqlite3 && npm run install && cd ../..`
- **Red underlines in `tests/server/*.test.ts`:** no tsconfig covers `tests/`, so editors can't
  resolve `h3` or `~~`. Tests still run and pass. `auth.test.ts` has the same issue.
- **`.nuxtrc` changes by itself** when tests or typecheck run (it records the installed
  `@nuxt/test-utils` version). Don't commit it.

### Action Items

- Use `awardCoins` when a submission is approved and when a referral qualifies.
- Use `spendCoins` inside the shop purchase flow (plan §7.2).
- Frontend: map `reason` keys to friendly text in the coin history view.
- Follow-up issue: add a tsconfig that covers `tests/` so editors type-check test files.
- Decide whether a human-readable `reason` column is wanted (would need a migration).
