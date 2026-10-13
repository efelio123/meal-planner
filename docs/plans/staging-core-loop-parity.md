# Bring staging to the core-loop release

Status: draft for Felipe's approval (October 13, 2026). No staging change is
authorized by this document alone.

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

Felipe must approve this plan, including removal of the two verified staging
Shopping rows and proceeding with the known Expo-check failure, before any
snapshot, deletion, migration, or deploy. The migration runner must be chosen
so the staging credential stays private; if that cannot be arranged safely,
stop and ask for a new execution path.
