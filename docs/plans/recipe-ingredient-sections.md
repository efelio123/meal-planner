# Recipe ingredient sections — F09

Status: proposed November 1, 2026; awaiting Felipe's review and explicit approval.
Planning branch: `codex/recipe-sections-plan`, clean from `origin/main` at `b06be48`.
Chat owns planning/review. Implementation follows AGENTS.md ownership unless
Felipe explicitly assigns it here. This plan does not authorize a live rollout.

## Goal and place in the inventory

Organize a recipe's ingredients under optional names such as Chicken and Mashed
potatoes. Use the same saved recipe from Recipes and Plan. Preserve today's
simple flat list when sections are unused. F10 then builds on this structure to
copy another recipe's ingredients/directions into an independent editable draft.
Directions remain the current single ordered list for this proposed F09 slice;
sectioning directions can be reviewed separately if desired.

## Source findings and affected areas

The shared recipe editor, Ingredient Details native sheets, saved detail view,
form/order helpers and API types live in `apps/mobile/src/features/recipes/`
and `src/lib/api.ts`. Recipes Create/Edit and Plan Create share that editor.
Current ingredient occurrences already have stable local keys; repeated Catalog
items are allowed and retain distinct amounts, units and notes. They must stay
separate rather than being merged inside the recipe.

`services/api/src/meal_planner_api/main.py` declares recipe inputs; `recipes.py`
validates and transactionally replaces ordered ingredient children under the
recipe revision guard. PostgreSQL currently stores one global ingredient
position. Shopping consolidation reads all occurrences and groups by item/unit,
not presentation. Schema changes belong in a new migration after
`meal_plan_special_entries`; use a verified disposable DB for all tests.

## Proposed interaction

1. Add optional Add section/Manage sections controls to Ingredients. A short
   native entry sheet creates or renames a section; names are trimmed, required,
   and limited to 80 characters. Allow up to 20 named sections per recipe while
   retaining the existing 200-ingredient limit. Identity is independent of name.
2. Show each section as a small heading above its ingredient rows in editor and
   saved detail. Unassigned rows appear first as Other ingredients only when
   named sections exist. An ordinary unsectioned recipe keeps its current look.
   Empty named sections remain visible in the draft with an Add ingredient action.
3. Add ingredient within a section preselects that section. Ingredient Details
   gets a Section picker, including No section, so an occurrence can move to
   another section without changing its amount, unit or note. A new section
   leaves existing rows in their current assignment; no automatic regrouping.
4. In this bounded first version, the accepted three-line handle reorders
   ingredients within their section; Section selection moves between sections.
   Manage sections uses the same handle/lift/reflow/drop treatment to reorder
   section names, moving each section's ingredients with it. No visible Up/Down
   ingredient controls or tap-to-reveal reorder menu. Cross-section dragging is
   an explicit review choice, not an assumed library capability.
5. Remove section explicitly confirms that its ingredients will be kept and
   moved to Other ingredients. Append them there in their existing order. The
   action removes grouping only; it does not delete ingredients or Catalog items.
6. All changes affect the recipe draft until the existing Save action. Preserve
   selection, names and assignments across nested Back/dismiss, errors and save
   conflicts. A canceled drag keeps its pre-drag order. Existing ingredient
   Edit/Remove, grab-only haptic, separator and release/tap guards still apply.

## Layout and reuse

The shared editor retains its route-supplied tab-stack layout and one measured
scroll owner. Saved detail keeps its existing stack frame. Section/name/picker
flows reuse the accepted native formSheet routes/context with in-content titles,
Back/Cancel/Done, content-sized detents and one keyboard/safe-area owner. The
section-order sheet is a short recipe-draft flow, not a global Catalog manager.
Keep the parent draft scoped to household/session/editor; ignore stale callbacks
and drops after scope changes or section/ingredient removal. Reuse semantic
colors, text, rows, icons and the accepted three-stroke handle across these flows.
Last controls must remain reachable with long content, large text and keyboard.

Reuse Sortables 1.10.1 and existing gesture/haptic dependencies. Consult its
installed source and official docs for each API used; retain variable-height
rows, parent auto-scroll and nonvisual move actions. No dependency upgrade or
new library is proposed. Native drag feel remains a phone acceptance check.

## Persistence and compatibility

Add ordered household/recipe-scoped section rows and a nullable section foreign
key on ingredient occurrences. Composite ownership constraints prevent referring
to a section from another recipe or household. Existing ingredient rows remain
unassigned; preserve every old value and global order during migration.

Proposed wire representation: optional ordered `ingredient_sections` with names,
and nullable `section_position` per ingredient referencing that submitted array.
The server resolves positions to section IDs; local draft keys never enter the
payload. Responses return section metadata/positions alongside the existing flat
ordered ingredients array. Persist global ingredient order as Other ingredients,
then named sections in order, retaining occurrence order inside each group.

Use the existing create/update endpoints and revision checks. Grouping saves send
sections plus the complete ingredient array atomically; validate references before
replacing children. Legacy field-only edits preserve grouping. For a recipe that
already has named sections, reject an older client's ingredient replacement that
omits section metadata with a clear update-required conflict; do not silently
flatten it. Legacy flat recipe creates/edits and successful create-request
replays remain compatible. Include grouping in save-outcome reconciliation, and
never report a successful grouped save when the returned server data omits it.

Shopping needs still combine all occurrences across sections by the existing
item/unit rules. Sections do not become Shopping categories or alter totals,
To taste handling, partial amounts, special meals or review date ranges.
Deploy the additive API/schema before an updated mobile build in a separately
approved rollout. Take a fresh verified backup before live migration. Refuse a
schema downgrade that would discard section data; retain old apps' read access
and safe flat-recipe writes through the compatibility guard, and prefer fix
forward rather than restoring a backup over new family writes.

## Validation after implementation

- Targeted helpers/component and actual-router coverage: flat/sectioned Create,
  Edit and Plan Create; rename/reorder/remove; add/move duplicate occurrences;
  empty groups, last section removal, fractions/default/custom units/To taste;
  stable keys, canceled/late drops, Back/dismiss, scope switches and save retry/
  unknown outcome/conflicts. Verify ingredient and section order after reload.
- Disposable PostgreSQL migration/API coverage: preserve old data/order; enforce
  tenant/recipe references; atomic invalid/stale saves; legacy compatibility and
  create replay; sectioned save/read; unchanged all-section Shopping totals.
- One coordinated final pass: full mobile normal/cold suites, types/lint, full
  disposable-PostgreSQL API suite and migration-head checks, and native JS export.
  Existing SDK 58 release tests are historical, not coverage of this feature.
- Phone review in the current appearance: drag, scrolling, keyboard, nested
  returns, empty/long content, large text and saved reload. Dedicated light/dark
  and both-phone native review before a later major release. Android unrun until
  actually checked. No tests, seeding or destructive checks against the Mac DB.

## Review decisions

Approval is requested for the proposed ingredient-only scope and the simpler
within-section drag plus Section-picker movement between groups. If Felipe wants
cross-section dragging or direction sections now, revise this plan before code.
No implementation changes are approved yet.

References: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[Sortables official releases](https://github.com/MatiPl01/react-native-sortables/releases)
(version 1.10.1 confirmed in the installed package), and
[native-sheet agreement](native-sheets-app-wide.md).
