# Household-scoped Catalog plan

Status: the previously approved Catalog implementation is in progress on
`feat/household-catalog` and remains uncommitted. This revision adds visual and
category-seeding requirements only; those additional changes await review and
explicit approval. Existing uncommitted implementation work is preserved.

Validation chronology: an earlier mobile snapshot passed 199 tests in each of
the normal and cold runs, with 45 focused actual-router tests; TypeScript,
mobile lint, and API Ruff passed in that snapshot. Felipe reported an earlier
full disposable-PostgreSQL run with 62 passed and 2 failed before the focused
fixes, then a later run with 64 passed, 0 failed, and 0 skipped. The latter is
Felipe-reported, not independently reproduced in this documentation-only turn,
and covers the existing Catalog migration/code only. The proposed starter-
category migration has not been written or run and remains unvalidated. No
validation was run for this documentation-only revision.

## Goal and approved product direction

Replace the Pantry tab with a household-scoped Catalog using the approved
reference hierarchy: searchable items grouped by category, All/Food/Household
filters, and separate Add item and Edit item screens. Catalog entries are
reusable definitions, not inventory. There are no quantities on hand, stock
states, or pantry adjustments. Recipe and shopping-list linkage is a later
slice; the existing shopping list remains free-text and is not rewritten.

The tab is available to all active household members. Every active member may
manage items, categories, stores, and custom shopping units. Household and
member management remains owner-only. Category is optional, and uncategorized
items appear in an “Uncategorized” group. Food and Household categories are
separate within each household. Stores and custom shopping units are shared
across both item types.

Typical shopping unit and preferred store are optional and have no automatic
default. Built-in shopping choices are read-only; members may create
household-specific shopping labels. Recipe measurement choices are a separate,
fixed controlled set. Neither custom shopping labels nor built-in package
labels convert automatically to recipe measurements. For example, “bottle”
does not imply a volume or convert to milliliters.

## Existing foundation and Home-server reference

The consumer API currently has users, households, memberships, invitations,
household-scoped shopping lists, and household-management endpoints, but no
catalog tables or routes. Reuse `lock_household()` for mutations: it locks the
live household, then checks current membership/role. Reads and writes must also
scope their SQL to that household. Use handwritten Alembic migrations, not an
ORM or autogeneration.

The Home-server catalog provides useful lessons: Food/Household item types,
normalized duplicate-name prevention, category grouping, store metadata, and
separate recipe measurement metadata. It is a single-namespace desktop system;
its categories are free text and its unit tables store conversion factors.
Adapt the domain concepts, not its desktop tables/forms or inventory/package
conversion model.

## Proposed data model and migration

Keep all catalog data household-owned and retain it when a household is
soft-deleted. Use restrictive physical-delete FKs to households; application
deletion remains the existing in-place soft-delete. The existing
`household_catalog` revision has already been applied to the disposable test
database, so do not rewrite it to add category seeds. Add a new handwritten
Alembic revision after `household_catalog`. Suggested tables and constraints:

- `catalog_categories`: UUID, household ID, `item_type` (`food` or
  `household`), display/normalized name, timestamps, and `archived_at`. Add
  `UNIQUE (household_id, id, item_type)` for composite references and an
  active-only unique index on household, type, and normalized name.
- `catalog_household_seed_sets`: internal one-time seed ledger with household
  ID (restrictive FK), seed-set key, and completion timestamp; unique on
  `(household_id, seed_set)`. It has no API exposure and does not mark or
  restrict individual category rows.
- `catalog_stores`: UUID, household ID, display/normalized name, timestamps,
  and `archived_at`; stores are not item-type-specific. Enforce active-only
  normalized-name uniqueness per household.
- `household_shopping_units`: UUID, household ID, display/normalized custom
  label, timestamps, and `archived_at`; enforce active-only normalized-name
  uniqueness per household. These labels are shared across Food/Household and
  have no dimension or conversion behavior.
- `catalog_shopping_units`: global, seeded built-ins with stable code and label.
  These rows are read-only and cannot be renamed or removed by users.
