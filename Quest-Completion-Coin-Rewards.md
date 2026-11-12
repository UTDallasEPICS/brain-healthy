Implement Quest Completion and Coin Rewards

Description

Implement the backend functionality that allows users to complete wellness quests and automatically earn coins. This feature should connect the existing Quest System with the Coin Economy so that successful quest completions update the user's coin balance and completion history.

API Endpoints

POST /api/quests/:id/complete
Allow authenticated users to mark a wellness quest as completed.
Verify that the quest exists and is available for completion.
Check whether the user has already completed the quest during the current eligible period.
Award the configured number of coins upon successful completion.
Return the completion status, coins earned, and updated coin balance.
Backend Functions

Update server/utils/questService.ts with the following functions:

completeQuest(userId, questId) - Validate and record a user's quest completion.
isQuestEligible(userId, questId) - Use the existing function to check whether the quest can be completed.
getQuestCompletionStatus(userId, questId) - Retrieve the user's current completion status for a specific quest.
Integrate the existing coin economy functions:

getRewardAmount(activityType) - Retrieve the configured reward amount for quest completion.
grantActivityReward(userId, activityType, referenceId) - Award coins using the existing reward and coin services.
Files to Create or Modify

server/api/quests/[id]/complete.post.ts - New endpoint for completing quests.
server/utils/questService.ts - Add quest completion functionality.
server/utils/rewardService.ts - Integrate quest rewards if necessary.
server/db/schema/activities.ts - Review or update quest completion tracking if necessary.
tests/questCompletion.test.ts - Unit tests.
Tasks

Review the existing quest completion database schema.
Implement the POST API endpoint.
Validate quest existence and completion eligibility.
Record successful quest completions in SQLite.
Connect quest completion to the configurable coin reward system.
Automatically update the user's coin balance after completing a quest.
Prevent users from earning duplicate rewards for the same quest during the same eligible period.
Ensure quest completion and coin rewards are saved together in a single database transaction.
Write Vitest tests for successful completions, duplicate submissions, and invalid requests.
Acceptance Criteria

Authenticated users can successfully complete eligible wellness quests.
Completing a quest automatically awards the configured number of coins.
Quest completion history is updated correctly.
Users cannot repeatedly complete the same quest within its restricted period.
Invalid quest IDs and unauthorized requests return appropriate errors.
Coin rewards and quest completions are processed together without partial database updates.
All relevant Vitest tests pass.
Dependencies

Implement Coin Economy API and Transaction Tracking.
Implement Configurable Coin Reward System.
Implement Quest Retrieval and Habit Tracking API.
Scope

This issue focuses on completing individual wellness quests and awarding coins. QR event check-ins, friend referral rewards, social engagement rewards, and advanced micro-lesson functionality will be implemented in separate issues.