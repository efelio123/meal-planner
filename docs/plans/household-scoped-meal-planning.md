# Household-scoped meal planning and shopping review

Status: approved by Felipe for VS Code coding-agent implementation on October 7, 2026; implementation not started.

Branch: `codex/household-meal-planning`

Date: October 7, 2026

## Goal and approved direction

Replace the Plan placeholder with a shared, Monday-start weekly meal plan. A
member chooses a day and Breakfast, Lunch, or Dinner, then schedules a saved
household recipe. Tapping a planned meal's small, vertically centered chevron
opens an edit sheet. The Plan tab shows the selected day's meals; **Review
shopping needs** considers the entire displayed week, not just that day.

Adding a meal stays quick: do not ask what is on hand, add Shopping items, or
show a shopping shortcut during that action. This app does not maintain pantry
inventory. In a separate, explicit review, members decide which recipe
ingredients to buy. Nothing is written to Shopping until they confirm. This
adapts the home server's weekly structure and recipe-linked ingredients but
does **not** copy its member assignment, per-meal on-hand entry, or automatic
shopping contributions.

The approved visual targets are all four PNGs in
`docs/design/meal-plan/README.md`. The coding agent must inspect the images
before implementation and compare running screens against them. Match the
approved hierarchy, spacing, text treatment, cards, selection states, and
small centered meal-row chevrons as closely as native platform behavior
allows. Document any meaningful mismatch and its cause.

Before coding, read `AGENTS.md`, `apps/mobile/AGENTS.md`, this entire plan,
`docs/design/meal-plan/README.md` and its four v1 PNGs, and
`docs/plans/native-sheets-app-wide.md`. Inspect the existing native-sheet
route/context/screen implementation and the current Recipes, Catalog, and
Shopping contracts. The optional-side image is explicitly deferred and must
not be implemented as part of this slice.

## Current foundation and affected areas

- Plan is a placeholder. Signed-in startup still goes temporarily to Shopping.
  Plan has its own tab stack; native sheet infrastructure already exists from
  the Recipes/Catalog work.
- Recipes are household-owned and require a linked Food Catalog ingredient.
  Each ingredient may have an amount, built-in unit, custom unit, or note.
  Recipes may be edited and archived, but are not hard-deleted.
- Shopping is one household-owned shared list of text-only names with
  check/uncheck/remove. It has no catalog link or quantity today. The reviewed
  ingredients therefore require a compatible extension of its schema, API,
  and display; existing manual entries must keep working unchanged.
- Household settings already contain an IANA time zone. Existing write
  services lock the live household before checking active membership. Keep
  that ordering and the household-deletion retention boundary.

The slice touches a handwritten PostgreSQL migration, FastAPI services and
contracts, mobile API types/state, Plan routes/screens and native sheets,
Shopping presentation, focused tests, and the roadmap. Keep
`apps/mobile/src/app/` limited to route screens/layouts and put feature code
under `src/features/meal-plan/`. Reuse existing styling and sheet patterns;
do not add a dependency without an approved need and compatibility review.

## Proposed experience

1. Plan opens to the current household-local week, Monday through Sunday.
   Previous/next week and Today controls change the displayed dates. Day
   selection changes the Breakfast/Lunch/Dinner sections; dots and counts
   reflect that week's entries. The tab root stays headerless and scrollable.
2. An empty slot opens the approved Add meal native sheet with day, slot,
   searchable active household recipes, and Create a new recipe. On successful
   recipe creation, return to the still-scoped Add meal flow with that recipe
   selected; do not lose the day/slot draft. A confirmed Add inserts one
   planned occurrence and closes the sheet.
3. A filled slot opens the approved prefilled Edit meal native sheet. A member
   can change day, slot, or recipe and save, or remove only that occurrence
   after confirmation. The recipe itself remains in the library. A destination
   slot occupied by another meal is a visible conflict, not a silent replace.
4. Review shopping needs opens a week-wide screen. It shows recipe ingredient
   amounts, units, and source meals; an ingredient used in several meals has
   one combined row and an expandable per-meal breakdown when its exact
   catalog item **and unit identity** match. Different units stay separate;
   there is no implicit conversion. Checked choices remain editable before
   final confirmation. Existing Shopping matches are separated and unselected
   initially. The button states exactly how many selected lines will be added.
5. The shared Shopping tab displays the resulting quantity/unit when present
   while preserving text-only manual items and familiar check/remove behavior.
   Review never checks, removes, or reduces an existing Shopping item.

Use semantic light/dark colors, safe-area-aware content, reachable controls
with the keyboard open, visible loading/empty/error/retry states, accessible
labels and selection state, and no clipped titles or values. On iPhone, sheet
drag/dismissal must have the smooth native behavior accepted in the prior
slice. Web should retain an explicit way to close and retry sheets.

## Proposed data and API behavior

- Store planned entries by household, local calendar date, meal slot, recipe,
  creator, timestamps, and edit revision. Allow **one occurrence per
  household/date/slot for v1**; the same recipe may be scheduled on other
  dates. Enforce the slot rule in PostgreSQL as well as the API. Household-
  scoped foreign keys must prevent cross-household recipe references.
