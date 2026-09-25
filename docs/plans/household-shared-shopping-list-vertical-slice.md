# Household-shared shopping-list vertical slice

**Status:** Proposed — awaiting Felipe's approval before implementation
**Branch:** `docs/shared-shopping-list-vertical-slice-plan`

## Safe branch preparation before implementation

This documentation branch was created locally from `main` before the mobile
theming work was merged. Do not implement the shopping-list feature on top of
that stale base.

After the theming PR is merged, the implementation starts with these safe
steps:

1. Record `git status --short` and preserve this plan; do not reset, clean, or
   overwrite unrelated work.
2. Fetch `origin`, verify that the approved theming commit is an ancestor of
   `origin/main`, then fast-forward local `main` only.
3. Create a new `feat/household-shared-shopping-list` branch from that updated
   `main`. Do not work directly on `main` and do not merge the feature branch
   into this documentation branch.
4. Re-check the branch, log, and status before code or migration work begins.

If theming has not yet merged, stop at planning rather than silently stacking
the next vertical slice on an outdated or unrelated branch.

## Goal

Deliver the first household-owned product workflow: an authenticated household
member can add, view, check or uncheck, and remove free-text shopping-list
items. Every request must prove active membership in the addressed household;
another household must neither read nor mutate those records.

This is intentionally the first small proof of database persistence, Clerk
authentication, household authorization, and a shared mobile experience. It is
not the generated meal-plan shopping-list feature.

## Scope and non-goals

Included:

- One current shared list per household, created during household creation and
  backfilled by the migration for existing households.
- Free-text item labels and checked/unchecked state.
- Native mobile list, add, toggle, remove, loading, empty, and recoverable
  error states.
- Database-backed authorization and tenant-isolation tests.

Deferred:

- Catalog items, quantities, units, categories, stores, sorting, clear-all,
  editing labels, history/archiving, offline sync, real-time subscriptions,
  generated recipe/meal-plan contributions, list reconciliation, and pantry
  behavior.
- Provider selection, paid cloud infrastructure, deployment configuration,
  staging secrets, RLS, and production operations.

The home-server implementation usefully demonstrates item timestamps, explicit
checked state, user-facing loading/error/empty states, and retryable actions.
Its catalog selection, quantities, store filters, clearing, and meal-plan
contribution model must not be copied into this initial consumer slice.

## Database migration

Create one handwritten Alembic revision after `identity_and_households`; do not
use an ORM or migration autogeneration.

### `shopping_lists`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `household_id UUID NOT NULL REFERENCES households(id) ON DELETE RESTRICT`
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `UNIQUE (household_id)`

The unique household key means the first slice has exactly one current list per
household. The migration will backfill one list for every existing non-deleted
household, and the existing `create_household` transaction will insert its list
at household creation time. Both operations will use conflict-safe insertion.
Consequently, `GET` is a read-only operation and never changes data merely
because a member opens the app. Historical or archived lists require a later
migration rather than pretending they exist now.

The rejected alternative is lazy creation on `GET` or add. It has fewer changes
to onboarding, but it makes an otherwise safe read request mutate state and
complicates retries, observability, and authorization reasoning.

