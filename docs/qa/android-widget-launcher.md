# Android native widget launcher gate — November 2, 2026

Branch: `codex/native-widgets`. Felipe directs the Android check to the PC emulator
rather than waiting for the Samsung. **The agreed emulator execution gate passes.**
Samsung hardware/OEM and Android private HTTPS/Tailscale checks remain unrun.
The real Shopping/Plan widget feature is not implemented by this probe.

## Target and isolation

A newly created Android 37.0 x86_64 disposable AVD runs the standalone native
`apps/widget-lab/native-probe/android-probe` with Glance 1.2.0, AGP 9.2.1,
Kotlin 2.2.10 and Gradle 9.4.1. No consumer JavaScript, Clerk session, household data,
Mac service, physical phone or existing AVD is used. The debug fixture is bound to
Windows loopback; its emulator address is 10.0.2.2:43817. No cloud resources or
private Mac route are created for this test.

## Probe additions and launcher defect found

The Activity now offers native self-check and explicit system widget pinning. It
initializes only an ephemeral fictional fixture credential in Keystore-backed
storage. The widget shows a count projection in Glance state; the native SQLite
outbox remains authoritative and the credential is never in that projection.
Callbacks publish Pending before network work, perform blocking I/O on Dispatchers.IO,
and provide a distinct Retry action that does not enqueue another operation.
Confirmed increments only when an existing operation is acknowledged once.

The initial actual launcher pin stayed on a loading screen. Logcat showed that
WorkManager was unavailable in the custom :widget receiver process: Android's
startup provider had initialized it only in the normal app process. The Glance
receiver now uses the default app process, matching the normal Glance manifest
pattern; no Activity or JavaScript listener needs to launch for a widget tap.
The debug-only separate-process receiver remains for the protected-storage test.
After this fix the probe/test APKs rebuild and all three native instrumentation
tests rerun successfully. This defect was not caught by the earlier worker-only
tests; the launcher checks below verify the corrected integration.

## Actual launcher observations

The native system pin dialog adds a 2 × 2 widget to Pixel Launcher. Android SDK
UI Automator observations and screenshots inspect the rendered RemoteViews;
Android input commands tap its observed controls. These are actual launcher widget
taps, not direct calls to ProbeWorker or the debug receiver.

| Check | Observed widget and fictional server result |
| --- | --- |
| Activity self-check | 1 confirmed, 0 pending; server 1 |
| Small launcher widget, Activity backgrounded | 2 confirmed, 0 pending; server 2 |
| Native process restart | Android am kill did not reclaim the active process, so only the probe's own debug UID terminates its verified PID. A subsequent widget tap restarts a new native process; 3 confirmed, 0 pending; server 3. Pixel Launcher remains resumed. |
| Offline tap | Disable Wi-Fi and mobile data only in the owned AVD. Widget shows 3 confirmed, 1 pending; server stays at 3. |
| Pending survives native process termination | Terminate only that probe process again while Pending exists; restore emulator networking. Launcher still shows 3 confirmed, 1 pending. No self-check reset or Activity launch. |
| Retry after reconnect | Actual Retry pending button changes widget to 4 confirmed, 0 pending; server 4. Retry has not enqueued a second action. |
| Medium resize and tap | Drag the native launcher width handle; responsive size is 260 × 180dp. Controls remain visible. Tap confirms: widget 5, server 5. |
| Large resize and tap | Drag native bottom resize handle; responsive size is 260 × 260dp. Controls remain visible. Tap confirms: widget 6, server 6. Pixel Launcher remains resumed. |

The small responsive layout is 140 × 140dp; it omits the diagnostic title/size
line to keep count and button reachable. The launcher host can allocate a larger
cell rectangle than a responsive minimum. These sizes are probe layouts, not
acceptance of the planned product count-only small widget or seven-day Plan view.
Local screenshots are in the ignored `apps/widget-lab/artifacts/android-launcher/`
directory; they contain only this new, unsigned-in emulator's diagnostic UI.

## Validation and limits

- Final native app/test APK compilation: passed.
- Final three Android instrumentation tests: all passed, none skipped. Checks
  include protected credential roundtrip, outbox preservation, separate native
  process success/rejection and nonduplicated confirmed count.
- Actual launcher, process restart, offline persistence/retry and three native
  responsive layouts: passed as described above.
- iOS code did not change in this follow-up; its prior four XCTest and reported
  physical-device results remain historical, not newly rerun.
- Android Settings Force stop was deliberately not used: it has different OS
  semantics from process reclamation. No claim of recovery after force-stop,
  guaranteed background retry, reboot/before-first-unlock, Samsung battery policy,
  Android HTTPS/Tailscale, OS tint/larger text or production deep links.
- Consumer mobile/API suites and database checks were unrun because their source,
  dependencies, configuration and data were not changed.

## Reproduction and cleanup

Build the two debug APKs as documented in the probe README. Run
`run-android-checks.ps1` with `-KeepRunningForLauncherReview`; the usual three tests
run first, then only its owned emulator/fixture remain for review. Launch the
probe Activity, run self-check, request Add test widget, accept the emulator's pin
dialog and return Home. The action/resize/offline checks above can then be repeated.

`finish-android-launcher-review.ps1 -Sdk <sdk-path>` verifies SDK/probe/AVD identity,
restores networking on that device, checks fixture PID ownership, stops only the
owned fixture/emulator and archives the local review-state file. It has been run
successfully for this review. The new disposable AVD is retained on disk for
inspection; existing AVDs, physical phones, Mac and consumer services are untouched.