- `recipe_measurement_units`: global, fixed seeded code, label, and dimension
  (`volume`, `mass`, or `count`). This table has no conversion factors and no
  user-managed rows.
- `catalog_items`: UUID, household ID, optional category ID, name and
  normalized name, item type, optional built-in shopping-unit code, optional
  custom shopping-unit ID, optional preferred-store ID, optional
  food-only recipe dimension/unit pair, creator attribution if useful, created/
  updated timestamps, and `archived_at`. Item ownership is the household, not
  the creator.

The item may have no shopping unit; otherwise exactly one of built-in code or
custom-unit ID is set. Add a check constraint for that rule. Category may be
null; if present, use a composite FK `(household_id, category_id, item_type)`
to the category parent key so a category cannot cross household or type
boundaries. Use household-scoped composite FKs for custom shopping units and
stores as well. Recipe dimension and unit must be both absent or both present,
must belong to a Food item, and must match the fixed unit's dimension.

Normalize names by trimming, collapsing repeated whitespace, and lowercasing.
Enforce active item uniqueness across the whole household, regardless of type:
`UNIQUE (household_id, normalized_name) WHERE archived_at IS NULL`. This lets a
removed item name be reused while preventing active “Food” and “Household”
duplicates. Apply appropriate active-only uniqueness to categories (per type),
stores, and custom shopping-unit labels. The service must also reject a custom
unit label that conflicts with a built-in label.

“Remove item” archives the item; it does not hard-delete the row. Removing a
category, store, or custom unit also archives its choice, and is allowed only
when no active catalog item uses it. The API checks this rule transactionally
and returns a conflict if in use. Built-in units have no rename/remove
operation. Renaming a referenced choice updates the label shown by items
because items retain its stable ID. Existing archived items retain their
references. Do not add restore or archived-item browsing in this slice.

Seed the following approved built-in shopping-unit set. Shopping unit is
optional and no option is preselected:

- Package/count labels: `Unit`, `Bag`, `Bottle`, `Box`, `Bunch`, `Can`,
  `Carton`, `Dozen`, `Jar`, `Loaf`, `Pack`, `Roll`, `Tub`.
- Measured labels: `Milliliter`, `Liter`, `Teaspoon`, `Tablespoon`,
  `Fluid ounce`, `Cup`, `Pint`, `Quart`, `Gallon`, `Gram`, `Kilogram`,
  `Ounce`, `Pound`.

The fixed recipe-measurement set is the same measured choices grouped by
dimension, plus count choices `Unit` and `Dozen`:

- Volume: Milliliter, Liter, Teaspoon, Tablespoon, Fluid ounce, Cup, Pint,
  Quart, Gallon.
- Mass: Gram, Kilogram, Ounce, Pound.
- Count: Unit, Dozen.

The old Home-server “Each” choice is named “Unit”. The displayed shopping unit
is only a label; there is no package quantity, base conversion factor, or
automatic conversion to the recipe-measurement choice.

Seed these household-owned categories in both the new revision and household
creation:

- Food: Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry Staples, Frozen,
  Beverages.
- Household: Cleaning, Paper Goods, Personal Care.

Backfill starter categories only for active households (`deleted_at IS NULL`).
For each candidate household, use the same household-row lock used by
household deletion and Catalog writes. Acquire the lock first, then re-read
`deleted_at` while holding it; insert categories and the seed-set ledger only
if the household is still active. Enumerate candidates in a stable order to
avoid lock-order deadlocks. Do not create a seed-state row or alter any
catalog row for a soft-deleted household: its retained state must be logically
unchanged by the backfill.

For an active household, skip a starter name if any category already has that
household, type, and normalized name, regardless of `archived_at`; an archived
match can represent an intentional removal. Use a private, household-scoped
seed-set ledger (for example, one unique `starter_categories_v1` record per
household) written in the same transaction as seed insertion. The migration
processes only active households missing that ledger record, checks for both
active and archived matching names, then records completion even when some or
all names already existed. This makes a rerun a no-op after users rename or
archive seed rows instead of restoring removed names. The ledger is internal
migration state, not a category flag or special permission: category rows
remain indistinguishable in normal API/UI behavior and fully manageable by
members.

