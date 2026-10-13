# Core-loop acceptance and staging parity

Status: planning and read-only audit in progress (October 13, 2026). The
visual-consistency branch is merged and pushed to `main` at `2955089`.

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
2. **Read-only staging audit.** Establish the exact Render service, deployed
   commit, dedicated Neon project/database, and live Alembic revision.
   Compare them with `main` and repo head
   `household_shopping_catalog_items`. Confirm both configured and live
   database identity before any database operation. Never use the local
   `meal_planner_dev` connection for staging. If access is unavailable,
   record the gap rather than inferring parity from `/v1/health` (which only
   returns `{"status":"ok"}`).
3. **If staging is behind, stop for a separate deployment decision.** First
   inspect QA data and migration preflight, choose a recoverable snapshot or
   rollback approach, and verify the exact CI-validated commit. Present the
   migration/deployment sequence and risks for Felipe's approval before any
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

- Which Render service and Neon staging database are accessible for read-only
  revision checks? The current workspace API configuration targets
  `meal_planner_dev`, and the mobile configuration is not a verified staging
  target.
- Which Android device or emulator and iPhone can run the two-member test?
- Is a no-cost installable build path available under the current project
  accounts? Do not enroll in a paid Apple/Google program or use billable EAS
  capacity without Felipe's explicit approval.

## Read-only preflight (October 13, 2026)

- Repository migration head is `household_shopping_catalog_items`.
  `/v1/health` returns only `{"status":"ok"}`, so it cannot establish a
  deployed commit or live migration revision. The workspace API `.env`
  targets `meal_planner_dev`; no staging database credential is set in this
  shell. The configured mobile API target is not confirmed as staging.
- No staging Render URL or Neon read-only access is recorded in the repo.
  GitHub CLI's saved authentication is invalid. No staging endpoint was
  contacted, and no database query, migration, or deployment was attempted.
- On this Windows host, `adb`, the Android SDK environment variables, the
  Android emulator command, EAS CLI, and `EXPO_TOKEN` are unavailable. Java
  is present. No installable build was attempted. [Expo's local debug-build
  guidance](https://docs.expo.dev/guides/local-app-development/) requires
  Android Studio for local Android compilation and Xcode for local iOS;
  [Expo's local EAS guidance](https://docs.expo.dev/build-reference/local-builds/)
  does not officially support Windows outside WSL. A build path and any
  account or cost prerequisites need review before configuration changes.
