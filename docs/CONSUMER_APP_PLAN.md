# Consumer Meal-Planning App: Product and Delivery Plan

Last updated: October 7, 2026

## Purpose of this document

This document is the durable context and working roadmap for turning the meal-planning portion of Felipe's home-server dashboard into a consumer iOS and Android application.

Future agents should read this document before proposing architecture, data-model, product-scope, or release-plan changes. Update it when a material product or technical decision changes.

## Owner context and goals

- Felipe is a software engineer seeking a new job and intentionally using this project to deepen his backend, database, mobile, cloud, and production-engineering experience.
- Felipe wants to understand the code and tradeoffs. Agents may implement approved work, but should work incrementally, explain their decisions, and offer focused hands-on exercises when useful.
- Shipping a useful consumer product would be excellent, but the project is also successful if it becomes a strong, credible portfolio project demonstrating end-to-end product engineering.
- The work should stay focused. Do not overbuild speculative features before validating and completing the core workflow.

## Current starting point

The existing home-server project is a working private family dashboard.

Current stack:

- React, TypeScript, Vite, and PrimeReact web frontend
- Python and FastAPI backend
- psycopg and PostgreSQL 17
- SQL migrations and development seed data
- Docker Compose
- Nginx serving the frontend and reverse-proxying `/api` to FastAPI
- Mac Mini M1 production host for the private family system
- Tailscale for private remote access
- Scheduled PostgreSQL backups, Google Drive synchronization, and a tested restore workflow

Existing product features include:

- Shared shopping list
- Pantry/catalog items with food or household type, category, default unit, and archive state
- Recipe library
- Recipe ingredients referencing normalized food catalog items
- Duplicate-ingredient prevention
- Weekly meal-planning calendar
- Quantity-on-hand input for each planned meal
- Automatic addition of missing ingredient quantities to the shopping list

Current limitations that make the private system unsuitable for public consumers:

- One shared configured username and password
- One household/data namespace
- Cookie-oriented authentication designed for the current web deployment
- Production runs on a private Mac Mini
- No public account registration, recovery, invitations, or account deletion
- No native iOS or Android application
- No consumer-grade monitoring, support, privacy, or store compliance

The Mac Mini deployment should remain the functioning family dashboard and a development laboratory. It should not become the public consumer production server.

## Current consumer-app progress (October 4, 2026)

