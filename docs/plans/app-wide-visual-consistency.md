# App-wide visual consistency pass

Status: implemented in code; physical-device visual acceptance pending
(October 12, 2026).
Felipe approved the 32-point tab title and 48-point circular Add baseline,
then reviewed and accepted the expanded sheet, disclosure-arrow, and grouped-
row standards below. Planning is on
`codex/app-wide-visual-consistency`, branched from the clean, pushed `main`
after Shopping v1. The implementation is on this feature branch.

## Goal

Make same-purpose controls look and behave alike throughout the signed-in
mobile app, starting with the five tab roots and the Add actions in Recipes,
Shopping, and Catalog. Preserve the hierarchy of different roles: a tab-page
title, native stack header, detail hero, section heading, and sheet heading
should not all become the same size. This is a visual and reusable-component
pass, not a redesign of app navigation or feature flows.

## Current evidence and design references

- Tab titles currently differ: Plan 34/40, Recipes 32/40, Shopping and Catalog
  30/36, and Profile 30/34 (font size/line height). All are bold but are
  implemented separately.
- Circular Add actions currently differ: Recipes is 52 points with a Unicode
  plus, Catalog is 48 points with a Unicode plus, and Shopping is 44 points
  with a platform symbol. Shopping centers its button against a combined
  title/subtitle block, causing a different vertical position.
- The shared `Screen` already supplies 24-point content padding and owns
  tab-root safe-area behavior. `ThemedText`, `ThemedInput`, `PrimaryButton`,
  and `AppBackButton` already exist, but there is no shared tab-page header or
  circular Add action. Do not add another 24-point inset inside a shared header.
- Sheet headings currently use different scales (for example, Meal Plan 17,
  Recipes 21, and Shopping 22 points). Navigable rows mix text chevrons with
  platform symbols. Distinguish these from week-navigation arrows and other
  controls before standardizing them.
- Approved page references to compare during implementation:
  `docs/design/recipes/recipes-library-grid.png`,
  `docs/design/recipes/recipes-library-list.png`,
  `docs/design/shopping/shopping-main.png`,
  `docs/design/catalog/catalog-home.png`, and
  `docs/design/meal-plan/weekly-plan.png`. These references were approved at
  different times and do not agree on every title/button measurement. The
  newly approved app-wide standard will supersede those measurements only;
  preserve each page's other approved hierarchy and content. These images
  have been inspected for this plan; compare against the running app during
  implementation, not just against one isolated screenshot.
- Sheet and grouped-row references inspected for this audit:
  `docs/design/recipes/ingredient-search.png`,
  `docs/design/recipes/ingredient-details.png`,
  `docs/design/shopping/shopping-catalog-picker.png`,
  `docs/design/shopping/shopping-edit-details.png`,
  `docs/design/catalog/category-picker.png`,
  `docs/design/catalog/item-detail.png`,
  `docs/design/meal-plan/add-meal-sheet.png`, and
  `docs/design/meal-plan/shopping-amount-sheet.png`. These show distinct
  selection lists, edit forms, and read-only details. Their content and
  density should remain purpose-specific even where the underlying tokens
  are shared.

### Cross-screen audit added after Felipe's follow-up

| Family inspected | Current mismatch | Plan treatment |
| --- | --- | --- |
| Native sheets: Recipes Food/Details/Cover/Emoji; Catalog choice and emoji; Shopping picker/Details; Meal Plan Add/Edit/day and amount; Time zone | In-content titles range from 17 to 22 points, horizontal insets from 20 to 24, and Back/Cancel/Done controls have different hit areas and placement. Some sheets have a keyboard-aware fixed footer, while others scroll as the native route root. | Share title/action typography, spacing tokens, and minimum hit targets. Use a reusable header only where its layout fits; do not wrap every sheet in one container or change its native root, detents, keyboard footer, drag, or nested draft behavior. The compact Catalog emoji entry may keep its action row below the field, but should use the same action roles. |
| Rows that open a detail/edit/manage screen or nested selector | Recipes and Catalog use text `›`; Shopping, Meal Plan, Catalog management, and some Profile rows use platform chevrons at 17–20 points. Profile's card variant and some sheet links use a link-colored text arrow. | One shared disclosure-chevron treatment for ordinary navigable/edit rows, including sheet selectors and Profile card rows. Keep week navigation arrows, expand/collapse arrows, and selected-state checkmarks as separate roles. A link-colored trailing arrow for a Create action is intentional, but uses the same icon family and is documented as an action variant. |
| Grouped lists and table-like rows | Catalog choices/items, Recipes lists, Shopping groups, Profile settings, and Catalog management vary in corner radius, border weight, row padding, and whether the divider is on the preceding/following row. Catalog detail also has read-only label/value rows. | Define grouped-surface and single-divider tokens. Reuse a small grouped-row primitive only for equivalent navigation/selection rows. Outer borders are contextual: the Catalog category picker reference has a lighter selection list, while detail cards may need a visible outline. Use a separate read-only label/value pattern; do not turn it into a tappable row. Shopping swipe rows keep their divider outside the moving row to avoid stacked borders. |

