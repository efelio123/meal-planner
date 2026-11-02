# Import a whole recipe or ingredient section — F10

Status: accepted by Felipe November 1, 2026; current feature complete.
Branch: `codex/recipe-import`, from approved plan at `c3caeb6`.
This revision replaces the proposed editor-level Copy button and mandatory
preview with Felipe's Add ingredient entry point and expandable recipe list.
Preserve the accepted F09/editor work; it has not been merged or deployed.

## Goal and scope

From a recipe's Add ingredient sheet, import ingredients from a saved household
recipe or one of its sections. Imported occurrences are independent editable
recipe-draft entries; the source recipe is never modified. Reuse the shared
Create/Edit editor in Recipes and recipe creation from Plan.

Felipe confirms the import rule: a singular section (including Other ingredients)
imports ingredients only; a whole-recipe import brings all ingredients and all
directions. Existing directions remain one list without section associations.
There is no separate directions checkbox or inferred section-to-step mapping.

## Proposed interaction

1. In the existing Add ingredient sheet's fixed bottom area, keep **Create Food
   item in Catalog** and place **Import from recipe** directly below it. Both
   actions remain reachable above the keyboard and long Food results. No extra
   Import/Copy action appears in the main editor.
2. Import opens an expanded native **Import from recipe** sheet with an in-content
   Back/Cancel, recipe-name search and current-household recipe list. Back or
   dismiss returns to the Food picker with its search intact and both footer
   actions usable again; a duplicate-tap latch must not strand the picker. Show active recipes
   only and exclude the recipe currently being edited.
3. A recipe with sections has the shared expandable chevron. Tapping its heading
   expands/collapses it; that action never imports. Expanded choices are
   **Whole recipe — ingredients & directions** followed by its named sections
   with ingredient counts. Make the distinction visible before Import.
   Show **Other ingredients** last if unassigned rows exist. Each choice has an
   explicit **Import** action with a 44-point target and an accessible name such
   as **Import Mash ingredients from Chicken and Mash**, or **Import whole recipe
   Chicken and Mash** for the complete selection.
4. A flat recipe has one whole-recipe Import action including all directions;
   no pointless empty expansion.
   An empty section stays visible with a disabled Import action. Multiple recipes
   may stay expanded. Expansion is keyed by recipe ID; search does not destroy
   expansion state or the Food picker's separate search.
5. Selecting Import validates/loads the selected snapshot and appends the chosen
   ingredients. Whole-recipe selection also appends every source direction after
   the destination's existing steps, continuing ordinary step numbering. A section
   selection leaves existing directions untouched. Do not add a mandatory preview/confirmation
   for this non-destructive draft addition. Show a small accessible confirmation
   such as **6 ingredients imported from Mash** and return to the same editor,
   dismissing this flow's import and Food-selection sheets once.
6. Existing recipe content remains editable and unchanged until the addition.
   Only normal recipe Save persists the destination. The accepted discard warning
   protects leaving with imported draft changes. Back/Cancel/error adds nothing.

## Destination grouping — approved defaults

The entry context remains visible (for example **Import into Chicken**).
- From a named section's plus button, append the selected ingredients to that
  existing destination section. Importing all ingredients here keeps their
  source display order but flattens their grouping into the chosen destination;
  do not create nested sections or change other destination groups.
- From the main Add ingredient action, importing a singular named source section
  creates a new section with that source section's name. A whole flat source
  creates a section based on its recipe name. Derive a valid 1–80-character name
  and show the destination label before Import; normal Manage sections can rename it.
- Whole sectioned-recipe import preserves its named sections as new independent
  groups in source order. Append source unassigned rows to existing Other
  ingredients, which stays visually last. Selecting the source's Other ingredients
  choice imports only those rows into the destination's Other ingredients.
- Same-name sections stay separate identities. Keep duplicate Food ingredients
  as separate occurrences, with their own amounts, units and notes. Never merge
  or sum them during import; current Shopping consolidation still applies later.

## Data and safety rules

- Copy quantities as written, including To taste, built-in/custom units and
  ingredient notes. Show source servings when known and clarify that amounts
  are not automatically scaled. Destination servings do not change.
- Generate fresh local keys for imported sections and occurrences. Shared Food
  Catalog references stay shared, so editing Catalog itself remains household-wide;
  recipe amounts, membership, order, units and notes are independent of the source.
  Whole-recipe imports also give every imported direction a fresh local key;
  editing those steps never changes the source recipe.
