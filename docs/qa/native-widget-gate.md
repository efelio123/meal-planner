# F16 app-owned native widget gate — November 2, 2026

Branch: `codex/native-widgets`, following the approved
`docs/plans/home-screen-widgets-native-sync.md`.

**Result: partial gate passed; production integration remains gated.** Both native
platforms compile and six native simulator/emulator tests pass. Signed iPhone
provisioning and actual home-screen actions remain unverified. This does not
complete F16.

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
No phone installation, paid resource or membership change occurred.

## Completed native validation

| Check | Actual result | Limit |
| --- | --- | --- |
| SwiftUI app + WidgetKit extension, Xcode 27.0 / iOS simulator | Build succeeded | Unsigned simulator build, not Personal Team acceptance |
| XCTest snapshot publication preserves queued action | Passed | Separate store instances in hosted test; not a cross-process race stress test |
| XCTest shared-Keychain credential roundtrip | Passed | Simulator Keychain, not a provisioned extension reading the app's credential |
| XCTest native URLSession request | Passed | Fictional authenticated fixture success clears only matching acknowledged action; rejection preserves Pending |
| Android native app/widget and instrumentation APKs | Build succeeded | Glance 1.2.0 / AGP 9.2.1 / Kotlin 2.2.10 / Gradle 9.4.1; no consumer Expo integration |
| Android instrumentation snapshot/outbox check | Passed | Native SQLite, separate store instances |
| Android instrumentation Keystore encrypted credential | Passed | AES/GCM with non-exportable Android Keystore key; saved file excludes plaintext credential |
| Android separate `:widget` process native write | Passed | Distinct process ID verified; worker reads encrypted credential, acknowledges success and preserves rejected action |

Totals: **3 XCTest + 3 Android instrumentation tests; all passed, none skipped.**
Android ran on a new Android 37.0 x86_64 emulator; its Activity was never launched.
The debug-only non-exported receiver calls the same worker as the Glance callback;
this proves the separate native worker, not launcher callback dispatch.

## iPhone signing blocker

The separate device Release build fails for both app and extension with:

- `No Accounts: Add a new account in Accounts settings.`
- No development provisioning profile for the corresponding probe identifier.

Felipe reauthenticated Xcode; a remote retry still produces the same errors.
Read-only checks find a running Xcode in the same logged-in Mac account. The
stored developer-account preference container has an empty account list; the
presence of that container does **not** establish a usable signing account.
The separate probe project has been opened for a direct Xcode team/build check;
its outcome is pending. Do not infer that App Groups require payment, purchase a
membership, reuse the production profile for another identifier, or remove secure
storage entitlements to bypass this gate.

## Still required before production integration

- Resolve signed-device capability/profile support with the free Personal Team.
- Coordinate installing only the isolated probe on an available iPhone/Samsung.
- Actual WidgetKit/Glance home-screen tap while main app is closed; native process
  credential sharing, protected data/locked-phone behavior and persisted Pending.
- Use a disposable HTTPS fixture reachable from physical devices. The current
  loopback/emulator addresses are deliberately not phone endpoints.
- Real native sizes, resizing/tint/larger text and deep links; Tailscale extension
  networking where relevant. No claim of force-quit recovery or guaranteed retry.

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
