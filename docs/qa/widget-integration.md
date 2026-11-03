# F16 consumer widget integration

Branch: `codex/native-widgets`. Approved plan:
`docs/plans/home-screen-widgets-native-sync.md`. Status: implementation prepared
locally; the approved Windows development migration is complete. Real household/phone
acceptance and Mac deployment remain outstanding.

## API and data contract

`widget_devices` follows `calendar_sync`. A protected per-phone secret has a
seven-day renewable lifetime; only its digest is persisted in PostgreSQL.
Normal app authentication registers/revokes that user's binding. Limited Widget
credentials can only read the bounded household summary, submit explicit checked
intents, or revoke themselves. Every request checks live membership, bound role,
permission revision, generation and expiry. Errors do not echo credentials.

Summary schema 1 carries all-household unpurchased count, up to 40 shopping rows,
all seven household-local dates and their meal slots, special-meal details and a
declared 500-meal bound. It includes the personal starting day and an increasing
per-device `snapshot_version`. Native commits compare that watermark, preventing
a late app/extension response from replacing newer state.

`check_version` advances on every explicit checked-state write, including old
clients and re-adds with unchanged quantities. Other item edits preserve it.
App/widget checkoffs share the same mutation. Stable operation IDs and expected
versions handle lost acknowledgements, duplicate taps, re-adds, removed items and
family conflicts without blind toggles.

## App and native implementation

- `src/features/widgets/`: opt-in, account/session/household fencing, coalesced
  refresh, theme/week-start projection and Profile → Widgets. The page uses
  shared `Screen layout="tab-stack"`. Account loading/offline errors preserve
  same-session pending work; confirmed sign-out or loss of household selection
  clears old data. Older native builds, web and Expo Go remain usable.
- `modules/meal-planner-widgets/`: SwiftUI/WidgetKit and Glance renderers, protected
  transactional SQLite snapshot/outbox and native action handlers. Each user
  connects independently; Calendar's single-phone restriction does not apply.
- iOS secret storage uses the app/extension's widget-only shared Keychain group,
  excluded from timeline/SQLite/props. Android stores only Keystore-encrypted
  secret files and keeps state under credential-protected `noBackupFilesDir`.
- Queue before networking, display Pending separately, consume terminal operations
  only with an authoritative refreshed snapshot. Snapshot publication never
  erases unrelated queued actions. Stale generations cannot publish or enqueue.
- Local disable clears immediately. Online revocation retries from native-only
  state if offline; the API's seven-day expiry bounds that credential's lifetime.
  Unconfirmed first registrations retry their original binding after reconnecting.
- Small count links to Shopping. Medium/large switch Shopping/Plan, offer native
  checkoffs/retry and make seven dates/three slots reachable. Themes reuse both
  appearances of the app's semantic palette, without copying application screens.
- No guaranteed background interval. iOS uses OS-controlled timelines; Android
  uses constrained periodic WorkManager. Neither promises refresh after force-stop,
  before first unlock, or immediate changes from other family phones.

## Build generation and compatibility

The scoped config plugin embeds one extension, its dependency and source group.
It preserves the app's default Keychain group first, adds a separate widget group,
and gives the extension only the latter. It retains existing target signing/team
settings (verified with sentinel settings across repeated no-clean generation) and does not rewrite the Podfile or regenerate working projects itself.

**SDK 58 prebuild defaults to clearing native directories. Use `--no-clean` when
preserving a prepared native project**, after a recovery copy and scoped review.
Repeated `--no-clean` generation is checked for duplicate targets/sources/embeds.
Do not interpret repeated clean generation as an idempotence/preservation test.

The bridge supports the app's existing iOS 16.4 minimum so Expo actually links it;
interactive widget availability requires iOS 17+. The widget extension targets 17.
An extension-only successful build does not prove the Expo bridge is present:
verify `MealPlannerWidgets` in Podfile.lock/generated modules and build its module.
The extension uses the separate Swift module name `MealPlannerHomeWidgets` so its
17.0 module cannot shadow the 16.4 bridge in shared build products.
No consumer SDK/JavaScript dependency upgrade is introduced. Android uses Glance
1.2.0, WorkManager 2.10.5 and Compose matching resolved Kotlin 2.2.10. Java API
backporting (`desugar_jdk_libs` 2.1.5) preserves the app's Android 24/25 minimum
for date/expiry APIs, rather than silently raising it. Test-only native hosts have
separate application IDs and never contain personal data or production credentials.

