# Recipe ingredient sections — F09

Status: implemented November 1, 2026; automated validation passed, phone
acceptance pending. Felipe approved the first part and assigned implementation here.
Planning branch: `codex/recipe-sections-plan`, clean from `origin/main` at `b06be48`.
Implementation owner: this chat agent, on `codex/recipe-ingredient-sections`. This plan does not authorize a live rollout.

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
   saved detail. Unassigned rows appear after the named sections as Other ingredients only when
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
ordered ingredients array. The wire/storage array retains its existing Other
ingredients-first order, then named sections, preserving occurrence order within
each group. Visible editor/detail headings show named sections first and Other
ingredients last; this display change does not dirty or rewrite a recipe.

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

Felipe approved the ingredient-only scope, within-section drag and Section-picker
movement between groups, and assigned implementation here. Cross-section dragging,
direction sections and F10 recipe copying remain outside this slice. Live rollout
remains separate.

References: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[Sortables official releases](https://github.com/MatiPl01/react-native-sortables/releases)
(version 1.10.1 confirmed in the installed package), and
[native-sheet agreement](native-sheets-app-wide.md).

## Implementation review — November 1

Implemented on `codex/recipe-ingredient-sections`:
- One shared editor/detail behavior for Recipes and Plan; native name/management
  sheets reuse the scoped formSheet flow and existing drag/haptic engine.
- Draft section identity is independent of names and ingredient occurrences.
  Removal preserves rows, and grouped saves/reconciliation include assignments.
- New `recipe_ingredient_sections` migration preserves old rows, constrains
  household/recipe references and refuses a downgrade that would discard groups.
  API compatibility rejects legacy ingredient replacement on grouped recipes.
- No dependency changes. The live Mac DB/API, phone builds and Render are untouched.

Original implementation validation at `5ce3e85` (before the presentation follow-up below):
- API Ruff, migration head and all 196 API tests pass on identity-verified local
  `meal_planner_disposable_test`, with no skips. Includes ownership constraints,
  old-row migration preservation, downgrade refusal, grouped persistence, legacy
  protection, idempotent create replay and unchanged cross-section Shopping totals.
- Full mobile normal and cache-cleared runs each pass 745 tests in 71 suites,
  with no skips. Types and lint pass. Actual-router cases cover both create
  origins, moving/renaming/reordering/removing sections, final-section removal,
  duplicate occurrences and retrying an unconfirmed grouped save with the same ID.
- iOS and Android JS exports pass. Validation uses an isolated runtime matching
  the committed lockfile, preserving packages used by the running Expo server.
- Native iPhone/Android drag, keyboard, large-text, scroll settling and visual
  acceptance remain unrun. These checks do not prove native device geometry.

Local review setup: after the passing full normal suite, the Windows development
DB was identity-checked, backed up as a valid custom-format archive at
`C:/Users/efeli/AppData/Local/Temp/meal-planner-dev-before-recipe-sections-20261101.dump`,
then migrated to the new head. The local API was restarted and its health/OpenAPI
confirm the new section inputs. Existing Expo continues on the LAN target;
its installed packages were not refreshed underneath the running server.
This is local development only, not the Mac family-trial rollout.

Phone review still to perform:
1. Open an existing flat recipe: no grouping labels should appear.
2. Create from Recipes and Plan; add Chicken and Mashed potatoes sections,
   add ingredients inside each, including a fraction and a blank To taste amount.
   Save and reopen to verify names, assignments, quantities and notes.
3. Reorder rows within a group and groups through Manage sections. Move one
   repeated ingredient through its Section picker; its quantity/note must follow it.
4. Cancel a section removal, then confirm it. Its ingredients must move to Other
   ingredients without deletion. Remove the final section to return to a flat list.
5. Check nested Back/Cancel/dismiss, long lists, larger text, keyboard visibility
   and the last actions after scrolling settles. Verify a canceled drag keeps order.

## iPhone blank-sheet follow-up — November 1

Felipe's first device review shows a real draggable sheet with no visible Add
section form. The new section flows had used the shared root sheet/container,
whereas the previously accepted Recipes native sheets render content directly
inside their owning Recipes/Plan stack. The component tests did not expose this
native layout mismatch.

Correction: register a scoped `sheet/sections` route in both existing stacks,
using the shared entry detents and native options before navigation, and render
its content directly as the accepted recipe sheets do. Add/Rename, Manage and
the ingredient Section picker all use this route. Nested naming retains the
manager beneath it, and the same scope/draft/Back guards remain in place. General
Catalog and other app-wide sheet layouts are unchanged.

Focused validation passes: 43 tests across actual-router recipe cases,
native-sheet lifecycle and route-option cases, with no skips; TypeScript and
lint pass. Route cases assert both recipe origins use the scoped direct-rendered
route and retain naming, movement and manager return behavior. Earlier full
mobile/API runs are historical and do not cover this follow-up. No API, database
or dependency edits were needed; database tests and full suites were not rerun.
Physical iPhone presentation/keyboard review is still pending.

### Manage sections header overlap follow-up

Felipe's next iPhone screenshot shows the manager instructions overlapping its
title. Preserve the root/header/footer as non-collapsible native sibling Views
and give the scrolling body a bounded shrinking frame, matching the accepted
Add meal sheet. No padding compensation or draft/ordering changes. Root and
mobile AGENTS plus the native-sheet plan now record this recurring native frame
rule for future sheets. All 38 actual-router recipe tests, TypeScript and lint
pass; the manager test guards the native header/body/footer hierarchy and bounded
scroll frame. Physical layout recheck remains pending. Earlier full mobile/API
results are historical; no database or dependency changes or API retest here.

### Section presentation follow-up — November 1

Felipe requests more prominent section headings and Other ingredients at the
bottom. Both shared editor and saved detail now use the app's existing 20-point
bold section-title role (previously ordinary 16-point text) and render named
sections before Other ingredients. Flat recipes retain their ordinary unlabelled
list. The underlying ingredient/section identities, wire order and save behavior
remain intact. All 45 actual-router recipe tests, TypeScript and lint pass.
The added case checks saved/editor reading order and confirms that displaying
Other ingredients last does not mark ingredients dirty on Save. Phone appearance
still needs review. No API, database or dependency changes; full suites and
API/database tests were not rerun for this presentation-only follow-up.

### Compact section controls — November 1

Felipe requests Manage sections to the right of Ingredients, a plus action at
the right of each named section instead of repeated Add ingredient text, and
vertically centered section names in the management sheet. The shared editor
now uses wrapping heading rows with 44-point action targets and the app's
existing blue plus icon. The main bottom Add ingredient action stays intact.
Only section-management reorder rows use centered alignment; ordinary ingredient
rows retain their multiline alignment and the accepted drag/separator behavior.
All 51 focused recipe route/component tests, TypeScript and lint pass. Both
create-origin cases verify the icon action preselects the named section and only
one main Add ingredient text remains. Existing drag/separator tests pass after
section-only row centering. Native appearance, large-text wrapping and touch
targets still need phone review. No API/data edits or database tests here.

### Ingredient details actions and opening height — November 1

Felipe requests Add at the top right of Ingredient details, performing the same
submission as the bottom action, and expanded opening height whenever Section
selection is shown. Header Add (Save for an existing occurrence) shares the
same validation, scope checks and submit handler as the bottom button; a submit
latch prevents double taps from dismissing multiple layers. Back remains the
non-saving return path. Both owning stacks read the entry's initial detent
before navigation: sectioned details open at the existing largest detent
(0.92); flat details retain their medium opening. Native dragging and direct
content rendering are retained. All 50 focused recipe/native-sheet tests,
TypeScript and lint pass, with no skips in the final run. Actual-router checks
confirm expanded sectioned details from Recipes and Plan, medium flat details,
header Add submission, invalid-amount disabling on both actions, and Back without
saving. Tests inspect the actual native modal screen, not an underlying stack
screen. Actual iPhone height and keyboard reachability remain unrun. No API/data
edits or database tests here.
