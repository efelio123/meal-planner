# Release prerequisite: SDK 58 patch alignment

Status: approved October 31, 2026. Felipe explicitly says Go ahead to this patch set.
Owner: this chat agent, continuing the authorized family trial release on
`codex/family-trial-release`. Dependencies are prepared in an isolated checkout so
the existing Expo server can retain its current dependency tree.

## Goal and evidence

The release's full API tests pass, and mobile types/lint plus iOS/Android exports
pass. Expo compatibility and Doctor fail because their current supported SDK 58
matrix recommends 14 patches below. Doctor passes 19/20 checks, failing only this
alignment. Do not bypass/exclude the check or merge with a falsely green report.
This remains SDK 58, React 19.3 and Clerk 4.14.1, with no new library.

| Package | Current resolved | Proposed target |
| --- | --- | --- |
| @expo/ui | 58.0.23 | 58.0.26 |
| expo | 58.0.19 | 58.0.22 |
| expo-build-properties | 58.0.11 | 58.0.12 |
| expo-constants | 58.0.13 | 58.0.14 |
| expo-font | 58.0.10 | 58.0.11 |
| expo-image | 58.0.17 | 58.0.18 |
| expo-linking | 58.0.14 | 58.0.15 |
| expo-router | 58.0.26 | 58.0.29 |
| expo-splash-screen | 58.0.11 | 58.0.12 |
| expo-system-ui | 58.0.6 | 58.0.7 |
| expo-web-browser | 58.0.6 | 58.0.7 |
| react-native | 0.88.0 | 0.88.1 |
| react-native-screens | 4.30.0 | 4.30.1 |
| jest-expo | 58.0.12 | 58.0.13 |

## Proposed changes and decisions

Update only these direct manifest ranges and the reproducible lockfile, retaining
existing range conventions and exact RN pin. Resolve the specified versions; if
the supported matrix moves again or additional direct changes are needed, record
and review that scope rather than silently expanding it. Allow ordinary necessary
transitive lock changes; no audit --force, major upgrade or validation exclusions.

The benefit is the supported Expo/native combination and passing release/CI
compatibility gates. The alternative is keeping current packages and postponing
the release; skipping the checks is not proposed. Patch changes still affect
native libraries and Router behavior, so rerun navigation/sheet regressions and
regenerate/build a separate Mac native project. The release already requires
both native phone rebuilds; this adds dependency installation/revalidation, not a
paid service. Preserve the old native project, signing configuration and images.

Use an isolated dependency workspace if Expo is still serving Felipe's phone;
do not run a clean install over that running dependency tree. Keep private .env
files out of git. Commit focused package changes and validation records on the
release branch. No schema, auth provider or product behavior changes.

## Affected areas and validation

`apps/mobile/package.json` and package-lock.json, with a small compatibility fix
only if a demonstrated patch regression requires it. Complete intended edits
before a coordinated pass: clean install; full normal and cold mobile suites;
types/lint; Expo compatibility and Doctor; iOS/Android JS exports; inspect audit
changes. Full API checks already passed on disposable PostgreSQL and hosted CI
will verify the exact final candidate again. Preserve historical results as such.
Verify generated scene support, no Apple sign-in entitlement for Personal Team,
embedded JS and the private trial URL, then physical launch/navigation/keyboard
and complete-loop checks on both phones. Old native builds are not patch tests.

## References and open questions

Exact targets are from the captured October 31 local `expo install --check` and
Expo Doctor release logs. Official [Expo upgrade guidance](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
recommends aligning dependencies and checking with Doctor; consult the installed
SDK and [SDK 58 changelog](https://github.com/expo/expo/blob/sdk-58/packages/expo/CHANGELOG.md)
when implementing. [RN 0.88.1 release](https://github.com/react/react-native/releases/tag/v0.88.1)
is the proposed patch, not a new RN minor. Felipe approved this exact patch set before dependency changes, as required by
root AGENTS.md. No additional direct manifest upgrades are included.

## Execution record

The 14 targets resolved exactly in an isolated Windows checkout. Original manifest
range conventions are preserved and npm ci succeeded. The running Expo checkout
keeps its existing node_modules; it is not the validation dependency tree. Full
normal/cold suites, types/lint, compatibility/Doctor, native JS exports and audit
comparison are in progress. Hosted CI and native phone builds remain pending.
