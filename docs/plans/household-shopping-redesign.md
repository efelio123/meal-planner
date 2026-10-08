# Catalog-backed household Shopping list

Status: Felipe approved the screen and flow direction on October 8, 2026.
Implementation and non-database validation are complete on the feature branch.
For unmatched legacy free-text rows, use the safe manual-review policy below;
do not auto-classify or delete them. The disposable PostgreSQL migration/API
run remains with the Codex chat agent.

Branch: `codex/household-shopping-redesign`, based on `main`. The plan,
roadmap edits, and seven design references were already uncommitted before
implementation and have been preserved. The VS Code coding agent owns the
implementation; the Codex chat agent owns the identity-verified database run.

Validation record (October 8, 2026): mobile normal and cache-cold runs each
passed 46 suites / 298 tests; TypeScript, mobile lint, API Ruff, and 87
non-database API tests passed. The PostgreSQL migration/integration suite was
not run in this session, and no database was contacted. Legacy migration rows
therefore have not been inspected; the migration preflight stops with a report
if any row lacks exactly one active same-household Catalog match or if rows
collide. No runtime visual comparison was possible because `adb` is not
available in this environment; iPhone and Android acceptance remain open.

## Goal and approved experience

Replace the temporary Shopping screen with one shared, household-scoped list
whose entries always refer to Catalog items. The list has at most one current
row per Catalog item, regardless of name case, source meal, unit, or purchased
state. Catalog is reusable item metadata, not on-hand inventory.

- Main screen: Catalog-style `+` in the upper right opens Add; no free-text
  inline form or three-dot menu. Keep one To buy list and a collapsible
  Purchased section. A row shows its item name, then **only** amount and store
  (`1 pound · Costco`); omit meal/source/category subtitles. A missing amount
  or store shows only the available value, not an invented quantity or store.
- Store picker beside Sort filters both To buy and Purchased. Choices include
  All stores, each relevant household store, and No store. Counts and empty
  states reflect the filter. Sort offers Recently added (default), Name A–Z,
  Name Z–A, Store, and Category; sorting changes order, not row content.
- Checking/unchecking changes just that row immediately, with rollback and a
  visible error on failure. Do not show a whole-page spinner or reload the list
  merely because one checkbox changed. Preserve a deliberate refresh path.
- Add sheet searches active Catalog items. Selecting an item already on the
  list opens its Edit sheet rather than making a duplicate. For a missing
  Catalog item, reuse the existing Catalog Create Item flow and return to the
  Shopping draft with the newly created item selected. Add Details offers
  optional positive amount, optional unit, and optional store; initialize unit
  and store from Catalog preferences where present, without changing Catalog.
- Edit sheet changes the list-specific amount, unit, and store, shows read-only
  planned meals that use that Catalog item, links to Catalog, and offers Remove
  from Shopping. The meals section is computed from the current household week,
  not displayed on the main list and not treated as pantry inventory. Show a
  clear empty message if no meal uses the item that week.
- A visible **Clear list** action below Purchased asks for explicit destructive
  confirmation. It empties both To buy and Purchased for **all stores**, even
  when a store filter is active. The confirmation must say this; Catalog items,
  recipes, and meal plans remain untouched. Cancel changes nothing. Hide or
  disable Clear list when the list is empty.

Use all seven inspected references in `docs/design/shopping/README.md` as the
visual target. Match the hierarchy, content, spacing, icon/action styling, and
related Catalog/Recipes screens as closely as the native platforms allow.
Record any necessary deviation and its reason; tests alone do not prove visual
parity. Use the accepted native draggable-sheet pattern in
`docs/plans/native-sheets-app-wide.md`, including nested Back, search/draft
retention, keyboard clearance, and household/session scoping. The destructive
Clear confirmation is a dialog, never a drag-to-confirm sheet.

## Affected areas and implementation direction

### Data and migration

The current list permits name-only rows, and meal-plan review can insert more
than one row for a Catalog item. Add a handwritten migration after the current
head to make every Shopping row resolve to a same-household Catalog item and
enforce uniqueness for the household/list at the database boundary. Catalog's
active normalized-name uniqueness already treats `milk` and `Milk` as the same
item; Shopping must use the Catalog ID as its canonical identity and reject
case-only or stale-name bypasses. Keep checked audit and source-request
integrity. Add list-specific store and unit references/validation as needed:
Catalog shopping units for manual Add/Edit; existing recipe measurement or
custom labels for meal-plan needs. Do not silently convert units or add unlike
amounts. Preserve existing source/request rows needed for retry idempotency.

Migration must preflight existing rows before adding `NOT NULL`/unique
constraints. Match a name-only row to an active Catalog item only when its
normalized name has exactly one unambiguous same-household match. Never guess
Food versus Household for an unmatched name, delete rows silently, or combine
different amounts/units/checked states silently. Produce a readable report of
unmatched rows and collisions, and stop safely until the approved policy below
is applied. A rollback must not silently discard Shopping data or leave
constraints inconsistent. Retained rows pointing to later-archived Catalog
items remain readable/removable, but archived Catalog items cannot be newly
added; their association must not leak across households.

