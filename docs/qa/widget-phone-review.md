# F16 signed consumer phone review

Status: signed Release verified, installed in place and launched on Felipe's
iPhone November 2. Actual consumer widget/phone acceptance and a development
household widget connection remain pending. Loryn's app and the Mac family
service remain unchanged.
Source candidate: `6a942aeb1e95938a5482c9c7d21a18bdf0f1c40e` on
`codex/native-widgets` (later notes-only commits do not change that build).

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
