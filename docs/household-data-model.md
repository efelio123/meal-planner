# Household data model (v1)

This is the initial multitenant model for the consumer API. It guides the
PostgreSQL schema and API authorization work; it does not introduce database
code yet.

## Model rules

- Use UUID primary keys and UTC `created_at` / `updated_at` timestamps on
  durable records. Keep actor fields such as `created_by_user_id` for audit
  history, not as an authorization shortcut.
- A household owns the product data. `users` are global identities; every
  other product record below is household-scoped, either directly or through a
  household-scoped parent. Prefer a direct `household_id` on every such table,
  including child tables, so tenant boundaries are obvious and efficient to
  enforce.
- Store dependent foreign keys with the same `household_id` as their parent
  (for example, `(household_id, recipe_id)`). Each household-scoped parent
  referenced this way must expose `UNIQUE (household_id, id)` so PostgreSQL can
  enforce that a child cannot reference a parent from another household.
- `owner` and `member` are the only v1 roles. Both use shared household data;
  owners administer membership, invitations, and household lifecycle. A
  transaction/service rule must prevent removing or demoting the last owner.

## Identity and membership

### `users`

Global account identity: `id`, identity-provider subject (unique), normalized
email (unique while active), display name, timestamps, and `deleted_at` for
account deletion workflow. Authentication credentials and raw provider tokens
do not belong in this table.

Deletion immediately disables sign-in. After the deletion workflow permanently
removes or anonymizes personal data, release the normalized email for a new
account; retain only a non-reversible deletion/audit marker as required. A
reused email creates a new account and never restores the deleted account's
households or history.

### `households`

Shared tenant: `id`, name, `time_zone`, `created_by_user_id`, timestamps, and
`deleted_at` for an explicit household-deletion workflow. `time_zone` is a
valid IANA time-zone name (for example, `America/Phoenix`) and defines local
week boundaries and planned dates. A household starts with one owner membership;
it is not inferred from `created_by_user_id`.

### `household_members`

The authorization join table: `household_id`, `user_id`, `role`, `joined_at`,
`removed_at`, and audit timestamps. `removed_at` preserves membership history;
only memberships with `removed_at IS NULL` authorize household access. Use
`UNIQUE (household_id, user_id)` (or that composite primary key). A user may
belong to many households.

### `household_invitations`

Invitation: `id`, `household_id`, normalized invited email, invited role
(default `member`), `created_by_user_id`, token digest, `status`, `expires_at`,
`accepted_at`, `revoked_at`, and timestamps. `status` is one of `pending`,
`accepted`, `revoked`, or `expired`. Never store a raw invite token.

Allow at most one `pending` invitation for the same household and normalized
email with a partial unique index. Before creating a replacement, the service
must transactionally mark any stale pending invitation as `expired`; expiry
cannot be enforced only by a time-based partial index because index predicates
cannot advance as time passes. Acceptance must likewise verify that the
invitation is still pending and unexpired.

## Household product data