- The separate `meal-planner` repository has an Expo/React Native mobile app and a FastAPI `/v1` API. Clerk passwordless email-code authentication, household onboarding, and the global light/dark theme are implemented.
- Local PostgreSQL 17, Alembic migrations, and the identity/household schema are in place. The existing invitation-code acceptance contract enforces verified-email matching, expiry, and single use.
- Household create/join/select/sign-out flows are implemented; signup and household creation have been exercised on a physical iPhone against the local API. The owner-facing, manually shared invitation-code UI merged through PR #8. Felipe reports testing invitation creation, a recipient joining on a second device, and matching shopping lists; the second device's OS is not recorded, so Android acceptance is not claimed. A previously issued raw invitation code cannot be recovered because only its hash is stored; owner-initiated replacement-code reissue is implemented in PR #10.
- The household-shared shopping-list implementation (handwritten migration, household-scoped API operations, eager list creation/backfill, and themed mobile screen/tests) merged to `main` through PR #5 on September 26, 2026. Felipe's earlier matching-list check was a basic second-device invitation/join test; it did not complete broader or platform-specific acceptance. His later Render-backed two-device check is recorded in the cloud-staging status below.
- The five-tab signed-in navigation foundation merged through PR #6. The tabs are now Plan, Recipes, Shopping, Catalog, and Profile: Catalog merged through PR #13 and Recipes through PR #14. Plan is the permanent startup destination and remains a placeholder; Shopping is the temporary startup destination. Felipe completed physical iOS testing of the earlier navigation slice; Android device testing and a native-build smoke test remain outstanding. Expo SDK 57 package patch alignment and the function-form `app.config.ts` refactor merged through PR #7, though newer patch recommendations are deferred below.
- The Profile hub replacement merged into `main` through PR #9 on September 28, 2026. It replaces Settings with Profile while preserving the five-tab order and temporary Shopping startup. All Profile detail routes share one tab-level stack for native headers and Back history. Felipe's iPhone testing confirmed the layout looks good, Back works through nested pages, and VoiceOver announces Back correctly. Android device testing and native rebuilds remain outstanding; the later staging flow report is not OS-specific Profile acceptance. A lost raw invitation code cannot be retrieved, but an owner can request a replacement code.
- Household management merged into `main` through PR #10 on September 30, 2026. It adds extra-household creation without switching, owner household edits, active member details and role/remove/leave flows, owner invitation listing/revoke/reissue, and owner-only “Delete household” backed by internal soft deletion. It preserves shared content and enforces transactional last-owner and delete/write safeguards. Creation opens new-household details without changing the active household; editing returns to that same household's updated details. Approved display-name choices are non-unique names, trimmed 1–80 Unicode characters without control characters, profile completion for existing nameless accounts on their next app visit without sign-out, and retaining combined first/last names for existing named users. The Clerk Development instance's First and last name setting and the resolved `@clerk/expo` 4.6.5 signup/update type support were verified before implementing the `firstName` mapping. The earlier migration/integration suite passed 50/50 at `household_management_profiles (head)`; the latest full API run passed 56 tests with 0 skipped, including disposable-PostgreSQL tests. Latest mobile normal and cold runs each passed 27 suites / 178 tests. Felipe reports iPhone checks confirmed role updates and pull-to-refresh work; this is not complete device acceptance. Broader iPhone checks, Android device testing, and native rebuild/smoke testing remain outstanding; the later staging flow report is recorded separately and does not establish OS-specific acceptance. Public-release account deletion/retention policy is a separate follow-up.
- Household-scoped Catalog merged through PR #13. It replaces Pantry with reusable household items, optional type/category/unit/store metadata, member-managed choices, searchable/grouped browsing, and archival; it is not inventory. Recipes can link Food Catalog items, but shopping-list linkage remains for meal planning. The emoji field uses the ordinary keyboard with validation rather than an in-app chooser. The later disposable-PostgreSQL run passed 90 tests with no skips at `catalog_category_emoji (head)`; Felipe reports the emoji sheet looks good on iPhone. See the Catalog plan and validation updates below for the limited device scope.
- Cloud staging/CI is merged to `main` through PR #11. The hosted workflow passes mobile normal/cold runs (27 suites / 178 tests each), TypeScript, lint, Expo dependency compatibility and Doctor (21/21), plus all 56 API tests with 0 skipped after disposable-database identity and Alembic-head checks. Render and Neon staging resources are provisioned on the approved Free/$0 plans; the API is manually deployed with auto-deploy off. Felipe reports two physical devices successfully completed the Render-backed invited-user/shared-household flow and saw the same shopping list; their operating systems were not recorded, so no Android- or iOS-specific staging acceptance is claimed. After Render slept, Felipe reports the app showed a loading indicator for about one minute, then loaded successfully. This is an observed successful cold wake; failed-wake retry behavior remains untested, and acceptance of the roughly one-minute latency remains undecided. The local API remains the everyday development default; staging data is test-only and Felipe will manually review and clear it within 30 days. Android-specific testing, native-build/smoke testing, production reliability, and broader release readiness remain outstanding. See `docs/plans/free-cloud-staging-and-ci.md`.

Focused Catalog emoji-sheet follow-up (2026-10-04): the Android keyboard
reproduction is addressed by using the existing Catalog picker’s `padding`
keyboard-avoidance behavior on both platforms and reducing only the keyboard-
open bottom inset; the keyboard-closed safe-area spacing and the iPhone gap
correction are retained. The latest full mobile normal and cold runs each
passed 34 suites / 232 tests; TypeScript, lint, and whitespace checks passed.
The coding agent could not attach ADB in its session, but the Codex chat agent
subsequently verified the keyboard-open/closed emoji sheet on the running
Pixel 10a Android emulator: its field and actions stay visible above the
software keyboard. The Store removal action also rendered with the same
bordered destructive treatment as category deletion. This is focused Android
coverage; iPhone retest and broader device flows remain open. Separately, the
chat agent verified both the URL and live database identity as
`meal_planner_disposable_test` on an isolated PostgreSQL 17 container,
migrated to `catalog_category_emoji (head)`, and ran the full API suite:
90 passed, 0 skipped. The disposable container was removed afterward;
`meal_planner_dev` was not accessed.

Catalog validation update (2026-10-04): this later result supersedes the older
67-passed/1-failed and pending-cleanup statements in the Catalog progress
snapshot and immediate-milestone text above. The Codex chat agent independently
verified the configured and connected database as
`meal_planner_disposable_test`, migrated it to
`catalog_category_emoji (head)`, and ran the full API suite: 90 passed, 0
skipped. The latest mobile normal and cold runs each passed 34 suites / 232
tests; TypeScript and lint passed. The Pixel 10a check covered the emoji sheet
above the software keyboard and Store removal styling only. The synthetic QA
Catalog item remains active. Felipe reports that the emoji sheet looks good
on iPhone; this is limited to that focused check. Broader gesture/device
acceptance remains outstanding. No database tests were rerun for this commit.

