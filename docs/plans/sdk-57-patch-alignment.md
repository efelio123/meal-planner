# Expo SDK 57 patch alignment and config-warning investigation

Status: approved package-range alignment and the separately approved function-form `app.config.ts` update are implemented. Final online checks reported by Felipe passed: `npx expo install --check` said dependencies are up to date, and temporary `npx --yes expo-doctor` passed 21/21 checks. Native rebuild and device acceptance remain outstanding.

## Goal

Align the mobile app's Expo SDK 57 packages with the SDK 57-compatible patch versions, then identify the exact cause of the reported Expo Doctor app-config warning. Keep Expo SDK 57, React Native 0.86, React 19, Clerk, app behavior, and environment configuration unchanged. Android physical-device acceptance remains outstanding.

## Current findings

Before patch alignment, the lockfile resolved Expo `57.0.19`, React Native `0.86.3`, React `19.2.3`, Expo Router `57.0.23`, Expo Symbols `57.0.3`, and Clerk Expo `4.6.5`. Router `~57.0.23` and Symbols `~57.0.3` were already aligned in the navigation PR; they are not part of this follow-up.

An earlier SDK compatibility check reported mismatches for the following nine packages. It did not establish that the dependency set passed validation:

| Package | Pre-alignment resolved | Approved package range |
| --- | ---: | ---: |
| `expo` | `57.0.19` | `~57.0.25` |
| `expo-build-properties` | `57.0.17` | `~57.0.22` |
| `expo-device` | `57.0.1` | `~57.0.2` |
| `expo-font` | `57.0.3` | `~57.0.4` |
| `expo-image` | `57.0.4` | `~57.0.5` |
| `expo-secure-store` | `57.0.3` | `~57.0.4` |
| `expo-splash-screen` | `57.0.8` | `~57.0.9` |
| `expo-system-ui` | `57.0.3` | `~57.0.4` |
| `expo-web-browser` | `57.0.2` | `~57.0.3` |