There is no general grid-style data table in the current mobile UI. Here,
“table” means these grouped lists and label/value detail rows. A recipe card,
meal slot, Shopping checkbox/swipe row, and read-only metadata row can share
surface colors and separators without sharing the same component or height.

## Proposed visual standard

| Role | Proposed treatment |
| --- | --- |
| Main tab-page title | Previously approved: 32-point bold text, 40-point line height, `theme.text`, aligned at the same top position within `Screen`'s existing 24-point inset on all five tabs. |
| Main tab header row | Shared title/trailing-action layout. Shopping's household subtitle sits below this row, so its Add button aligns with the title rather than the whole title/subtitle block. Preserve Plan's Today and Catalog's Manage as text actions. |
| Circular Add action | Previously approved: one 48 × 48-point circle with a 24-point platform plus symbol, `theme.primary` fill and `theme.primaryText` icon, consistent pressed/disabled states and an accessible label. Keep each feature's existing navigation behavior. |
| Section heading | Proposed 20-point bold / 26-point line height for major content sections such as To buy, Food, and Account Settings. Keep smaller meal-slot labels and in-form labels as a distinct 16-point tier. |
| In-sheet heading/actions | Proposed 20-point bold / 26-point line height for in-content sheet titles; 16-point link-color Back/Cancel/Done actions with at least 44-point targets. Leave the native grabber, detents, keyboard behavior, and dismissal semantics alone. Allow long titles to wrap without covering actions. |
| Detail/form heading and Back | Keep native stack titles and large item/recipe heroes distinct from tab titles. Use the existing `AppBackButton` for custom back arrows where applicable; do not add a second Back control under a visible native header. |
| Navigable-row affordance | Use one small platform chevron (proposed 17 points, secondary text tint) for rows that open detail, edit, manage, or a nested picker. Hide decorative chevrons from accessibility; the row has the accessible name. Use a link-color variant for Create/navigation actions. Week-navigation and expand/collapse arrows remain different controls. |
| Grouped navigation/selection lists | Proposed `theme.surface` background, 16-point corner radius, and exactly one hairline `theme.border` divider between rows (none after the last). An outer hairline border is used only where the screen's grouped-card treatment calls for one; picker selections may remain borderless. Base horizontal inset 16 points and minimum 44-point tap area; navigation rows may grow for subtitles/icons, while compact selectable rows keep their own content height and selected/checkmark state. |
| Read-only label/value rows | Keep secondary label and right-aligned value with wrapping for long values; use the same grouped surface/divider tokens but no disclosure arrow or button semantics. A single-field card need not draw a divider. |
| Common actions and rows | Reuse existing primary/secondary/destructive color roles and shared controls where they match. Preserve different row structures for recipe cards, Shopping checkboxes/swipes, and Catalog entries; consistency means equivalent affordances, not identical containers. |

The section, sheet, chevron, and grouped-row values were added in the
cross-screen review and approved with this plan. Use
current theme colors and platform symbols. Existing Expo SDK 57 / React Native 0.86
components cover this work; no dependency, backend, schema, or configuration
change is proposed. Preserve 44-point minimum touch targets, text scaling,
safe areas, and keyboard-open behavior. Do not flatten every screen into
identical spacing.

## Affected areas and implementation approach

1. Turn the audit above into a short, file-level role inventory before editing:
   the five tab roots; every native-sheet family listed above; navigable,
   selectable, swipeable, and read-only grouped rows; and comparable
   Add/Back/primary/destructive actions in Plan, Recipes, Shopping, Catalog,
   and Profile. Note each intentional exception and its accepted reference.
   Audit auth/onboarding for reuse of an existing same-purpose control, but
   do not apply a tab header or redesign those flows merely because they have
   headings.
2. Introduce only the reusable primitives needed in
   `apps/mobile/src/components/` and small semantic typography/style tokens
   in the existing theme location: a tab-page header and circular Add action
   are the likely first two. Keep routes in `src/app/` thin and feature state,
   behavior, and accessible names in feature modules. Avoid a broad component
   framework or a generic `shared/` directory.
3. Migrate all five tab roots together. Use `Screen`'s existing padding and
   safe-area ownership; do not add nested page insets. Align each title and
   trailing action; put Shopping's subtitle on its own line. Use the same Add
   primitive for Recipes, Shopping, and Catalog; retain each action's current
   destination, Catalog Manage, and Plan Today. Check narrow widths and large
   text so title/actions do not overlap.
4. Apply the role inventory to signed-in detail/edit/manage and native-sheet
   screens: major section headings, sheet header/action rows, custom Back,
   ordinary disclosure chevrons, equivalent grouped navigation/selection
   rows, read-only label/value rows, and existing primary/destructive actions.
   Prefer the established shared controls where they fit. Use a small shared
   disclosure icon and grouped-surface/divider tokens before extracting any
   larger row component. Keep feature-specific content, row density,
   contextual outer borders, confirmation wording, Shopping's swipe-layer
   separator, native-sheet presentation, detents, keyboard footer, and
   nested Back/draft behavior intact. Do not force Recipes, Shopping, Catalog,
   and Profile into one row component just because they are grouped. List any
   remaining difference as intentional rather than silently normalizing it.