Catalog merge and Recipes implementation update (2026-10-05): Catalog merged
into `main` through PR #13 at `78051f6`, after four hosted checks passed.
Felipe reported that the final iPhone emoji sheet looks good; broader gesture
and device acceptance is still outstanding. The approved household-scoped
Recipes slice in `docs/plans/household-scoped-recipes.md` was implemented on
`feat/household-recipes-plan` and merged through PR #14 as
`ac5dcf0`, but has not been deployed. The approved screen direction uses a
grid/list switch, name initials by default with optional emoji/photo cover,
Food Catalog-linked ingredients, editable amounts/units/notes, numbered
directions, separate hours-and-minutes prep/cook input, and optional details.
A recipe needs a name and at least one Catalog ingredient. Recipe screens do
not add items to Shopping; that belongs to later meal planning. Felipe chose
to defer photo upload (initials and emoji only), accept positive numbers and
fractions for ingredient amounts with ranges in notes, and expose Archived
recipes with Restore under Profile → My households → the specific Household
details page for all active members. Felipe approved the archived-list visual
reference; Felipe approved the full Recipes plan for implementation on
October 5, 2026. Earlier validation for the implementation: mobile
normal and cold baseline tests each passed 38 suites / 248 tests; TypeScript,
mobile lint, API Ruff, and 75 selected non-database API tests passed. A later
mobile-only phone-UX follow-up passed normal and final no-cache runs of 39
suites / 258 tests each, plus TypeScript and lint. It reuses the full Catalog Food form from Recipes and
addresses ingredient navigation, unit entry, validation feedback, and detail
styling; its native appearance remains to be reviewed. The full
disposable-PostgreSQL migration/API suite was not run at that earlier point.
On October 6, a fresh disposable container was verified by URL and live
database name, migrated to `household_recipes (head)`, and the full API suite
passed 120 tests with no skips. Current mobile normal and no-cache runs each
passed 40 suites / 262 tests, plus TypeScript, lint, API Ruff, and whitespace
checks. At that point, broader physical-device/reference acceptance remained
pending and the custom Ingredient Details drag was rejected on iPhone; the
subsequent native-sheet slice replaced it. No new mobile dependency was added.

This is a status snapshot, not a change to the long-term scope below. Update it as milestones are validated.

Native-sheet direction (2026-10-06): Felipe reports that the development-only
stacked Recipes `formSheet` prototype has the desired drag feel on iPhone. The
approved retroactive migration of interactive selection/entry sheets is in
`docs/plans/native-sheets-app-wide.md`. The first implementation had full-screen
pages and overlapping Recipes sheets; the corrected version restores Catalog
Category dragging, and Felipe reports the ingredient screens now look good on
iPhone. He considers Recipes v1 and this sheet slice finished for now. Broader
stacked-sheet interaction and remaining sheet flows still await review. Full
detail/manage pages and destructive
confirmations are outside that presentation change. Android, web interaction,
production draft/state behavior, and reference-image parity still require
validation. Both hosted PostgreSQL checks
on PR #14 passed; both hosted Mobile jobs failed only at Expo's patch-version
compatibility check. Felipe approved merging with that known result and
deferred the five approved SDK 57 patch alignments to a later follow-up.

## Product decision

Create a new consumer product based on the lessons and domain model of the home dashboard. Do not simply wrap or publish the current Vite website.

The separate `meal-planner` repository now exists so the home dashboard can remain stable and the consumer product does not inherit unrelated dashboard functionality or private-server assumptions.

## Product thesis

The application is centered on this weekly loop:

```text
Save family recipes
        ->
Plan meals for the week together
        ->
Review the week's recipe ingredients together
        ->
Choose what to buy; combine matching ingredients and units
        ->
Use one shared shopping list
```

The working product hypothesis is:

> Busy couples and families need a faster way to plan meals collaboratively from their own recipes and decide what to buy without maintaining pantry inventory.

The likely positioning is:

> A low-maintenance family meal planner that uses your own recipes, shows the week's combined ingredients, and lets the household choose what goes on its shared shopping list.

## Competitive context

The broad category is validated but crowded. Existing products include Paprika, MealBoard, AnyList, Plan to Eat, Samsung Food, and Mealime.

- Paprika already provides recipe import, meal planning, grocery lists, and pantry tracking.
- MealBoard supports recipes, planning, pantry quantities, shopping lists, and pantry deduction.
- AnyList is strong at live shared lists, recipe organization, and household meal planning.
- Plan to Eat turns a personal recipe collection and calendar into an automatic shopping list.
- Samsung Food is strong at recipe discovery, importing, nutrition, meal planning, and shopping.
- Mealime is strong at personalized meal suggestions and consolidated grocery lists.

Therefore, `recipes + planning + pantry + shopping` is not sufficient differentiation on its own.