Official references checked against installed packages:
[Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[Expo Module API](https://docs.expo.dev/modules/module-api/),
[Glance](https://developer.android.com/develop/ui/compose/glance/create-app-widget),
[Android API backporting](https://developer.android.com/studio/write/java8-support),
[backport library 2.1.5](https://github.com/google/desugar_jdk_libs/blob/master/CHANGELOG.md).

## Validation record

- Verified localhost `meal_planner_disposable_test`: migration/head `widget_devices`,
  lint and full API suite **265 passed**, none skipped (29.84 seconds), including
  the monotonic-response follow-up. Previous 264-test checkpoint is historical.
- Full mobile suite: **87 suites / 902 tests passed**, none skipped (133.373 seconds).
  This includes controller authority/races, shared preference hydration, and
  navigation-independent session/household fencing. Later edits to OS-availability
  copy and test mock syntax passed the final targeted check below.
- iOS/Android/web JavaScript exports passed. Native compilation/execution is
  recorded separately; exports are not proof of widget execution.
- Android Expo module/bridge compilation and AAR assembly passed. A full consumer
  Android test-APK attempt hit a separate Windows Worklets/Ninja rebuild error;
  do not label it a passing full Android app build. The standalone test host
  compiles the real storage/renderer sources and runs on a separate owned emulator.
- Final consumer iOS native storage/expiry/registration checks: **6 passed**, none
  skipped (0.245 seconds). Android instrumentation: **5 passed**, none skipped
  (1.945 seconds), on an owned Android 37.0 x86_64 emulator. Both test hosts were
  built from the final core/renderer sources, not the original feasibility probe.
- Final TypeScript and lint: passed, no warnings; targeted widget/week preference
  run: **3 suites / 17 tests passed**, none skipped (5.367 seconds).
- Full generated consumer iOS simulator workspace build passed with the actual
  CocoaPods bridge imported in ExpoModulesProvider and the embedded extension.
  Earlier extension-only builds and the intermediate skipped-bridge build are
  not the final linking result. Signed physical consumer builds remain unrun.
- Final Android Expo bridge/AAR assembly passed after native follow-ups. Repeated
  iOS no-clean generation retained one target/two sources/one embed/dependency,
  isolated the Clerk Keychain group, and preserved explicit test signing/team
  settings. There was no working-project regeneration or phone installation.
- Native core checks cover pending persistence, out-of-order publication, account/
  household fencing, expiry/access, and credential exclusion. The iOS test harness
  compiles the real widget extension as well. Existing phone/simulator installations
  are untouched; owned test simulators/emulators are shut down after execution.

## Reproducible native checks

Use a disposable Mac directory/environment with Xcode, Ruby/xcodeproj and Python:
`python3 apps/mobile/modules/meal-planner-widgets/tests/run-ios-tests.py` creates a
new project, runs native XCTest on a newly named simulator and deletes only that
simulator. Artifacts remain at the printed temporary directory for inspection.
The generator rejects an existing nonempty destination and reads no working project.

For Android, point the installed Gradle 9.4.1 wrapper at
`apps/mobile/modules/meal-planner-widgets/tests/android`, then build/run its
`app` instrumentation target on an explicitly owned disposable emulator. It copies
the production core/renderer files verbatim at build time; it has no alternate
storage implementation and deliberately excludes the Expo bridge, which is
compiled separately in the generated consumer project. iOS generated-project
invariants can be checked using `tests/validate-ios-project.rb`.

## Remaining acceptance / rollout

- Obtain explicit approval for each persistent migration, with a verified backup
  and disposable restore first. Windows development is now at `widget_devices`
  after Felipe's explicit approval (below). The Mac family database remains
  unmigrated by this slice. Do not start/misrepresent a mixed-version family API.
- Prepare signed consumer app+extension profiles for each phone, verify matching
  widget App Group/Keychain entitlements and preserve existing Clerk sign-in.
- Physical iPhone consumer flow: enable/add all sizes, small Shopping deep link,
  all Plan dates/slots, every palette/current appearance, Pending/retry with the app
  closed, household/session switching, permission changes and reconnect/disable.
  These are distinct from Felipe's accepted isolated fictional probe checks.
- Run the dedicated light/dark and native text/tint/geometry pass before release.
  Larger text and small Android 24/25 geometry have not been device-reviewed.
- Samsung/OEM and Android private HTTPS/Tailscale acceptance remain unrun. No
  production app installation, Mac API/data deployment, merge or push is claimed.

## Approved Windows development update — November 2

Felipe explicitly approves backing up, restore-verifying and migrating only the
Windows development database. Its identity is verified as localhost PostgreSQL
17.11, `meal_planner_dev`, at `calendar_sync` before any change.

Docker Desktop/database were stopped. Only the existing `meal-planner-postgres-1`
container is restarted; unrelated containers are left stopped. A custom-format
archive is saved privately outside the repository at
`%LOCALAPPDATA%/MealPlanner/backups/meal-planner-dev-before-widgets-20261102204508.dump`,
with its archive hash and verification report in the adjacent `.json` file.
The dump and source fingerprints use the same exported consistent snapshot.

The archive restores into a new, explicitly named temporary database. All **22
table schemas and complete row fingerprints match**. The widget migration is
then rehearsed there; original content is preserved and the checked-state trigger
is verified with a rolled-back update on the restored copy. Only this owned
restore-check database is dropped after verification.

The approved live development migration succeeds from `calendar_sync` to
`widget_devices`. Complete fingerprints of every original table's original
columns match immediately before/after; the version row changes as intended.
New check versions are valid, the trigger is present, and both widget tables are
empty. No device credential or household widget connection is created.

The Windows API had the previous source loaded. Only its verified development
process is restarted with the same environment file, host and port. Health returns
200, the widget routes appear in OpenAPI, and unauthenticated summary access
returns 401. This operational verification does not claim a signed phone test.
The prior full API/mobile/native test results above remain their recorded source
validation; those suites are not run against a persistent household database.

The Mac family database/API, installed phone apps and cloud staging are unchanged.
Signed consumer widget profiles, actual household connection and physical visual/
interaction acceptance remain the next review stage.


## Consumer phone-review preparation

Felipe then approves a temporary Windows-development phone test through private
Mac HTTPS 8443, leaving family HTTPS 443/data unchanged. An isolated native Release
workspace, prior signed-app recovery archive and guarded route/tunnel cleanup are
prepared. Consumer signing is awaiting Xcode account/profile refresh; no phone
update or widget connection is claimed. See `widget-phone-review.md` for the
current boundary, prepared artifacts, signing evidence and acceptance steps.