| Table | Suggested key fields and relationships | Rules |
| --- | --- | --- |
| `catalog_items` | `id`, `household_id`, name, normalized name, category, default unit, `created_by_user_id`, `archived_at` | V1 catalog items are food only and household-private. `UNIQUE (household_id, normalized_name) WHERE archived_at IS NULL` makes active `Milk` and `milk` one item while allowing an archived name to be recreated. |
| `recipes` | `id`, `household_id`, title, instructions/notes, servings, `created_by_user_id`, `archived_at` | Recipes are shared with their household. Do not require a unique title: legitimate variations may share one. |
| `recipe_ingredients` | `id`, `household_id`, `recipe_id`, `catalog_item_id`, quantity, unit, optional note, display order | Enforce same-household recipe and catalog item with composite foreign keys. `UNIQUE (household_id, recipe_id, catalog_item_id)` keeps v1 to one consolidated ingredient per item per recipe. |
| `meal_plan_entries` | `id`, `household_id`, `recipe_id`, planned date, meal slot, servings/scale, `created_by_user_id`, timestamps | `UNIQUE (household_id, planned_date, meal_slot)` supports one entry per household/day/slot. An archived recipe may remain referenced by historical plans. |
| `meal_plan_entry_ingredients` | `id`, `household_id`, `meal_plan_entry_id`, `catalog_item_id`, required quantity/unit, optional source recipe-ingredient id | Snapshot ingredient requirements when a meal is planned, so later recipe edits do not alter that plan. Use one row per entry/catalog item; do not store per-meal on-hand quantities here. |
| `shopping_lists` | `id`, `household_id`, plan-period start/end dates, name, status, `created_by_user_id`, `archived_at` | Start with one list per household/week, with the period interpreted in the household time zone: `UNIQUE (household_id, plan_period_start)`. Lists are shared household artifacts. |
| `shopping_list_items` | `id`, `household_id`, `shopping_list_id`, `catalog_item_id`, required quantity, aggregate on-hand quantity, missing quantity, unit, checked state, `checked_at`, `checked_by_user_id`, timestamps | Generated items represent an aggregate; manual additions retain their source/provenance. The displayed missing quantity is calculated from aggregate requirement and on-hand quantity. Use `UNIQUE (household_id, shopping_list_id, catalog_item_id, unit)` for one display item per food/unit. |

For all tables with a parent, include the parent relation in the key design so
that the parent's `household_id` matches the child's. Quantities should use a
fixed-precision numeric type rather than floating point. V1 only combines like
units; it does not silently convert them. Units may initially be stored as
display strings, but they should eventually be controlled values (such as a
validated unit catalog), not arbitrary free text.

## Pantry-lite list generation

Do not treat `on_hand_quantity` as a per-meal fact: doing so can spend the same
finite milk, for example, against two planned meals. For a selected plan period,
first aggregate all meal-entry ingredient requirements by `(catalog_item_id,
unit)`. Ask the household for one full, partial, or zero on-hand quantity for
each aggregate, then calculate `missing = max(total_required - on_hand, 0)`.
The resulting aggregate becomes the generated shopping-list item. This is
pantry-lite behavior, not persistent household inventory.

## Shopping-list reconciliation decision

Meal-plan changes after generation need provenance. **V1 requires a
generated-item/source-contribution model** before it automatically reconciles a
list: a household-scoped supporting relation (for example,
`shopping_list_item_sources`) should link a display item to a manual addition
or a generated plan-period contribution and record its quantity. Regeneration
replaces only open generated contributions for the selected period, then
recalculates their aggregate item. It must never delete manual contributions or
an already purchased item; those remain as audit/history even when the plan
later changes. This supporting model is required for safe automatic
reconciliation but is not an inventory system.
`shopping_list_items` are materialized display aggregates: their required,
on-hand, and missing quantities must be recalculated transactionally from active
source contributions and must never be independently edited as a competing source
of truth.

## Authorization and tenant isolation

Every request identifies its authenticated user, then verifies membership for
the target `household_id`. Never trust a client-supplied household ID or fetch
a child record by its ID alone. Reads, creates, updates, and deletes must all
filter by both the resource identity and authorized household. `created_by` is
not ownership permission: shared records remain available to household members.

All invitation acceptance, membership changes, and multi-row planning/list
updates should be transactional. When the API and database are introduced,
automated tests must prove that a user in household A cannot read, update, or
delete household B's resources (including child records and guessed IDs).
Return a consistent non-sensitive result for unauthorized cross-tenant access.

## Retention and deletion direction

Archive catalog items and recipes instead of hard-deleting them while history
references them. Preserve meal-plan and shopping-list history; archive a list
rather than silently erase it. An unchecked, non-historical shopping-list item
may be removed. Invitations expire or are revoked. Account and household
deletion need an explicit, authenticated workflow later; they should not be
implemented as ad-hoc cascading deletes.

## Explicitly deferred

This model intentionally excludes full household inventory and inventory
transactions, public recipes, nutrition, delivery integrations, AI features,
complex unit conversions, and billing/subscriptions. Those additions need
separate product and schema decisions after the core household loop is proven.
