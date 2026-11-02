# App color themes — F14

Status: accepted by Felipe November 2, 2026 on `codex/app-themes`; feature complete
for this iteration. Merge, native release and live rollout remain separate.
Felipe approved direct implementation with light/dark versions of the colored
palettes, installation-local persistence and the first-use chooser. This branch
preserves accepted F09/F10/F15 work. No live deployment or native installation.

## Goal

Offer three reusable color themes in Settings and during first use: the current
phone/system theme, the website's Apricot/Chocolate/Navy, and the saved green
alternative. Keep the accepted app layout, typography, icons and behavior.

## Findings and saved design sources

- Mobile already uses semantic color roles in `src/constants/theme.ts` and shared
  `useTheme()` / `useThemeMode()` hooks. Current light/dark choice follows the phone.
- Root navigation, tabs, shared controls, keyboards, native sheets and system
  backgrounds already consume those hooks. The preference must update their
  shared source without replacing the navigator or discarding drafts.
- A remaining literal-color audit includes error labels, member-avatar fallback,
  picker borders, sheet grabbers, confirmation backdrops and swipe-delete colors.
- The website is in a separate dirty checkout on `codex/product-showcase-demo`:
  `apps/web/src/site/styles.css` and `docs/plans/product-showcase-and-demo.md`.
  These were inspected read-only. They are not present on this mobile branch;
  do not merge the website branch or import its runtime/CSS into the mobile app.

Saved palette anchors (reuse these exact digital values):

| Theme | Saved anchors | Mobile intent |
| --- | --- | --- |
| Phone theme | Existing mobile light/dark tokens | Preserve today's appearance and automatic phone changes. |
| Apricot, Chocolate & Navy | Apricot `#E2C4A6`, Chocolate `#56352D`, Navy `#2A3244` | Warm surfaces, chocolate text, navy actions in light appearance. |
| Green | Sage `#E2E9DF`, Green `#164939`, Paper `#FFFDF3`, Ink `#284D3F` | Sage/cream surfaces, green actions and readable green ink. |

Website supporting light tokens are also saved: Apricot paper `#f7eddf`, soft
`#edd7c0`, muted `#75564a`, app paper `#fbf5eb`; Green soft `#d8e2d3`, muted
`#52624e`. Reuse where readable, deriving additional role-specific colors when
needed. The Pantone names/codes are recorded in the website plan; these HEX
values are its accepted digital equivalents, not newly verified physical-color
matches. No screenshot resampling or new fonts/receipt styling.

## Proposed experience

1. Add **Appearance** to Profile's existing settings navigation, available to
   every signed-in role regardless of household permissions.
2. Open a normal native-stack page titled Appearance, using `Screen` with
   `layout="tab-stack"`, one native header and the shared bounded scrolling body.
3. Show three full-width selectable cards: Meal Planner (Apricot/Chocolate/Navy),
   Phone theme, and Green. Each has a small illustrative app preview, name, short description
   and far-right selected indicator. Use accessible single-choice/radio semantics
   and a checkmark; color alone must not indicate selection.
4. Tapping a card applies and saves immediately. No extra Save button. Previews
   represent the actual shared palette roles and current appearance; they are
   simple non-interactive illustrations, not three duplicated app screens.
5. On the first eligible app visit on that installation, show **Choose your look**
   with the same selection component in the accepted full-height native sheet.
   Meal Planner starts selected. Continue closes it; swiping down also continues
   with the current choice. Explain that it can be changed in Profile → Appearance.
6. Offer the chooser once to current testers after upgrading, too. Present only
   after sign-in/profile/household setup reaches an idle app tab root. Never
   interrupt an editor, deep link, nested sheet, auth recovery or API error flow.
   Defer until the app is eligible rather than adding a new auth destination.

The first-use sheet uses the shared native-sheet route/context, full-height
detent, visible grabber, real native root/header/footer frames and one bounded
scrolling body. Continue stays reachable above navigation and safe areas. Drag
and explicit dismiss preserve the current theme; they do not save app content.

## Approved appearance behavior

Approved: all three themes follow the phone's light/dark appearance. The
colored themes get carefully designed dark counterparts: dark navy/chocolate
surfaces with apricot accents, and deep green surfaces with sage accents.
Changing the phone appearance updates the selected palette live. This yields
three choices, each with two appearances; it does not add a second mode picker.

Felipe approves implementing this recommendation with the plan on November 2. The final semantic role
values and contrast pairings will be recorded during implementation/review.

## Preference lifetime and failure behavior

- Recommend one **device-local installation preference**, independent of the
  selected household and user role. It survives app restarts, sign-out and
  household/account switching on that phone. Different phones can choose
  different looks; account sync and reinstall recovery are outside this slice.
- Use installed AsyncStorage 2.2.0 for a small versioned record containing only
  theme identifier and chooser-seen version. No household/recipe data, secrets,
  API endpoint, database migration or permissions grant is needed.