Future household creation inserts all ten categories and the seed-set ledger
in the same transaction as the household, owner membership, and shopping list.
Keep this in the existing household-creation service, not a later read or
client request, and call it only for the newly created household. Never run
the seed helper as a recurring reconciliation. “Snacks” is an example of a
user-created category, not a seed. Do not seed stores. “Uncategorized” is a
display group only, never a category row.

The migration must preserve any existing catalog items, household, and
shopping-list rows. Test upgrade from empty and from the current
`household_catalog` head with existing households/lists/items; verify the exact
Food/Household seeds, conflict-safe behavior for equivalent active categories,
no seeded stores or Uncategorized row, unchanged existing rows, constraints,
and retention under household soft-deletion. Include a deleted household with
existing catalog rows in the migration fixture and compare its category,
item, store, and custom-unit rows before/after; assert there is no new seed-set
ledger row for it. Also verify an archived matching category blocks insertion,
the ledger makes a second backfill a no-op, and renaming/removing a seeded row
followed by rerunning does not restore it.

Add a controlled PostgreSQL archive-versus-backfill concurrency test using two
real transactions and the shared household lock. If backfill acquires the lock
first, it rechecks the household as active, writes the seed rows and ledger,
and commits before deletion; those categories are part of the archived
household state. If deletion acquires the lock first, backfill waits, then
re-reads `deleted_at`, skips the household, and writes neither categories nor
ledger afterward. Assert both legal orderings and the final rows. Because
seeded categories are ordinary editable rows with no per-category provenance,
this additive data revision's downgrade is intentionally a no-op for both
seed rows and the seed-ledger table/rows: it does not drop the table, clear the
ledger, or guess which categories are safe to delete. Its upgrade must
therefore be idempotent when the ledger table already exists (`CREATE TABLE IF
NOT EXISTS`/equivalent), validate that an existing ledger schema has the
expected key/constraints rather than silently accepting an incompatible table,
and use conflict-safe seed inserts. Test upgrade →
downgrade → upgrade with renamed and archived starter rows, confirming the
ledger and categories remain and no starter name is restored. Do not alter the
previous `household_catalog` revision or remove catalog tables/data.

Close the migrate-before-deploy interval with a one-time staging maintenance
window: stop or route the old API to a maintenance response before running the
backfill, and keep household creation unavailable until the updated API commit
is deployed and healthy. Run migration and Alembic head/identity checks from
the full repository checkout at the exact CI-verified deployment SHA; deploy
that same SHA manually. Before restoring traffic, perform a read-only audit
that every active household has the seed-set ledger and expected category set.
If the maintenance/pause mechanism is unavailable, stop rollout and add a
separately reviewed operational gate rather than allowing the old API to
create an unseeded household. Do not seed on reads or run recurring
reconciliation; the updated household-creation transaction seeds only the new
household after deployment.

## API and authorization

Proposed household-scoped contracts:

- `GET /v1/households/{household_id}/catalog/units`: the single unit-options
  read contract, returning fixed built-in shopping units, active
  household-specific shopping units, and fixed recipe-measurement units in
  separately labeled groups. Do not add another GET unit-list endpoint.
- `GET`/`POST /v1/households/{household_id}/catalog/categories`, with optional
  type filter; `PATCH` a category to rename it and `DELETE` to archive it if
  unused.
- `GET`/`POST` `/v1/households/{household_id}/catalog/stores`, `PATCH` rename,
  and `DELETE` archive if unused.
- `POST`, `PATCH`, and `DELETE`
  `/v1/households/{household_id}/catalog/shopping-units` to create, rename, or
  archive only household custom labels if unused. The unit-options GET above
  lists built-ins and active household labels. There are no mutation routes
  for built-in shopping units or recipe-measurement units.
- `GET` `/v1/households/{household_id}/catalog/items`, optionally filtered by
  type; `GET`/`PATCH` one item; `POST` a new item; `DELETE` to archive it.
  Search may be local over the initially loaded household catalog.

