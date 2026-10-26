# Expo SDK 58 upgrade

Status: approved October 25, 2026. Felipe approved the proposed separate SDK 58
upgrade and explicitly assigned implementation to this chat. No deployment or
paid resources are included.

## Goal and branch

Restore physical-iPhone testing with the installed SDK 58 Expo Go, while
preserving the family-trial UI, data, and the committed B05 navigation repair.
Branch `codex/expo-sdk-58-upgrade` starts at `88971fd`, atop the main-based B05
branch. Keep the earlier trial native configuration and uncommitted website /
Android work in their own branches. Do not merge or deploy automatically.

## Affected areas and changes

- Align `apps/mobile/package.json` and its lockfile to stable Expo 58 and the
  SDK-recommended React 19.3 / React Native 0.88 / native-module set. Keep Node
  22 (local 22.17 meets the >=22.13 requirement); review CI requirements.
- Upgrade Clerk within 4.x to a release explicitly supporting SDK 58: existing
  4.6.5 peers require Expo <58; registry release 4.14.1 permits Expo <59. Retain
  existing custom email-code flows and token storage, without adding social
  authentication, biometrics, or optional native UI modules.
- Apply required Router 57->58 migrations, especially removed `beforeRemove`
  events and unsaved-change continuation; preserve exactly-once sheet cleanup,
  Back/Cancel/dismiss behavior, draft/session/household scope, and the B05 fix.
  Migrate strict React Native instance/ref types rather than opting out globally.
- Update Router tests to await SDK 58 helpers and to assert supported observable
  behavior; preserve meaningful protected-route and navigation coverage even
  where internal state structure changes.
- Preserve explicit static web output and existing native header appearance.
  Update live SDK documentation references in the mobile agreement/README;
  historical validation records stay historical.
- Isolate dependencies: remove only this checkout's verified node_modules
  junction and install a private dependency tree. Do not mutate its SDK 57
  target or delete native projects in other checkouts/the Mac.

## Decisions, alternatives, and risks

SDK 58 is necessary for the current App Store Expo Go reported on Felipe's
phone. Staying on 57 with a custom development client is viable but requires
a native build; adopt that deliberately later rather than silently adding it.
The upgrade changes native navigation and React Native across two versions,
so native sheets, insets, gestures, sign-in/session restoration, and local LAN
loading require device acceptance. Do not mix in backlog feature work.

SDK 58 generates scene-lifecycle native projects. Existing Personal Team
signing, the Meal Planner display name, and disabled unused Apple sign-in
entitlement from the separate trial branch must be preserved when preparing
future standalone builds. This slice does not regenerate or replace the Mac
projects or either phone's installed app, and does not touch API/database data.

## Validation

After completing the migration edits, run clean-install reproducibility,
the full normal and cold mobile suites, TypeScript, lint, Expo dependency check,
Expo Doctor, whitespace checks, and static web plus iOS/Android JS exports.
Inspect production dependency audit changes; no force fixes or unrelated major
upgrades. Use non-secret placeholder config for automated exports.

Native builds/device checks are separate and must be reported unrun until
performed. Felipe checks Expo Go launch, sign-in/restoration, all five tabs,
recipe creation/editing, B05 Store/Unit round trips, keyboard/footer reachability,
meal planning/review, and rapid Shopping checkoffs/swipes. No PostgreSQL suite
is needed without backend changes; do not test destructively on the Mac DB.

Keep rollback at the preserved SDK 57 branch/commits and its dependency tree.
Record exact resolved versions, failures/fixes, warnings, and unverified cases.
If an unsupported core dependency or product-behavior change is required,
revise this plan with a concrete alternative before expanding scope.

## References reviewed

- https://docs.expo.dev/versions/v58.0.0/
- https://expo.dev/changelog/sdk-58
- https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
- https://docs.expo.dev/router/migrate/sdk-57-to-58/
- https://reactnative.dev/docs/strict-typescript-api
- npm registry peer metadata for `@clerk/expo` 4.6.5 and 4.14.1.
