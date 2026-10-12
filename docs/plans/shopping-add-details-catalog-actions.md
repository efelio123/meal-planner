# Shopping Add Details: Catalog edit and choice shortcuts

Status: approved by Felipe, implemented on October 9, 2026, and merged into
`main` with Shopping v1. The later quick-add flow supersedes the intermediate
Add Details step; Catalog editing and choice shortcuts remain in Edit.
The complete physical-device regression checklist remains open.

This was a follow-up to `household-shopping-redesign.md`, not a new Shopping
API or database migration.

## Goal

Make adding a Catalog item to Shopping fast even when its Catalog details,
shopping unit, or store need attention. Let people enter amounts such as
`2 2/3` without losing the current one-item-per-Catalog-item rule.

## Affected areas and proposed behavior

- **Add/Edit Shopping details:** Put a secondary, clearly labeled **Edit
  Catalog item** action beside or below the selected item's summary. Open the
  existing Catalog item editor from the Shopping navigation flow. Explain by
  placement/copy that this edits the shared Catalog item, whereas Amount,
  Unit, and Store below are for this Shopping entry. Return to the Shopping
  details draft after Save or Back; do not silently add the item. Refresh the
  displayed name/category and active choices after the edit. Keep unsaved
  Shopping amount, unit, and store choices intact. Only adopt changed Catalog
  unit/store defaults for fields the person has *not* overridden in the
  Shopping draft.
- **Unit selector:** Keep the existing built-in and household units, plus a
  bottom **Add unit** action using the existing household shopping-unit
  creation form. After creation, return to this Shopping entry with the new
  unit selected. This creates a reusable unit, but does not alter the Catalog
  item's typical shopping unit. That default changes only in Edit Catalog
  item. No general unit-management screen is added to the Shopping picker in
  this follow-up.
- **Store selector:** Match the approved Catalog store-picker treatment:
  searchable choices and bottom **Create store** / **Manage stores** actions.
  Reuse the existing household store create/manage flows. A newly created
  store is selected for this Shopping entry without changing the Catalog
  item's preferred store. A managed/archived selection must be refreshed and,
  if unavailable, cleared with a visible explanation rather than submitted.
  Open this sheet at a medium initial detent, with an available taller detent
  for long lists and the same native drag/dismiss feel as other accepted
  sheets.
- **Amount input:** Replace the decimal-only keypad with a text input that
  permits digits, spaces, `/`, and decimal points. Use the iOS
  `numbers-and-punctuation` keyboard and a normal Android keyboard; neither
  platform gets a custom keypad or new dependency. Keep the initial `1` for
  new entries and the saved amount for edits. Give an example such as
  `2 2/3`, disable autocorrection/capitalization, and show an inline error for
  invalid or non-positive values. The existing API amount parser already
  accepts mixed fractions, simple fractions, and decimals; do not add a new
  amount format or change stored Catalog defaults.

## Navigation and safety decisions

- Reuse the Shopping-owned native form-sheet routes and Catalog editor/choice
  forms; do not layer a custom gesture modal over a native sheet. Add
  Shopping-owned routes only where needed so back navigation returns to the
  Shopping draft instead of switching tabs.
- Scope any draft/return result to signed-in user, session, household, and
  selected Catalog item. Cancel/back must not add an item. A household/session
  change discards the pending draft and prevents stale selections from being
  applied. Preserve the Shopping picker search when returning to it.
- A Catalog item edit is persistent household data; Shopping-specific amount,
  unit, and store changes are saved only by **Add to Shopping** or **Save
  changes**. Creating a household unit or store is also persistent even if
  the Shopping draft is later cancelled; make this clear in the create flow.
- Do not add a dependency, API endpoint, migration, or automatic change to a
  Catalog item's default unit/store for this follow-up.

## Design references

- `docs/design/shopping/shopping-add-details.png` and
  `docs/design/shopping/shopping-edit-details.png` for the Shopping summary,
  fields, and actions. Add the small Edit Catalog action without changing the
  established layout hierarchy.
- `docs/design/catalog/store-picker.png` for the store choices and bottom
  Create/Manage actions; `docs/design/catalog/category-picker.png` for the
  related sheet/action styling.
- `docs/plans/native-sheets-app-wide.md` for form-sheet behavior, detents,
  stacked navigation, drag, and draft preservation. Inspect rendered
  references before implementation and compare related Shopping/Catalog
  screens for consistent action styling.

## Validation after implementation is complete

- Then run one coordinated focused mobile check (actual-router navigation,
  scope changes, choice creation/management, Catalog edit Save/Cancel,
  inherited versus overridden defaults, and fraction/invalid amount input),
  TypeScript, lint, and whitespace checks. Do not run tests between coding
  steps. Run database tests only if the implementation unexpectedly changes
  database behavior, and revise this plan before such a scope change.
- On iPhone and Android, verify the Shopping picker and details sheet, medium
  store picker and tall drag, keyboard-open amount entry (`2 2/3`), new
  unit/store round trips, Catalog edit return, cancellation, and no clipped
  header/footer. Compare to the saved references in light mode; defer the
  full dark-mode pass to major-deployment acceptance per Felipe's preference.
- Physical Add testing needs the locally running API to use the current
  `catalog_item_id` Shopping contract; the previously observed local process
  advertised the older `name` contract. The user owns that API terminal; do
  not stop or restart it without asking.

## Implementation and validation record

Shopping Add/Edit Details now links to the Shopping-owned full-page Catalog
editor. Unit and store selectors use Shopping-owned native choice sheets and
reused Catalog create/manage pages. Their selection result is scoped to the
Shopping household/session and Catalog item. A Catalog edit refreshes the
item summary and only untouched new-item defaults; Shopping amount and
explicit overrides remain in the open details sheet. Store opens at the
medium `[0.52, 0.92]` detents. No API, migration, or dependency changed.

The coordinated mobile check passed **47 suites / 305 tests**. Focused
actual-router and amount checks passed **3 suites / 67 tests**. TypeScript and
mobile lint passed. The focused sheet suite still emits non-failing React
`act()` warnings from its asynchronous fixture; no test failed. A web export
bundled successfully but could not complete static rendering because
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` was intentionally absent with dotenv
loading disabled; it is not a passing web-export check. No PostgreSQL test
was run because no database behavior changed. `git diff --check` passed (Git
reported line-ending notices only). Phone verification remains pending.

On a phone, still verify full-screen Catalog/choice routes return over the
details sheet with its draft intact, medium-height store presentation and
dragging, keyboard entry, and comparison with the saved references. The
local API process must be restarted by its owner if it still advertises the
older Shopping `name` request contract.