- Compute and validate week boundaries as calendar dates in the household's
  time zone; never use a phone's time zone to shift a meal to another day.
  Make Monday-start behavior stable across DST and year boundaries. All
  active members may read and change the plan; no owner-only action here.
- Show the **current saved recipe** for a planned occurrence,
  including its latest ingredients in review. Keep an already planned
  occurrence visible if its recipe is later archived, but do not offer an
  archived recipe for new scheduling. An edit/archive between loading review
  and confirming it must trigger a stale-review response and refresh, not add
  obsolete quantities. Do not silently drop an archived recipe's needs.
- Aggregate with decimal arithmetic by `(catalog_item_id, built-in unit
  identity or normalized custom unit label)`. No Pound/Ounce or other unit
  conversion. If an amount is absent, show “Amount not specified”; never
  invent a numeric quantity or sum it with known amounts. Preserve ingredient
  notes/source attribution in the review where useful.
- Extend Shopping items with nullable catalog ID, decimal amount, and unit
  identity/label. Keep old name-only rows valid and current manual-add API
  compatible. Use a household-scoped catalog reference and migration checks.
  Exact catalog/unit matches already on Shopping are unselected by default;
  a same-name manual line is a *possible match*, not proof of identical
  identity. Do not silently merge or mutate a pre-existing line.
- Provide household-scoped endpoints for week read, entry add/edit/remove,
  review read, and a transactional “add selected to Shopping” action. The
  final action must revalidate membership, plan/recipe revisions, selection,
  and household state; return a stale/conflict error requiring refresh if the
  preview changed. Use a client request ID so a lost response can be retried
  without creating duplicate Shopping rows. A later, separately confirmed
  review may add more items intentionally.
- A plan edit/removal does not delete previously added Shopping rows. After a
  successful write, update the acting phone immediately and let other phones
  see it on their next explicit refresh/focus refresh. Ignore stale responses
  after household, Clerk session, route, or selected-week changes.

## Migration, safety, and validation

- Write a forward migration for planned entries and optional Shopping
  metadata/idempotency. Existing household shopping rows and recipes must
  survive unchanged. New plan and shopping rows remain stored but inaccessible
  after internal household deletion; no cross-household exposure.
- Lock the live household first for writes, then verify active membership and
  current recipe/catalog ownership. Cover concurrent slot claims, plan edits
  during shopping confirmation, retries after lost responses, and household
  archive versus writes. Read routes return safe not-found responses to
  outsiders, removed members, and deleted households.
- Add targeted API tests for week/date/time-zone boundaries, slot conflicts,
  active/archived recipes, exact aggregation versus different/unknown units,
  existing manual Shopping rows, idempotency, stale review, authorization,
  and tenant isolation. Add fresh-migration and retained-deleted-household
  tests against disposable PostgreSQL.
- Add mobile unit and actual-router tests for the four views, Add/Edit/Remove,
  new-recipe return, whole-week review and source breakdown, Shopping display,
  retry states, and deferred responses after household/session/week changes.
  Confirm the signed-in startup destination changes from Shopping to Plan only
  after Plan is usable; update the existing navigation tests.
- After all intended code, migration, and test edits are complete, run one
  coordinated validation pass and debug failures: normal/cold mobile tests,
  TypeScript, lint, API Ruff, migration/head checks, and the full API suite.
  For database runs,
  verify both configured `DATABASE_URL` and `SELECT current_database()` are
  exactly `meal_planner_disposable_test`; do not use `meal_planner_dev` for
  tests. Report skipped tests as unrun. Do not claim staging or device
  acceptance from automated results.
- Compare each running iPhone and Android screen side by side with its saved
  PNG, including light/dark in the final major-deployment pass. Exercise
  native sheets, scrolling, keyboard, accessibility, longer names/amounts,
  two-household isolation, two-device refresh, and lost-response retries.
  Local API remains the everyday test path; staging deployment is separate
  and not required for every slice.

## Confirmed product decisions

Felipe confirmed these four policies on October 7, 2026:

1. One recipe per day/meal slot in v1. An occupied destination is a conflict,
   not an implicit replacement. An optional, plan-specific side may be
   designed later; it is not part of this slice and would not be baked into
   the main recipe. The deferred visual concept is
   `docs/design/meal-plan/future-optional-side.png`, not a v1 target.
2. Planned meals follow the latest saved recipe and remain visible after
   recipe archival. A changed recipe invalidates an open shopping review.
3. An ingredient with no amount may become a name-only Shopping line,
   visibly marked “Amount not specified”; it is never numerically combined.
4. Explicitly selecting an item already on Shopping adds a separate line
   after a clear duplicate warning. It never silently increases or
   overwrites the existing item.

Out of scope: inventory/on-hand tracking, automatic Shopping additions while
planning, shopping from recipe screens, serving-based scaling, automatic unit
conversion, member assignment, recurring meals, drag-and-drop calendar
editing, notifications, and the deferred quick-add uncatalogued item flow.
