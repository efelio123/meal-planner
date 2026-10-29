# Clear purchased Shopping items — F03

Status: proposed October 29, 2026; awaiting Felipe's review. Planning only;
no application, API, schema, dependency, deployment or live-data changes.

Planning branch: `codex/clear-purchased-items-plan`, from clean `a0b714c`
after Felipe accepted the reviewed F02 recipe-unit change. Preserve accepted
family-trial fixes, SDK 58 and unrelated website/Android work. After approval,
implement on a focused `codex/` branch from this baseline. Implementation
ownership follows AGENTS.md unless Felipe directly assigns the chat agent.

## Goal

Remove purchased items from the household Shopping list while keeping everything
still needed. Retain the existing way to clear the entire list. Deleting Shopping
entries must not delete Catalog items, recipes or planned meals.

## Proposed user experience and decisions

1. Add **Clear purchased items** beside the existing clearing actions at the
   bottom of Shopping. Use a vertical stack and the existing destructive-action
   styling/touch targets. Rename the other button **Clear entire list** so the
   difference is explicit; its existing all-items meaning stays unchanged.
2. **Recommended scope: all stores in the active household**, matching current
   Clear list. A local Store filter does not narrow either bulk action. Make
   that scope visible in the action area (for example, “Applies to all stores”)
   and repeat it in the confirmation. Keep both actions outside Purchased's
   collapsible content so collapsing that section does not hide cleanup.
3. Show Clear purchased items when the household's loaded list contains at
   least one purchased item, including one hidden by the Store filter. Keep
   Clear entire list when any items exist. Show neither on an empty list.
   Disable bulk actions while initial loading, another bulk action, or local
   item writes are pending. Close any revealed swipe action before clearing.
4. Keep **one brief bulk confirmation**, unlike accepted immediate single-item
   deletion: title “Clear purchased items?”; message “This removes purchased
   items from all stores in this household. Items still needed will stay on
   the list.” Buttons Cancel and destructive Clear purchased items. Use the
   current native Alert/web confirmation pattern, not a new sheet or framework.
5. After confirmation show Clearing… and prevent repeat submissions. Use the
   server's actual removed count for brief accessible completion feedback;
   zero removed is a normal up-to-date result, not a failure. Preserve sorting,
   valid Store filter and Purchased expansion. Retain the existing filter
   fallback if its Store disappears from the remaining list.
6. Cancel creates no request. Capture the initiating household/session when
   opening confirmation and recheck it before sending; an old confirmation must
   never clear a different household or run after sign-out.

This is a household-wide cleanup, not a request to clear only visible rows,
add search/grouping, change swipe deletion, introduce Undo, or change roles.

## Source findings and affected areas

- ShoppingListScreen has one bottom Clear list button and an explicit all-store
  destructive confirmation. Store filtering/sorting happen locally. Its
  Purchased count currently reflects the filtered view, so it cannot define
  the new household-wide action's eligibility or deleted set.
- useShoppingList.clear calls DELETE Shopping list and then clears local items.
  Per-item pending operations, load versions and user/session/household scope
  guards already exist, but a conditional clear needs its own reconciliation
  and a shared bulk-pending guard to avoid conflicts with local writes.
- shopping_lists.clear_list deletes all household Shopping rows in a transaction
  after lock_household. Add, update/re-add, delete and membership-changing
  operations use this same household lock. Current clearing authorizes an
  active household member and rejects nonmembers, removed members and deleted
  households. Do not derive a new role policy from the future F15 proposal.
- Affected files: `services/api/src/meal_planner_api/shopping_lists.py`, its
  route in `main.py`, Shopping API types/client in `apps/mobile/src/lib/api.ts`,
  `features/shopping-list/use-shopping-list.ts` and `shopping-list-screen.tsx`,
  plus relevant mobile/API tests. Keep support/tests outside src/app.

## API and atomic server behavior

- Add a distinct endpoint:
  **DELETE /v1/households/{household_id}/shopping-list/purchased-items**.
  Leave existing DELETE Shopping list and its response contract unchanged.
- In one transaction, reuse lock_household and perform one household-scoped
  conditional DELETE where is_checked is true, returning the deleted row IDs.
  Never loop over the phone's stale list or delete by its purchased-ID snapshot.
  Return **{ removed_count, removed_item_ids }**, with unique IDs matching the
  count. An empty/already-cleared list returns 200, count 0 and an empty ID list.