### `shopping_list_items`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE RESTRICT`
- `name TEXT NOT NULL` (trimmed, nonblank, API maximum 200 characters)
- `is_checked BOOLEAN NOT NULL DEFAULT FALSE`
- `checked_at TIMESTAMPTZ`, `checked_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT`
- `created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- A check constraint requiring both checked audit fields when `is_checked` is
  true and neither when it is false.
- A `shopping_list_items_name_not_blank` constraint requiring
  `char_length(btrim(name)) > 0`.
- An index on `(shopping_list_id, is_checked, created_at, id)` for the list
  read order.

No name uniqueness constraint is proposed. Two identical manual entries can be
intentional, and later generated-item/source-contribution work needs a clearer
reconciliation model before any deduplication rule is safe. The migration will
continue the current explicit-timestamp direction: no implicit update trigger.
Both new foreign keys use `RESTRICT`, matching the existing identity and
household record-retention policy.

## Authorization and API design

Add a focused shopping-list service module and route module. Reuse
`require_current_user` so every protected route can provision or resolve the
local user even when `/v1/me` has not been called.

Add a reusable active-member authorization query, distinct from the existing
owner-only invitation check. It must join `household_members` and `households`,
require `removed_at IS NULL` and `deleted_at IS NULL`, and return `404` for a
missing or unauthorized household. Item update/delete queries must constrain
both item ID and household/list membership in the same operation; never load an
item by ID and authorize it separately.

Proposed contract:

| Endpoint | Purpose | Success |
| --- | --- | --- |
| `GET /v1/households/{household_id}/shopping-list` | Load the household's current list and items | `200` |
| `POST /v1/households/{household_id}/shopping-list/items` | Add `{ "name": "Milk" }` | `201` |
| `PATCH /v1/households/{household_id}/shopping-list/items/{item_id}` | Set `{ "is_checked": true|false }` | `200` |
| `DELETE /v1/households/{household_id}/shopping-list/items/{item_id}` | Remove an item | `204` |

Responses will use UUIDs as strings and ISO timestamps, e.g. a list with
`id`, `household_id`, and `items`; each item includes `id`, `name`,
`is_checked`, `checked_at`, `checked_by_user_id`, `created_by_user_id`, and
`created_at`. Items will be ordered unchecked first, then creation order.

FastAPI/Pydantic request-shape failures—missing required fields, wrong types,
invalid JSON, or exceeding declared field limits—retain FastAPI's `422`
response. Domain validation that occurs after parsing, such as a name made
blank by trimming whitespace, returns `400`. Absent/unauthorized households
and items return `404`; the implementation will retain the existing safe
generic API-error behavior.
All active `owner` and `member` roles have identical list permissions for this
slice. No client-supplied user ID, creator ID, or checked-by ID is accepted.

## Mobile work

- Replace the signed-in placeholder home with a shopping-list screen scoped to
  the API-authorized selected household ID.
- Extend the typed API client with the four endpoints, retaining fresh Clerk
  token retrieval for every request and the protected Authorization-header
  behavior.
- Add a compact free-text form, an accessible checked control, and an accessible
  remove action. Preserve the existing theme/form primitives and route guards.
- Load on entry and provide explicit loading, empty, error, and retry states.
  Include a visible **Refresh** action (and pull-to-refresh where the chosen
  native list control supports it) that reloads the authoritative server list.
- After add/remove, refresh from the authoritative API. Check/uncheck will be
  optimistic with a rollback and a visible safe error if the request fails.
  There is no offline queue or real-time push in this slice; revisiting/retrying
  reloads the current server state.
- A household selection change must clear prior list state before loading the
  newly selected household, so device-local selection never leaks displayed
  records across households. Guard every asynchronous list response and every
  pending add, toggle, delete, or optimistic-rollback completion with the
  selected household ID plus a request generation/version. A request begun for
  household A cannot populate, roll back, or otherwise alter household B after
  a switch.

## Tests and validation

### API and migration

- Migration tests for tables, constraints, indexes, foreign-key deletion
  behavior, backfilled list creation, new-household list creation,
  checked-audit consistency, nonblank names, and no user-defined update
  triggers.
- Disposable-PostgreSQL integration tests for owner/member read/add/toggle/
  delete behavior.
- Mandatory two-household tests for cross-household list read, add, toggle, and
  delete attempts. Each must return the safe not-found outcome and leave the
  target household's records unchanged.
- Authorization tests proving a member whose `household_members.removed_at` is
  set cannot read or mutate its former household list, and that an active
  member cannot read or mutate a soft-deleted household's list. Both cases
  return `404` and leave records unchanged.
- Route/contract tests for input validation and checked-to-unchecked audit-field
  clearing.

### Mobile

- API-client tests for path, JSON, token/header handling, and errors.
- Component tests for loading, empty, explicit refresh, retryable error, add,
  optimistic toggle success/rollback, remove, and household switch clearing.
  Add deferred-response tests that start household-A loads and mutations,
  switch to household B, then resolve or reject the old A work. Confirm it
  cannot restore A's list, perform an optimistic rollback in B, or overwrite
  B's loading/error state.
- Run `uv run pytest` and `uv run ruff check .` in `services/api`; run
  `npm test`, `npx tsc --noEmit`, and `npm run lint` in `apps/mobile`; then run
  `git diff --check` at the repository root.
- Manually test two members of one household on separate physical devices, then
  a member of another household; verify checked state and deletions only appear
  in the authorized household.

## Cloud staging decision

**Recommendation: make cloud staging a separate, blocking follow-up
prerequisite for the M2 acceptance test, not part of this implementation
slice.**

Keeping it separate lets this PR concentrate on the product boundary,
migration, authorization, and mobile behavior without prematurely selecting a
paid provider or committing secrets. It also produces a testable local vertical
slice and keeps infrastructure review independently reversible.

The tradeoff is that a local/LAN API cannot prove the roadmap's cloud-hosted,
multi-device milestone. Before calling M2 complete or inviting a partner to
test outside the local network, staging must provide HTTPS, a managed PostgreSQL
database, migration deployment, Clerk configuration for that API origin, and a
LAN-independent mobile API base URL.

Felipe needs to decide before the staging follow-up:

1. Whether to merge this locally validated feature before staging exists, or
   require staging validation before merge.
2. The desired staging budget/region and provider evaluation criteria; no
   provider is selected by this plan.
3. Whether the first two-device acceptance test can use local LAN development
   before staging, or must wait for HTTPS staging.

## Open questions

None block the narrow implementation. Names are intentionally free text; the
future catalog slice will decide how manual items relate to normalized food
items without retroactively changing this list's behavior.
