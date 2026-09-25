# Mobile light and dark theming

**Status:** Proposed — awaiting approval before implementation
**Branch:** `feat/mobile-theming`

## Goal

Make the current Expo mobile experience readable and consistent in the device's
light and dark appearance, without adding an app-specific theme preference or
changing existing product flows.

## Scope

This slice will update the active mobile auth, household onboarding, signed-in,
loading, and API-error screens, as well as shared screen/form components and
the time-zone picker modal. It will not redesign the UI, change backend
behavior, or add a theme toggle or persisted theme setting.

## Affected areas

- `apps/mobile/src/constants/theme.ts` and `src/hooks/use-theme.ts`
- Root Expo Router layout and navigation theme
- Shared screen, text, input, button/action, and sign-out components where a
  small shared primitive removes repeated styling
- Current auth, onboarding, signed-in, loading, and API-error routes
- Time-zone picker and modal
- Existing Expo starter components that consume the current theme API:
  `app-tabs.tsx`, `app-tabs.web.tsx`, `themed-text.tsx`, `themed-view.tsx`, and
  `ui/collapsible.tsx`
- Mobile unit/component tests

## Pre-implementation Git preparation

Before modifying mobile implementation files, safely bring the documentation
commit currently on `main` into this feature branch:

1. Record `git status --short` and preserve the untracked
   `docs/plans/mobile-theming.md`; do not clean, reset, or stash it away.
2. Compare the untracked root `AGENTS.md` with `origin/main:AGENTS.md`. The
   incoming version is the repository-specific, tracked working agreement. If
   the older untracked copy contains no additional agreement, remove only that
   superseded untracked path so Git can write the tracked file. If it contains
   material local guidance not present on `main`, stop for Felipe's direction
   rather than overwrite it.
3. Fetch and fast-forward merge `origin/main` into `feat/mobile-theming` using
   `git merge --ff-only origin/main`. This brings in the tracked consumer
   roadmap and working agreement without rewriting history.
4. Re-check `git status --short` and confirm the untracked theming plan remains
   present before starting implementation.

This preparation intentionally does not touch unrelated ignored environment,
build, or dependency files.

## Proposed implementation

### 1. Resolve one device-driven theme consistently

- Retain `userInterfaceStyle: "automatic"` as the source of truth.
- Add a small pure resolver that treats React Native's nullable/unspecified
  color scheme as light.
- Keep `useTheme()` returning the palette object so existing consumers do not
  need a disruptive interface migration. Export a small companion mode hook
  (or use the pure resolver) for callers, such as the root layout, that need
  the resolved `light`/`dark` mode.
- Use that same resolved mode in the root layout for Expo Router's navigation
  theme. The navigation background, card, text, border, and primary colors
  will be derived from the app palette rather than relying on mismatched
  defaults.

### 2. Consolidate the palette into semantic roles

Replace the current structural color names with a concise pair of light/dark
semantic palettes. The exact names will cover only current needs, including:

- screen and elevated surfaces
- primary and secondary text
- borders
- input background, text, and placeholder
- primary actions, action text, and links
- error text/surface
- selected/disabled states and loading indicators where needed

Brand/action colors that are intentionally shared between modes will remain
named tokens, not scattered literals. Each mode will receive independently
chosen contrast-safe values rather than mechanically inverted colors.

`Colors` remains the exported two-mode palette and `ThemeColor` remains the
key type derived from one complete semantic palette. The migration will update
every current consumer together:

- `ThemedText` and `ThemedView` will use the renamed semantic keys while
  retaining their typed color override props.
- Native and web `AppTabs` will select the resolved palette through the shared
  resolver instead of independently handling only `unspecified`.
- `Collapsible` will use the revised background/text keys and continue to
  type-check even though it is starter UI rather than an active product route.
- The root layout and active screens will use the palette/mode hooks, rather
  than direct `Colors[...]` indexing or local light-color literals.

This exhaustive update prevents a palette-key rename or hook adjustment from
leaving dormant starter components broken at TypeScript build time.

### 3. Apply the palette through small reusable primitives