- Default missing/invalid values to Meal Planner. Read before presenting themed
  app content where practical, with a safe bounded fallback on storage failure.
  The OS launch screen remains native/static; do not promise a dynamically themed
  launch asset. Reuse existing startup handling rather than hanging on a read.
- Serialize writes so rapid taps cannot persist an older choice over a newer
  one. Apply optimistically; on a failed latest write, reconcile to the last
  confirmed choice and show an actionable retry message. Keep navigation usable.
- Persist the chooser-seen version when it is actually presented, not before an
  eligible visit. Suppress duplicate presentation in the current session even
  if that write fails; it may appear on a later launch until storage recovers.
- Preference loads/writes must not remount the provider tree, reset sessions,
  refresh household data or alter existing permission/draft guard behavior.

## Implementation design and affected areas

- Introduce a typed theme registry with `system`, `apricot`, `green` identifiers
  and complete semantic tokens for each supported appearance. Keep common
  structural styles separate. Preserve the `useTheme()` token-object contract;
  make `useThemeMode()` report the selected palette's effective light/dark mode.
- Add a narrowly scoped theme-preference provider/store and shared selectors.
  Put it above every themed app consumer, including navigation and auth/loading
  states, without coupling it to household membership or keying roots by theme.
- Reuse existing semantic keys and add roles only where the audit demonstrates
  a need, e.g. destructive action/background, scrim, grabber and avatar fallback.
  Use neutral role names; feature components must not inspect theme identifiers
  or contain per-theme conditionals. Avoid a new design-system/library dependency.
- Audit all routes, reusable inputs/buttons, list states, search, dates, badges,
  selection highlights, permission checkboxes, recipes/sections/import, Plan,
  Shopping/review, Catalog, Profile, onboarding/auth, error and confirmation UI.
  Keep destructive actions recognizably red across palettes, with paired readable
  foregrounds. Preserve translucent native chrome and native interaction behavior.
- Update root navigation theme, native/web tab colors, stack headers, native-sheet
  surfaces, StatusBar/SystemUI and keyboard appearance from the same resolution.
  Keep `userInterfaceStyle: automatic`. No dependency upgrade or native plugin
  change is proposed. Validate SDK 58 platform APIs before implementation.
- Place preference/selector UI and tests under `src/features/appearance/`; keep
  common palette definitions in constants/theme, shared hooks/infrastructure in
  their existing locations, and Expo route files thin. Do not reorganize auth.
- Native OS alerts, menus and permission prompts keep platform styling; they
  must remain legible in the effective mode but cannot promise arbitrary brand
  tinting. App icons, native launch assets, recipe images and emoji are unchanged.

## Validation and acceptance

Complete intended code/test edits first, then one coordinated validation pass:

- Registry/resolver completeness, invalid preference fallback, system changes,
  restart persistence, ordered rapid writes and failed reads/writes.
- Actual navigation/component coverage for choosing a theme, first-use eligibility
  and dismiss/once behavior, account/household transitions, live changes with
  retained recipe drafts and native sheets; existing permission gates unchanged.
- Automated contrast checks for assigned text/background and action pairs: normal
  text at least 4.5:1; large text and essential UI boundaries/icons at least 3:1
  where applicable. Check selected/error states and do not rely on color alone.
- Full mobile normal and cache-cleared suites, TypeScript, lint, Expo compatibility
  and iOS/Android production JavaScript exports. No API/database tests required
  for a mobile-only preference unless scope changes; exports are not native builds.
- Dedicated physical theme review: all tabs and related sheets, short/long lists,
  larger text, bottom actions, keyboard, selection, destructive swipes, headers,
  badges, startup/relaunch and open-app phone appearance changes. Review every
  offered theme/appearance; record iPhone and Android results separately. Android
  and native geometry cannot be marked passing from JS/component tests alone.

## Delivery

Create a dedicated implementation branch from this planning branch after approval,
preserving F09/F10/F15 commits. Deliver preference/registry, app-wide token audit,
selection/first-use UI and their tests as focused commits. No live Mac migration,
server change, native installation, merge, push, paid service or release included.

Felipe approved the colored palettes’ light/dark behavior, installation-local
preference and once-per-install chooser, then explicitly requested implementation
in this chat. Implementation is on `codex/app-themes`; deployment remains separate.

## Official documentation reviewed

The repo resolves Expo 58.0.22, React Native 0.88.1, AsyncStorage 2.2.0,
expo-system-ui 58.0.7 and expo-status-bar 58.0.4, verified in package-lock.json. Existing installed modules suffice; no package changes planned.