All routes require an active membership in a live household. All active members
have equal catalog permissions. No RLS is added. Every write locks the live
household, re-reads membership after acquiring the lock, validates all referenced
category/store/unit IDs against the same household, and scopes its mutation by
household plus resource ID. Item archival, reference rename/removal checks, and
household deletion serialize through the same household lock so a concurrent
catalog write cannot race past archival/deletion rules. Reads also require the
household and active membership in their SQL query. Removed members, deleted
households, malformed UUIDs, and foreign-household references must not leak
records or produce 500 responses.

Pydantic request-shape errors use `422`; normalized duplicate names or an
in-use removal use safe `409` conflicts; missing or unauthorized household
resources use `404`. Normal item, category, store, and custom-unit reads and
picker options exclude archived rows. If a choice was archived after an Add/Edit
form loaded it, create/update must revalidate the reference under the household
lock and return a safe `409` (for example, `CATALOG_REFERENCE_ARCHIVED`); never
accept an archived category, store, or custom unit from stale client state. The
mobile form then refreshes its choices, preserves other draft values, clears
the invalid selection, and explains what needs to be selected again. Return
stable IDs, type, category/store/unit labels, archive-safe timestamps, and no
creator-as-owner semantics. Update `updated_at` explicitly in service writes.

## Mobile routes and interaction

- Rename the `pantry` route/tab to `catalog`. Update native/web tab labels,
  icons, accessibility names, and actual-router tests. Preserve the five-tab
  order Plan, Recipes, Shopping, Catalog, Profile and the centralized temporary
  Shopping startup target.
- Keep the Catalog tab root headerless. Put an explicitly labeled `Manage`
  action beside `+ Add` in its title row; `Manage` opens a nested `Manage
  catalog` hub with separate Categories, Stores, and Shopping units rows. Each
  row opens the corresponding editable list. Keep the optional starter-category
  preview from the hub mockup out of v1; the editable Categories list is
  required. Use the established icon-only native Back header on nested routes.
- Use `catalog-home.png` for the root hierarchy: prominent Catalog title,
  Manage/+ Add actions, search field, All/Food/Household filter pills, short
  truthful helper text, grouped rounded row surfaces, and clear item-name and
  secondary metadata hierarchy. Keep existing theme tokens, five-tab bar,
  typography scale, and safe-area ownership rather than copying the mockup's
  exact device dimensions or branding. The helper must not imply recipe/list
  linkage; for example: “Manage your household’s reusable food and household
  items.”
- The approved behavior groups catalog items by category, but `catalog-home.png`
  visually shows only Food and Household as top-level groups. Reconcile this
  without dropping category grouping: in All, show Food and Household sections
  with category subsections inside each; a Food or Household filter shows that
  type's category sections directly. Keep category identity type-scoped so
  same-named Food and Household categories never merge. Show “Uncategorized”
  for null category IDs, not as a stored choice. Within grouped rounded row
  surfaces, show item name, category and optional shopping-unit summary, an
  initial tile, and a trailing chevron; do not add product photography.
- `item-detail.png` is the detail-page reference: a centered initial tile and
  item name, type/category labels, grouped Shopping preferences and Recipe
  measurement summaries, a clear Edit action, and a destructive Remove item
  action. Use the item's initial rather than a photo. Keep the native stack's
  existing title and Back ownership; place Edit in the header action area only
  if supported without duplicating the title. The mockup's fields are display
  summaries, not inventory or recipe/list linkage.
- `edit-item.png` is the form hierarchy reference: item name, a clear Food /
  Household segmented choice, category and typical-shopping-unit rows, an
  optional More details section, and a prominent save action. Reuse themed
  inputs, row spacing, rounded surfaces, and semantic colors in both modes. The
  image shows More details expanded, while the already-approved behavior is
  collapsed initially; retain the collapsed default and allow expansion. Its
  store and recipe-measurement fields remain optional as already specified.
  Do not add the pictured fields as new scope if they are not in the approved
  form, and do not add notes, inventory, quantities, photos, or conversions.
