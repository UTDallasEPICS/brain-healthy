mplement Configurable Coin Reward System

Description
Implement a configurable reward system for Belonging Blocks that determines how many coins users earn from different activities. Reward values should be stored in the database rather than hardcoded, allowing them to be updated without modifying application code.

Reward Configuration

Activity	Coins
Individual quest completion	1
QR event check-in	5
Social engagement (hugs/messages)	5
Verified friend referral	30
Friend referral rewards must be limited to 3 verified referrals per user.

Backend Functions

Create server/utils/rewardService.ts with the following functions:

getRewardAmount(activityType) - Retrieve the configured coin reward for an activity.
getRewardConfigurations() - Retrieve all available reward configurations.
grantActivityReward(userId, activityType, referenceId) - Validate reward eligibility and award the configured amount using coinService.ts.
API Endpoints

GET /api/rewards
Retrieve the current reward values for different activities.
Return the activity type and corresponding coin amount.
Files to Create or Modify

server/api/rewards/index.get.ts - New API endpoint.
server/utils/rewardService.ts - Reward configuration and distribution logic.
server/db/schema/economy.ts - Update reward configuration tables if necessary.
tests/rewardService.test.ts - Unit tests.
Tasks


Review the existing economy schema and create a reward configuration table if necessary.

Store initial reward values in SQLite.

Implement the reward service functions.

Implement GET /api/rewards.

Integrate reward distribution with awardCoins() from the previous issue.

Prevent duplicate rewards for the same qualifying activity.

Enforce the maximum of 3 rewarded friend referrals per user.

Write Vitest tests for reward lookup, distribution, and duplicate prevention.
Acceptance Criteria

Reward amounts are retrieved from SQLite rather than hardcoded.
Reward values can be changed in the database without modifying application code.
Backend services can distribute rewards through the existing coin economy.
Users cannot claim the same activity reward multiple times.
Users can earn referral rewards for a maximum of 3 verified friends.
All relevant Vitest tests pass.
Dependencies

Implement Coin Economy API and Transaction Tracking
Scope

This issue focuses on configuring and distributing rewards. Implementing actual quest completion, QR scanning, friend invitations, and social interactions will be handled in separate issues.