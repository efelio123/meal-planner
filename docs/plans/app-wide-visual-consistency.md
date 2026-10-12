# App-wide visual consistency pass

Status: visual standard approved by Felipe. Shopping v1 is feature-complete;
implement this as the next separate slice on its own branch after the Shopping
work is merged. No app-wide UI changes are part of the Shopping closeout.

## Goal

Make controls with the same purpose look and behave alike across the mobile
app, starting with the five main tab pages and the Add actions in Recipes,
Shopping, and Catalog. Keep intentionally different roles—tab-page title,
native stack header, detail hero, section heading, and sheet heading—visually
distinct rather than forcing every heading to one size.

## Current evidence and design references

- Tab titles currently differ: Plan 34/40, Recipes 32/40, Shopping and Catalog
  30/36, and Profile 30/34 (font size/line height). All are bold but are
  implemented separately.
- Circular Add actions currently differ: Recipes is 52 points with a Unicode
  plus, Catalog is 48 points with a Unicode plus, and Shopping is 44 points
  with a platform symbol. Shopping centers its button against a combined
  title/subtitle block, causing a different vertical position.
- The shared `Screen` already owns tab-root padding and safe-area behavior;
  `ThemedText`, `ThemedInput`, and `PrimaryButton` exist, but there is no shared
  tab-page header, circular Add action, or semantic typography scale.
- Approved page references to compare during implementation:
  `docs/design/recipes/recipes-library-grid.png`,
  `docs/design/recipes/recipes-library-list.png`,
  `docs/design/shopping/shopping-main.png`,
  `docs/design/catalog/catalog-home.png`, and
  `docs/design/meal-plan/weekly-plan.png`. These references were approved at
  different times and do not agree on every title/button measurement. The
  newly approved app-wide standard will supersede those measurements only;
  preserve each page's other approved hierarchy and content.

## Proposed visual standard

| Role | Proposed treatment |
| --- | --- |
| Main tab-page title | 32-point bold text, 40-point line height, `theme.text`, same top position and 24-point horizontal content inset on all five tabs. |
| Main tab header row | Shared layout: title and trailing actions aligned on one row; optional subtitle on a separate row below, not part of the Add button's vertical alignment. |
| Circular Add action | Shared 48 × 48-point circle, 24-point platform plus symbol, `theme.primary` fill and `theme.primaryText` symbol, consistent pressed/disabled states and accessible label. |
| Section heading | One semantic size/weight/line-height tier for comparable section headings; smaller list/slot labels stay a separate tier. |
| Sheet heading | One tier for in-sheet titles and consistent Back/Cancel/Done placement, while preserving native drag handles and each sheet's approved detents. |
| Detail/form heading | Consistent tiers by purpose, with explicit line heights and wrapping for long names; do not use tab-page title dimensions for recipe/item names. |
| Common actions and rows | Match same-purpose primary, secondary, destructive, navigation-chevron, filter, and list-row treatments across features; keep different states and actions visually distinguishable. |

Use the current theme colors and platform symbols; no new package is proposed.
The exact values above are a proposed baseline for review, not a requirement to
flatten every screen into identical spacing. Preserve 44-point minimum touch
targets, text scaling, safe areas, and keyboard-open behavior.

## Affected areas and implementation approach

1. Inventory comparable UI roles across the app: Plan, Recipes, Shopping,
   Catalog, Profile, their detail/edit screens and sheets, plus auth and
   onboarding where the same semantic role exists. Record intentional
   exceptions before changing them; auth/onboarding do not inherit the tab
   header layout merely because they contain a title.
2. Add only the small reusable typography/style tokens and components actually
   needed under `apps/mobile/src/components/` (for example a tab-page header
   and circular Add action). Keep feature behavior, routes, and accessibility
   labels in their feature modules. Do not create a broad component framework.
3. Apply the shared tab header to all five roots and the Add action to Recipes,
   Shopping, and Catalog. Align Shopping's subtitle beneath the title/action
   row. Preserve Catalog's Manage action and Plan's Today action.
4. Sweep the remaining screens by semantic role: section headings,
   detail/form titles, sheet headings/actions, repeated rows, filters, and
   destructive/primary actions. Reuse existing shared controls where they
   already fit. Do not alter information architecture or rewrite screen copy.
5. Add focused component/route regression coverage for shared dimensions,
   theme colors, accessible names and hit targets, then compare rendered
   screens side by side with their references and with related screens.
   Document any deliberate deviation from an older reference.

## Branch, sequencing, and preservation

This is a separate cross-app slice. The current checkout is
`codex/household-shopping-redesign` and contains substantial uncommitted
Shopping work. Do not mix the consistency implementation into that branch or
commit its uncommitted changes. After the Shopping work is safely accounted
for, implement on a focused `codex/app-wide-visual-consistency` branch from
the appropriate updated base, with focused commits. Preserve all unrelated
changes. The Codex chat agent owns this plan and review; the VS Code coding
agent owns implementation after Felipe approves it.

## Validation and acceptance

- Complete the intended code and test edits before running checks. Then run
  one coordinated mobile validation pass: focused component/route tests, full
  mobile suite, TypeScript, lint, and whitespace check; debug and rerun only
  what fails. No API, database, or migration checks are needed unless scope
  changes into backend behavior.
- Perform a current-appearance visual pass on iPhone and Android: all five tab
  roots, their title/action alignment, and representative detail, form, and
  native-sheet screens. Check short/long titles, larger text, keyboard-open
  sheets, and pressed/disabled states. Do not claim visual parity from unit
  tests alone. Save dedicated light/dark comparison for a major deployment.
- Acceptance: comparable controls have the same size, color role, spacing,
  icon treatment, and interaction state unless an exception is documented;
  no clipped text, new tab-bar overlap, or route/behavior regression.

## Approved baseline

Felipe approved the proposed 32-point tab title and 48-point Add circle as the
common baseline. This is a measured compromise among today's 30–34-point
titles and 44–52-point Add circles.
