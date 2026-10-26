# Expo SDK 58 upgrade

Status: approved October 25, 2026. Felipe approved the proposed separate SDK 58
upgrade and explicitly assigned implementation to this chat. No deployment or
paid resources are included.

Implementation complete locally; automated validation passed. Physical-phone
acceptance, native rebuilds, hosted CI, merge, and deployment remain pending.

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

## Implementation and validation record (October 25)

Resolved core versions:

| Package | Version |
| --- | --- |
| Expo | 58.0.19 |
| Expo Router | 58.0.26 |
| React / React DOM | 19.3.0 |
| React Native | 0.88.0 |
| Clerk Expo | 4.14.1 |
| Gesture Handler | 3.3.x, SDK-recommended range |
| Reanimated / Worklets | 4.7.1 / 0.13.0 |
| Jest / jest-expo / native Jest preset | 30.5.2 / 58.0.12 / 0.88.0 |

Expo's published bundled-native-module map supplied native package versions.
Clerk's 4.x update explicitly permits SDK 58. Jest 30 matches jest-expo's new
runtime dependencies, and the separate native preset fulfills its peer. No
dependency override, legacy-peer installation, or audit force fix was used.
This worktree has its own dependency tree; the prior SDK 57 junction target
and both other checkouts were not modified. The verified local Expo server
was stopped for installation; the API was left running.

Required source migrations:

- Native sheet cleanup observes SDK 58's completed `removed` event, deferring
  listener disposal through unmount as the migration guide prescribes. Effect
  cleanup alone must not discard a draft when React Activity hides a screen.
- Protected routes remain registered in SDK 58. Explicit fallbacks now use the
  shared startup-destination mapping. This fixes a demonstrated onboarding-exit
  redirect loop that the previous implicit fallback produced in SDK 58.
- Household-switch history reset retains complete nested navigator state while
  clearing retained tab detail stacks. It uses a deliberate synchronous reset
  before startup href navigation, with direct regression coverage.
- Recipe focus uses `useIsFocused`; native-tabs imports use the stable entry.
  Strict ref types use native instances; one custom web trigger locally corrects
  Router's still-legacy slot-ref declaration without disabling strict types.
- Shopping picker -> Create Catalog now uses the same atomic route replacement
  as B05. Ordinary recipe/choice flows preserve the committed B05 changes.
- Router tests await rendering and protected-route tests assert denied access
  rather than removal from internal route-name lists. Only actual-router suites
  receive a 30-second initialization budget; the first cold SDK 58 import
  exceeded the previous 5-second unit default. A save regression now waits for
  form loading to complete before pressing its disabled-until-ready action.
  No failing behavior assertion was skipped or suppressed.

Final automated results:

- `npm ci --no-fund`: passed, independent lockfile reproduction.
- Full normal mobile tests: 53 suites / 350 tests passed, no skips (46.189 s).
- Full `--no-cache` mobile tests: 53 suites / 350 tests passed, no skips
  (73.632 s). Cache-disabled does not mean a newly booted machine.
- TypeScript and lint: passed with no remaining warnings/errors.
- `expo install --check`: dependencies up to date.
- Expo Doctor: 20/20 checks passed.
- `expo export --platform all`: web static rendering and iOS/Android JavaScript
  bundles passed using non-secret placeholder environment values. This is not
  a native Xcode/Gradle build or proof of device appearance.
- Whitespace diff check passed before the final documentation record.

Earlier full attempts were stopped after startup timeout cascades and then a
diagnosed onboarding redirect loop; those attempts were not passing runs. The
final results above include the repairs. Native bundle exports emitted the
environment's NO_COLOR/FORCE_COLOR warning; exports still completed.

Audit reports 0 critical and 6 high findings in the Expo CLI dependency chain
(including propagated parent findings), from node-forge and zod. node-forge's
published latest remains 1.4.0 and is affected by GHSA-86w9-cpqp-85rv. Expo CLI
requires zod ^3.25.76 while GHSA-mrhx-c7xc-m3w5's patched range starts in 4.x;
forcing that major would violate its supported range. These remain recorded
upstream dependencies, not claimed resolved or silently overridden.

Still unrun: native builds, physical iPhone/Android checks, dedicated light/dark
visual review, hosted CI, and PostgreSQL tests (no backend changes). No paid
resource, database migration, Mac deployment, or phone installation occurred.
The existing trial signing/name/scene configuration stays on its original
branch and must be reconciled before any deliberate standalone rebuild.

Restart local testing from this checkout's `apps/mobile` with
`EXPO_PUBLIC_API_BASE_URL=http://<PC-LAN-IP>:8000 npx expo start --lan --clear`.
Use SDK 58 Expo Go; existing standalone SDK 57 trial builds cannot load these
SDK 58 bundles. Check sign-in/session restore, all five tabs, onboarding return,
household-switch Back history, B05 Store/Unit creation, sheet dismissal/keyboard
layout, meal planning/review, Shopping creation and swipe/checkoff behavior.