- Add/Edit forms include name, type, optional category picker, and optional
  typical shopping unit. More details is collapsed initially and contains the
  optional preferred-store picker and Food-only dimension/recipe-unit fields.
  No unit is selected automatically. A type change clears or requires
  confirmation before clearing incompatible category/recipe values.
- Replace the current full-screen choice selector with a partial-height sheet
  over the still-mounted Add/Edit form. `category-picker.png` and
  `store-picker.png` define the picker hierarchy: sheet title/close action,
  selected-row checkmark, distinct Create and Manage actions, and a dimmed but
  recognizable form behind it. Category selection includes `No category`, a
  searchable/scrolling list when needed, and separate Create category and
  Manage categories actions. Preferred store includes `No preferred store` and
  separate Create store and Manage stores actions. The short store list should
  size to its content and remain visibly shorter than a long category sheet;
  longer lists stay within a maximum height and scroll. Apply the same
  draft-preserving sheet pattern to Shopping units, with built-in package/count,
  built-in measured, and household-created groups plus search.
- Size sheets responsively rather than copying a fixed screenshot height:
  respect safe areas and keyboard insets on iOS and Android, cap height to the
  available viewport, keep actions reachable, and allow list scrolling. On web,
  use a bottom-aligned, width-constrained overlay over the form with equivalent
  focus, Escape/close, and scroll behavior. Use existing React Native and app
  primitives; this plan does not propose a picker dependency. Platform behavior
  and visual geometry still require device/browser acceptance.
- `manage-catalog.png` defines the separate hub hierarchy: Categories, Stores,
  Shopping units as clear full-width navigation rows with leading icons and
  trailing chevrons. `manage-categories.png` defines an editable list grouped
  by Food and Household, with clear category names and a trailing edit action.
  Show seeded and user-created categories alike, with no protected/default
  badge. “Snacks” is illustrative user data, not a seed. Category creation and
  editing must identify the type; stores and custom shopping units are shared
  across types. Keep Create and Manage as separate actions in each picker, not
  per-choice edit icons. Members may rename any category and remove it only
  when unused; store/unit safeguards remain unchanged.
- Creating a choice from Add/Edit returns to the same form, selects the new
  choice, and preserves every other draft field. Keep the parent form mounted
  in its nested stack and use a narrowly scoped, in-memory Catalog form state
  keyed by household and Clerk user/session for route results. Do not persist
  drafts in AsyncStorage or route parameters. Renaming a selected choice keeps
  its ID and updates its label. If a draft-only selection is removed from a
  manager, clear that selection with a small explanation; server-side
  in-use checks remain authoritative.
- The Catalog hook/screen clears prior household data, query, filters, draft,
  and errors immediately on household or authenticated-session change. Guard
  delayed list, unit, manager, and save responses/rollbacks by household plus
  session generation. Tab focus changes alone do not trigger requests. Add
  native pull-to-refresh for items and picker data, and a visible Refresh action
  on web; this is how another device's changes appear without restarting or
  switching households. Show a refreshing indicator and preserve last-good data
  as visibly stale with a safe retryable error if refresh fails. Provide loading,
  no-items/no-results, validation, saving, duplicate, stale-reference, and
  archive-confirmation states. Failed saves preserve the form draft.

## Focused validation

API and PostgreSQL:

- Empty/current-head migration tests, lookup contents, checks/FKs/indexes,
  exact ten-category backfill for active existing households only,
  transactional seeding for a newly created household, active and archived
  same-name collision handling, ledger-backed rerun safety after rename or
  removal, row-lock/recheck ordering, archive-versus-backfill serialization in
  both commit orders, and absence of any changes to a soft-deleted household's
  existing catalog rows. Verify downgrade/re-upgrade preserves the ledger and
  does not resurrect names, no seeded stores or Uncategorized row, and all
  unrelated rows remain unchanged. Assert seeds have no privileged lifecycle
  behavior: rename/removal follows the same in-use rules as custom categories.
- Owner/member equal access for list/create/edit/archive; removed-member and
  deleted-household denial for reads and writes; cross-household item/category/
  store/custom-unit ID attempts; malformed IDs; no target-row changes after
  denial.
