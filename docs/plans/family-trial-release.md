# Family trial improvement release - October 31, 2026

Status: Felipe explicitly authorizes continuing release checks, merge, a fresh Mac
backup and updates for both iPhones. Branch `codex/family-trial-release` starts
from clean `8a2890e`; unrelated website and Android checkouts remain untouched.

## Release scope and preparation

Ship the accumulated accepted bug fixes, SDK 58, Shopping improvements, recipe
ordering, special planned meals and personal planning/review ranges. Latest
Shopping return and decimal fixes are included. No new product feature or package
upgrade is included. Restore the already requested Meal Planner display name and
Clerk appleSignIn=false setting found in the Mac's working trial override; this
preserves free Personal Team signing and existing email authentication. SDK 58
already includes scene support; its installed build-properties documentation says
the SDK 57 enableSceneSupport patch is no longer required.

Read-only baseline: origin/main is `129264d` and is an ancestor of the candidate.
Mac trial is a detached `129264d` checkout with local app/package overrides and
untracked trial Compose/Docker/scripts/build assets. Preserve those and the
existing native project, signing team, environment files, Docker volume and
separate home-server containers. Reach the Mac via its .local hostname and the
existing dedicated SSH identity/trusted host key; do not bypass host validation.
Both physical iPhones are attached. Read actual current database identity and
revision before migration; never reset or seed live data.

## Execution and gates

1. Complete candidate config fixes, then full normal/cold mobile suites, types,
   lint, Expo compatibility/Doctor, iOS/Android JS exports, and full API tests on
   identity-verified disposable PostgreSQL. Obtain final light/dark phone review
   of the complete loop; keep unrun device checks explicit.
2. Make a private custom-format Mac backup, verify archive and restore into an
   explicitly separate recovery-check database, compare all source table counts
   and migration revision, and preserve the archive locally. Take another fresh
   backup immediately before a later migration if family data may have changed.
3. Commit/push the exact candidate and create a reviewable PR. Run hosted CI for
   that SHA; the public repository uses ordinary Linux runners and no paid
   resources. Merge only passing checks and record the merged revision. Inspect
   automatic staging-deployment implications before merging.
4. Prepare an isolated Mac release checkout/native project and Release build,
   preserving the existing project instead of regenerating it in place. Use the
   current private trial API/Clerk configuration without committing credentials,
   and retain bundle ID/keychain/signing identity. Verify embedded JS, scene
   lifecycle, entitlement compatibility and the API URL before installation.
5. Preserve the verified trial DB container/volume. Build only the new API image,
   apply the approved additive migration with a current backup, then restart only
   the trial API service against the same database. Verify schema/health and old
   row preservation. Do not affect the separate home-server services.
6. Install the same signed Release build on both connected, unlocked iPhones.
   Launch/phone-smoke both against the updated Mac API, including shared data and
   special entries, without deleting existing apps or household data. Report
   physical checks that still require Felipe and leave the trial usable.

## Recovery and limits

Keep the prior source, private config/native snapshot and API image available.
The special-meal migration refuses schema downgrade while special rows exist;
never delete those rows to force rollback. Prefer fixing forward on the preserved
schema. A pre-upgrade restore is a separate data-loss decision if new trial writes
exist, requiring review of that concrete recovery action. Tests use disposable
local PostgreSQL only, not the live Mac database. No paid Apple account, cloud
service, charge, store submission, domain purchase or unrelated cleanup.

## Release record

Validation, backup verification, PR/CI SHA, image/schema/build revisions and
phone results will be recorded as each step completes. Pending user replies:
final complete-loop light/dark review and availability for installation.


### Preparation findings

The Mac's current address is different from the saved .140; use its confirmed
address with the original trusted host-key alias and dedicated identity. Its
trial Docker database is verified as `meal_planner_trial` at
`household_shopping_catalog_items`, on the original named volume. A fresh private
custom-format backup was saved under the Mac's backup directory at
`family-release-20261031T213800Z/meal-planner-trial.dump`. A full isolated restore
verified all 19 table counts and canonical row digests plus revision; it contains
70 Catalog items, 9 recipes and 14 planned meals. The restore-check database was
removed. Existing native source/trial overrides were archived beside the dump.
An initial helper reached verification but used a checksum API unavailable in
the Mac's Python; a fresh compatible run completed and recorded verification.
Live data/runtime was not changed.

The full API release pass is 187 tests, no skips, plus Ruff and migration-head
verification on local disposable PostgreSQL. Mobile normal pass is 70 suites /
735 tests, no skips; the cold pass also passed 70 suites / 735 tests with no skips. Types/lint and iOS/Android JS exports
pass. Expo compatibility/Doctor fail only for 14 recommended patches; see
`release-sdk58-patch-alignment.md`. Explicit package approval is pending before
changes. These results do not cover a future aligned dependency tree.


The prior trial API image has a recovery tag, and the existing API health check
still returns ok. The native backup excludes regenerable Pods/build folders;
the original native project remains in place and was not regenerated. No live
migration or API restart has occurred. Final phone light/dark report and exact
SDK patch-set approval remain pending. Installed app updates, hosted CI/merge
and final trial deployment wait for those prerequisites.
