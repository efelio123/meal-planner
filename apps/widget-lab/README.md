# Widget feasibility lab

This separate Expo application is the approved F16 feasibility prototype.
It uses only fictional items/meals. It has **no sign-in, API origin, household
credential, database connection, or dependency on consumer-app state**.
Nothing under `apps/mobile` was changed for this lab.

The SDK is pinned to `expo-widgets 58.0.26`, with matching SDK 58 / Expo UI.
The lockfile and audit script verify the reviewed registry integrity. Do not
upgrade it without repeating the native-source review.

## What it demonstrates

- iOS small/medium/large layout registrations and Shopping/Plan switching.
- Three Android gallery sample kinds. The reviewed Android environment does not
  expose actual resize dimensions; these are not proof of responsive resizing.
- All seven sample days: direct choices on iOS, Previous/Next on Android so seven
  full Material buttons are not forced into a narrow row.
- Pending local checkoffs remain separate from confirmed purchases.
- Explicit reset replaces local pending props. This deliberately demonstrates why
  SDK snapshot storage is not a safe app/extension operation outbox.
- iOS widget URL points only to this lab. Android activity deep links and native
  rendering/signing still require device verification.
- The timeline inspector handles the missing Android readback method explicitly.

**A successful tap here never means the shared Shopping API changed.** The stock
SDK's native interaction path persists local props and notifies an app-side
in-memory observer. Its public API provides no reviewed closed-app network worker.
The feasibility plan requires review before replacing that path or introducing
production credentials/schema. See `docs/qa/widget-feasibility.md` from repo root.

## Reproduce local validation

Use Node compatible with Expo SDK 58. From this directory:

```bash
npm ci --ignore-scripts
npm run typecheck
npm run audit:sdk
npm test
npm run build:runtime:ios
npm run build:runtime:android
npm run test:bundles
npm run export
```

`npm test` evaluates the SDK's actual JS normalizer/dispatcher with stub native
view hosts. `test:bundles` repeats those checks using the SDK-built iOS/Android
runtime resources and actual Expo UI JavaScript instead of those host stubs.
Both use the actual Expo Babel-serialized layouts in an isolated JS context.
Neither executes WidgetKit, JavaScriptCore/Hermes native hosts or Glance on a phone.

Native Android scaffolding can be generated with `npx expo prebuild --platform
android --no-install` **in this lab directory only**. Generated native folders,
bundles, dependencies and build artifacts are ignored. Generation is not a
Gradle compile, APK installation or device test.

The lab has distinct example bundle IDs, app-group ID and URL scheme. Do not
change the working consumer app's native project, team, identifiers or profiles.
Before a future Mac native build, preserve its working native project/signing and
use the separate lab directory; actual Personal Team signing remains unverified.
The lab is unavailable in Expo Go. No app was installed or working server started.

## Approved app-owned native follow-up

The native replacement approach is approved. `native-probe/` contains separate
SwiftUI/WidgetKit and Glance capability targets, without changing this stock SDK
prototype or the consumer app. Both compile, and six native tests pass. iPhone
signing and actual home-screen taps are still pending; see the probe README and
`docs/qa/native-widget-gate.md`. The production widget feature is not complete.
