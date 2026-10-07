# Household-scoped Recipes: design and implementation plan

Status: implementation merged to `main` through PR #14 as `ac5dcf0`; it has
not been deployed to staging. The fresh disposable-PostgreSQL migration reached
`household_recipes` (head), and the full API suite passed 120 tests with no
skips on 2026-10-06.
Mobile normal and no-cache runs each passed 40 suites / 262 tests; TypeScript,
lint, API Ruff, and whitespace checks passed. Felipe considers Recipes v1
finished. The later native-sheet migration replaced the rejected custom
Ingredient Details drag; he reports the corrected ingredient screens look good
on iPhone. Broader physical-device and reference-image acceptance remain
pending. The approved slice excludes photo upload and all
shopping-list/meal-planning actions. The separate unapproved swipe-Back plan
must be preserved.

## Goal and boundaries

Replace the Recipes placeholder with a shared library owned by the selected
household. Every active household member can create, view, edit, search, and
archive recipes. A recipe requires a name and at least one linked, active Food
Catalog item when first saved. A member can create a missing Food Catalog item
from the ingredient flow and return to the unchanged recipe draft.

This slice does not implement meal scheduling, quantities on hand, automatic
shopping calculations, or an Add to Shopping List action on recipe screens.
Those belong to the later planning flow. Catalog remains a definition list,
not an inventory. Household soft-deletion retains the recipe state in place
but makes it inaccessible through normal member APIs, following the existing
household privacy boundary.

## Visual contract

Use the approved PNG references in `docs/design/recipes/`, not just their
textual descriptions. They were rendered from the approved visual sources and
inspected on October 5, 2026, before implementation. `docs/design/recipes/README.md`
maps all twelve PNG states to the seven approved sources. Do not use the
superseded first-detail draft as the target. Running native screenshots were
not available in this session: no Android emulator/ADB was available, and no
iPhone comparison was performed. Therefore side-by-side comparison against
the running screens and physical visual acceptance remain outstanding; no
visual match is claimed. Report specific differences after those checks rather
than silently substituting another design.

| Screen or interaction | Approved PNG reference |
| --- | --- |
| Recipes library, grid/list switch | `recipes-library-grid.png`, `recipes-library-list.png` |
| Final recipe detail | `recipe-detail.png` |
| Full Create/Edit Recipe form | `recipe-editor.png`, `recipe-editor-more-details.png` |
| Add/edit ingredient and Catalog search/create | `ingredient-search.png`, `ingredient-details.png`, `ingredient-create-food.png` |
| Initials/emoji cover selection | `cover-choice-initials-emoji.png`, `cover-emoji-entry.png` (photo option deferred) |
| Numbered direction-step controls | `directions-editor-section.png` |
| Archived recipes and Restore | `archived-recipes.png` (under Profile → My households → Household details) |

The directions reference magnifies one section of the **same** full recipe
editor; it is not a separate edit-only page. The full editor has cover, name,
and ingredients above directions, and More details below directions. Its
`More details (optional)` disclosure should use the visual treatment already
established by Add Catalog Item. All nested pages have one native header and
top-aligned content; tab roots remain headerless. Follow the existing
platform-safe-area and keyboard conventions rather than adding duplicate top
insets.

## Product and interaction rules

- Library: search within the active household; default to grid, with a
  grid/list switch immediately below search. Cards and rows show recipe-name
  initials by default (`Chicken tacos` → `C T`), or the chosen emoji.
  Both views open the same detail route. Retain the view choice across tab
  changes; household/account changes must not show stale results.
- Detail: show cover, title, optional servings and prep/cook time, linked
  ingredients with amounts/units and `Note: ...` where present, numbered
  directions, optional recipe notes and source link, plus Edit and archive.
  Archive is confirmed and removes the recipe from the active library. Every
  member can find and restore it at Profile → My households → Household
  details → Archived recipes. The archive is scoped to the household shown
  on that details page, even when it is not the currently selected household.
- Editor: require trimmed name and at least one ingredient. Servings,
  directions, prep/cook time, notes, and source URL are optional. Prep and cook
  each accept **hours and minutes** rather than demanding manual conversion;
  persist a normalized duration and render it naturally. Steps can be added,
  edited, deleted, and reordered before saving. Empty optional steps are not
  persisted.
- Ingredient flow: search active Food Catalog entries, select one, or create a
  Food Catalog item inline and return with the recipe draft intact. The
  ingredient editor permits optional amount, optional unit, and optional
  note, and can be reopened after adding. Accept positive numbers and typed
  fractions such as `1/2` or `1 1/2`, normalizing to precise decimal values
  before saving. Leave amount blank for “to taste”; put ranges such as
  “2–3” in the note for now. Offer common recipe measurement
  units, No unit, and a custom unit **for that ingredient only**; do not add
  custom labels to the shared Catalog unit table. The UI never labels a note
  “optional note.” A name-only ingredient bypassing Catalog is later work.