5. Update focused visual/component and route tests for the shared dimensions,
   theme roles, accessibility names, hit targets, and unchanged action routes.
   Then compare the running screens side by side with each approved reference
   and related screens; record any justified deviation. No tests or lint runs
   are needed between incremental code edits—validate after the intended
   implementation and test edits are complete.

## Branch, sequencing, and preservation

This is a separate cross-app slice. The Shopping branch was merged and
cleaned up; `main` is pushed and the working tree was clean before this plan
revision. Plan and later implementation belong on
`codex/app-wide-visual-consistency`, with focused commits and no direct
implementation commits on `main`. Preserve unrelated changes. The Codex chat
agent wrote the plan; at Felipe's explicit request, the Codex chat agent now
owns this implementation as well. Before coding, the implementer reads this
plan, root and mobile `AGENTS.md`, the native-sheet
standard, the listed design images, and the installed-version official
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) and
[React Native 0.86 Text](https://reactnative.dev/docs/0.86/text)/
[Pressable](https://reactnative.dev/docs/0.86/pressable) guidance.

## Validation and acceptance

- After the intended code and test edits are complete, make one coordinated
  pass: focused component/route tests, the full mobile suite, TypeScript,
  mobile lint, web export, and whitespace check. Debug failures and rerun the
  affected checks. No API, database, or migration checks are needed unless
  scope changes into backend behavior. Report skipped/unrun checks honestly.
- Compare the current appearance on a physical iPhone and Android device when
  available: all five tab roots, both Recipes layouts, Shopping short/long
  lists, Catalog filters, Profile, one screen from each audited sheet family,
  and navigation/selection/read-only grouped rows. Check single and last-row
  dividers, short/long titles and values, small and large text, narrow widths,
  pressed/disabled actions, scroll/blank-space gestures, sheet drag,
  keyboard-open controls, tab-bar clearance, and Back/dismiss. If a platform
  is unavailable, leave its visual acceptance explicitly unverified.
- Acceptance: same-purpose roles share the agreed dimensions, theme colors,
  alignment, icon treatment, and interaction states or have a documented
  exception; no clipped text, new safe-area/tab-bar overlap, or route/behavior
  regression. Save the dedicated light/dark pass for a major deployment.

## Approved baseline

Felipe approved the proposed 32-point tab title and 48-point Add circle as the
common baseline. This is a measured compromise among today's 30–34-point
titles and 44–52-point Add circles.

## Scope decision

Auth/onboarding receive only existing shared-control fixes where the same
purpose applies. A broader redesign of those flows is outside this visual
pass. If implementation reveals a materially different design decision,
revise this plan and return it for review before expanding scope.

## Implementation inventory and intentional exceptions

- Tab roots: `meal-plan-screen.tsx`, `recipe-library-screen.tsx`,
  `shopping-list-screen.tsx`, `catalog-screen.tsx`, and
  `profile-hub-screen.tsx`. Share the tab header role; only Recipes,
  Shopping, and Catalog have circular Add actions.
- Sheet families: `recipe-native-sheets.tsx`, `choice-picker.tsx`,
  `catalog-emoji-input-sheet.tsx`, `shopping-sheets.tsx`,
  `meal-plan-sheets.tsx`, `shopping-amount-sheet.tsx`, and
  `time-zone-picker.tsx`. Share text metrics and 44-point actions while
  preserving each existing native route root, grabber, detents, and
  keyboard-aware footer. Catalog emoji retains its below-field actions.
- Navigation rows: Recipes/Catalog lists, Shopping rows and picker,
  Plan meals and nested selectors, Catalog management, Profile, and
  household member rows use the ordinary disclosure icon. Create/navigation
  links use its link-colored variant. Week arrows, dropdown arrows,
  expansion arrows, selection checkmarks, and the Shopping delete swipe
  remain distinct roles.
- Grouped content: Recipe and Catalog lists, Catalog choice management,
  native pickers, and Catalog label/value details share surface/divider
  metrics where their structure matches. Shopping retains its 14-point
  swipe-group radius and separator outside the moving row because that
  established interaction and its border alignment are specialized.
  Meal slots/cards, recipe grid cards, and Profile's plain divider list
  retain their own structure and density.

## Implementation validation record

- Shared visual roles and focused component tests are implemented, and the
  audited tab, sheet, disclosure, and grouped-row families above have been
  migrated without changing routes or native-sheet presentation settings.
- Final full mobile run: 51 suites / 335 tests passed. TypeScript, mobile
  lint, web export, and `git diff --check` passed. The web export used
  non-secret placeholder public configuration because dotenv loading was
  disabled; no `.env` file or app configuration was changed. No backend or
  database checks were run because this slice changes mobile presentation
  only.
- Physical iPhone and Android side-by-side comparison, native sheet drag,
  keyboard-open layout, and large-text visual acceptance remain unverified.