These are candidate patch updates within SDK 57, not an SDK/RN/React upgrade. The SDK 57 reference recommends the listed module versions for [BuildProperties](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/), [Device](https://docs.expo.dev/versions/v57.0.0/sdk/device/), [Font](https://docs.expo.dev/versions/v57.0.0/sdk/font/), [Image](https://docs.expo.dev/versions/v57.0.0/sdk/image/), [SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [SplashScreen](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/), [SystemUI](https://docs.expo.dev/versions/v57.0.0/sdk/system-ui/), and [WebBrowser](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/). Expo documents SDK 57 with React Native 0.86 and React 19.2.3 in its [SDK reference](https://docs.expo.dev/versions/v57.0.0/).

The current SDK 57 map also shows four additional package recommendations that were not included in the earlier mismatch report. In the current manifests and lockfile:

| Package | Prior manifest range | Current lock resolution | Approved manifest range | Review status |
| --- | --- | ---: | ---: | --- |
| `@expo/ui` | `~57.0.15` | `57.0.20` | `~57.0.20` | Approved; resolution preserved |
| `expo-constants` | `~57.0.17` | `57.0.19` | `~57.0.19` | Approved; resolution preserved |
| `expo-glass-effect` | `~57.0.1` | `57.0.4` | `~57.0.4` | Approved; resolution preserved |
| `expo-linking` | `~57.0.9` | `57.0.11` | `~57.0.11` | Approved; resolution preserved |

The additional SDK-map recommendations are documented in the official [Expo UI](https://docs.expo.dev/versions/v57.0.0/sdk/ui/), [Constants](https://docs.expo.dev/versions/v57.0.0/sdk/constants/), [GlassEffect](https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/), and [Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/) references. Felipe approved aligning these four manifest ranges while preserving their already-matching lockfile resolutions. The fresh compatibility check reported no mismatches and did not implicate additional packages.

Before package edits, a fresh online `npx expo install --check` was run from `apps/mobile`; it returned `Dependencies are up to date`. This result agreed with the approved targets and implicated no additional packages. A subsequent check attempt from the agent environment failed with `EACCES`; no package-resolution changes were made after the successful check, only manifest-range alignment to versions already resolved in the lockfile. Do not use `--fix` as a substitute for review. Expo documents `--check` as validation and `--fix` as automatic package correction in its [CLI version-validation guide](https://docs.expo.dev/more/expo-cli/#version-validation).

The installed Clerk Expo `4.6.5` package metadata declares `expo: ">=54 <58"`; the [official Clerk Expo package metadata](https://github.com/clerk/javascript/blob/main/packages/expo/package.json) retains the same peer range. This includes SDK 57 and excludes SDK 58. Keep Clerk at `4.6.5` and do not upgrade Expo to SDK 58 as part of this work.

Before the config edit, Felipe ran temporary `npx --yes expo-doctor`: 20/21 checks passed, with the sole failure “You have an app.json file in your project, but your app.config.ts is not using the values from it.” The config then exported an object after manually importing and spreading `app.json`. Expo's documented function-form config receives the static config as `ConfigContext.config`; the resolved outputs were captured before changing the export. Felipe approved a small behavior-preserving function-form update; no Doctor check is suppressed. See final before/after results below.

## Proposed scope and affected files

1. Update only the nine original approved package ranges plus the four approved manifest-range alignments in `apps/mobile/package.json` and the corresponding root dependency metadata in `apps/mobile/package-lock.json`. Preserve the four packages' already-matching lock resolutions. Keep Router `~57.0.23` and Symbols `~57.0.3` unchanged. The fresh online SDK check returned `Dependencies are up to date` before edits; it reported no other package candidates.
2. Inspect `apps/mobile/app.config.ts` and `apps/mobile/app.json` without changing them initially. Capture the exact Doctor version, exact warning/check name, and relevant output. Compare `npx expo config --type public --json` and `npx expo config --type prebuild --json` for the default and development `APP_VARIANT`, checking only non-secret fields. Confirm the development-only cleartext plugin does not appear in the default/production config.
3. Compare Doctor's warning with the actual resolved config and Prebuild/introspection result. The initial comparison showed the intended resolved values; after separate approval, update `app.config.ts` to Expo's function form and rerun the comparison. Do not edit `app.json`, suppress Doctor, or broaden the configuration change.
4. Do not edit `.env` files, add secrets, change app identity, modify `AGENTS.md` or the product roadmap, change application behavior, upgrade Clerk/Router/Symbols/RN/React, or add dependencies.

Implemented scope: the two package manifests, `app.config.ts` function-form update, and this plan's validation/status record. The unrelated uncommitted invitation-plan draft remains preserved. No `app.json`, app identity, or environment-file changes were made.

## Native-build prerequisites and implications

The repository has no checked-in `ios/` or `android/` directories, no `expo-dev-client` dependency, and no `eas.json`.

- The repository's available build route is local Continuous Native Generation: after approval, Expo can generate native projects with `npx expo prebuild`, then build with `npx expo run:android` or `npx expo run:ios` when the corresponding native toolchain is available. Android needs its local Android SDK/Gradle toolchain; iOS requires macOS and Xcode. Prebuild creates native directories, so inspect generated changes and do not commit them without a separate decision.
- A dedicated Expo development-client workflow is not configured. Adding `expo-dev-client` and configuring/validating that workflow would be an additional dependency/setup change requiring approval; do not add it as part of this plan automatically.
- EAS cloud builds are also not configured: there is no `eas.json`. Creating EAS project/build configuration, linking a project, or initiating cloud builds is outside scope and requires separate approval. Do not assume an account, project, credentials, or build profile exists.
- Several candidate packages contain native code or config plugins. If package changes are approved and alter native artifacts, an app binary rebuilt with the selected approved path is required; JS export alone cannot validate native modules. Expo notes that `expo-build-properties` affects Prebuild output and SecureStore plugin options affecting native config require a new binary.

No build is authorized or initiated by this plan. If local toolchains are unavailable, report that blocker and do not substitute Expo Go or claim native validation passed.

## Automated package and configuration validation

- Before the function-form edit, `npx expo install --check` had completed online with `Dependencies are up to date`. My final-state attempt failed with `EACCES`, then Felipe reran it locally after the edit and reported `Dependencies are up to date`.
- Before the function-form edit, Felipe's temporary `npx --yes expo-doctor` run completed 20/21 checks with the app-config warning described above. My final-state temporary Doctor attempt could not complete because network resolution stalled, then Felipe reran it locally after the edit and reported 21/21 checks passed with no issues. No Doctor check is suppressed.
- Public and prebuild config summaries were captured before and after the edit for default and `APP_VARIANT=development`. They match for scheme `mealplanner`, iOS bundle ID and Android package `com.efelio.mealplanner`, `userInterfaceStyle: automatic`, and the four existing plugins (`expo-router`, `@clerk/expo`, `expo-secure-store`, `expo-splash-screen`). In both default summaries, `expo-build-properties` is absent and cleartext is unset. In both development summaries, it is appended with `android.usesCleartextTraffic: true`. These checks used only allowlisted public config fields; no secrets were printed. `app.config.ts` now takes `ConfigContext`, returns `ExpoConfig`, and spreads its normalized `config`; the cast reflects that Expo's context type marks runtime-normalized fields optional.
- Final-state normal and cold mobile tests each passed 16 suites / 84 tests. `npx tsc --noEmit`, `npm run lint`, and root `git diff --check` passed. Git emitted only line-ending conversion notices; there were no whitespace errors.
- iOS, Android, and web Expo exports passed. Exports are automated bundling checks only; they do not count as native-build or device acceptance.

## Native-build and physical-device acceptance (not performed)

- Only after the build path and any required setup have been approved, build/install fresh iOS and Android development binaries and smoke-test startup, Clerk session restoration, household state, navigation, shopping-list flows, and system appearance.
- Keep automated checks distinct from native builds and device behavior. iOS testing of the navigation slice has been accepted, but the new rebuilt binary still needs smoke testing. Android device acceptance is explicitly outstanding. If an Android device or toolchain is unavailable, report acceptance as not performed; do not infer it from exports or CI.

## Remaining limitations and approval points

- Online Expo validation is complete: Felipe's final-state install check reported dependencies up to date, and final-state Expo Doctor reported 21/21 checks with no issues. Before the approved config update, Doctor reported 20/21 with the app-config warning; the approved function-form callback resolved that warning without suppressing checks.
- Native builds were not initiated. Choose/approve the local CNG path after confirming platform toolchains. Adding `expo-dev-client` or setting up EAS configuration/cloud builds each requires additional approval.
- Android device acceptance remains outstanding. If an Android device/toolchain is unavailable, report that acceptance as not performed and arrange it when the device is available.
