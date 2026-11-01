# Clear purchased Shopping items — F03

Status: approved and implemented October 29, 2026. Felipe directly assigned
implementation to the chat agent. Felipe accepted the reviewed change on
October 29 ("Okay looks good"). Individual device-checklist cases and Android
acceptance are not inferred from that report. No schema,
dependency, deployment or live-data changes.

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

## Approval and implementation

Felipe approved the all-stores household scope, one bulk confirmation, two
clearly named actions, and server-current-status clearing, and directly assigned
implementation to the chat agent. Implemented on `codex/clear-purchased-items`
from `0c1c704`; accepted earlier fixes are preserved. Push/merge, native rebuild
and trial deployment are separate.

- API performs one conditional DELETE under the existing household lock and
  returns sorted removed IDs/count. No schema or authorization-policy change.
- Mobile uses exact returned IDs and canonical refresh, guards local writes and
  competing clears, ignores stale loads/tokens/scope transitions (including old
  confirmations after leaving and returning), and retains confirmed deletions
  if refresh fails. A failed DELETE also releases any invalidated refresh spinner.
- Both controls retain the existing scrollable tab-root layout and destructive
  button style. No native-sheet geometry or keyboard changes were needed.

## Validation results — October 29, 2026

- **218 tests / 5 targeted mobile suites passed**, no skips: Shopping hook,
  screen, swipe row, API client and actual-router startup/navigation suite.
  Includes all-store eligibility while filtered/collapsed, confirmation and
  cancellation without writes, accurate counts/zero, busy controls, stale
  confirmations/scopes/token resolution, exact-ID reconciliation, preserved
  other-phone unchecks/re-adds, refresh failure/retry and normal checkoffs.
- **25 API tests passed**, no skips: Shopping integration and request validation.
  Identity verified as local PostgreSQL `meal_planner_disposable_test`; migrations
  already at head. Mixed/two-store, all-needed, all-purchased and empty lists;
  owner/member access, cross-household/removed-member/deleted-household denial;
  repeats, source preservation and exact IDs/count. Deterministic transaction
  ordering covers uncheck/re-add before clear, clear then re-add with a new ID,
  and clear then stale uncheck returning 404. Existing clear-all tests pass.
- TypeScript, Expo lint, API Ruff and whitespace checks pass. The initial API
  lint pass found only import ordering in the new test; corrected and rechecked.
  Final review added the refresh-spinner/scope-cycle regressions before the
  final mobile pass and the clear-before-uncheck case before final API validation.
- Official guidance consulted: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/),
  [FastAPI path parameters](https://fastapi.tiangolo.com/tutorial/path-params/),
  [SQLAlchemy 2 transactions](https://docs.sqlalchemy.org/en/20/core/connections.html),
  [PostgreSQL 17 DELETE/RETURNING](https://www.postgresql.org/docs/17/sql-delete.html).
  Existing project versions/dependencies retained.
- **Unrun:** the full mobile/full PostgreSQL suites, hosted CI, physical iPhone/
  Android and two-phone checks, native builds and deployment. Historical full
  results predate this change and do not replace these checks. Mac trial data
  and runtime were untouched.

## Device review checklist

Use the current local API and Expo checkout (the trial Mac API has not received
this endpoint). Create disposable entries across two Stores, check some, filter
to one Store and collapse Purchased. The bottom Clear purchased items action
should remain available; Cancel keeps everything. Confirming should remove
only purchased entries across all Stores and report the actual number, while
needed quantities/units/stores remain after refresh. Check that both actions
scroll above navigation and that Clear entire list still has its distinct
confirmation. Repeat after rapid checkoffs settle and test a second-phone
uncheck/re-add before clearing. No fallback to clear-all is permitted if an old
API returns 404.
