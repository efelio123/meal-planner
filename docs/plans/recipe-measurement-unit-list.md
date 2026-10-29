# One recipe measurement-unit list — F02

Status: proposed October 29, 2026; awaiting Felipe's review. Planning only;
no application, API, schema, dependency or deployment changes.

Planning branch: `codex/recipe-unit-list-plan`, based on clean `0a3c932` after
Felipe accepted the reviewed Shopping picker-return flow. Preserve the accepted
family-trial work and SDK 58, and leave the website/Android checkouts untouched.
After approval use a focused `codex/` implementation branch from this baseline.
Implementation ownership follows AGENTS.md unless Felipe assigns it directly
to the chat agent. Do not start another agent during planning.

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

## Review decision

Approve the single optional Default unit for recipes field, complete searchable
list, and automatic internal dimension selection, while retaining the current
More details placement and per-ingredient custom-unit behavior. No required
clarification beyond confirming that scope. No implementation, push/merge,
native rebuild or deployment is authorized by this planning document alone.