The most promising wedge is reducing pantry-management friction. The approved consumer v1 has a reusable Catalog, not inventory: it shows ingredients from the displayed week's meals, combines matching item/unit requirements, and asks members to select what they want to buy. Adding a meal does not prompt for on-hand quantities or alter Shopping.

Example:

```text
Monday recipe:     2 Unit tomatoes
Wednesday recipe:  2 Unit tomatoes
Friday recipe:     2 Unit tomatoes
Review row:        6 Unit tomatoes; member chooses whether to add it
```

Additional differentiators worth testing, but not all building at once:

- A household-first Sunday planning workflow
- Meal suggestions, voting, and cook assignment between partners
- Leftover, takeout, away, and repeat-meal handling
- Remembering family ratings, substitutions, and preferences
- Avoiding meals made too recently
- An optional on-hand aid, only if later user research justifies it
- Planning around expensive proteins or foods that need to be used soon

Do not initially compete on having the largest recipe database, AI-generated recipes, nutrition tracking, grocery delivery, barcode-complete inventory, or a social recipe network.

## Version 1 scope

Version 1 should include:

- User registration and login
- Email verification and account recovery
- Create or join a household
- Invite a partner or family member
- Shared household recipe library
- Create, edit, archive, search, and view recipes
- Food catalog with normalized names, categories, and default units
- Weekly meal-planning calendar
- A week-wide, explicit shopping-needs review with member-selected additions
- Consolidation of ingredients shared by multiple planned recipes
- Shared shopping list
- Check, uncheck, edit, and remove shopping items
- Loading, error, empty, and offline-aware states
- Household settings
- Account and household deletion
- Production backups, monitoring, and error reporting

## Explicit non-goals for the first release

Defer these until the core weekly loop is validated and reliable:

- Complete household-supply inventory
- Public recipe publishing
- Social feeds, comments, followers, and ratings
- Large proprietary recipe catalog
- Nutrition and macro calculation
- Grocery delivery integrations
- AI recipe generation
- Barcode scanning
- Complicated cross-unit conversion
- Paid subscriptions
- Full offline-first synchronization

## Target architecture

```text
Native iOS and Android application
React Native + Expo + TypeScript
                  |
                HTTPS
                  |
             FastAPI /v1
                  |
         Managed PostgreSQL
```

Supporting production services will eventually include:

- Clerk for managed authentication
- Transactional email for verification, recovery, and invitations
- Object storage for recipe images
- Error and crash reporting
- Structured logs and operational metrics
- A background worker or job service when asynchronous work is introduced
- A small public website for product information, privacy, terms, support, and account deletion

Environments:

- Local development
- Cloud staging
- Cloud production

Production secrets must live in the platform's secret manager. They must never be committed to Git.

## Recommended mobile stack

- React Native
- Current supported Expo SDK at implementation time
- TypeScript
- Expo Router
- A native-oriented component system
- TanStack Query for server state and caching
- React Hook Form and Zod for forms and client validation
- Clerk's Expo integration with SecureStore-backed session caching; do not persist raw access tokens separately
- An OpenAPI-generated TypeScript API client

The existing PrimeReact components and web CSS cannot be reused directly in React Native. The mobile screens will be rewritten with native components. Reusable knowledge and assets include:

- TypeScript experience
- API and endpoint design
- Domain names and workflows
- Validation rules
- Non-UI utilities where appropriate
- FastAPI concepts
- PostgreSQL schema and migration lessons

Do not use a thin web wrapper as the final consumer application. The mobile product should feel native and provide meaningful mobile behavior.

## Recommended repository structure

```text
meal-planner/
|-- apps/
|   |-- mobile/
|   `-- web/
|-- services/
|   `-- api/
|-- packages/
|   `-- api-client/
|-- db/
|   |-- migrations/
|   `-- seeds/
|-- docs/
`-- .github/
    `-- workflows/
```

Mobile source organization:

- Expo Router's `apps/mobile/src/app/` contains route screens and navigation
  layouts only; tests and supporting code live elsewhere.
- Feature-specific support code and tests live under `src/features/<feature>/`.
  App-wide UI stays in `src/components/`, shared hooks in `src/hooks/`, shared
  infrastructure in `src/lib/`, and theme/constants in their current shared
  locations. Do not create a generic `shared/` directory or empty scaffolding.
- Move only code that belongs to the feature being changed, update imports and
  tests, and preserve unrelated authentication/onboarding organization.

The initial web application only needs to support:

- Product/landing page
- Privacy policy
- Terms of service
- Support information
- Account deletion request or completion flow

A full consumer web application can be considered later.

## Core data model

The consumer database must become multitenant.

Core identity and household tables:

- `users`
- `households`
- `household_members`
- `household_invitations`

Core product tables:

- `catalog_items`
- `recipes`
- `recipe_ingredients`
- `meal_plan_entries`
- `meal_plan_entry_ingredients`
- `shopping_lists`
- `shopping_list_items`

Possible later inventory tables:

- `inventory_items`
- `inventory_transactions`
- `storage_locations`

Household-owned records must have a direct or unambiguous inherited `household_id`. Every API operation must verify that the authenticated user belongs to the relevant household.

Useful audit fields include:

- `created_by_user_id`
- `created_at`
- `updated_at`
- `archived_at` or `deleted_at`

Catalog names should use household-level, case-insensitive uniqueness so `Milk` and `milk` cannot become separate items in the same household.

Recipe visibility may eventually support:

- Private to a user
- Shared with a household
- Public/curated

Only household sharing is required for version 1.

## Security and multitenancy

Preventing cross-household data exposure is the highest-priority security requirement.

Required practices:

- Every household-scoped query is authorized against membership.
- Never trust a `household_id` received from the client without membership verification.
- Add automated tests in which one household attempts to access, update, and delete another household's resources.
- Use parameterized SQL.
- Validate all input at the API boundary.
- Return consistent, non-sensitive error responses.
- Apply rate limiting to authentication and expensive endpoints.
- Use structured logs with request IDs, without logging secrets.
- Consider PostgreSQL row-level security later as defense in depth, not as a substitute for application authorization.

## Authentication direction

Replace the current shared account with consumer authentication.

Prefer a managed identity provider initially rather than building password security, resets, token rotation, and abuse prevention entirely from scratch.

Required capabilities:

- Registration
- Email verification
- Passwordless email-code sign-in and sign-up, including returning-user access
- SDK-managed session persistence, rotation, and restoration
- Session revocation
- Brute-force protection
- Optional Apple and Google sign-in later
- Account deletion

Clerk manages the mobile session. Its Expo integration uses SecureStore-backed token caching, and the API client obtains a fresh token for each protected request rather than persisting raw access tokens itself. The FastAPI backend verifies Clerk session tokens and maps them to local users.

The first beta uses email verification codes only: no app password and no Google or Apple sign-in. If third-party login is introduced later, verify current Apple and Google store rules before implementation.

## API engineering plan

- Introduce API versioning under `/v1`.
- Keep route modules small and organized by domain.
- Move business logic into service modules instead of route handlers.
- Introduce repository/data-access modules where this improves testability.
- Use database transactions for multi-step operations.
- Create a consistent API error shape.
- Add pagination, filtering, and search where collections may grow.
- Generate the TypeScript API client from FastAPI's OpenAPI schema.
- Add idempotency to retry-prone operations.
- Add health and readiness endpoints.
- Add structured logging and request IDs.

Scheduling a meal must not write Shopping items. The later, explicit operation that adds selected reviewed ingredients to Shopping should be transactional and idempotent; a lost response must not duplicate items.

## Mobile experience priorities

Critical user journeys:

1. Register and create or join a household.
2. Invite a partner.
3. Create, import later, or select a saved recipe.
4. Place meals on a weekly calendar.
5. Review the displayed week's consolidated recipe ingredients.
6. Select what to buy and explicitly add it to Shopping.
7. Shop collaboratively and check items off.
8. Adjust the plan when the week changes.

Shopping-list interaction should be optimistic so checking an item feels immediate.

### Household invitation delivery

- For the current local-testing/shared-list slice, use manually shared invitation codes. The recipient enters the code in the existing join flow; invitation-link handling is out of scope for this slice.
- Later, owners should be able to share an invitation URL by text or another sharing channel. Opening the URL should open the installed app and prepopulate the invitation code, continuing through sign-in/sign-up when necessary.
- A link must preserve the existing server-side invitation checks: matching verified recipient email, expiry, and single-use acceptance. Opening a URL must not automatically accept an invitation.
- Plan and review cross-platform link routing, behavior when the app is not installed, and safe handling of codes before implementing this follow-up.

Initial offline behavior should be deliberately modest:

- Cache the last successfully loaded shopping list and current meal plan.
- Allow optimistic shopping-list interactions.
- Retry failed mutations.
- Clearly indicate unsynchronized changes.

Full offline conflict resolution can wait until real usage proves it necessary.

## Recipe exploration strategy

Treat the household recipe library and public recipe exploration as separate product layers.

- Version 1: recipes created, saved, and shared inside a household
- Version 1.1: curated starter recipes owned or properly licensed by the product
- Later: public/community recipes or licensed external recipe data

Do not copy or republish recipe instructions or photographs without appropriate rights. Imported recipes should preserve provenance and attribution. The product may store a source link plus user-authored adjustments rather than republishing protected content.

## Quality strategy

Backend:

- Unit tests for domain calculations
- Integration tests against PostgreSQL
- Authorization and tenant-isolation tests
- Migration tests from an empty database
- Migration tests from representative older snapshots
- Transaction and idempotency tests
- API contract tests

Mobile:

- Component tests for reusable UI and forms
- End-to-end tests for the critical weekly loop
- Physical-device testing on iOS and Android
- Slow-network, intermittent-network, and airplane-mode tests
- Accessibility testing

Operations:

- Automated database backups
- Point-in-time recovery when supported by the managed database
- Periodic restore drills
- Crash reporting
- API error monitoring
- Availability checks
- Database and resource usage alerts

## Product validation before the large build

Moving forward is an explicit decision, even though competitors exist. Validation should happen alongside early engineering rather than being skipped.

### Competitor test

Use Paprika, AnyList, MealBoard, Samsung Food, and Plan to Eat or Mealime for a real planning cycle. In each product:

- Save three personal recipes.
- Plan five dinners.
- Review what the household actually needs without an inventory ledger.
- Generate a shopping list.
- Share the workflow with a partner.
- Shop from the result.
- Change the plan during the week.

Record every slow, confusing, manual, or missing step.

### Current-product observation

Continue using the deployed home-dashboard version and log:

- Time required to plan the week
- Repeated data entry
- Incorrect generated quantities
- Stale pantry information
- Manual shopping-list cleanup
- Features used without prompting
- Features ignored
- Problems caused by midweek plan changes
- Whether the household voluntarily returns the next week

### Interviews

Interview approximately 10 to 15 couples or families. Ask about existing behavior before pitching the solution:

- How do they decide what to eat?
- Where are recipes kept?
- How is the shopping list created and shared?
- What repeatedly goes wrong?
- Which apps have they tried and abandoned?
- Why do they avoid or stop maintaining pantry inventory?
- What do they duplicate, forget, or waste?

Positive evidence includes several households describing the same recurring pain, agreeing to test weekly, and showing willingness to pay or switch from an existing workaround.

## Delivery roadmap

The following estimate assumes solo, part-time development. A realistic target is approximately five to eight months for a disciplined first public release. A tightly scoped full-time effort could reach beta sooner.

### Phase 1: Product definition (1-2 weeks)

Deliverables:

- One-page product brief
- Defined target household
- Version 1 scope and non-goals
- Screen map
- Five critical user journeys
- Household permission rules
- Ingredient and quantity rules
- Initial success metrics
- Competitor-friction notes

Exit condition:

- The core user and weekly problem can be explained clearly without listing features.

Suggested product metric:

> A household plans at least three meals and uses the resulting shopping list during the same week.

### Phase 2: New repository and cloud staging (2-3 weeks)

Deliverables:

- New repository and directory structure
- Expo application shell
- FastAPI `/v1` foundation
- Managed staging PostgreSQL
- Automated test workflow
- Automated staging deployment
- HTTPS staging domain
- Migration pipeline
- Health/readiness endpoints
- Structured logs
- OpenAPI TypeScript-client generation

Exit condition:

- A mobile development build can securely call a deployed staging API.

### Phase 3: Users, households, and authorization (4-6 weeks)

Build in this order:

1. Consumer authentication
2. Users
3. Households
4. Household membership
5. Invitations
6. Household-scoped catalog
7. Household-scoped recipes
8. Meal plans and shopping lists
9. Cross-household isolation tests

Exit condition:

- Two separate test households can use the service without seeing or mutating each other's data.

### Phase 4: Mobile foundation (2-3 weeks)

Deliverables:

- Registration and login
- Session restoration
- Onboarding
- Create/join household
- Navigation architecture
- Reusable native styling and form components
- API loading, error, and empty states
- Secure token storage
- Theme and accessibility foundations

Exit condition:

- Installable development builds work on a physical iPhone and Android device.

### Phase 5: Core vertical slices (6-10 weeks)

Implement in this order:

1. Shared shopping list
2. Food catalog (reusable items, not inventory)
3. Recipe creation and library
4. Weekly meal planner
5. Week-wide ingredient consolidation and explicit shopping selection
6. Household invitations and settings

Exit condition:

- A household can complete the recipe -> plan -> review/select -> shopping -> checked-off loop on both platforms.

### Phase 6: Security, quality, and operations (3-5 weeks)

Deliverables:

- Tenant-isolation test suite
- Critical end-to-end tests
- Migration and restore tests
- Rate limits
- Production secret management
- Crash and error monitoring
- Accessibility pass
- Slow/offline-network pass
- Account and household deletion
- Privacy-minimal analytics, if any

Exit condition:

- The team can detect failures, restore data, and demonstrate that household boundaries are enforced.

### Phase 7: Private beta (3-5 weeks)

Recruit roughly 10 to 20 households.

Track:

- Weekly planning completion
- Shopping-list usage
- Week-two and week-four retention
- List corrections and duplicate items
- Shopping-review abandonment or confusion
- Invitation success
- Crash-free sessions
- Support requests and confusion points

Exit condition:

- Multiple households repeatedly complete the core loop with limited direct assistance.

### Phase 8: Store preparation and release (3-6 weeks)

Deliverables:

- Final product name
- App icon and launch assets
- Confirm the already selected iOS bundle identifier (`com.efelio.mealplanner`)
- Confirm the already selected Android package name (`com.efelio.mealplanner`) and Expo scheme (`mealplanner`)
- Privacy policy
- Terms of service
- Support page and email
- Account deletion page
- Store descriptions and screenshots
- Apple privacy disclosures
- Google Data Safety declaration
- Reviewer/demo account
- TestFlight build
- Google internal and closed testing
- Staged production rollout

Exit condition:

- The application is approved, downloadable, monitored, and supported on both stores.

## Current store considerations

These requirements change and must be rechecked against official documentation near submission time.

As of this document's date:

- Apple Developer Program membership is USD $99 per year.
- Google Play registration is USD $25 once.
- Apple individual enrollment displays the developer's legal name as the seller.
- Organization enrollment generally requires a legal entity and D-U-N-S number.
- Newer personal Google Play accounts require a closed test with at least 12 testers opted in continuously for 14 days before applying for production access.
- Applications offering account creation must provide compliant account-deletion capabilities.
- Google distributed builds require a Data Safety declaration and privacy-policy link.
- Google Play submissions must meet the current Android target API requirement.
- Apple submissions must use the current required iOS SDK/Xcode toolchain.

Decide early whether the app should be published under Felipe's legal name or a business/brand. If the latter is important, consider forming the legal entity before opening final store accounts.

## Monetization

Keep the initial beta free.

Do not add subscriptions until real households repeatedly use the weekly workflow. Paid digital features introduce store billing, entitlement management, customer support, refund handling, and additional policy work.

Possible later paid value:

- Multiple households or advanced collaboration
- Rich planning history and reusable plans
- Advanced imports
- Pantry expiration and waste-reduction tools
- Budget and store intelligence
- Premium household automation

Any monetization plan must be validated and checked against current Apple and Google billing policies before implementation.

## Approximate early operating budget

- Apple Developer Program: $99/year
- Google Play registration: $25 once
- Domain: approximately $10-$25/year
- Early cloud infrastructure: roughly $30-$100/month depending on database, API host, email, storage, monitoring, and traffic

Provider pricing should be checked when selecting services.

## Original first 30-day execution plan

This is the initial sequencing baseline, not the current sprint checklist. The status snapshot above records what has actually been completed.

### Week 1

- Write the one-page product brief.
- Select a working product name.
- Create the new repository.
- Diagram the current and proposed data models.
- Write the five critical user journeys.
- Begin competitor workflow testing.

### Week 2

- Create the Expo mobile application.
- Establish routing, theming, and reusable native form patterns.
- Create the FastAPI `/v1` project structure.
- Configure backend and mobile tests.
- Generate an initial TypeScript client from OpenAPI.

### Week 3

- Evaluate and select managed authentication.
- Implement users, households, and memberships.
- Write the first tenant-isolation tests.
- Deploy the authenticated API to staging.

### Week 4

Build the first end-to-end vertical slice:

```text
Register
  -> create household
  -> invite partner
  -> add shopping item
  -> see it on the partner's device
  -> check it off
```

This milestone validates authentication, multitenancy, mobile networking, shared state, database persistence, and cloud deployment before rebuilding the more complicated recipe workflow.

## Major risks

- Building a generic feature clone without a compelling reason to switch
- Cross-household data exposure
- Shopping review becoming too tedious for sustained use
- Incorrect ingredient matching, consolidation, or unit conversion
- Recipe-content copyright or licensing problems
- Offline mutation conflicts
- Overbuilding public recipe exploration before the private household loop works
- Delaying real-user testing until after months of development
- Treating app-store submission as a final-day administrative task
- Adding monetization before retention is demonstrated

## Milestones

- **M0 - Existing prototype:** The private family dashboard proves the domain workflow.
- **M1 - Secure cloud foundation:** Staging API, managed database, authentication, and household isolation work.
- **M2 - Shared-list vertical slice:** Two household members use an installable mobile build and a shared list.
- **M3 - Core-loop build:** Recipes, planning, week-wide ingredient review, and member-selected shared-shopping additions work end to end.
- **M4 - Private beta:** 10-20 households test the app repeatedly.
- **M5 - Store ready:** Security, reliability, privacy, account deletion, support, and store assets are complete.
- **M6 - Public release:** iOS and Android versions are available through staged rollout.

## Immediate next milestone