- [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/)
- [Expo color themes](https://docs.expo.dev/develop/user-interface/color-themes/)
- [SDK 58 AsyncStorage](https://docs.expo.dev/versions/v58.0.0/sdk/async-storage/)
- [SDK 58 SystemUI](https://docs.expo.dev/versions/v58.0.0/sdk/system-ui/)
- [SDK 58 StatusBar](https://docs.expo.dev/versions/v58.0.0/sdk/status-bar/)
- [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

Recheck version-matched API guidance during implementation. No version upgrade
is needed for this plan.

## Implementation details — November 2

The shared registry, installation-local store/provider, Profile Appearance page,
first-use native chooser and token audit are implemented. The provider sits above
all themed consumers; no navigator/session/household key depends on theme choice.
Preferences are hydrated with a two-second read fallback; writes are serialized,
failed latest selections return to the last confirmed theme, and Retry reconciles
explicitly. A failed preference read defers the automatic chooser so its default
cannot overwrite a previously saved but unreadable choice.

The native-sheet registry now exposes whether a sheet is open and permits an
explicit direct-content frame. Only the Appearance chooser opts into that frame;
existing shared Catalog/time-zone and recipe routes retain their accepted layout.
The chooser preserves real header/body/footer frames at full height, marks its
seen version on mounting, and uses the same accessible choices as Settings.

All app-owned color literals found by the audit now resolve through semantic
roles. Exceptions are the existing logo/animated/native launch assets. Four older
auth/onboarding action groups now reuse the existing shared PrimaryButton rather
than platform buttons that kept an unrelated color or unreadable dark-palette
foreground. Their labels, callbacks, disabled behavior and ordering are unchanged;
include those controls in phone review. Native OS alerts/menus keep OS styling.

Warm light-mode secondary text/input placeholders use `#684a3f`, borders use
`#85664f` and error text uses `#9b2119`: the saved website supporting values did
not meet the planned contrast on apricot. The three approved anchor colors are
unchanged. Dark Apricot uses navy surfaces and apricot actions; dark Green uses
deep-green surfaces and sage actions. Full semantic values are in theme.ts.

## Validation and review handoff — November 2

- Full normal mobile run: 80 suites / 851 passed, no skips. This run precedes the
  final four auth/onboarding button substitutions. Those have a subsequent
  33-test focused auth/household-state pass and are included in the final cold run.
- Final cache-cleared/no-cache mobile run: 80 suites / 851 passed, no skips.
- Final TypeScript and Expo lint pass with no warnings. SDK dependency
  compatibility passes; no package or lockfile changes.
- Production iOS and Android JavaScript exports pass using non-secret placeholder
  configuration. These validate bundling, not signed native builds or installs.
- Contrast tests pass across all six palettes for assigned normal text/action/
  placeholder/error roles (4.5:1) and essential border/trash-icon roles (3:1).
- Existing router fixtures now explicitly represent an installation that has
  already seen the chooser; dedicated actual-router cases cover first-use,
  editor deferral, settings selection and retained recipe work. Store tests cover
  invalid/read-timeout/failure/ordered-write/retry behavior. No broad permissive
  production fallback or test-only permission bypass was added.
- Validation used an isolated runtime whose lockfile matches the worktree, leaving
  the serving Expo dependencies untouched. The local API health remains OK.
  No API/database behavior changed; no API suite was rerun for this mobile slice.

Code commits: `e98fe93` (registry/store/provider) and `6b073f4` (appearance UI/
color audit). Physical review remains unrun by the agent. Use
`docs/qa/app-color-themes.md`: Profile → Appearance, all three choices, device
light/dark changes, first-use/native-sheet geometry and auth controls. Existing
Expo is still serving this checkout; reload if necessary. No Mac trial changes,
merge, push or native release is included.

## Main-theme follow-up — November 2

Felipe accepts the overall chooser and selects Apricot/Chocolate/Navy as the
main app theme. Show it first and default new/missing/invalid preferences to it;
Phone theme is second, Green third. Existing saved choices remain unchanged.
Name the main theme **Meal Planner** for now, retaining the current descriptions.
Replace that placeholder with the official app name once it is chosen; the
registry has an `app-name` TODO at the single display-name definition. Stable
stored IDs remain unchanged so renaming will not reset anyone's preference.

Preview action circles now use the shared native plus symbol inside the existing
centered container instead of a text glyph affected by font baseline spacing.
Physical/optical centering remains for Felipe's phone review.

Follow-up validation: 86 tests across five targeted suites pass (appearance
store/UI/first-use, palette contrast and actual recipe routing), plus TypeScript
and lint with no warnings. Earlier full-suite/native-export results are historical;
not rerun for this focused default/name/icon follow-up.

## Slice acceptance — November 2

Felipe reports “Perfect this looks great for the theme slice” after the main-theme
order/default/name and preview-icon follow-up at `6760c3c`. Record overall theme
slice acceptance for this iteration. This does not establish every individual
six-appearance, Android or native release checklist case as performed. The
placeholder-app-name reminder stays open until an official name is chosen.
No merge, push, Mac trial change or installed-phone update is authorized by this
acceptance. Remaining original major features are calendar integration and widgets.
