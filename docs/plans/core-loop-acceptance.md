# Core-loop acceptance and staging parity

Status: staging parity and a single-phone smoke completed October 13, 2026;
two-device and native-build acceptance remain open. The visual-consistency
branch is merged and pushed to `main` at `2955089`.

## Goal

Prove that two household members can complete the consumer v1 weekly loop on
the current app, including Android, before starting another feature or a
private beta. Do not mistake local tests, Expo Go, or the earlier staging
shared-list test for full-loop acceptance.

## Affected areas

- Render/Neon Free staging identity, deployed API commit, and Alembic head.
- Recipes, Plan, week-wide Shopping review, and the shared Shopping list on
  two devices in a disposable QA household.
- Android and iPhone native sheet, keyboard, navigation, loading, and refresh
  behavior; an installable native-build smoke test.
- `docs/CONSUMER_APP_PLAN.md` and a dated acceptance record. No feature,
  schema, dependency, or paid-service change is included in this plan.

## Sequence and safeguards

1. **Merge baseline — complete.** Visual consistency and the full seven-day
   Plan row were reviewed, tested, fast-forwarded, and pushed to `main` at
   `2955089`. The final full mobile run passed 51 suites / 336 tests;
   TypeScript and lint passed.
2. **Read-only staging audit — complete.** Establish the exact Render service, deployed
   commit, dedicated Neon project/database, and live Alembic revision.
   Compare them with `main` and repo head
   `household_shopping_catalog_items`. Confirm both configured and live
   database identity before any database operation. Never use the local
   `meal_planner_dev` connection for staging. If access is unavailable,
   record the gap rather than inferring parity from `/v1/health` (which only
   returns `{"status":"ok"}`).
3. **If staging is behind, stop for a separate deployment decision — complete.** First
   inspect QA data and migration preflight, choose a recoverable snapshot or
   rollback approach, and verify the exact release commit's test results and
   any known CI failures. Present the migration/deployment sequence and risks
   for Felipe's approval before any
   staging write or Render deploy. Keep Auto-Deploy Off and stay within the
   existing $0/month boundary.
4. **Two-device full-loop acceptance.** With test-only accounts in one QA
   household, create/find a Catalog Food item, save a recipe, plan meals on
   different days, review the displayed week, combine repeated ingredients,
   edit the amount to buy, add selected needs, and check/edit/remove items in
   Shopping. Refresh on the other device and verify identical household data.
   Also switch to a second QA household and verify isolation. Record the
   device/OS, build or reload, API target, date, and Pass/Fail/Not run for
   each step; use `docs/qa/shopping-manual-regression.md` for Shopping details.
   No real household list should be cleared for testing.
5. **Native-build smoke.** Check the current Expo SDK 57 build guidance and
   available local or no-cost build path. Produce a build only after its
   configuration, signing, platform prerequisites, and $0 cost are confirmed.
   Launch it on Android and iPhone where available; verify auth restoration,
   tab navigation, one native sheet, keyboard, and the core loop. Expo Go is
   useful for iteration but not final native-build acceptance.

## Validation and exit

- Keep the last 51-suite / 336-test mobile result and 145-test disposable
  PostgreSQL result as historical evidence; rerun checks proportionately if
  acceptance work changes code or configuration. Do not claim a skipped or
  unavailable device/build/database check passed.
- Exit only when staging parity is known, the full loop is recorded on two
  members including Android, and a native build is smoke-tested or its exact
  remaining blocker is documented. Any discovered defects get focused fixes
  with separate validation and review.

## Open questions

- The approved staging rollout removed exactly the two disposable Shopping
  rows after a verified Neon snapshot, migrated to repository head, and
  manually deployed current `main`. The current workspace API configuration
  targets `meal_planner_dev`; the ignored local mobile API URL was temporarily
  set to staging for the phone smoke and then restored to its LAN development
  target. The running Expo app needs a reload for that restoration.
- Which Android device or emulator and iPhone can run the two-member test?
- Is a no-cost installable build path available under the current project
  accounts? Do not enroll in a paid Apple/Google program or use billable EAS
  capacity without Felipe's explicit approval.

## Read-only preflight (October 13, 2026)

The observations below are the historical state before the approved rollout;
see the rollout result that follows for the current staging state.

- Repository migration head is `household_shopping_catalog_items`.
  `/v1/health` returns only `{"status":"ok"}`, so it cannot establish a
  deployed commit or live migration revision. The workspace API `.env`
  targets `meal_planner_dev`; no staging database credential is set in this
  shell. The configured mobile API target is not confirmed as staging.
