# F16 app-owned native widget gate — November 2, 2026

Branch: `codex/native-widgets`, following the approved
`docs/plans/home-screen-widgets-native-sync.md`.

**Result: iPhone native execution checks passed; physical Samsung gate pending.**
Production integration remains gated. Both platforms compile and seven native
simulator/emulator tests pass. App/extension signatures and shared groups are
verified. Felipe confirms all three iPhone sizes, offline Pending/reconnect/retry,
a tap after swiping the main probe app away and a subsequent tap after phone
lock/unlock without reopening it. The final fixture aggregate is eight unique
fictional acknowledgements. This does not complete F16.

## Isolation and recovery

`apps/widget-lab/native-probe/` contains separate SwiftUI/WidgetKit and native
Android/Glance targets, with example app/group identifiers and fictional data.
There is no JavaScript runtime or dependency on consumer authentication/state.
The only endpoint is an ephemeral local fixture, using a randomly generated
credential rather than any real API token. The fixture has no household database.
Secrets, generated signing/team metadata and build products are not in git.

Before Mac generation, the working native source project was archived into a
private, mode-600 recovery file. The separate project was generated in a new Mac
probe directory. The working Meal Planner project, live family API/database,
running Expo/API servers and installed phone apps were not changed. Android APKs
were installed only into a newly created, explicitly verified disposable emulator.
A later explicitly authorized step installs only the separate iPhone probe; no
consumer-app installation, paid resource or membership change occurred.

## Completed native validation

| Check | Actual result | Limit |
| --- | --- | --- |
| SwiftUI app + WidgetKit extension, Xcode 27.0 / iOS simulator | Build succeeded | Unsigned simulator build, not Personal Team acceptance |
| XCTest snapshot publication preserves queued action | Passed | Separate store instances in hosted test; not a cross-process race stress test |
| XCTest shared-Keychain credential roundtrip | Passed | Simulator Keychain, not a provisioned extension reading the app's credential |
| XCTest native URLSession request | Passed | Fictional authenticated fixture success clears only matching acknowledged action; rejection preserves Pending; duplicate acknowledgement does not increment confirmed count twice |
| XCTest phone endpoint validation | Passed | HTTPS required on devices; embedded credentials, query and fragment rejected; only the fixed simulator loopback may use HTTP |
| Android native app/widget and instrumentation APKs | Build succeeded | Glance 1.2.0 / AGP 9.2.1 / Kotlin 2.2.10 / Gradle 9.4.1; no consumer Expo integration |
| Android instrumentation snapshot/outbox check | Passed | Native SQLite, separate store instances |
| Android instrumentation Keystore encrypted credential | Passed | AES/GCM with non-exportable Android Keystore key; saved file excludes plaintext credential |
| Android separate `:widget` process native write | Passed | Distinct process ID verified; worker reads encrypted credential, acknowledges success and preserves rejected action |

Latest totals: **4 XCTest + 3 Android instrumentation tests; all passed, none skipped.**
Both suites reran after the phone-fixture follow-up; the earlier six-test result
is historical. Python helper syntax also passes.
Android ran on a new Android 37.0 x86_64 emulator; its Activity was never launched.
The debug-only non-exported receiver calls the same worker as the Glance callback;
this proves the separate native worker, not launcher callback dispatch.

## iPhone signing and phone test preparation

The initial remote build failed with No Accounts. Selecting the Personal Team
resolved that error, then remote CodeSign failed with errSecInternalComponent.
Felipe subsequently used Xcode Product → Build and reported Build Succeeded.

Read-only inspection of that Debug-iphoneos build confirms **both** NativeWidgetProbe
and its embedded ProbeWidget have valid code signatures. Both signed entitlements
contain matching App Groups and matching shared Keychain groups; both development
profiles authorize those groups. The profiles expire November 9. This validates
the current free Personal Team provisioning, not physical shared-storage behavior.
Felipe initially clarified the probe was not installed. He then explicitly
requested remote build/run because he was away from the Mac.

