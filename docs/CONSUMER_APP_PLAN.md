# Consumer Meal-Planning App: Product and Delivery Plan

Last updated: September 23, 2026

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

## Current consumer-app progress (September 23, 2026)

- The separate `meal-planner` repository exists. Its Expo/React Native mobile app and FastAPI `/v1` API are under active development.
- Local PostgreSQL 17, Alembic migrations, and the first identity/household schema are in place. Disposable-database integration tests cover migration and onboarding behavior.
- Clerk is the selected identity provider. The mobile app uses passwordless email verification codes; the API verifies Clerk session tokens and provisions local users.
- Household create, join by invitation code, select, and sign-out flows are implemented. Signup and household creation have been exercised on a physical iPhone against the local API.
- The current feature is a global light/dark theme foundation. Its plan is awaiting review; no theme implementation is approved yet.
- Cloud staging, cross-household product-data isolation, the shared shopping-list vertical slice, and consumer release operations remain future milestones.

This is a status snapshot, not a change to the long-term scope below. Update it as milestones are validated.

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
Indicate what is already on hand
        ->
Calculate only the missing quantities
        ->
Use one shared shopping list
```

The working product hypothesis is:

> Busy couples and families need a faster way to plan meals collaboratively from their own recipes and buy only the quantities they are actually missing, without continuously maintaining a perfectly accurate pantry inventory.

The likely positioning is:

> A low-maintenance family meal planner that uses your own recipes, asks what you have only when it matters, and creates the exact shared shopping list for the week.

## Competitive context

The broad category is validated but crowded. Existing products include Paprika, MealBoard, AnyList, Plan to Eat, Samsung Food, and Mealime.

- Paprika already provides recipe import, meal planning, grocery lists, and pantry tracking.
- MealBoard supports recipes, planning, pantry quantities, shopping lists, and pantry deduction.
- AnyList is strong at live shared lists, recipe organization, and household meal planning.
- Plan to Eat turns a personal recipe collection and calendar into an automatic shopping list.
- Samsung Food is strong at recipe discovery, importing, nutrition, meal planning, and shopping.
- Mealime is strong at personalized meal suggestions and consolidated grocery lists.

Therefore, `recipes + planning + pantry + shopping` is not sufficient differentiation on its own.

The most promising wedge is reducing pantry-management friction. Instead of forcing users to maintain an exact permanent inventory, the application can show only ingredients relevant to the planned meals, ask for full/partial/zero quantities on hand, and generate the remaining shopping requirements.

Example:

```text
Recipe requirement: 2 gallons of milk
Quantity on hand:   1 gallon
Shopping quantity:  1 gallon
```

Additional differentiators worth testing, but not all building at once:

- A household-first Sunday planning workflow
- Meal suggestions, voting, and cook assignment between partners
- Leftover, takeout, away, and repeat-meal handling
- Remembering family ratings, substitutions, and preferences
- Avoiding meals made too recently
- Pantry-lite behavior rather than exhaustive inventory maintenance
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
- Full, partial, or zero quantity-on-hand input while planning
- Missing-quantity calculation
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

The operation that schedules a meal and creates shopping requirements should be transactional and idempotent. A failure must not leave half a meal or duplicate shopping items behind.

## Mobile experience priorities

Critical user journeys:

1. Register and create or join a household.
2. Invite a partner.
3. Create, import later, or select a saved recipe.
4. Place meals on a weekly calendar.
5. Enter quantities already on hand.
6. Review the consolidated list of missing ingredients.
7. Shop collaboratively and check items off.
8. Adjust the plan when the week changes.

Shopping-list interaction should be optimistic so checking an item feels immediate.

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
- Handle ingredients already on hand.
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
2. Food catalog/pantry-lite
3. Recipe creation and library
4. Weekly meal planner
5. Quantity-on-hand entry
6. Missing-ingredient consolidation
7. Household invitations and settings

Exit condition:

- A household can complete the recipe -> plan -> on-hand -> shopping -> checked-off loop on both platforms.

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
- Pantry/on-hand abandonment
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
- Pantry maintenance becoming too tedious for sustained use
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
- **M3 - Core-loop build:** Recipes, planning, quantities on hand, and generated shopping lists work end to end.
- **M4 - Private beta:** 10-20 households test the app repeatedly.
- **M5 - Store ready:** Security, reliability, privacy, account deletion, support, and store assets are complete.
- **M6 - Public release:** iOS and Android versions are available through staged rollout.

## Immediate next milestone

The next milestone is intentionally narrow:

> Build an installable Expo application in which two authenticated users belonging to one household can share a shopping list through a cloud-hosted, multitenant FastAPI API, while a different household is securely isolated.

Do not begin by rebuilding every existing feature. Prove this vertical foundation first, then add the catalog, recipes, meal planning, and missing-quantity workflow one slice at a time.

## Decision log

- Continue with the consumer application despite existing competitors because it remains valuable as a portfolio project and may find a useful product niche.
- Use the current home dashboard as a proven prototype and learning source, not as the consumer production deployment.
- Use the separate `meal-planner` consumer-product repository.
- Keep FastAPI and PostgreSQL.
- Build a native React Native/Expo mobile application rather than wrapping the existing website.
- Use Clerk for passwordless email-code authentication in the first beta; defer social sign-in.
- Use `com.efelio.mealplanner` for the iOS bundle identifier and Android package, with `mealplanner` as the Expo scheme.
- Make household multitenancy and authorization foundational work.
- Prioritize the low-maintenance, quantity-aware, household meal-planning loop.
- Keep the initial beta free and defer speculative features.
