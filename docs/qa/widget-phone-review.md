# F16 signed consumer phone review

Status: Felipe's phone and consumer widgets are now connected to the Mac family
trial API/database on HTTPS 443. Separate probe app and temporary development
connection are removed. The complete rollout/cleanup record is at the end.
Current installed candidate: `1b3a970` (same application code as pagination
`57cd9ec`; later commits are records only) on
`codex/native-widgets` (iPhone pagination follow-up). The initial review source
was `6a942aeb1e95938a5482c9c7d21a18bdf0f1c40e`; the isolated build directory
retains that original name.

## Approved test boundary

Felipe approves testing the new phone build against the **Windows development
API**, through a temporary private Mac HTTPS connection on port 8443. Start with
Felipe's phone. The Mac family database/API and Loryn's installed app remain on
the existing release. Development data is separate from the family's live data.
The Windows PC, its database/API, the SSH forward, Mac and phone Tailscale
connection need to remain available during review.

The existing Mac family HTTPS 443 configuration is recorded before adding the
review endpoint. A verified loopback SSH reverse forward maps Mac 127.0.0.1:8011
to Windows 127.0.0.1:8000; HTTPS 8443 proxies only that loopback port. Exact
configuration comparison confirms family 443 routing is unchanged. Mac family
local/private-HTTPS health and the new development API health/routes pass.
Windows itself currently cannot resolve the private MagicDNS name; the Mac-side
HTTPS checks pass. Do not label that a successful phone connectivity check.
The primary phone must use its existing Tailscale connection during testing.

The Windows development database is already restore-verified and migrated to
`widget_devices`; see `widget-integration.md`. No Mac migration or production
API update is approved as part of this temporary test.

## Prepared artifacts and recovery

Isolated Mac source/build root:
`~/meal-planner-releases/widget-review-20261102-6a942ae`.
The exact committed source is archived/transferred; npm ci, native generation
with `--no-clean`, CocoaPods and project invariant checks pass. There is one
embedded widget target, separate bridge/extension Swift modules and isolated
widget Keychain access. Only the existing Personal Team is selected; no account,
Keychain ACL or paid resource is changed.

The private mobile environment contains only the two public client settings.
The sign-in instance matches the existing family app. Build API origin is the
approved private development endpoint on 8443. The existing signed family Release
artifact is signature/hash/embedded-JS verified and archived privately in the
review directory before any phone replacement. Do not uninstall the existing app.

A uniquely named `MealPlanner Widget Review.xcworkspace` is opened on the Mac;
its `MealPlanner Widget Review Release` scheme runs **Release**. This avoids the
previous Debug/Metro/no-script-URL error. Existing family and earlier validation
native projects are preserved. Both phones were detected attached; only the
primary phone is targeted for the first review.

## Signing history and completed remote installation

The one-shot build in the existing Mac desktop session reports **No Accounts**.
The cached consumer profile lacks the new App Group entitlement, and the widget
extension has no profile. A successful prior isolated probe profile does not
supply these consumer bundle/group identities.

Felipe is asked to reauthenticate Xcode â†’ Settings â†’ Accounts if prompted, then
select the review Release scheme and his phone and press Build (Command-B).
Handle Apple/signing-key prompts locally. Do not send passwords/codes, weaken
credential storage or reuse a mismatched probe profile. Do not retry unchanged
CLI signing as an account repair. The failed one-shot launch job is removed;
unsigned physical-device Release compilation then **succeeds**. Its embedded JS,
exact private development API origin, scene lifecycle, bundle IDs/build versions,
App Group metadata and widget extension placement are verified. This unsigned
artifact cannot be installed as the signed phone test; the profile/signature and
actual consumer-phone acceptance gates remain pending.

The refreshed consumer app and extension profiles were then detected and checked
for the intended phone and shared App Group. A new one-shot desktop Release
build **succeeded**. The private verification helper's certificate extraction
option was corrected to `--extract-certificates=<prefix>`; both signatures,
profile/certificate authorization and expiry, target-phone coverage, isolated
Keychain groups, shared App Group, embedded JavaScript and exact development API
origin passed verification. The app was installed **in place** on Felipe's phone
only and launched successfully with `devicectl`; no uninstall/data erase was used.
The completed one-shot build job was removed. Private signed verification,
installation, launch and recovery records remain in the isolated Mac review root.

Installation/launch success does not establish correct UI or widget behavior.
Felipe still needs to connect Tailscale, open Profile → Widgets, enable the
current development household and perform the physical review below. Windows
must stay running for the approved temporary development API. The family Mac
API and private HTTPS 443 health checks remain successful.

## Acceptance gates (first two completed)


1. Finish and verify the signed app **and extension**: valid signatures, matching
   shared App Group, correct widget-only Keychain group, preserved app default
   Keychain group first, appropriate profiles/certificates, actual target phone
   included and unexpired provisioning. Verify embedded JS and exact API origin.
2. Install in place on Felipe's phone only, launch and verify startup. A build or
   install success is not proof of a working widget or authorized API mutation.
3. In Profile â†’ Widgets, enable the development household and add small, medium
   and large widgets. Verify count, Shopping deep link, checkoff acknowledgment,
   Pending/retry after Tailscale disconnection, app-closed taps, both views and all
   seven dates/three slots. Use disposable development changes for this review.