- Cover: default to initials; allow one chosen emoji using the established
  ordinary-keyboard/emoji-validation approach. Do not assume a
  platform-specific emoji keyboard can be opened. Clearing a cover returns
  to initials. Changing cover or visiting a nested picker must preserve the
  unsaved editor draft.
- Do not add shopping-list controls to recipe creation or detail. The later
  meal-planning flow will decide what quantity, if any, to put on the list.

## Affected areas and proposed technical shape

- Add a handwritten Alembic migration after `catalog_category_emoji` for
  household-owned recipes, ordered ingredient rows, and ordered direction
  steps. Store a cover kind (`initials`, `emoji`) and only its relevant data,
  optional servings/durations/notes/source URL,
  timestamps, and `archived_at`. Each ingredient references a Catalog item
  with a same-household composite foreign key; normalize supported fraction
  input to a decimal amount (not a floating-point value), and use a known
  recipe unit code, bounded custom label, or no unit, plus an optional note.
  Preserve ingredient order. Define an edit
  revision/precondition so concurrent household edits cannot silently
  overwrite one another. Active recipes may share a name unless Felipe later
  chooses a stricter rule.
- Add household-scoped `/v1/households/{id}/recipes` active/archived list,
  search, create, detail, update, archive, and restore routes. All active
  members may use them. Lock the live household before writes, then verify
  current membership, matching
  the existing archive/write ordering. Validate ingredient references as
  active Food items in that household on create or replacement; existing
  recipes remain readable if a linked Catalog item is later archived. Return
  safe 404s for outsiders, removed members, deleted households, and foreign
  IDs. Save the recipe, ingredients, and steps atomically. Define a clear
  conflict response for an out-of-date edit revision.
- Add `src/features/recipes/` with the library, detail, editor, ingredient
  flow, cover flow, archived list, state/hooks, and focused tests. Place the
  archived route under the specific household's Profile detail. Keep
  `src/app` files as thin routes and put no tests there. Reuse the app's typed
  API client, theme,
  shared screen primitives, Catalog create flow where practical, and the
  existing Recipes tab stack. Keep valid same-household results across tab
  changes; invalidate stale requests/drafts on household, Clerk identity,
  sign-out, or route-scope changes. Saving a recipe that succeeds on the server
  but loses its response must not be blindly resubmitted on retry.