### API and meal-plan integration

Replace free-text Shopping creation with a Catalog-ID-based request. Validate
active same-household Catalog membership, amount/unit/store references, and
archived-choice rejection. Extend item update for list-specific amount, unit,
and store while retaining check/uncheck. Return enough item and store/unit
display data for the two-line row and Edit sheet. Add a household-authorized,
transactional clear-all operation that deletes all current rows and returns a
useful count. Use safe `404` for outsiders, removed members, and deleted
households; members and owners otherwise have equal permissions.

Change the weekly Shopping review and add operation to the same canonical
rule. A selected need whose Catalog item is already on the list must not
insert a second row, even if the recipe uses a different unit or the current
row is checked. Show the existing item and offer Edit; add only genuinely new
Catalog items. Never silently sum, replace, convert, or re-check an existing
row. Preserve stale-review detection, per-request replay/idempotency, partial
amount overrides for new items, and atomicity for a multi-item add. Update the
current "add anyway" duplicate path so it cannot bypass uniqueness. Existing
older name-only clients may no longer create items after the coordinated
migration/API rollout; document this compatibility boundary.

The Edit sheet's read-only "Used in meals" list should come from active plan
entries in the current household week for that Catalog ID, with recipe name
and planned day; it is not a claim about the original source of the Shopping
row. Keep this query household-authorized. If a recipe or plan changes, a
refresh shows the current state. No automatic list quantity adjustment follows
from meal-plan edits.

### Mobile

Replace the placeholder `shopping-list-screen.tsx` and extend the existing
household-scoped hook/API client. Put feature code and tests under
`src/features/shopping-list/`; keep Expo Router route files route-only. Reuse
Catalog selection/creation and native-sheet plumbing instead of inventing a
new modal/gesture implementation. Preserve the temporary success notice when
the Plan review hands off to Shopping, but update its copy/count for additions
that were actually new. Keep name/amount formatting concise and
quantity-aware on this screen; a global unit-pluralization refactor remains a
separate future task.

Guard all loads, list-specific mutations, checkbox rollbacks, picker drafts,
and clear-all completion against household, Clerk identity/session, and stale
responses. A store filter never widens server authorization. Keep clear/error,
empty, loading, retry, and accessibility states; confirmation and destructive
actions must be announced and reachable by touch and screen reader.

No new dependency is currently proposed. If implementation genuinely needs
one, stop for the standing compatibility/benefit review and Felipe's approval.
Keep the $0/month ceiling; do not deploy staging or change environment files
as part of this slice.

## Validation and acceptance

Finish the intended code, migration, and test edits before the coordinated
validation pass; do not run incremental tests between edits. Then:

- The Codex chat agent owns the disposable-PostgreSQL migration/integration
  run after the VS Code agent delivers its implementation. Use a URL and live
  `current_database()` both verified as `meal_planner_disposable_test`, never
  `meal_planner_dev` for tests. Cover legacy backfill/ambiguity/rollback,
  same-household Catalog identity, case-insensitive duplicates, concurrent
  adds, archived item/store/unit behavior, CRUD, clear-all with an active
  filter, plan-review duplicate prevention, idempotent retry, partial amounts,
  and tenant isolation including removed/deleted households.
- The VS Code agent runs mobile normal and cache-cold suites, TypeScript,
  lint, non-database API checks/Ruff, and whitespace checks after coding is
  complete. Cover Catalog create/return, already-listed Edit, store
  filter and sort, optimistic row-only check/rollback, source-meal display,
  clear Cancel/Confirm, list/plan refresh, and delayed responses after a
  household/session switch. Report skips as unrun and cold failures honestly.
- iPhone and Android light-appearance review against every Shopping PNG and
  the related Catalog and Plan screens. Check long names/values, safe areas,
  native sheet drag/back and keyboard-open states, checked-row movement, store
  filtering, clear confirmation, and two-device shared changes. Reserve the
  dedicated light/dark pass for a major deployment.

The VS Code agent should make focused commits on this branch, leave the diff
reviewable, and not push, merge, or deploy until Felipe reviews the result.

## Migration safety policy and remaining choice

Implement a preflight that **stops and reports** any legacy free-text row with
no active Catalog match for manual Food/Household classification. Do not
automatically create an uncategorized Food item or discard the Shopping row.
The same stop-and-report rule applies to duplicate rows with conflicting
amounts, units, or checked states. This conservative policy permits the code
and disposable tests to be completed without guessing the identity of real
household data. Before applying it to a non-disposable database, Felipe can
review the report and either resolve rows manually or explicitly approve a
different migration policy.
