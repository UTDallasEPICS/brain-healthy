Make sure you read and implement each .md file one by one

at each step make sure to implement what they are asking for but make sure to add new things based on any differences found in requirements.md

make sure to get as much context of the project you read through the codebase, README.md, and the project description

here is teh proejct description:

Working WebApplication name: Belonging Blocks
Project type: Community-based, college-specific platform supporting brain health through social connection Target milestone: Working MVP model by December (end of EPICs) 
Team sync: Thursdays, 3:45 PM, lab check-in (as needed) with software team, Teams chat for digital connect
Use this time for sprint check-ins, blockers, and confirming scope against the December MVP deadline
Out of scope for dev team: UI/visual design and server deployment/hosting are outsourced (see "Out of Scope" section below). Dev team should build against placeholder/basic UI and a local or lightweight dev environment.
1. Project Overview
Belonging Blocks is a community-based, college-specific web app that offers digital incentives for habits that support brain health through social connection. Verified students (via current utdallas .edu email) receive a personalized digital house that they grow and decorate using coins earned by completing wellness habits, engaging socially, and participating in campus events (via QR code check-ins).
The app is designed to be:
Student-led and student-run, nonprofit in direction
Zero paywall, no cap on sign-ups and no/verified advertising partners 
NOT collecting user-data as much as possible
Web-first, offered as a home-screen widget on iOS/Android (avoids maintaining separate native builds + easy integration into student life)
Launched via soft launch/beta testing with a small student group before wider release (ex: discord)
1.2 Project Inspirations/Takeaways 
Focus Friend
Finch/Wellness Apps 
Animal Jam/Club Penguin/Poptropica etc. (nostalgia and interface)



2. Core Functional Requirements (MVP)
2.1 Account & Verification
Student sign-up/login via university (.edu) email verification
Basic verification approach: validate email domain against a maintained list of accredited institutions (reference: public GitHub repo of ~50,000 global universities) rather than pursuing formal administrative/registrar approval
Handle edge cases/user error in email entry gracefully (e.g., typo detection, resend verification)
2.2 Digital House (Core Visual/Progress System)
Each verified student receives a personalized digital house
House can be customized/decorated using earned coins (decorations, add-ons)
House should visually reflect progress, habits completed, and growth over time
Note: actual art/character assets and rigging/animation will be provided by a separate design team — dev team builds the framework/skeleton logic that consumes these assets, not the assets themselves
2.3 Coin & Rewards System
Coin economy (subject to final balancing, but structure to build against):
Action
Coin Value
Individual quest completion (hydration check-ins, micro-lessons, stress check-ins)
1 coin
Social engagement (QR event check-in, sending a "hug"/kind message)
5 coins
Inviting a friend who verifies with .edu email (per friend, up to 3)
30 coins

Coins must be trackable per-user, spendable on house decorations/add-ons
System should be modular/configurable so coin values can be adjusted without code changes (e.g., admin-configurable table)
2.4 Habit / Quest System ("Stress Quests")
Self-monitored habit tracking (e.g., drink water, limit phone use, stress check-ins) — similar to apps like Finch
If way to incorporate more accountability measures, can adjust this 
Short micro-lesson content modules (video/text) tied to quests — content will be provided, dev team builds the delivery/display system
Quest completion should feed directly into the coin system
2.5 QR Code Integration
Integration with the existing UT Dallas Mobile App QR code system for campus events
Scanning a QR code at a campus event should award coins in Belonging Blocks
Requires research into UTD's existing QR/event API or a compatible scanning workflow (may need to build our own QR scan-and-verify flow if no API access is available — flag early)
2.6 Social Features
Add/accept friends within the app
Send "hugs" and kind messages (lightweight social nudges) between users
Friend invitations tied to coin rewards (see 2.3)
Basic messaging/nudge functionality (scope to confirm: simple presets vs. free text — recommend starting with presets for MVP to limit moderation burden)
Community groups for club announcements, etc. in one area 
2.7 Widget Functionality
Web app should be structured so it can be surfaced as a home-screen widget on iOS and Android
Desktop and phone version compatibility 
Widget should show at-minimum: house snapshot / coin count / quest reminder
Confirm feasibility constraints with outsourced UI/deployment team early, since this affects front-end architecture decisions

3. Out of Scope for Software Dev Team
UI/visual design/Character art, — being handled by outsourced/separate team; dev team should build to reasonably clean placeholder UI and plan for a swap-in of final design assets ex: house= rectangular structure/label
Server hosting/deployment — outsourced; possible use of EPICS server partners (EndPoints); dev team should build with deployment-agnostic practices (containerization recommended) to ease handoff
Skeleton frame rigging/animation — may be part of integration later
Possibly using software called Spine, skeletal animation and rigging PNGs to skeletons and moving them. 





4. Technical /Architecture Considerations
Platform: Web app (not native), designed to also function as an iOS/Android home-screen widget
Email verification: domain-check against a maintained university list (not full registrar integration) 
Data privacy: No data selling to third parties; minimize data collection; be prepared to publish a clear, transparent privacy policy (referenced as a strong practice by peer platforms during scoping calls)
Scalability approach: Start with a small beta group to control server load and identify bugs before scaling  plan architecture to support incremental server capacity increases rather than requiring full scale at launch
Moderation: Plan lightweight moderation/reporting tools for social features (hugs, messages, friend requests) even at MVP stage
App store considerations (IF native wrapper is needed much later on): iOS review has historically been fast (~2 days) if scope starts small and features are added incrementally via updates; Android review tends to be more complex, plan phased feature releases rather than shipping everything in v1

5. Suggested MVP Feature Priority (for December Deadline)
Must-have (MVP core):
.edu email verification/sign-up
Basic digital house (view + simple decoration from a small starter set)
Coin earning from individual quests (1-coin actions)
Coin earning from QR event check-in (5-coin actions)
Friend add + invite flow with coin reward
Basic quest/habit checklist UI
Nice-to-have (if time allows before December):
"Hugs"/kind message social nudges
Widget version for home screen
Expanded decoration/add-on catalog
Stress Quest micro-lesson content modules
UI integration with models from art team 
Post-MVP (soft launch → wider release):
Expanded moderation tools
Admin dashboard for coin/quest configuration
Broader QR/event API integration refinements
Full widget parity across iOS/Android

6. Open Questions for the Dev Team to Flag Early
Does UTD's existing Mobile App QR/event system expose any API we can hook into, or do we need our own scan verification flow?
What's the minimum viable "widget" data payload, and does that change our front-end data architecture?
Do we need real-time updates (e.g., live coin counts, friend activity) or is periodic refresh sufficient for MVP?
What deployment format (containerized, static build, etc.) will best support handoff to the outsourced hosting team?
What are constraints with server partners?

7. Contract/Developer Involvement Agreement/IP protection
What protections do you want/need from us 
Registering as business/nonprofit 



currently only work on the making the parts of the project that im asking you to verify or complete dont focus on creating this entire thing right

1. Coin-Economy.md
2. Quest-Completion-Coin-Rewards.md
3. Reward-System.md
4. Quest-Retrieval-Habit-Tracking.md

once done and verified by me we will continue with next steps



To run the console yourself:
  1. In .env, set SEED_USER_PASSWORD to any password.
  2. Run pnpm db:migrate, then pnpm db:seed, then pnpm dev.
  3. Sign in at http://localhost:3000/auth as seeded-user@utdallas.edu with that password.
  4. Click Test console in the header (or open /dev/economy), then click Run all checks.