- Felipe supplied the [Render staging service](https://dashboard.render.com/web/srv-daup95gjo6nc73e2d1p0).
  Its dashboard shows `meal-planner-api-staging` on the Free plan, building
  `services/api/` from `main`, with Auto-Deploy **Off** and no pre-deploy
  command. The live deployment is commit `a640747` (PR #11), while current
  `main`/`origin/main` is `228e165`. That deployed commit predates Catalog,
  Recipes, Plan, and Catalog-backed Shopping; staging API code is therefore
  not at parity. The service is grouped under a Render environment named
  `Production` despite its staging service name; verify its database identity
  independently. No Render deployment or settings change was made.
- The deployed commit contains migrations only through
  `household_management_profiles`; the repository now contains six later
  migration files and has head `household_shopping_catalog_items`. Felipe
  supplied the [Neon staging database](https://console.neon.tech/app/projects/falling-cloud-99942700/branches/br-dark-cell-arcu0x0j/databases?database=meal_planner_staging).
  The dashboard identifies project `meal-planner-staging`, branch
  `production`, and database `meal_planner_staging`. Its Tables view shows
  `alembic_version = household_management_profiles`, with only the seven
  tables expected before Catalog. Render's configured `DATABASE_URL` was
  compared privately with Neon connection details: the endpoint and database
  match, and the credential was re-masked without recording its value. A
  counts-only `SELECT` against `meal_planner_staging` confirmed the revision,
  two households, and two legacy Shopping rows. Because Catalog does not yet
  exist there, the final Shopping migration's mandatory Catalog mapping will
  stop on those rows unless they are mapped or explicitly removed. Do not
  silently discard them. Neon currently shows a six-hour restore-history
  window and a manual snapshot option; neither a snapshot nor a restore has
  been attempted. GitHub CLI's saved authentication is invalid. No data was
  changed, and no migration or deployment was attempted.
- GitHub Actions [run #23 for `main` at `228e165`](https://github.com/efelio123/meal-planner/actions/runs/38429920215)
  failed overall at `npx expo install --check`: seven resolved Expo packages
  lag its current SDK 57 patch recommendations. Its mobile normal/cold test,
  TypeScript, lint, and disposable-PostgreSQL API jobs completed successfully.
  The commit is therefore **not** a fully green CI release candidate. The
  dependency alignment or an explicit known-failure exception must be part of
  the separate deployment decision; no package changes were made here.
- On this Windows host, `adb`, the Android SDK environment variables, the
  Android emulator command, EAS CLI, and `EXPO_TOKEN` are unavailable. Java
  is present. No installable build was attempted. [Expo's local debug-build
  guidance](https://docs.expo.dev/guides/local-app-development/) requires
  Android Studio for local Android compilation and Xcode for local iOS;
  [Expo's local EAS guidance](https://docs.expo.dev/build-reference/local-builds/)
  does not officially support Windows outside WSL. A build path and any
  account or cost prerequisites need review before configuration changes.

## Staging rollout result (October 13, 2026)

- Felipe approved the separate [staging parity plan](staging-core-loop-parity.md)
  and confirmed no one else was testing during the transition. Neon Free
  accepted a manual snapshot named `pre-core-loop-migration-2026-10-13` with
  no expiry shown. A guarded transaction deleted exactly two legacy Shopping
  rows from `meal_planner_staging`; zero remained. Both households were
  preserved.
- All six pending Alembic revisions applied successfully. Independent
  read-only checks verified `household_shopping_catalog_items (head)`, the
  Catalog, household Recipes, and Plan tables, and the non-null canonical
  Catalog reference on Shopping rows. An initial supplemental check used an
  incorrect `recipes` table name; the corrected check for
  `household_recipes` passed without another data change.
- Render Free manually deployed exact `main` commit
  `228e1651ad0074c014222043892b07932b0a703a` as
  [deployment `dep-db77bdcs728c73fcppc0`](https://dashboard.render.com/web/srv-daup95gjo6nc73e2d1p0/deploys/dep-db77bdcs728c73fcppc0).
  It reports Live, Auto-Deploy remains Off, direct `/v1/health` returned
  `ok`, and OpenAPI exposed the Catalog, Recipes, Plan, and Shopping routes.
  The known Expo patch-check CI failure was accepted for this staging-only
  deployment; CI was not green. Felipe subsequently reported that the app
  opened all main pages and a full single-phone flow including Plan and
  Shopping worked on staging. New Recipe had a bottom tab-bar overlap; a
  focused fix is on the acceptance branch, awaiting a phone retest. The
  two-device and Android behavior remains unverified in the QA checklist.