- Define cross-phone ordering through the existing lock: an uncheck or re-add
  committed before this clear is evaluated keeps that needed row. If clearing
  commits first, later re-add follows the accepted B12 create/reconcile path;
  a later update to the removed row gets the existing not-found behavior.
  Do not promise that a later uncheck can undo an already completed deletion.
- Repeat requests are safe. Deleted rows may include recipe-derived amounts
  or archived Catalog references; their source records remain untouched.
  No schema/migration, conversion, Catalog-default or quantity change is needed.
- Match the current Clear entire list membership checks. F15's future per-member
  bulk-delete permission must cover both operations; adding/checking permissions
  alone must not be treated as that future grant. Permission redesign is separate.

## Mobile state and race handling

- Add a separate typed API method for the purchased-only endpoint. Do not fall
  back to the legacy clear-all endpoint on a 404, timeout or malformed response.
  Local API validation comes first; trial API deployment is a separate action.
- Keep reconciliation in the current scoped Shopping state owner. Wait for
  server confirmation before removing anything, then remove only returned IDs.
  An unchecked row kept by the server must remain; a newly re-added row with a
  different ID must not be erased by a stale Catalog-identity filter.
- Invalidate loads started before/during the mutation and fetch a fresh list
  after success to reconcile other-phone changes. Ignore stale household/session
  responses and token resolution, including old confirmation callbacks.
- Separate mutation success from refresh failure: confirmed deleted IDs stay
  removed if the follow-up GET fails; show the existing load/retry path without
  pretending the deletion failed or restoring the rows. On DELETE failure keep
  current rows, show a safe retry and reconcile as appropriate. Atomic/idempotent
  server behavior makes a retry safe after an uncertain network outcome.
- Share a single bulk-pending guard with Clear entire list. Before sending,
  reject overlapping local row writes or another bulk operation; disable the
  list's conflicting write controls while clearing/reconciling. This brief guard
  must not slow independent rapid checkoffs during normal use. Reading/scrolling
  does not need an app-wide lock. Recheck pending state synchronously as well as
  through disabled UI, so double taps cannot enqueue competing requests.
- Retain needed item amounts, units, stores and IDs, as well as accepted Add/
  re-add, swipe suppression, explicit refresh and native sheet navigation.

## Validation after all intended source/test edits

- API integration against an **identity-verified local
  meal_planner_disposable_test PostgreSQL database only**: mixed checked/needed
  rows across stores, all-needed/all-purchased/empty lists, repeated requests,
  canonical removed IDs/count, and preserved needed row details/source records.
  Cover cross-household access, nonmembers/removed members/deleted households,
  and both lock orderings with concurrent uncheck/re-add and conditional clear.
  Keep the existing clear-all contract tests passing. Never run against Mac
  trial data or the ordinary development database.
- Mobile hook/client tests: returned-ID reconciliation, other-phone unchecks,
  re-added/new IDs, stale refreshes, DELETE failure/retry, refresh-after-delete
  failure, repeated taps and pending item writes, token/scope changes and old
  confirmation callbacks. Clear entire list remains distinct and guarded.
- Screen/actual-router tests: eligibility across filters and collapsed Purchased,
  exact all-store confirmation/Cancel, busy and success/zero/error feedback,
  preserving needed rows/filter/sort, closing a revealed swipe, and unchanged
  rapid checkoffs/Add/re-add/edit behavior. Keep footer actions scroll-reachable
  using the existing tab-root Screen contract; no fixed padding guesses.
- Coordinated targeted Shopping API/mobile checks, API lint/request validation,
  TypeScript, Expo lint and diff checks. No full database suite for this bounded
  operation without schema changes; broaden if implementation exposes an
  unresolved concern. Report all unrun checks. Consult current official docs
  against installed FastAPI/SQLAlchemy/PostgreSQL and Expo/React versions before
  implementation. No dependency upgrade is proposed.
- Phone check with disposable local-API entries: buy some items across two Stores,
  apply one Store filter, clear purchased, confirm only needed entries remain
  after refresh; Cancel and clear-all distinction; clear immediately after rapid
  checkoffs settle; second-phone refresh and a cross-phone uncheck/re-add.
  Review the current appearance; Android/native builds and broader device cases
  remain explicit checks, not inferred acceptance. No trial deploy is included.

## Review decisions

Approve the recommended **all-stores household scope**, **one bulk confirmation**,
and **two clearly named bottom actions**, plus server-current-status clearing.
If Felipe prefers current-Store-only clearing or no bulk confirmation, revise
those decisions before implementation. This proposal does not authorize code,
schema/configuration changes, push/merge, native rebuild or trial deployment.
