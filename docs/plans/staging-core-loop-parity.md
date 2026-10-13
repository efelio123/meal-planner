# Bring staging to the core-loop release

Status: staging rollout and single-phone smoke complete on October 13, 2026;
two-device acceptance remains pending. Felipe confirmed no one else was
testing staging during the transition.

## Goal and scope

Make the existing $0 Render/Neon staging environment match the consumer v1
Recipes, Plan, and Catalog-backed Shopping API on `main`, so the two-device
core-loop acceptance checklist can be run. This is a staging-only data/schema
and deployment operation. It does not change application code, dependencies,
CI, production resources, or the local `meal_planner_dev` database.

## Verified starting point

- Render service `meal-planner-api-staging` is live at `a640747`, manually
  deployed from `main` on the Free plan with Auto-Deploy Off. The repository's
  current `main`/`origin/main` is `228e165`.
- Render's configured Neon endpoint and database match project
  `meal-planner-staging`, branch `production`, database
  `meal_planner_staging`; credentials were not recorded. A counts-only read
  verified `alembic_version = household_management_profiles`, two households,
  and two legacy Shopping rows. Repository head is
  `household_shopping_catalog_items`, six revisions later.
- The last [hosted CI run for `228e165`](https://github.com/efelio123/meal-planner/actions/runs/38429920215)
  passed its API/PostgreSQL job and the mobile test, type-check, and lint
  steps, but failed overall on seven Expo SDK patch recommendations. Treat
  that as a known, unwaived failure—not a green release check.
- Felipe chose to treat the two staging Shopping rows as disposable. This is
  not permission to delete them before the rest of this plan is approved.

## Proposed sequence and decisions

1. Recheck the exact `main` SHA, Render live SHA, Neon project/branch/database,
   Alembic revision, and legacy row count immediately before the change.
   Confirm all data is staging test data and no other person is testing during
   the short schema/API transition. Stop if any identity or count differs.
2. Confirm that Neon's manual snapshot is available on the existing Free plan
   without a charge or upgrade. Create a named pre-migration snapshot and
   verify it appears as a usable recovery point. The visible six-hour history
   window alone is not a durable rollback plan. Do not create paid resources.
3. In a secure, single-purpose staging connection, remove only the two
   confirmed legacy rows from `meal_planner_staging.shopping_list_items`.
   Recount to zero; leave households, users, and shopping-list containers
   intact. Never use the local development database or persist a connection
   string in the repo, shell history, logs, or a committed file.
4. Run the repository Alembic upgrade from
   `household_management_profiles` to `household_shopping_catalog_items`
   against that verified staging database. Confirm `alembic current` and a
   read-only query both show the expected head; stop on any migration error.
   Do not force-stamp a revision. The six migrations add Catalog, starter
   categories/emoji, Recipes, Plan, and Catalog-backed Shopping. The final
   migration rejects unmatched legacy Shopping rows, hence step 3.
5. Manually deploy the exact reviewed `main` commit to the existing Render
   Free service. Keep Auto-Deploy Off. Confirm the dashboard reports that SHA
   live and `/v1/health` responds. Then perform a minimal authenticated
   staging smoke test for Catalog, Recipes, Plan, and Shopping with test-only
   accounts before the full two-device checklist.
6. If anything fails, stop writes and diagnose before retrying. Render can
   roll back a recent service deploy, but that does **not** roll back Neon
   schema/data. Restore the verified Neon snapshot if a database rollback is
   needed, then align the Render code to that restored revision. Do not run a
   blind Alembic downgrade. Record the resulting SHA, revision, recovery
   point, and test outcome in `docs/qa/core-loop-acceptance.md`.

## Validation and known risks

- Before the write: verify identity, no-cost recovery, disposable row count,
  latest relevant local/disposable-database validation, and the exact hosted
  CI result. Decide explicitly whether the known Expo version-check failure
  is acceptable for this staging-only API deployment; do not claim CI passed.
- After the write: verify Alembic head, Render deployed SHA, health, and
  authenticated cross-feature reads/writes. The mobile app's API target must
  be verified as staging before device acceptance.
- Migration and deploy cannot be atomic across Neon and Render; old API writes
  may fail during the transition. Schedule a quiet test window. A code-only
  rollback can be incompatible with the new schema, so preserve the paired
  database recovery point. Neon [restores from history](https://neon.com/blog/announcing-point-in-time-restore)
  and Render [deployment rollbacks](https://render.com/docs/rollbacks) are
  separate controls. Render Free retains only limited previous deploys.

## Approval gate

Felipe approved this plan, including removal of the two verified staging
Shopping rows and proceeding with the known Expo-check failure. On October 13,
the existing Free Neon project accepted one manual snapshot named
`pre-core-loop-migration-2026-10-13` (captured at 18:06:06 UTC, with no expiry
shown). A private read-only connection independently reconfirmed the named
database, old revision, and two rows; the credential was not written to disk
or logs and was cleared from the clipboard. Felipe confirmed the quiet window
before deletion, migration, or deployment.
The guarded transaction then removed exactly the two disposable legacy
Shopping rows and verified zero remained. Alembic applied all six pending
revisions and reported `household_shopping_catalog_items (head)`; an
independent read confirmed the same revision, both households, zero Shopping
rows, the Catalog/Recipes/Plan tables, and the canonical Shopping item
constraint. A first supplemental check incorrectly asked for a table named
`recipes`; the actual table is `household_recipes`, and the corrected check
passed without another migration or data change. Render manually deployed
commit `228e1651ad0074c014222043892b07932b0a703a` from `main` as
[deployment `dep-db77bdcs728c73fcppc0`](https://dashboard.render.com/web/srv-daup95gjo6nc73e2d1p0/deploys/dep-db77bdcs728c73fcppc0).
The service reports Live on the Free plan with Auto-Deploy Off. Direct
`/v1/health` returned `ok`, and the public OpenAPI document exposes the
Catalog, Recipes, Plan, and Shopping routes. The ignored local Expo `.env` was
temporarily pointed at staging for a phone check, with Felipe's approval, and
then restored to the LAN development API. After manually restarting Expo,
Felipe could open all main pages and reported a full single-phone flow,
including meal planning and adding to Shopping, worked. New Recipe had a
bottom tab-bar overlap; a focused fix is awaiting phone retest. This is not
the two-device or Android acceptance result. Do not count route discovery
alone as an authenticated smoke test.