The updated phone probe displays confirmed/pending counts, reloads its widget after
native actions and offers Retry pending without a new queued tap. Its physical
URL must be HTTPS; requests refuse redirects. A private, temporary Tailscale Serve
subpath now proxies only the disposable loopback fixture; before/after comparison
confirms the existing Serve configuration is otherwise identical and the family
API remains healthy. No Funnel, ACL change, public hosting or real API credential
is involved. The generated probe plists receive this fixture URL; it is not stored
in repository source. The owned fixture can be removed using phone-fixture.py stop.
The updated SSH Debug build again encountered errSecInternalComponent. Running
that same isolated build as a one-shot Aqua job in the existing signed-in desktop
session **succeeds**. The completed job was removed afterward; no Keychain ACL,
password, login-account or security setting was changed. A read-only AppleScript
state query that waited for desktop authorization was terminated without action.

Before installation, both updated signatures, matching shared groups, unexpired
profiles authorizing the intended phone and the exact fixture URL were verified.
Apple devicectl then successfully **installed and launched NativeWidgetProbe on
Felipe's physical iPhone**, as requested. No app was installed on Loryn's phone;
the existing Meal Planner app remains untouched. The fixture subsequently reports
one acknowledged fictional operation after launch. Felipe then reports that
**small, medium and large widgets all confirm their taps**. A fresh fixture status
read shows **four unique acknowledged operations**, consistent with the initial
self-check and three widget taps. This is physical WidgetKit/native handler, shared
credential and private HTTPS execution evidence; it is not a force-quit, lock-state,
offline-retry, larger-text or final production-layout result by itself.

Felipe subsequently confirms the requested offline sequence worked as planned:
disconnecting Tailscale leaves the tap visibly Pending without incrementing the
confirmed count; reconnecting and using Retry pending clears Pending and increments
confirmed after acknowledgement, with the probe remaining in the background.
The next server status read reports six unique fictional acknowledgements in
aggregate. That count includes the manual test session; per-tap attribution was
not captured, so it is not evidence of an exact number of offline retries.
Felipe then confirms both additional execution checks: swiping NativeWidgetProbe
away in the app switcher and tapping the widget succeeds without reopening it;
locking/unlocking the phone and tapping again also succeeds. A fresh fixture read
shows eight unique acknowledgements, two more than before these checks. This is
evidence for those user-driven actions after app termination and lock/unlock,
not execution while the phone is locked, before its first unlock after reboot,
or guaranteed scheduled background retry.

The completed temporary fixture was then stopped and its own HTTPS proxy path
removed. Exact before/after comparison confirms no other Serve configuration
changed; the family API passes both loopback and private HTTPS health checks.
The installed diagnostic probe remains on the phone, but its temporary endpoint
is no longer running. No consumer app, household data or family API was stopped.

## Still required before production integration

- Coordinate the separate Samsung probe installation and actual Glance home-screen
  callback/private networking checks when the device is available.
- Native rendering, resizing/tint/larger text and deep links remain separate
  layout/routing acceptance. The small probe is not the final Shopping/Plan UI.
- Do not infer execution while locked, before first unlock after reboot, or
  guaranteed scheduled retry from successful user-driven widget actions.

Only after the gate succeeds, implement the approved consumer Expo bridge,
summary/theme/settings, API authorization/versioning/idempotency, protected
production outbox and migrations. No production migration or API mutation has
been attempted. Consumer/mobile/API suites were **not rerun** for this isolated
probe; earlier results are historical and do not validate widgets.

Reproduction and cleanup boundaries: `apps/widget-lab/native-probe/README.md`.
Official guidance reviewed: [Apple interactivity](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities),
[Apple shared Keychain](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps),
[Android Glance actions](https://developer.android.com/develop/ui/compose/glance/user-interaction),
[Android Keystore](https://developer.android.com/privacy-and-security/keystore),
[Glance releases](https://developer.android.com/jetpack/androidx/releases/glance).