The cloud-backed, household-isolated shared-shopping-list foundation is in place. Catalog merged through PR #13 and Recipes through PR #14 as `ac5dcf0`; the Recipes migration is not deployed to staging. On a separately verified `meal_planner_disposable_test` container, migrations reached `household_recipes (head)` and the full API suite passed 120 tests with no skips. The separate native-sheet slice has since replaced the rejected custom Ingredient Details drag; Felipe considers Recipes v1 and the sheet UI finished for now, while broader device/reference acceptance remains pending. Its local mobile normal and no-cache runs each passed 41 suites / 263 tests, plus TypeScript, lint, web export, and whitespace checks. Hosted Mobile CI for PR #14 failed the five Expo patch-alignment recommendations; Felipe explicitly approved merging with that known result and deferred those updates. Catalog remains inventory-free. The household-scoped weekly Plan and explicit shopping-review slice is implemented in focused commits on `codex/household-meal-planning`; it has not been pushed or deployed. Details and exact validation limitations are recorded in `docs/plans/household-scoped-meal-planning.md`. In this session, the normal mobile run passed 44 suites / 281 tests, API Ruff and non-database validation passed, while the cache-cleared cold run had five 5-second test timeouts in other suites. API pytest reported 85 passed and 50 PostgreSQL-backed tests skipped because `DATABASE_URL` was absent. Migration/head verification and all database integration tests are pending a verified `meal_planner_disposable_test` connection. The four visual references were reviewed before coding, but side-by-side running-device and native sheet behavior acceptance remain outstanding; no Android emulator was available and no iPhone check was performed. The optional-side image remains deferred and outside v1 scope.

Cloud staging and CI merged through PR #11 and are provisioned for test-only use on Render Free and Neon Free. The committed workflow passes on push and pull-request triggers, including disposable PostgreSQL validation (56 tests, 0 skipped) and mobile checks; the approved Expo patch alignment passes compatibility/Doctor checks. Felipe reports that two physical devices completed the invited-user/shared-household flow through the Render-backed API and saw the same shopping list; device operating systems were not recorded. After Render slept, the app showed a loading indicator for about one minute and then loaded successfully. This is an observed successful cold wake; failed-wake retry behavior remains untested, and acceptance of the roughly one-minute latency remains undecided. Keep the total cost at $0/month, local API as the everyday development default, and staging data test-only with Felipe manually reviewing and clearing it within 30 days. Staging does not establish production reliability, backup/recovery readiness, broad release validation, or store readiness; Android-specific acceptance and native-build/smoke testing remain outstanding. See `docs/plans/free-cloud-staging-and-ci.md`.

## Decision log

- Continue with the consumer application despite existing competitors because it remains valuable as a portfolio project and may find a useful product niche.
- Use the current home dashboard as a proven prototype and learning source, not as the consumer production deployment.
- Use the separate `meal-planner` consumer-product repository.
- Keep FastAPI and PostgreSQL.
- Build a native React Native/Expo mobile application rather than wrapping the existing website.
- Use Clerk for passwordless email-code authentication in the first beta; defer social sign-in.
- Use `com.efelio.mealplanner` for the iOS bundle identifier and Android package, with `mealplanner` as the Expo scheme.
- Make household multitenancy and authorization foundational work.
- Keep the current invitation-testing slice code-only; add text-shareable invitation URLs that open the app and prepopulate the code in a later approved slice.
- Prioritize the low-maintenance, household meal-planning loop: combine matching recipe ingredients for the week, then let members select what to buy without tracking on-hand inventory.
- Keep one recipe per day/meal slot for the first Plan version. Consider an optional side attached to a planned meal later, without making it part of the saved main recipe.
- Keep the initial beta free and defer speculative features.
- Profile hub implementation merged to `main` through PR #9 and accepted by Felipe after iPhone testing; it replaces Settings with Profile while retaining account, household, and household-targeted invitation destinations. Household management merged to `main` through PR #10; only the reported role-update and pull-to-refresh iPhone checks are accepted, while Android and broader device acceptance remain outstanding. Cloud staging/CI merged through PR #11; its CI checks pass, and the Free/$0 Render/Neon staging API is deployed for test-only use. Felipe reports a two-device invited-user/shared-list flow succeeded against staging, with OS unconfirmed, and a Render cold wake displayed loading for about one minute before succeeding. Failed-wake retry behavior remains untested, and acceptance of the roughly one-minute latency remains undecided. Keep local API as the default, manually clear staging-only test data within 30 days, and treat Android-specific acceptance, native-build/smoke testing, production reliability, and broader release readiness as outstanding. See `docs/plans/profile-hub-replacement.md`, `docs/plans/household-management.md`, and `docs/plans/free-cloud-staging-and-ci.md`.
