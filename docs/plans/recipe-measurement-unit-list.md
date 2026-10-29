# One recipe measurement-unit list — F02

Status: approved by Felipe and implemented October 29, 2026 on
`codex/recipe-unit-list`. Felipe explicitly assigned implementation to the chat
agent. Physical iPhone/Android acceptance is pending.

Implementation routing note: Plan's Food form reuses CatalogItemForm, whose
generic recipe-choice route points to Recipes. For the new unit field, its
Plan route wrapper now explicitly supplies the already-existing Plan unit-sheet
route. That existing route honors the registered per-flow opening detent:
large for the default-unit field, unchanged medium for Ingredient Details.
This adds no route or presentation pattern and keeps unit selection above the
visible Plan draft, as required by the approved cross-origin scope.

Planning branch: `codex/recipe-unit-list-plan`, based on clean `0a3c932` after
Felipe accepted the reviewed Shopping picker-return flow. Preserve the accepted
family-trial work and SDK 58, and leave the website/Android checkouts untouched.
The focused implementation branch retains this baseline and the planning commit
`1588581`. The chat agent implemented directly under Felipe's explicit request;
no delegation, unrelated checkout changes, push or merge was performed.

## Goal

Choose a default recipe unit directly, without first deciding whether the
ingredient is measured by Volume, Mass or Count. Example: open the unit list,
choose Tablespoon, save. The app stores the correct measurement type internally.

## Source findings and affected areas

- CatalogItemForm currently presents Recipe measurement (Volume/Mass/Count)
  inside Food's More details section, then reveals Base unit for recipes with
  choices filtered to that dimension. Changing dimension clears the unit.
- RecipeIngredientDetailsSheet already offers one searchable list containing
  all recipe_measurement_units, with light dimension group headings, No unit
  and its existing per-ingredient custom-unit action.
- GET Catalog units already returns each recipe unit's globally unique code,
  label and dimension. This is separate from built-in/household shopping units.
- Catalog create/update already validate that the recipe dimension and code
  are both null or form a valid pair. No API contract or database change is
  needed. New recipe ingredients already inherit the saved Catalog unit;
  existing recipe-specific overrides follow their separate draft path.
- Shared forms cover direct Catalog Add/Edit, Food created inside Recipes or
  Plan, and Shopping-origin Catalog creation/editing. Catalog item detail has
  a read-only Base unit row. Existing router tests explicitly exercise the
  two-step selection and must be revised to the new interaction.

Affected support code: `features/catalog/catalog-item-form.tsx`, a small shared
recipe-unit option mapper under that feature if needed,
`features/recipes/recipe-native-sheets.tsx`, Catalog detail wording and relevant
form/router tests. Keep supporting code outside src/app; route wrappers and
their layout ownership need no change.

## Proposed experience and behavior

1. **One optional field.** Replace the two selectors with **Default unit for
   recipes (optional)** in the same Food-only More details area. Suggested help:
   “Used when adding this food to a recipe. You can change it for each recipe.”
   Use matching Default unit wording for the read-only Catalog detail row;
   no card/page redesign or new disclosure section.
2. **All recipe choices together.** Open the existing native ChoicePicker,
   searchable from the start and initially at its large/full-height safe detent.
   Include every recipe unit returned by the API, such as Cup, Tablespoon,
   Fluid ounce, Gram, Pound, Unit and Dozen. Do not hard-code a second registry.
   Reuse Ingredient Details' list presentation and group headings; these are
   labels within one list, not another classification step or filter.
3. **Infer the stored type.** Selecting a known unit sets its code and its API
   dimension together in the draft: Cup -> volume/cup, Pound -> mass/pound,
   Dozen -> count/dozen. No separate dimension selector or manual choice is
   exposed. Replacing a unit with one from another group updates both values
   atomically; it does not reset any other field.
4. **No unit stays valid.** Include an explicit No default unit option. New
   Food can be saved without a default (both fields null). Clearing a previous
   choice clears both. Back/Done without a selection leaves the draft unchanged.
   Saving an existing item without touching its unit retains the saved pair.
   Loading/error states must not silently clear a loaded choice or invent a
   dimension when unit metadata is unavailable.
5. **Reuse across origins.** The shared form change applies to Catalog Add/Edit,
   Recipe/Plan Food creation, and Shopping Catalog creation/editing. Reuse the
   common unit-option mapping in Ingredient Details to keep labels/groups
   consistent while preserving its No unit and Use custom unit actions, existing
   selected/custom value, keyboard behavior and accepted presentation.
6. **Keep the established meanings.** This is a default for newly added recipe
   ingredients. Changing it does not rewrite existing recipe ingredients,
   quantities, shopping entries, typical shopping units or stores. Household
   items still have no recipe section. Bag/Package/household-created shopping
   units are not added to this measurement list. Ingredient-specific custom
   unit labels remain per ingredient; adding persistent custom Catalog recipe
   defaults is not part of F02.

## Navigation and data safeguards

- Reuse the scoped native-sheet routes, content header, search and explicit
  close controls. Keep the shared Screen layout owners and accepted keyboard/
  safe-area handling; no new route, fake modal, drag gesture or guessed padding.