- Preserve destination name, cover, timings, source-link field and existing
  metadata. Section imports leave directions and recipe Notes unchanged. Whole
  imports append the full source step list and, when a source URL exists, one
  source name/URL attribution line to Notes, preserving existing notes and avoiding
  duplicate attribution lines. Source name, timings, cover and servings do not
  replace destination values; Whole recipe refers to ingredients and directions.
- Validate the selected addition atomically against 200 ingredients, 20 sections
  and all applicable field limits. Whole imports also check the 200-step and Notes
  limits; section imports do not add steps or attribution. If the whole addition
  cannot fit, leave the draft intact. No partial imports or silent truncation.
- Verify selected Food references against active Catalog data. An unavailable
  ingredient blocks that selection with a clear error/retry, without omitting or
  relinking it. Unavailable rows outside a selected section do not block that
  section. Existing Save validation catches later Catalog changes.
- Reuse the loaded source snapshot for what the user selected. Later source
  changes do not update an imported draft. Refresh reloads source details and
  invalidates stale selections before another import; never mix partial responses.
- One Import tap applies once even with repeated taps or a delayed response.
  Reopening and deliberately importing again is allowed. Ignore requests/results
  after Back, household/session/editor changes, reload or sheet removal.

## Source findings and affected areas

`recipe-native-sheets.tsx` already separates the Food header, results scroll and
fixed footer. Add the Import entry there, passing the existing scoped editor and
section destination context. Put new selector components, helper functions and
tests under `src/features/recipes/`; route files remain thin wrappers.

`recipe-editor-screen.tsx` owns ingredients, sections and directions. Build and
validate the merged result against its latest draft, then update refs/state
atomically so intermediate grouping updates cannot drop imported rows. Mark the
appropriate fields dirty and retain the existing save/revision/unknown-outcome guard.

`api.recipes` currently returns summaries with ingredient counts but no section
count. Add a small additive **ingredient_section_count** summary field in the
existing authorized list query and client type, allowing the picker to show which
recipes expand without eagerly downloading every recipe. Fetch `api.recipe`
contents lazily on expansion or a flat Import action; reuse those details during
that picker session. If an older API omits the count, load the selected recipe
before deciding its shape; do not treat missing data as zero sections.

Existing create/update payloads and the F09 schema already persist the resulting
independent groups/occurrences. No new table, migration, import endpoint, dependency,
paid resource or live deployment is proposed. This remains a local draft import,
not external website import, whole-recipe duplication, serving conversion or a
live linked sub-recipe. Whole imports include all directions; singular sections
remain ingredient-only, as Felipe confirmed.

## Native sheets and layout

Keep the editor's current tab-stack Screen frame. Register the Import route in
both owning Recipes/Plan stacks before navigation, reuse scoped native formSheet
entries and render its content directly as the accepted recipe sheets do.
Open the searchable expandable list at the larger detent, retaining drag dismissal.

Food keeps its non-collapsible root/header/footer as native siblings with one
bounded scrolling results body. Its footer now contains two ordered actions;
measure that layout rather than compensating with guessed padding. Retain its
single KeyboardAwareSheet owner. Import likewise keeps a native header/search
above one bounded body; disable automatic duplicate keyboard insets. Use shared
ExpansionChevron, recipe rows/covers, semantic colors and accessible action states.
Preserve underlying searches, draft content and explicit Back paths through the
actual navigator, not a custom Modal or drag gesture. See `apps/mobile/AGENTS.md`
and `native-sheets-app-wide.md`, including the recurring header-overlap rule.

## Validation after implementation

- Pure selection/merge cases: flat and sectioned recipes; whole, singular and
  Other selection; empty sections; existing destination section versus new groups;
  duplicate names/Food, independent keys, correct order, To taste/custom units,
  limits and no partial mutation. Verify that whole imports append all directions
  with fresh keys, keep existing step order, and handle zero directions. Verify
  that singular/Other section imports never add steps or change recipe Notes.
  Check whole-import step/attribution limits and independent source step edits.
- Actual-router cases in Recipes Create/Edit and Plan Create: exact footer action
  order/reachability, independent searches, multi-expansion and chevrons, whole
  versus section Import, correct return depth, add once, normal Save/reload and
  leave warning. Cover load/retry/refresh, archived source/Food, stale callbacks,
  scope changes and preserving the latest destination draft. Assert no source write.
- API tests on the explicitly verified local disposable PostgreSQL database for
  summary counts, empty groups, household scope and unchanged older fields. No
  tests or writes against the live Mac DB. Complete intended edits before checks.
- Final coordinated pass: full mobile normal/cold suites, types/lint, native JS
  exports and full disposable-PG API suite for the additive summary response.
  Report earlier acceptance/results as historical, not coverage of this feature.