4. Compare current appearance with shared app styling; perform the dedicated
   light/dark/text/tint/geometry acceptance before a later family release.

## Return / cleanup

Before returning to the family app, disable the review widget connection in the
new app and resolve/discard disposable Pending work explicitly. Restore the
preserved family Release in place as needed; do not delete household/app data.
Then remove **only** HTTPS 8443 with the prepared guarded helper and stop **only**
the identity-verified Windows SSH forward. Preserve current 443 routes and verify
family API health. Do not use a global Serve reset or restore an old whole config
over unrelated later changes.

Guarded helpers and state are private in the Mac review root and Windows
`%LOCALAPPDATA%/MealPlanner/logs/`. The HTTPS/tunnel remain available while review
is pending; they are not a new family production deployment or a permanent host.

## Accepted appearance / iPhone pagination follow-up

Felipe reports that the consumer widget looks beautiful and requests access to
more shopping rows. He approves previous/next arrows and a page indicator after
reviewing WidgetKit's scrolling limitation. This is appearance feedback, not a
claim that all consumer widget acceptance scenarios passed.

The follow-up keeps three rows in medium and seven in large, persists pages
independently by size within the existing household/session scope, clamps after
confirmed list shrinkage, and preserves Pending checkoffs while browsing offline.
Pages cover the existing 40-row cached summary. Lists beyond that cap retain
Open all with their full unpurchased count. Android is unchanged.

Targeted native validation: **10 XCTest cases passed, zero skipped/failures**,
including four new page boundary/persistence/shrink/scope regressions. The test
host compiles the actual extension and core; its owned simulator is removed.
The earlier full API/mobile results remain historical; those suites are not
rerun for this Swift-only follow-up. Signed consumer rebuild passes; both app/extension signatures, provisioning,
Keychain/App Group isolation and embedded development API are verified. The
committed Swift source hashes match the isolated bridge and extension inputs.
The previous signed review app is preserved privately before replacement.
The updated app installs in place on Felipe's phone only. Remote launch is denied
because the phone is locked: Felipe must unlock and open Meal Planner. The
completed build job is removed and both development 8443/family 443 health pass.
Felipe reviews the installed update and reports that it looks great; the
iPhone pagination presentation is accepted. Offline paging, rapid taps, list
shrinkage and larger-text geometry are covered only to the extent recorded in
the native tests above; those individual physical scenarios have not been
reported. Broader consumer widget acceptance remains separate.

## Family trial activation and cleanup — November 2

Felipe explicitly requests removing test widgets, returning his app to the Mac
family database and using that database for consumer widgets. He reports both
light/dark modes, app tabs and all three widget sizes look good before rollout.
See `docs/plans/family-widgets-rollout.md` for the authorized boundary/recovery.

- Exact application/API source `1b3a970` is packaged separately on the Mac; no
  repository merge, push or cloud deployment is performed.
- Final full API validation passes **265 tests, zero skips**, Ruff and migration
  head checks on an owned disposable PostgreSQL instance, removed after testing.
  Native pagination retains its **10 passing XCTest cases**; the historical
  mobile/native results above are not described as new full-suite reruns.
- A consistent rehearsal backup restores with all **19** existing table schemas
  and full row fingerprints matching. Four additive migrations are rehearsed to
  `widget_devices`, preserving all original values. The rehearsal DB is removed.
- After pausing only the API, a fresh final backup is independently restored and
  verified before live upgrade. All original-column fingerprints match after
  migration. The original DB container/volume and separate home-server services
  are preserved. Calendar integration stays disabled; existing active Members
  receive the approved full-content grants. The new API and HTTPS 443 are healthy,
  scoped widget routes exist and unauthenticated summary access returns 401.
- Final backup remains private on the Mac:
  `~/.config/meal-planner-trial/backups/family-widgets-final-20261103T051750Z/meal-planner-trial.dump`.
  Its adjacent verification report contains the hash and before/after evidence.
  Scheduled backups are updated to `widget_devices` and a backup at head passes.
- The signed family-target app/extension pass profile/certificate/signature,
  Keychain/App Group and embedded-JavaScript checks. Its JS contains family HTTPS
  443 and excludes temporary 8443. Felipe's app is installed **in place** and
  launched after he unlocks the phone. Loryn's app is not replaced.
- One fresh family widget binding and three successful authenticated summary
  requests are observed. The old Windows development widget authority is
  automatically revoked (zero active development credentials). API-origin
  session fencing clears the old local widget generation; credentials/data are
  never transplanted between databases. No synthetic family checkoff is sent.
- Only `com.example.mealplanner.nativewidgetprobe` is uninstalled. Final inventory
  confirms Meal Planner remains and both separate test bundle IDs are absent.
  Only the owned HTTPS 8443 proxy and identity-verified reverse SSH tunnel are
  removed; original family HTTPS 443 and health remain intact. Recovery archives
  and test-source/reproducibility files are retained.

Private active-release metadata uses the new API-only Compose overlay and records
source/schema/image/volume/phone provenance. The free consumer widget profile
expires **November 9 at 9:23 PM Arizona time**; re-sign before then. Loryn retains
her earlier signing expiry/build. Family checkoffs/concurrency, wider permissions,
calendar export and physical Samsung acceptance retain their individual unreported
checks; registration/summary success does not prove that whole matrix.
