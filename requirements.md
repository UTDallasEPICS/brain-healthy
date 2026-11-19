# Requirements

Requirements for **Building Blocks** (sponsor: BrainHealthy Collective), a digital-currency
app that rewards UT Dallas students with coins for attending campus events and completing
quests. Students spend those coins on items for a digital home. The goal is to build social
connection and a sense of belonging, which support brain health.

Project requirements (section 1) come from the Fall 2026 Project Brief and keep its IDs
(`R-xx`, `C-xx`). When one brief requirement covers more than one feature, it is split into
sub-IDs (`R-04.1`, `R-04.2`). Requirements that are not in the brief start at `R-08`.

## 1. Project Requirement Matrix

- **Brief Ref:** the Project Brief requirement this comes from, or *New* if it is not in the brief
- **Status:** Backlog, In-progress, Verified, Deferred, Deprecated
- **MVP:** whether the requirement is part of the Fall 2026 semester target (section 2)
- **Mapping:** the source that implements it so far; add the GitHub issue once one exists.

| ID     | Feature       | Requirement                                                            | Brief Ref        | Type          | How We Will Know It Is Met                                                      | MVP | Status      | Target Semester | Mapping (source / issue)                                                     |
| ------ | ------------- | ---------------------------------------------------------------------- | ---------------- | ------------- | ------------------------------------------------------------------------------- | --- | ----------- | --------------- | ---------------------------------------------------------------------------- |
| R-01   | Sign in       | Users can sign in with their UTD email                                 | R-01             | Safety (Data) | User receives a verification email; a non-UTD email is rejected                 | Yes | In-progress | 2026F           | `server/utils/auth.ts`, `shared/utils/email-domain.ts`, `app/pages/auth.vue` |
| R-08   | Home          | Users can see their digital house on the home page                     | Success criteria | Functional    | After sign-in, the home page shows the user's basic, uncustomized house         | Yes | Backlog     | 2026F           | `server/db/schema/house.ts`, `app/pages/index.vue`                           |
| R-09   | Inventory     | Users can see all the items in their inventory                         | New              | Functional    | Every item the user owns is listed in their inventory                           | Yes | Backlog     | 2026F           | `server/db/schema/house.ts` (schema only)                                    |
| R-10   | Inventory     | Users can place decorations from their inventory at specific spots in their house | New   | Functional    | A placed item shows up at the chosen spot on the home page and stays there      | Yes | Backlog     | 2026F           | `server/db/schema/house.ts` (schema only)                                    |
| R-03   | Shop          | Users can buy items for their house in the shop                        | R-03             | Functional    | Purchased items appear in the user's inventory and the cost is deducted         | Yes | Backlog     | 2026F           | `server/db/schema/house.ts` (schema only)                                    |
| R-02   | Coins         | Users can earn coins by scanning UTD event QR codes                    | R-02             | Usability     | User's balance goes up by the set amount for each QR code scanned               | Yes | In-progress | 2026F           | `server/utils/rewardService.ts`, `server/utils/coinService.ts`               |
| R-04.1 | Quests        | Users can complete quests to earn coins                                | R-04             | Functional    | Finishing a quest adds its coins to the user's balance                          | Yes | In-progress | 2026F           | `server/db/schema/activities.ts`, `server/utils/rewardService.ts`            |
| R-04.2 | Quests        | Users can track their quests and see which ones they haven't done      | R-04             | Functional    | User sees a checklist of quests with the unfinished ones marked                 | Yes | Backlog     | 2026F           | `server/db/schema/activities.ts` (schema only)                               |
| R-05   | Events        | Users can track campus event details                                   | R-05             | Functional    | User gets in-app notifications with each event's name, time, and location       | Yes | Backlog     | 2026F           | —                                                                            |
| R-06   | Friends       | Users can add existing users as friends                                | R-06             | Functional    | User can send an invite, or enter another user's ID, to add them as a friend    | Yes | Backlog     | 2026F           | `server/db/schema/social.ts` (schema only)                                   |
| R-07   | Chat          | Users can chat with friends and send hugs / simple messages            | R-07             | Functional    | User receives notifications when friends send them messages                     | Yes | Backlog     | 2026F           | —                                                                            |
| R-11   | Video quizzes | Users can complete video quizzes                                       | New              | Functional    | User can watch a video and answer its quiz in the app                           | Yes | Backlog     | 2026F           | —                                                                            |

### Constraints

| ID   | Constraint                                                                                         | Why It Matters                                                         | Status                    |
| ---- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| C-01 | Only UTD event QR codes earn coins; scanning goes through the UTD app, not our own scanner        | Building our own QR scanner isn't realistic on our timeline            | Open (integration TBD)    |
| C-02 | Most visual design is done by another team; we build the core screens with placeholders           | Keeps our scope to functionality; visuals plug in later                | Accepted                  |
| C-03 | Event information must stay accurate as UTD events change or are canceled                         | Students need correct times and locations                              | Open (after profiles work) |

## 2. Semester Target & Success Criteria

**Target (by December 19, 2026):** a working MVP where users can sign in, make an account to
access a digital house, earn coins from quests and events, add or invite a friend, and track
basic quests and habits.

| Success Criterion                                                       | Evidence / Measure                                                                 | Requirements |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------ |
| Beta tester can launch the program on a computer                        | Program runs and the user can open the login page                                  | —            |
| User can verify their UTD identity and make an account                  | Student email is verified and the student is added as a user in the database       | R-01         |
| Scanning a UTD event QR code or completing a task earns coins           | User's coin balance updates and they get a message saying how many coins they earned | R-02, R-04.1 |
| User sees a basic model of a digital home                               | Home page shows a visual of a basic, uncustomized house                            | R-08         |

## 3. Change Log

Track major changes, additions, or deprecations to the project scope.

| Date       | Requirement ID | Change Description                                                                   | Author      | Approved By |
| ---------- | -------------- | ------------------------------------------------------------------------------------ | ----------- | ----------- |
| 2026-08-23 | REQ-F/NF-\*    | Established the initial requirements register from the template baseline             | @TusharW4ni | —           |
| 2026-08-23 | REQ-NF-07      | Pinned `better-auth@1.6.23` and `better-sqlite3@12.11.1` to keep the deploy build and migration Lambda working | @TusharW4ni | —           |
| 2026-08-23 | REQ-NF-05      | Added `python3`/`make`/`g++` to the Docker builder so native modules compile         | @TusharW4ni | —           |
| 2026-10-26 | R-01–R-08, C-01–C-03 | Added project requirements, constraints, and success criteria from the Fall 2026 Project Brief | @ridwangalib | —   |
| 2026-10-28 | R-01–R-11      | Rewrote the matrix as high-level, feature-grouped requirements mapped to brief IDs; split R-04 into R-04.1/R-04.2; added R-09–R-11 | @ridwangalib | — |
| 2026-10-28 | REQ-F/NF-\*    | Removed the template platform baseline section from this document                    | @ridwangalib | —           |