- Choosing a unit returns to the same form with More details, name, category,
  store, shopping unit and any search-prefilled/user-edited name intact.
  Back/Done/drag dismissal never saves the Catalog item implicitly.
- Preserve F08 search-name prefill and the accepted Shopping Store/Unit/Category
  Create/Manage -> Back-to-picker flow. This built-in recipe-unit selector has
  no Create/Manage actions to add. Retain household/session stale-result guards.
- Preserve B06 default inheritance, explicit existing ingredient overrides,
  mixed-fraction entry and blank amount -> To taste. Do not change amount
  parsing, measurement conversions or meal-plan shopping calculations.
- Keep API field names, valid unit codes and dimension validation unchanged.
  No migration, live data rewrite, dependency or native signing/build change.
  Consult official SDK 58/Router and React docs against installed versions
  before implementation, per the working agreement.

## Validation after all intended source and test edits

- Unit/form cases: complete options across volume/mass/count; stable code
  identity; explicit clearing; optional unit; cross-group replacement; correct
  paired payloads; unchanged existing values; no mutation on Cancel/Back; and
  unavailable metadata without a silent reset. Verify the old classification
  selector is gone while list group headings remain allowed.
- Actual-router cases across Catalog Add/Edit, Recipes and Plan Food creation,
  and Shopping Catalog Add/Edit: open More details, search/select, return with
  other draft fields intact, save and reopen. Cover representative volume,
  mass and count units, not only Cup. Check the read-only default label.
- Recipe regressions: new ingredients inherit the chosen default; existing
  recipe units/custom overrides stay unchanged; blank amount still saves as
  To taste. Shopping default/unit/store behavior and picker return must retain
  their acceptance cases. Household items keep their simpler form.
- One coordinated, proportionate mobile pass after edits: affected shared unit/
  form/choice tests and actual-router/recipe integration suites, TypeScript,
  lint and diff checks. Fix failures and rerun affected checks. No database
  suite for unchanged API/schema behavior; previous full-suite results remain
  historical rather than claiming they cover these later edits.
- iPhone acceptance in the current appearance: new and existing Food; search
  and select Cup/Pound/Dozen; clear the default; cancel and return; nested
  choice/draft preservation; keyboard open/closed and safe-area/last-row
  reachability. Add the Food to a recipe and check its inherited unit and
  To taste behavior. Spot-check Recipe/Plan and Shopping origins, and record
  Android or any unrun cases explicitly. No automated writes to the live Mac.

## Approved decision and implementation

Felipe approved the single optional Default unit for recipes field, complete
searchable list and automatic internal dimension selection. The shared form
sets both fields in one draft update, clears both only on explicit No default
unit, and leaves untouched values unchanged. A shared API-backed option mapper
also supplies Ingredient Details without changing its custom-unit behavior.
The field stays under Food's More details, opens large through the existing
native selector, and is unavailable while unit metadata is absent/loading.
The read-only Catalog row now says Default unit. Shopping defaults, quantities,
stores, existing recipe ingredients and backend contracts are unchanged.

## Validation results — October 29, 2026

- **7 targeted suites / 184 tests pass** across the coordinated run and corrected
  suite rerun: ChoicePicker, choice navigation (including Plan detents), Catalog
  presentation, actual Router startup/navigation, recipe integration, meal-plan
  integration and native-sheet route options.
- The coordinated run passed 6 suites with one new test-fixture failure in
  startup/navigation: its simulated unit-load error hit the Catalog tab's
  background request instead of the edit form. After isolating that error,
  the complete affected suite passed **111 tests**, no skips (23.734s). The
  other 6 suites' source/tests were unchanged after their passing run.
- Final TypeScript `tsc --noEmit`, Expo lint and diff checks passed. Coverage
  includes complete cross-dimension options, searchable selection and paired
  payloads, no unit, replace/clear/cancel/unchanged and save/reopen, metadata
  failure/retry, unchanged shopping preferences, read-only wording, Household
  disclosure, Recipes/Plan Food creation, default inheritance and To taste.
  Existing recipe-specific/custom override and Shopping navigation tests pass.
- No API/schema/migrations/dependencies changed. Database tests, full mobile
  suite, cache-disabled run, web export, native build and physical-device checks
  were not run for F02. The earlier full 58-suite / 479-test result predates
  this feature and is historical, not validation of these edits. No live Mac
  data/runtime, deployment, push or merge changed.
- Consulted [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) and
  [React object-state guidance](https://react.dev/learn/updating-objects-in-state)
  against installed Expo 58.0.19, Router 58.0.26 and React 19.3.0.

Phone review: open Food More details in create and edit; select/search Cup,
Pound and Dozen without choosing a type first. Clear the default, cancel a
selection, and save/reopen. Check full-height sheet, keyboard and last-row
reachability. Spot-check Food creation from Recipes/Plan/Shopping, draft
retention, inherited ingredient unit with blank-amount To taste, and the
accepted Shopping Create/Manage -> Back-to-picker flow. Record actual device
results; this implementation does not authorize a native rebuild or deployment.
