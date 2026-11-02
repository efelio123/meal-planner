# App-owned native widget gate

This is a disposable build/storage/networking probe, **not the consumer widget
feature**. There is no Expo/React Native runtime, Clerk token, household database
or family API here. The source uses fictional items and an ephemeral loopback
fixture credential. Never reuse its example identifiers or HTTP fixture origin
in the consumer app.

The approved approach and required gate are in
`docs/plans/home-screen-widgets-native-sync.md`; actual results are in
`docs/qa/native-widget-gate.md`, both relative to the repository root.

## iOS

Copy the Swift files, Ruby generator and Python runners into a new private Mac
directory whose basename starts with `meal-planner-widget-probe-`. Preserve the
working iOS project first. The generator reads its signing team without editing
it; generated projects, plist/entitlement files and signing metadata stay outside
git. It refuses to overwrite an existing probe project.

With Ruby's installed `xcodeproj` gem available:

```bash
ruby create-project.rb /absolute/path/to/working/App.xcodeproj
xcodebuild -project NativeWidgetProbe.xcodeproj -scheme NativeWidgetProbe \
  -sdk iphonesimulator -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath DerivedData CODE_SIGNING_ALLOWED=NO build
python3 run-simulator-checks.py
```

The test runner creates, uses and deletes only its newly named iOS 27 simulator;
it terminates only its own fixture server. It requires the iPhone 18 Pro simulator
runtime/device type and a free loopback port 43817. For a rerun, preserve the prior
`ProbeResults.xcresult` elsewhere first; Xcode will not overwrite a result bundle.
The four hosted XCTest checks cover snapshot/outbox isolation, shared-Keychain
roundtrip, native authenticated fixture acknowledgement/rejection, duplicate
acknowledgement counting and HTTPS-only phone endpoint validation. They do
not prove extension-to-app Keychain sharing on a provisioned phone or an actual
WidgetKit button dispatch. Simulator entitlements cannot establish Personal Team
capability availability.

A separate Release build for `generic/platform=iOS` checks provisioning. It does
not install the probe. Resolve accounts/signing in the isolated project, retaining
both App Groups and Keychain Sharing; do not remove capabilities to get a build.
Actual device installation and closed/locked-app widget checks require
coordination. Simulators use loopback; device builds require the separate
ProbeFixtureOrigin HTTPS setting. The generator accepts that URL as its optional
second argument; credentials, query strings and fragments are rejected.

## Android

`android-probe/` is a standalone native app, separate from the generated Expo lab
project and consumer app. It compiles Glance 1.2.0 with AGP 9.2.1, Kotlin 2.2.10 and
Gradle 9.4.1, using the already generated lab Gradle wrapper:

```powershell
$env:JAVA_HOME = '/absolute/path/to/jdk'
$env:ANDROID_HOME = '/absolute/path/to/android-sdk'
./apps/widget-lab/android/gradlew.bat `
  -p apps/widget-lab/native-probe/android-probe `
  :app:assembleDebug :app:assembleDebugAndroidTest
```

Then run `run-android-checks.ps1` with `-Sdk`, `-Python` and `-TemplateConfig` pointing
to an existing Android 37.0 x86_64 AVD config. It copies **only configuration** to a
new, uniquely named AVD; existing AVD contents are never used or changed. It checks
its emulator identity before installing the fictional probe/test APKs. The
emulator is hidden, uses port 5582, is shut down afterward, and is retained on disk
for inspection. Its loopback fixture is stopped afterward. No physical device is
selected, and no application Activity needs to launch for the tests.

Three instrumentation tests cover snapshot/outbox isolation, Android Keystore
AES/GCM credential roundtrip without plaintext file storage, and the same native
checkoff worker invoked in a separate `:widget` process. A debug-only, non-exported
same-UID receiver drives that process test. The actual Glance action calls the
same worker, but launcher widget taps, rendering/resizing and Samsung background
behavior remain separate physical acceptance checks. No exact background retry
or force-stop behavior is established by these tests.

Cleartext networking is enabled **only in the disposable debug app**, for its
emulator-to-host `10.0.2.2:43817` fixture. Production credentials must use validated
HTTPS. Production must also add generation isolation, server authorization,
idempotency, conflict handling, expiry and revocation; none are claimed by this
small capability probe.

## Coordinated iPhone test

`phone-fixture.py start`, run only from the private Mac probe directory, adds one
randomly named `/_widget-probe-*` HTTPS path to the existing private Tailscale
Serve configuration. It verifies that all other configuration remains identical,
checks the family API health before/after, and sets the URL in the generated probe
plists. It does not regenerate the project or change selected signing teams.
Its listener remains loopback-only; no Funnel/public exposure is used. Its seed
endpoint is intended only for fictional disposable test state within this private
network; it is not a production device registration protocol. Secret and
acknowledgement state exist only in the fixture process's memory.

The helper saves its owned process/route identity and a mode-600 pre-change route
snapshot locally, never in git. `phone-fixture.py status` reports only fictional
acknowledgement count. `phone-fixture.py stop` removes only its matching proxy path
and its verified fixture process, preserving other routes. Leave it running only
while a coordinated phone test is pending, then stop it. Never use Serve reset.

1. Build and Run **NativeWidgetProbe**, with the intended unlocked iPhone selected.
   This installs only the distinct probe, not Meal Planner. Keep Tailscale on.
2. Tap **Run native self-check**. Expect **1 confirmed · 0 pending**.
3. Return to Home Screen and add the medium **Native Widget Probe** widget.
4. With the probe app in the background, tap **Test native tap** in the widget.
   Expect **2 confirmed · 0 pending**, with no main-app launch. Cross-check the
   server acknowledgement count using the helper's status command.
5. Disable Tailscale temporarily, tap again and wait for its bounded request to
   fail. Expect **1 pending**, retaining the confirmed count. Enable Tailscale and
   tap **Retry pending** in the widget; pending should clear only after a server
   acknowledgement. Do not run self-check again during this sequence: it resets
   the fictional fixture/session and shared probe data.

Physical checks, including repeat taps after app termination and lock/unlock,
remain separate recorded observations. Do not infer them from simulator tests,
profile verification, a successful install or the fact the code has no JS runtime.
