# Coin Service (`server/utils/coinService.ts`)

The coin service is the **only** place that reads or writes coins. Routes and other features should
call these functions, never query `coin_transactions` directly.

## How coins work

Coins work like a **bank statement**:

- Every time coins move, we add one row to the `coin_transactions` table.
- **Earning** adds a positive row (+10). **Spending** adds a negative row (−50).
- A user's **balance is never stored**. It's always calculated by adding up all their rows, so it
  can't get out of sync.
- Rows are **never edited or deleted**. Corrections would be new rows.

Every row has a **`sourceKey`**, like a receipt number, that says _why_ the coins moved:

| Reason              | `sourceKey` format          |
| ------------------- | --------------------------- |
| Approved activity   | `submission:<submissionId>` |
| Qualifying referral | `referral:<referralId>`     |
| Shop purchase       | `purchase:<userItemId>`     |

The database refuses two rows with the same `sourceKey`. This is the safety net that stops anyone
being **paid or charged twice** for the same thing, even if a button is double-clicked or a request
is retried.

## Functions

### `getCoinBalance(userId)`

**What it does:** returns how many coins a user has right now.
**Returns:** a number. A user with no history gets `0`.

```ts
const balance = getCoinBalance(user.id) // e.g. 120
```

### `getCoinTransactions(userId)`

**What it does:** returns the user's full coin history, **newest first**.
**Returns:** a list of rows. Each has `id`, `amount`, `transactionType`, `sourceKey`,
`rewardRuleId`, and `createdAt`.

```ts
const history = getCoinTransactions(user.id)
```

Two rows created in the same second still come back in the correct order.

### `awardCoins({ userId, amount, transactionType, sourceKey, rewardRuleId? })`

**What it does:** gives coins to a user.

**Inputs:**

- `amount`: a positive whole number.
- `transactionType`: `'activity_reward'` or `'referral_reward'`.
- `sourceKey`: why the coins are being given (see the table above).
- `rewardRuleId`: optional; the reward rule that set the amount.

**Returns:** the new row.

```ts
awardCoins({
  userId: user.id,
  amount: 10,
  transactionType: 'activity_reward',
  sourceKey: `submission:${submission.id}`,
})
```

**Errors:**

| Status                    | When                                                  |
| ------------------------- | ----------------------------------------------------- |
| **400**                   | `amount` is 0, negative, or not a whole number        |
| **409 "Already awarded"** | this `sourceKey` was used before. Nothing is written. |

### `spendCoins({ userId, amount, sourceKey })`

**What it does:** takes coins from a user, but only if they have enough.

**Inputs:**

- `amount`: a positive whole number. Pass `50` to spend 50, and it's stored as −50.
- `sourceKey`: usually `purchase:<userItemId>`.

**Returns:** the new (negative) row.

```ts
spendCoins({ userId: user.id, amount: 50, sourceKey: `purchase:${userItemId}` })
```

**Errors:**

| Status                       | When                                    |
| ---------------------------- | --------------------------------------- |
| **400**                      | bad `amount`                            |
| **409 "Insufficient coins"** | balance is too low. Nothing is written. |
| **409 "Already recorded"**   | this `sourceKey` was used before        |

**Safe under double-clicks:** the balance check and the debit happen as **one locked step** (a
database transaction). Two purchases at the same moment can't both spend the same coins.

## Rules for anyone editing this file

1. **Transactions must be synchronous.** Write `db.transaction((tx) => { ... })`, **never**
   `async (tx) =>`, and no `await` inside. With our SQLite driver, an async callback silently
   breaks the locking (see `docs/implementation-plan.md` §4.1).
2. **Use `tx`, not `db`,** inside a transaction.
3. **Never let a user ID come from the request body or URL.** Routes must use
   `requireUser(event).id`, so users can only see or change their own coins.
4. **Amounts are always passed as positive.** The function decides the sign.