- Photo upload is deferred to a separate plan. Do not add a photo button,
  media provider, dependency, or photo schema field in this slice. Household
  photos cannot be stored on Render Free's ephemeral filesystem; later work
  must review durable storage, privacy, access revocation, and the $0/month
  limit before selecting a provider. [Render Free limitations](https://render.com/docs/free).

## Validation and acceptance

- API unit tests for field validation, durations, decimals/fraction input
  normalization, unit cases, cover/URL validation, and edit conflicts.
- Against a **verified** `meal_planner_disposable_test` PostgreSQL database:
  migration/head, same-household foreign keys, tenant isolation, all-member
  permissions, deleted/archived household access, archived Catalog reference
  behavior, atomic saves, archive/restore, and archive/write races. Check both
  the URL target and `SELECT current_database()` before migration/tests; never use
  `meal_planner_dev` for the disposable suite.
- Mobile normal/cold tests, TypeScript, lint, and actual-router tests for
  grid/list search, editor validation, ingredient edit/create-and-return,
  duration fields, direction reordering, archive/restore through Profile,
  state preservation, stale responses, and save/refresh failure recovery.
  Add accessible labels and
  verify light/dark rendering.
- Physical iPhone and Android/emulator review against the saved references:
  library in both modes; emoji/initials; add/edit/delete/reorder steps;
  keyboard and sheets; item creation without losing the recipe; detail/edit
  and archive/restore; cross-device household sharing and isolation. Distinguish
  bundle/test success from actual device acceptance.
- Keep everyday development on the local API. Staging migration/deployment
  and two-device cloud acceptance are separate decisions, not automatic
  requirements for every development slice. Maintain the $0/month ceiling.

## Decisions and remaining review

Felipe chose to defer photo upload, accept positive numbers/fractions with
ranges in notes, and expose archived recipes with Restore under the
household-specific Profile details rather than on the main Recipes tab. This
route is available to active members, not only owners. An archived recipe
remains excluded from the normal library until restored.

Felipe approved the archived-list visual reference and the full revised plan.
All planned screens now have reviewed references. The VS Code coding agent
owns implementation under `AGENTS.md`; the Codex chat agent owns plan review
and follow-up coordination.

## Implementation and validation record (2026-10-05)

Implemented on the feature branch for review: handwritten recipe migration and
household-scoped API, recipe library/detail/editor/archived routes, Food
Catalog-linked ingredient flow, direction and duration editing, cover
selection, archive/restore, and focused unit, API-client, hook, library, and
actual-router tests. The Recipes tab now loads on focus without reloading on
ordinary tab switches; recipe-change notifications are scoped to the affected
household. Create retries use an idempotency key, and edits use a revision
precondition. No dependency was added.

Earlier baseline validation: mobile normal/cold tests passed 38 suites / 248
tests; TypeScript, mobile lint, API Ruff, and 75 selected non-database API
tests passed. See the follow-up below for the current mobile count.

### Android Recipes QA correction (2026-10-05)

Adjusted cover text to use explicit line heights (avoiding the clipped default
initials) and larger emoji typography for hero covers and thumbnails. Saved
decimal amounts now display without storage-scale trailing zeros in recipe
detail, editor rows, and reopened Ingredient Details (for example `2` and
`1.5`); API/database values are unchanged. The Amount placeholder is shorter
for the split field. Incomplete forms keep Save disabled, show a muted disabled
action, and explain the missing recipe name or Food ingredient. Added the
library search icon and vertical dividers between detail metrics. Editor
ingredient rows now stack measurement and note under the name and expose
separate, 44-point Edit and Remove controls to keep long names and actions
readable. This row arrangement is a deliberate small deviation from the
reference's single-line trailing measurement/Edit treatment to preserve space
for readable long names, notes, and Remove; the physical result still needs
visual review.

Focused regression tests passed (4 suites / 16 tests). Latest full mobile
normal and cold runs each passed 39 suites / 252 tests; TypeScript, mobile
lint, and `git diff --check` passed. The first normal run was launched
concurrently with type/lint work and caused four unrelated 5-second Jest
timeouts under load. Sequential two-worker reruns passed without changing
test timeouts. This was a mobile-only change: no PostgreSQL suite or API Ruff
run was needed for this follow-up, and no database was accessed.

The requested PNGs were opened and inspected. No side-by-side running-app
comparison was possible: the SDK ADB executable could not start because it
failed to create `\\.android` with permission denied, and no iPhone was
available. Therefore Android light/dark rendering, actual title clipping, and
reference fidelity remain unverified; do not count the automated style tests
as device acceptance.

No running-app screenshot comparison or physical-device acceptance was
performed. Android emulator tooling was unavailable, and no iPhone testing was
performed; both platform reviews remain outstanding.

### Recipe phone-UX follow-up (2026-10-06)

Felipe's iPhone review found the ingredient-details Back action did not return
to Food search, the Unit picker was oversized and poorly indented, custom unit
was outside that picker, the Recipe detail ingredient columns were too far
apart, and iOS gave Edit an unwanted rounded header background. The same
review found zero-valued prep/cook fields awkward to replace and missing-name
Save feedback too easy to miss. These are UI corrections within the approved
Recipes slice; recipe and Catalog API contracts are unchanged.

Ingredient Details Back now reopens Food search. Unit uses a shorter,
indented grouped picker with a custom-unit entry *inside* that picker; custom
labels remain specific to the ingredient. Prep/cook fields clear a displayed
zero on focus. Save is tappable on an incomplete, loaded editor and shows the
specific required-field error beside the corresponding field. Recipe detail
uses compact built-in unit abbreviations and a narrower measurement column;
on iOS its Edit action uses the same plain toolbar style already used by
Catalog Item Details.

Creating Food from a recipe now opens the existing full Catalog item form in
the Recipes stack with Food fixed as its type. Category/store/shopping-unit
Create and Manage pages reuse Catalog components under the same Recipes stack,
so Back returns to the Food form without losing its draft. A successful
create returns the new household-scoped item to the originating recipe editor
and opens Ingredient Details; a stale result from another editor, household,
or session is ignored. No new dependency, schema change, or backend change was
made for this follow-up.

Automated validation: full normal and final no-cache mobile runs each passed
39 suites / 258 tests; TypeScript, lint, and whitespace checks passed. Focused
actual-router checks cover the Back path,
custom-unit selection, category creation and return, store management return,
the full Food form, draft preservation, and zero-clearing fields. Native
appearance, keyboard behavior, the Edit toolbar, and reference-image parity
still require phone review. The database/API suite was not rerun for this
mobile-only follow-up.

Implement only the approved scope above, using the visual references as
testable design targets. Report any material deviation or newly necessary
dependency/provider before changing that scope.
