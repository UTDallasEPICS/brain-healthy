Description
Implement the backend coin economy for Belonging Blocks using Nuxt 4, Drizzle ORM, and SQLite. Users should be able to view their coin balance and transaction history, while other backend features can securely award and deduct coins.

API Endpoints

GET /api/coins/balance
Retrieve the authenticated user's current coin balance.
GET /api/coins/transactions
Retrieve the authenticated user's coin transaction history.
Include the amount, transaction type, reason, and date.
Return transactions from newest to oldest.
Backend Functions

Create server/utils/coinService.ts with the following functions:

getCoinBalance(userId) — Retrieve a user's current coin balance.
getCoinTransactions(userId) — Retrieve a user's transaction history.
awardCoins(userId, amount, reason, referenceId) — Add coins and record the transaction.
spendCoins(userId, amount, reason, referenceId) — Deduct coins and record the transaction.
Files to Create or Modify

server/api/coins/balance.get.ts — New API endpoint.
server/api/coins/transactions.get.ts — New API endpoint.
server/utils/coinService.ts — Coin economy business logic.
server/db/schema/economy.ts — Update existing schema if necessary.
tests/coinService.test.ts — Unit tests.
Tasks


Review the existing coin economy database schema.

Implement both GET API endpoints using Better Auth session validation.

Implement the four reusable coin service functions.

Store all coin earnings and spending in the database.

Ensure balance changes and transaction records are atomic.

Prevent negative balances and duplicate rewards for the same activity.

Write Vitest tests for earning, spending, balance retrieval, and transaction history.
Acceptance Criteria

Authenticated users can retrieve their own coin balance and transaction history.
Backend services can award and deduct coins securely.
Users cannot spend more coins than they own.
Duplicate activity rewards cannot be claimed.
All transactions are recorded correctly in SQLite.
All relevant Vitest tests pass.