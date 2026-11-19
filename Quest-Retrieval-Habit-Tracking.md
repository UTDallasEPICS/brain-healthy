Implement Quest Retrieval and Habit Tracking API

Description

Implement the backend functionality for managing wellness quests (Stress Quests) in Belonging Blocks. Users should be able to view available quests, see quest details, and track their completion history.

Quests will include activities such as drinking water, limiting screen time, and completing stress check-ins.

API Endpoints

GET /api/quests
Retrieve all available wellness quests.
Include quest name, description, and completion frequency (daily, weekly, or one-time).
Indicate whether the logged-in user has completed each quest during the current eligible period.
GET /api/quests/:id
Retrieve details for a specific quest.
Return the quest name, description, completion frequency, and reward amount.
GET /api/quests/history
Retrieve the authenticated user's quest completion history.
Include the quest ID, quest name, and completion date.
Return completions from newest to oldest.
Backend Functions

Create server/utils/questService.ts with the following functions:

getAvailableQuests(userId) - Retrieve available quests and their completion status.
getQuestById(questId) - Retrieve information about a specific quest.
getQuestHistory(userId) - Retrieve a user's quest completion history.
isQuestEligible(userId, questId) - Determine whether a user is eligible to complete a quest based on its frequency rules.
Files to Create or Modify

server/api/quests/index.get.ts - Retrieve all available quests.
server/api/quests/[id].get.ts - Retrieve individual quest details.
server/api/quests/history.get.ts - Retrieve quest completion history.
server/utils/questService.ts - Quest retrieval and eligibility logic.
server/db/schema/activities.ts - Review or update existing quest tables if necessary.
tests/questService.test.ts - Unit tests.
Tasks

Review the existing activities database schema.
Create sample quests for hydration, screen time, and stress check-ins.
Implement the three GET API endpoints.
Implement the quest service functions.
Support daily, weekly, and one-time quest frequency rules.
Use Better Auth to retrieve the authenticated user's information.
Track quest completion history and determine current eligibility.
Write Vitest tests for quest retrieval, completion status, and eligibility rules.
Acceptance Criteria

Authenticated users can retrieve all available quests.
Users can view detailed information about individual quests.
Users can retrieve their own quest completion history.
The system correctly determines whether a quest is eligible for completion based on its frequency.
API endpoints return appropriate errors for invalid quest IDs and unauthorized requests.
All relevant Vitest tests pass.
Dependencies

Existing database and authentication system.
Configurable Coin Reward System (for displaying reward amounts).
Scope

This issue focuses on retrieving quests and tracking completion status. Implementing the actual quest completion endpoint and awarding coins will be handled in the next issue.