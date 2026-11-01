# Family trial improvement release - October 31, 2026

Status: Felipe explicitly authorizes continuing release checks, merge, a fresh Mac
backup and updates for both iPhones. Branch `codex/family-trial-release` starts
from clean `8a2890e`; unrelated website and Android checkouts remain untouched.

## Release scope and preparation

Ship the accumulated accepted bug fixes, SDK 58, Shopping improvements, recipe
ordering, special planned meals and personal planning/review ranges. Latest
Shopping return and decimal fixes are included. No new product feature is included. The separately approved SDK 58 patch
alignment is documented in `release-sdk58-patch-alignment.md`. Restore the already requested Meal Planner display name and
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
`release-sdk58-patch-alignment.md`. Felipe subsequently approved the exact 14-patch set. These historical results
predate alignment; see the final results below.


The prior trial API image has a recovery tag, and the existing API health check
still returns ok. The native backup excludes regenerable Pods/build folders;
the original native project remains in place and was not regenerated. No live
migration or API restart has occurred. The SDK patch set was subsequently approved and applied. Final phone
light/dark review remains pending. No installed app update or live deployment
has occurred.


### Validated release candidate and remaining gates

Application candidate `bb55042` is pushed in PR #15. Hosted CI run
`41246001451` passes Mobile and API; the API result is 187 tests with zero skips.
Final isolated Windows normal/cold serial mobile runs each pass 70 suites / 735
tests with zero skips; types/lint, Expo compatibility, Doctor 20/20 and both native
JS exports pass. An earlier Windows npm argument-forwarding issue caused parallel
test timeouts; direct Jest serial invocations pass without test changes.

A private migration rehearsal restored the verified Mac archive into an explicitly
separate temporary database, applied `meal_plan_special_entries` with the new API
image and verified all original values/counts across 18 data tables. The check DB
was removed; live trial revision remains `household_shopping_catalog_items`.
Running Alembic through uv initially hit its image cache permissions; using the
image's installed .venv/bin/alembic succeeds. Use that executable for rollout.
New API image `meal-planner-trial-api:family-bb55042` and a private API-only Compose
override are prepared but not activated. Keep the existing Compose project and
volume, and take another current backup immediately before live migration.

An isolated Mac checkout at `/Users/felipe/meal-planner-releases/family-20261031`
preserves the original trial checkout/native project. npm ci, iOS prebuild, Pods
and unsigned Release compilation succeed. Embedded JS/private URL, Scene
lifecycle, display name/bundle ID and Personal Team-compatible entitlements were
verified. Signed build fails with Xcode No Accounts/no development profile; Felipe
was asked to restore the existing Apple Account/Personal Team in Xcode. No paid
account or new signing setup is proposed. No app was installed on either phone.

Main merge is still gated on inspecting Render auto-deploy/migration implications;
the dashboard requires Felipe's sign-in. Final complete-loop light/dark review is
also outstanding. These are pending user actions, not passing tests. Existing
Expo dependencies/server, Mac live API/data, native project and home-server
containers remain undisturbed. Resume signing, final phone review, staging-safe
merge and API-only trial rollout when those prerequisites are available.


### October 31 activation

Felipe reports both light/dark modes and the final complete loop passed on his
phone. Browser controls became available for the signed-in Chrome tab; the
Auto-Deploy menu authoritatively showed selected Off. Inspection also confirmed
main/services-api linkage, no pre-deploy migration command, and a uvicorn-only
start command. Canceled the edit form without saving or changing Render. The
earlier native computer-control attempts were unsuccessful; no skip-deploy
workaround or staging change was necessary.

PR #15 merged as `d36b14195d09bb2e1c27c5fb475c9b28da38c6f0` October 31 local
time. Its main CI run `41261791643` passes both jobs. Application/API/migration
trees match validated `bb55042` exactly.

The live Mac rollout completed after a brief API-only pause. A fresh backup at
`family-release-final-20261101T013932Z/meal-planner-trial.dump` in the private
Mac backup directory passed archive inspection and isolated restoration, with
all 19 table fingerprints matching. The additive migration reached
`meal_plan_special_entries`; every original value/count across 18 data tables
was preserved, including 70 Catalog items, 9 recipes and 14 planned meals. The
recovery-check database was removed. The new API image is active and both local
and private HTTPS health checks return ok. Original DB container/volume and
home-server containers are unchanged. Restart policy remains unless-stopped.

The private active Compose overlay is
`/Users/felipe/.config/meal-planner-trial/release-20261031.compose.yaml`, used
with the original trial Compose file and project name. It points the API image
and build context to the isolated release. Future trial commands must preserve
that overlay; building from the old original checkout would use old source.
`active-release.json` beside it records the active image/source/volume. The
scheduled backup helper's expected revision was updated after preserving its
old copy with the fresh backup, and a backup at the new revision succeeded.

Local Terminal signing succeeded and its deep signature verification passed.
The generic profile covers Loryn only; explicit Felipe-device preparation over
SSH still cannot access Xcode's account context. A private, syntax-checked local
script now builds and verifies a separately provisioned copy for each attached
phone, retaining the same application bundle. Felipe was asked to run
`build-release-for-both-phones.sh` in the Mac Terminal. Both-phone installation
and post-install native smoke checks remain pending; do not infer those from
the earlier Expo/full-loop acceptance. No phone app was uninstalled.


Phone follow-up: the per-device Mac Terminal script failed for Felipe with
No Accounts and a cached profile that excludes his phone. The generic signing
success was therefore insufficient evidence for both-device provisioning.
Felipe was asked to select his phone and existing Personal Team in the isolated
workspace's Signing & Capabilities, enable automatic signing and use Product →
Build to refresh the profile through Xcode. Do not keep retrying the unchanged
CLI command as an account repair.

The valid Loryn artifact was independently preserved and installed in place. iOS
then rejected launch with a signing/entitlement/developer-trust security error.
Mac deep signature verification passes, the signed leaf certificate is included
in the unexpired device profile, and application/team entitlements match it.
Developer trust on her phone is the next check, not a proven cause; Felipe was
asked to inspect VPN & Device Management and open the app. Native launch and
post-install smoke remain unverified. The live API and family data remain healthy.