- Phone review: keyboard open/closed with both Food footer actions, short/long
  and expanded lists, larger text, initial detent, slow/fast dismiss, nested Back
  and retained draft/search. Report Android or other unrun checks separately;
  dedicated both-mode/both-phone release checks precede a later major rollout.

## Review status

The footer entry, expandable searchable list and whole/section ingredient choices
are Felipe's requested revision. Destination grouping above was approved with
the implementation plan. Felipe resolves directions scope: section imports are ingredients-only,
whole imports include all directions. No remaining directions question or toggle.
Felipe approved implementation. This chat owns implementation and validation; physical review remains pending.


## Implementation and review handoff — November 1

Implemented directly in this chat on `codex/recipe-import`, preserving the
accepted F09 and editor changes. The Add ingredient fixed footer now includes
Import below Catalog creation. Both owning Recipes and Plan stacks register a
direct-rendered native Import sheet at the expanded detent. Recipe summaries
include an additive section count; the picker loads full details lazily and
falls back safely when older summaries omit the count.

The pure merge helper builds a validated independent addition before updating
the latest editor refs/state. Whole recipes append all directions and deduplicated
source attribution; singular/Other sections append ingredients only. Amounts,
custom units, To taste, duplicate occurrences and existing metadata are retained.
Native Back preserves the Food search; successful imports dismiss just these
two sheets. Scoped request generations, session tokens and a one-submit guard
ignore stale/duplicate callbacks. Refresh invalidates the source detail cache.
Only ordinary recipe Save writes; source recipes remain read-only.

The initial validation failures were corrected: the new tests now use the
existing string direction payload and 404 household-authorization contract,
and the sheet callbacks use refs with distinct session tokens to meet React's
immutability rules. No dependency or migration changes are part of F10.

Validation on the final code:
- TypeScript and Expo lint pass against the exact committed dependency lock in
  the isolated local validation runtime, leaving the running Expo install intact.
- Full normal mobile suite: 75 suites / 802 tests pass, including actual Recipes
  Create/Edit and Plan Create routes, successful Save/reopen, selection/merge
  limits, refresh/retry, unavailable sources, scope races and duplicate taps.
- API Ruff, migration/head verification and full suite: 197 tests pass, none
  skipped, on the explicitly verified local `meal_planner_disposable_test` only.
  Head remains `recipe_ingredient_sections`. The new summary test includes empty
  sections, household isolation, archive filtering and unchanged source reads.
- iOS and Android production JS exports pass. These are bundle checks, not a
  native signed-build or physical-device acceptance result.
- Cache-cleared/no-cache mobile suite: 75 suites / 802 tests pass, none skipped.

Local API was restarted and `/v1/health` returns ok; existing LAN Expo remains
running. No Mac trial, Render, live database, installed phone build, dependency
install, merge or push was performed.

Felipe owns the phone review: Create/Edit in Recipes and Create from Plan;
whole recipe versus singular/Other imports; named-section plus behavior;
keyboard-open/closed footer reachability; short/long/expanded lists and larger
text; native drag/Back and retained searches; confirmation, Save/reopen and
discard warning. Those physical geometry/gesture checks, Android review and the
dedicated light/dark release pass remain unrun. This chat owns any requested
follow-up fixes; a later merge/native rollout needs its own release step.


### Presentation follow-up — November 1

At Felipe's request, Add section stays beside Ingredients while there are no
named sections. Once a section exists it moves below the ingredient list,
following the main Add ingredient action; Manage sections stays at the top right.
Removed the flat-recipe Includes all directions caption and the word only from
section ingredient counts. Import behavior is unchanged.

All 60 focused recipe-router/import-sheet tests, TypeScript and lint pass.
The earlier full-suite/export results are historical validation of the initial
implementation; no API/database changes or new database run for this small UI
follow-up. Physical layout review remains pending.


## Acceptance checkpoint — November 1

Felipe confirms the current piece looks good and considers recipe import complete
for this iteration. Accepted application work is committed through `6d58537` on
`codex/recipe-import`. No further implementation is required for this scope.
Earlier physical-review statements describe the review status at those points;
this is overall feature acceptance, not confirmation that every listed device,
large-text, keyboard or light/dark release case was tested. Preserve unreported
release checks. Merge and deployment remain separate; the Mac trial is unchanged.

Future improvement: Felipe feels recipe import belongs alongside sectioned
directions. Record grouping directions by recipe section as a future companion
feature, including how a singular-section import could bring the relevant
instructions. Its design and scope need a separate plan before implementation.
For this completed iteration, whole recipes include all directions and individual
sections remain ingredients-only; no step-to-section association is inferred.
