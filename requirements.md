# Requirements

Requirements for **Building Blocks** (sponsor: BrainHealthy Collective), a digital-currency
app that rewards UT Dallas students with coins for attending campus events and completing
quests. Students spend those coins on items for a digital home. The goal is to build social
connection and a sense of belonging, which support brain health.

Project requirements (section 1) come from the Fall 2026 Project Brief and keep its IDs
(`R-xx`, `C-xx`). The platform baseline we inherited from the EPICS template is kept in
section 3.

## 1. Project Requirement Matrix

- **Status:** Backlog, In-progress, Verified, Deferred, Deprecated
- **MVP:** whether the requirement is part of the Fall 2026 semester target (section 2)
- **Mapping:** the source that implements it so far; add the GitHub issue once one exists.

| ID   | Description                                                                         | Type          | How We Will Know It Is Met                                                         | MVP | Status      | Target Semester | Mapping (source / issue)                                                     |
| ---- | ----------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- | --- | ----------- | --------------- | ---------------------------------------------------------------------------- |
| R-01 | Students sign up through university (`@utdallas.edu`) email verification            | Safety (Data) | User receives a verification email; a non-UTD email is rejected                    | Yes | In-progress | 2026F           | `server/utils/auth.ts`, `shared/utils/email-domain.ts`, `app/pages/auth.vue` |
| R-02 | Scanning a UTD event QR code earns coins                                            | Usability     | User's balance goes up by the configured amount for each QR code scanned           | Yes | In-progress | 2026F           | `server/utils/rewardService.ts`, `server/utils/coinService.ts`               |
| R-03 | Shop where users buy items for their character / digital house                     | Functional    | Purchased items appear in the user's inventory and the cost is deducted            | No  | Backlog     | TBD             | `server/db/schema/house.ts` (schema only)                                    |
| R-04 | Quest system that tracks routines and goals                                         | Functional    | User launches the app and sees a checklist of quests; finishing one earns coins    | Yes | In-progress | 2026F           | `server/db/schema/activities.ts`, `server/utils/rewardService.ts`            |
| R-05 | Students can track campus event details                                             | Functional    | User gets in-app notifications with each event's name, time, and location          | No  | Backlog     | TBD             | —                                                                            |
| R-06 | Students can add existing users as friends                                          | Functional    | User can send an invite, or enter another user's ID, to add them as a friend       | Yes | Backlog     | 2026F           | `server/db/schema/social.ts` (schema only)                                   |
| R-07 | Chat feature for sending hugs / simple messages                                     | Functional    | User receives notifications when friends send them messages                        | No  | Backlog     | TBD             | —                                                                            |
| R-08 | Home page shows a basic, uncustomized digital house                                 | Functional    | After sign-in, the home page shows a visual of the user's default house            | Yes | Backlog     | 2026F           | `server/db/schema/house.ts`, `app/pages/index.vue`                           |

> R-08 comes from the brief's success criteria (section 5), not its requirements table.

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
| Scanning a UTD event QR code or completing a task earns coins           | User's coin balance updates and they get a message saying how many coins they earned | R-02, R-04 |
| User sees a basic model of a digital home                               | Home page shows a visual of a basic, uncustomized house                            | R-08         |

## 3. Platform Baseline (from template)

Inherited from the EPICS template and already verified. Project requirements above build on it.

| ID        | Description                                                                                      | Status   | Target Semester | Mapping (source / issue)                     |
| --------- | ------------------------------------------------------------------------------------------------ | -------- | --------------- | -------------------------------------------- |
| REQ-F-01  | Passwordless sign-in via email OTP (Better Auth + Nodemailer); OTP emailed to an existing user   | Verified | 2026F           | `server/utils/auth.ts`, `app/pages/auth.vue` |
| REQ-F-02  | Server API gateway rejects unauthenticated requests to non-public routes with HTTP 401           | Verified | 2026F           | `server/middleware/auth.ts`                  |
| REQ-F-03  | Client route guard redirects signed-out users to `/auth` and signed-in users away from `/auth`   | Verified | 2026F           | `app/middleware/auth.global.ts`              |
| REQ-F-04  | Authenticated user can upload a profile image, stored per-user under the configured storage path | Verified | 2026F           | `server/api/users/upload.post.ts`            |
| REQ-F-05  | Profile image is served with its `Content-Type` detected from file contents (magic bytes)        | Verified | 2026F           | `server/api/users/[id]/profile.get.ts`       |
| REQ-F-06  | User-list endpoint returns only non-sensitive fields and never leaks image storage paths         | Verified | 2026F           | `server/api/users/index.get.ts`              |
| REQ-F-07  | Unauthenticated `/api/health` endpoint returns HTTP 200 for load-balancer probes                 | Verified | 2026F           | `server/api/health.ts`                       |
| REQ-NF-01 | Persistence is type-safe: Drizzle ORM schema with generated Zod select/insert schemas            | Verified | 2026F           | `server/db/schema/`                          |
| REQ-NF-02 | CI runs lint, type-check, and the Vitest suite on every PR and on `dev`/`stage`/`prod` pushes    | Verified | 2026F           | `.github/workflows/test.yml`                 |
| REQ-NF-03 | Deploy pipeline order is build → migrate → push → deploy, so a failed migration never ships       | Verified | 2026F           | `.github/workflows/deploy.yml`               |
| REQ-NF-04 | `stage`/`prod` auto-deploy to AWS ECS via GitHub OIDC — no static AWS keys stored                | Verified | 2026F           | `.github/workflows/{stage,prod}.yml`         |
| REQ-NF-05 | App ships as a container image with the toolchain to compile native modules in the builder       | Verified | 2026F           | `Dockerfile`                                 |
| REQ-NF-06 | Test baseline runs with no `.env`, database, email, or browser (`pnpm test` works on clone)      | Verified | 2026F           | `vitest.config.ts`, `tests/`                 |
| REQ-NF-07 | Dependency versions are pinned for reproducible, deploy-safe builds                              | Verified | 2026F           | `package.json`                               |

## 4. Change Log

Track major changes, additions, or deprecations to the project scope.

| Date       | Requirement ID | Change Description                                                                   | Author      | Approved By |
| ---------- | -------------- | ------------------------------------------------------------------------------------ | ----------- | ----------- |
| 2026-08-23 | REQ-F/NF-\*    | Established the initial requirements register from the template baseline             | @TusharW4ni | —           |
| 2026-08-23 | REQ-NF-07      | Pinned `better-auth@1.6.23` and `better-sqlite3@12.11.1` to keep the deploy build and migration Lambda working | @TusharW4ni | —           |
| 2026-08-23 | REQ-NF-05      | Added `python3`/`make`/`g++` to the Docker builder so native modules compile         | @TusharW4ni | —           |
| 2026-10-26 | R-01–R-08, C-01–C-03 | Added project requirements, constraints, and success criteria from the Fall 2026 Project Brief | @ridwangalib | —   |