- Case/repeated-space-normalized duplicates across item types and concurrent
  creates; category duplicate isolation by item type; store/custom-unit
  duplicates; custom-vs-built-in unit collision; archived-name reuse.
- Rename choice updates display through stable IDs. Removal of an in-use
  category/store/custom unit returns 409; unused choice removal archives it;
  built-in unit mutation is impossible. Item removal archives rather than
  deletes. Normal list, detail, manager-list, and unit-options responses omit
  archived rows. Simulate archiving a selected category/store/custom unit after
  a form loads it, then assert stale create/edit requests fail safely with 409
  and do not change the item. Test household deletion hides all catalog routes
  but leaves catalog rows and references present in PostgreSQL.
- Run database integration tests only after verifying both configured URL name
  and `SELECT current_database()` equal `meal_planner_disposable_test`; never
  use or reset `meal_planner_dev`.

Mobile:

- Actual-router tests for the renamed five tabs, temporary Shopping startup,
  the Catalog root's visible Manage and + Add actions, Catalog → Manage →
  Manage catalog → Categories/Stores/Shopping units navigation, Add/Edit and
  manager native headers/Back, and no extra tabs.
- Focused presentation tests for root/group hierarchy, type-scoped category
  grouping (including same-name Food/Household categories), detail and edit
  hierarchy, the Manage catalog hub and editable category groups, themed
  spacing/surfaces, and accessible names/selection state. Picker tests verify
  the category sheet offers No category, search/scroll for a long list, and
  distinct Create/Manage actions; the short store list fits a shorter sheet,
  while a longer store list becomes scrollable/searchable. Verify custom-unit
  groups and search, close/Back behavior, focus restoration, and keyboard
  dismissal/scrolling.
- List tests for search, All/Food/Household filters, category grouping/counts,
  uncategorized rows, optional unit/store summaries, and empty/loading/error/
  retry/archive states. Verify pull-to-refresh reloads items and picker data,
  reflects changes made by another device, shows refreshing and retryable stale
  states on failure, and does not reload merely from switching tabs. Verify web
  Refresh provides the same explicit reload behavior.
- Form tests for optional/no-default shopping unit, fixed recipe units by
  dimension, grouped/searchable built-in and household shopping-unit choices,
  custom labels, item validation and duplicate errors, and create/edit
  success/failure.
- Deferred actual-navigation tests for category/store/custom-unit creation and
  management from both Add and Edit: returning preserves the full draft, selects
  the created choice, reflects renames, handles a removed draft-only choice,
  and cannot apply late results after household/session change. Test no stale
  item/list or error appears after switching households. Cover a choice archived
  while the form is open: save is rejected, choices refresh, the stale value is
  cleared with an explanation, and all other draft fields remain intact. Also
  verify creating/managing from each sheet returns to the same Add/Edit draft,
  with the newly created choice selected and no duplicate submit or lost text.
- Run normal/cold mobile tests, TypeScript, lint, and `git diff --check`; rerun
  Expo dependency compatibility checks only if packages change. No dependency
  is proposed. Physical iPhone and Android checks must cover light/dark mode,
  picker/manage/back flows, draft preservation, screen-reader labels, safe
  areas, keyboard scrolling, and household switching.

## Implementation and validation status

The approved visual and starter-category addendum is implemented in the
uncommitted work on `feat/household-catalog`; all seven images under
`docs/design/catalog/` remain available as references. On October 2, 2026,
mobile validation passed 28 suites / 203 tests in both normal and cold runs,
TypeScript, mobile lint, and API Ruff. PostgreSQL migration and integration
validation remains pending: the process shell has no `DATABASE_URL`, and a
guarded inspection found the API's local `.env` targets `meal_planner_dev`.
The safety check refused to connect, so `SELECT current_database()` was not
run and no migration or API/PostgreSQL tests were run. Before accepting the
migration, backfill, archive-race, and
tenant-isolation behavior, verify both database identities and run the full
API/PostgreSQL suite only against that disposable database. No physical-device
acceptance has been performed.