- Theme the shared `Screen` container and existing themed text/view helpers.
- Introduce or refine only the small form/action primitives needed to remove
  repeated hard-coded input, button, link, and error styling. They will retain
  existing labels, disabled behavior, and accessibility props.
- Ensure text inputs set themed `color`, `placeholderTextColor`, selection and
  cursor colors where React Native supports them, and iOS keyboard appearance.
- Apply those primitives and tokens to every current active route, including
  loading and API-error states, without changing route guards or data flows.
- Theme the time-zone modal, search field, list rows, selection state, and
  modal background while continuing to submit the unchanged IANA identifier.

### 4. Align app and system chrome

- Render an explicit Expo status-bar icon style matching the resolved mode and
  theme its background/root surface where supported.
- Use the installed `expo-system-ui` capability to keep the native root
  background from flashing the wrong color during startup or a theme change.

Expo SDK 57's Android navigation-bar default is `auto`. This slice will not add
`expo-navigation-bar` speculatively. Android navigation/gesture-bar contrast
will remain a manual device acceptance check; a demonstrated problem will be a
separate, reviewed follow-up with its own version-matched dependency decision.

`expo-status-bar` and `expo-system-ui` are already installed. No production
transport, auth, or device-appearance configuration will be weakened.

## Design decisions

- The device setting remains authoritative; no manual toggle or AsyncStorage
  theme preference will be introduced.
- A `null` or `unspecified` scheme resolves predictably to light, avoiding a
  crash or undefined palette before a platform reports its preference.
- Shared controls will be deliberately small and local to this app rather than
  a general design-system framework.
- Existing brand colors may remain fixed only when they are deliberate semantic
  action tokens and meet contrast requirements in both modes.
- Platform behavior will follow the current official Expo SDK 57, React Native
  0.86, Apple status-bar, and Android system-bar guidance reviewed for this
  slice.

## Contrast acceptance criteria

- Primary text against screen and elevated surfaces, and input text against
  input surfaces, must meet WCAG 2.1 AA's 4.5:1 normal-text contrast target.
- Secondary text, placeholders, borders, and disabled states must remain
  visibly distinguishable in both modes; placeholders will not be the only
  means of conveying required errors or state.
- Primary action text/icons, link text, and error text must be readable on
  their assigned semantic backgrounds in both modes. Color alone will not be
  used to communicate a failure.
- Focused input selection/cursor, activity indicators, status-bar icons, and
  modal surfaces must be visible against their immediate backgrounds.
- The implementation will record/check the chosen token pairings during review
  rather than assuming equivalent hex values have adequate contrast.

## Validation

- Add focused unit tests for light/dark palette selection and the null fallback.
- Add representative component tests in both modes for shared screen/form
  presentation and the time-zone picker/modal styling behavior.
- Add a mounted-component appearance-change test: render under one mocked
  system appearance, change that appearance while the component remains
  mounted, and assert that the resolved palette/navigation-relevant styling
  updates without reintroducing persistent theme state.
- Run from `apps/mobile`:

  ```powershell
  npm test
  npx tsc --noEmit
  npm run lint
  ```

- Run `git diff --check` from the repository root.

## Manual device checklist

On both iPhone and Android, verify:

1. System light and system dark appearances at cold launch.
2. Switching the device appearance while the app is open.
3. Sign-in, sign-up, email-code, and verification screens.
4. Create/join/select-household and signed-in household screens.
5. Loading and authenticated API-error/retry states.
6. The time-zone picker: open, search, select, and dismiss in each mode.
7. Focused inputs: text, placeholder, selection/cursor, and keyboard contrast.
8. Status and Android navigation/gesture-bar icon contrast in each mode.

I cannot perform physical iPhone or Android checks from this session. In
particular, SDK 57 iOS testing may require an appropriate development build or
Expo Go-compatible distribution rather than assuming the App Store Expo Go
version supports it.

## Open question

None blocking. A demonstrated Android navigation-bar contrast issue will be
handled as a separate reviewed follow-up, not by adding a dependency in this
slice.
