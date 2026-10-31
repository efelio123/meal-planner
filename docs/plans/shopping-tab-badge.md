# Shopping tab count badge - F13

Status: approved October 31, 2026 with "Loooks good, implement it"; assigned
directly to this chat. Implementation branch: `codex/shopping-tab-badge`, from
planning commit `65c8e50`. Implementation and automated validation are complete;
physical phone review remains pending.
Planning branch: `codex/shopping-tab-badge-plan`, from clean `d606bdb`, which
records phone acceptance of planned-meal swipe deletion. Preserve that accepted
branch chain. Felipe explicitly approved direct implementation on the focused
branch above. Push, merge, deployment and native rebuild remain separate.

## Goal and product behavior

Show how many Shopping entries still need buying, from any main tab, without
requiring the user to open Shopping first.

- Count unchecked entries in the active household, including Food and Household
  items. Count rows, not amount/quantity totals: 6 eggs on one entry counts as 1.
- Count the whole list regardless of Shopping search, Store filter, sort order,
  collapsed groups or Purchased visibility. Checked entries never count.
- Show a small standard badge on the Shopping tab: 1 through 99, then `99+`.
  Hide it at zero and while the first valid list is unknown. Give the tab an
  accessible label with the full exact count, including singular/plural wording.
- Keep the badge visible when Shopping itself is selected. It is an in-app tab
  badge, not an app-icon badge, push notification or home-screen widget.
- Update with the same state as Shopping: rapid check/uncheck, add/re-add, edit,
  swipe/delete, Clear purchased, Clear all, and Plan -> Review shopping needs.
  Clear purchased normally leaves the needed count unchanged; a subsequent fresh
  read can reflect changes another person made. Adding an already-needed row
  does not increment twice; re-adding a checked row makes it count again.
- Retain the same household's last known list/count if a refresh fails; retain
  existing Shopping error/Retry UI. Do not turn a failed read into zero. A new
  user/session/household hides the old badge immediately, until its own list loads.

## Findings and affected areas

- `use-shopping-list.ts` owns items, pending writes, rollback, request versions and
  scope guards locally. Only ShoppingListScreen instantiates it today; another
  instance for the badge would create independent caches and duplicate requests.
- `ShoppingProvider` in the root layout currently holds sheet-return drafts and
  change revisions, not list data. It already spans the native-sheet routes and
  authenticated tab tree, and also exists around non-app destinations.
- Native and web tabs have separate `_layout.native.tsx` / `_layout.tsx` routes.
  Installed Expo SDK 58 / Router 58.0.26 supports native Trigger.Badge and its
  accessibilityLabel; bundled web tab types expose tabBarBadge and
  tabBarAccessibilityLabel. Use those existing primitives, not an icon overlay.
- ShoppingDetailsSheet currently writes via the API and marks Shopping changed.
  Review shopping needs uses a separate idempotent batch endpoint, then records
  a notice/revision in MealPlanContext. Its response contains only item IDs/names,
  not checked state or a full list; its result length is not the badge count.

## Proposed implementation

1. Lift the existing Shopping data owner into a feature-local
   `shopping-list-provider.tsx`, mounted once inside the root ShoppingProvider
   around RootStack. Keep sheet-return state in shopping-context.tsx. Separate
   the owner hook into `use-shopping-list-state.ts` and make useShoppingList a
   context consumer; update its tests to provide that owner. No duplicate list
   state, manually incremented counter, generic shared folder or new package.
2. Gate loads on validated signed-in/session state, destination `app`, and an
   active household. Never fetch for auth/onboarding/error screens. Scope the
   entire snapshot, pending work and requests by user/session/household and a
   generation that distinguishes leaving and returning to the same identity.
   Reject stale writes before dispatch; ignore old results after scope changes
   or unmount. Keep old data invisible during scope transitions.
3. Derive the exact count from the owner's complete visible items, with an
   explicit successful-load/unknown distinction. Expose a small badge selector/
   formatter for both tab layouts. Reuse platform badge geometry/default styling
   and match web's semantic notification color; keep existing tab titles, icons,
   order, history and native inset settings. Do not remount tabs for count changes.
4. Shopping screen and details sheets use the shared commands and their canonical
   response reconciliation. Move revision-driven refresh ownership out of the
   screen; remove duplicate refresh paths when commands already reconciled data.
   Preserve draft/search/filter/group state, multi-add feedback, native-sheet
   Back/dismiss, rapid independent toggles, pending row guards, swipe persistence,
   deletion rollback and confirmed-clear behavior. Screen-local presentation stays
   in the screen. Preserve the current API contracts and mutation timing.
5. After a successful Plan batch add (including replay), invalidate/reload this
   same owner, independently of Shopping screen mounting. Keep the existing Plan
   success notice and navigation. Never add result.items.length to a local count,
   infer checked state from its partial response, or retry the POST just because
   reconciliation failed. Existing notification/revision paths must not cause two
   separate list owners or duplicate loads.
6. Load on ready household entry, refresh when returning from background and when
   Shopping regains focus, and keep pull-to-refresh/Retry using that same owner.
   Coalesce overlapping refreshes and prevent older reads from replacing newer
   mutations or pending optimistic changes. Tear down lifecycle listeners on
   unmount/scope change. Web uses its supported visible/focus lifecycle equivalent.
   No timer polling, socket service or background task in this slice: changes from
   another phone appear on the next foreground, Shopping focus or manual refresh,
   not instantly while this app sits open on a different page.

## Frame and compatibility

This changes existing tab navigation decoration and data ownership, not page
frames. Shopping remains `Screen layout="tab-root"`; pushed pages and native
sheets retain their existing shared layouts, safe-area and keyboard owners. No
new page, sheet, guessed bottom padding or navigator replacement. Verify the
badge does not cover labels or change the accepted navigation/content geometry.
No API/schema/dependency, permissions, persistence of household data on disk,
Mac database/runtime, native build, deployment, Expo restart or paid resource
changes are included. Do not stop the running local servers for planning.

Official references consulted, checked against installed Router declarations:
- https://docs.expo.dev/versions/v58.0.0/
- https://docs.expo.dev/router/advanced/native-tabs/#badge
- https://reactnavigation.org/docs/bottom-tab-navigator/#tabbarbadge

## Validation after the intended implementation

- Provider/selector tests: unknown versus zero, one/many/99/100+, quantities and
  Household entries, canonical additions and checked-row re-adds, rapid toggles
  and rollback, optimistic deletion/failure, both clears and reconciliation errors.
- Scope/race tests: sign-out, session/household switch and leave/return, stale
  callbacks and reads, overlapping loads, multiple consumers sharing one owner,
  no fetch before validated readiness, background/unmount cleanup and failed
  refresh retaining the same household's known count. No old-count flash.
- Actual-router tests: badge populated before Shopping opens, updates from retained
  add/details sheets and Plan review, replay without double count, tab/focus/app
  return, filter/search/collapse independence, accepted nested navigation, and
  non-app destinations without Shopping requests. Verify no duplicate initial
  request from provider mount plus first Shopping focus.
- Native/web tab tests: hidden zero/unknown, full accessible count, `99+`, selected
  and unselected states, same tab order/icons/history/insets, no navigator remount.
- One coordinated validation pass: targeted Shopping/provider/Plan/navigation
  tests, then the full mobile suite because ownership spans the route tree;
  TypeScript, lint, whitespace and iOS JS export. No database test required if
  API/schema behavior stays unchanged. Existing 62-suite/633-test F06 results
  remain historical until this feature gets its own final pass.
- Phone review: launch onto Plan, check/uncheck several rows quickly, re-add a
  purchased item, add through Plan, delete/clear, change household and return from
  background after the other phone changes the list. Compare Shopping with the
  other tabs, larger count/text, keyboard and nested-sheet return. Review current
  appearance; dedicated light/dark checks belong to the later release pass.
  Mark unrun iPhone/Android/web cases explicitly; mocked badge props do not prove
  native rendering, accessibility announcements or touch/scroll geometry.

## Decisions for approval

Proposed: all unchecked rows; hidden zero/unknown; `99+` after 99 with an exact
accessible count; shared in-memory list owner; lifecycle refresh without live
cross-device delivery. No blocking technical question is known. Approval covers
this bounded state-owner move and badge, not push notifications, widgets, themes,
roles or automatic real-time household synchronization.


## Implementation record - October 31, 2026

- Root ShoppingListProvider owns one validated, user/session/household-scoped
  snapshot for tabs, the Shopping page and retained sheets. useShoppingList is
  now a consumer; use-shopping-list-state.ts holds the existing mutation engine.
  ShoppingContext keeps sheet returns and revision notices. Unknown data remains
  distinct from a confirmed empty list; scope/generation guards reject stale
  actions and token use, and mask a previous household immediately.
- Native and web tab layouts use shopping-badge.ts for the same count/format and
  exact accessible label. Native uses Trigger.Badge; web uses tabBarBadge and the
  existing navigation theme. Titles, icons, order, tab history, tab-root Screen
  and native safe-area settings are preserved. No new page or layout frame.
- Details saves now reconcile canonical responses through the shared owner.
  Plan review invalidates its full snapshot after confirmed batch/replay success;
  result length remains success-notice data, never badge arithmetic. A failed
  reconciliation does not retry the successful batch POST.
- Pending row mutations preserve rapid independent checkoffs and rollback. Reads
  coalesce, older responses cannot overwrite newer writes, and a requested read
  waits until pending row changes finish. Confirmed clear reconciliation and
  filters/search/collapse remain intact. No manually maintained count cache.
- Freshness is tied to foreground/visibility and Shopping stack focus, so merely
  dismissing its child Add/Edit sheet does not trigger an extra read. A first
  focus within one second of a completed startup/explicit reconciliation reuses
  that fresh snapshot; later tab returns refresh and in-flight requests coalesce.
  This uses timestamps, not timer polling. Native and browser listeners clean up.
- Tests cover the actual root provider and route flows; isolated stack-layout
  tests explicitly stub the new data dependency. The native system label is not
  a rendered text node in Jest: route checks observe the real tab consumer while
  separate native/web configuration tests verify badge/label wiring and stable
  navigator instances. Physical rendering and announcements still need review.

No API/schema, dependencies, Mac trial data/runtime, native build, deployment or
paid resource changed. Existing local Expo/API processes were not restarted or
stopped. During validation only completed Jest processes belonging to this run
were stopped after a failed isolated web fixture left its native router open.
Database tests and the full PostgreSQL suite are unrun because server/database
behavior did not change. Hosted CI, physical iPhone/Android/browser checks and
light/dark release review remain unrun; prior F06 validation is historical.

Phone review remains Felipe's follow-up: initial count from Plan, rapid checkoff,
re-add, Plan batch add, swipe/remove and both clears, filtering without changing
the badge total, household/sign-in isolation, and foreground return after the
other phone changes the list. Check one/two/three-digit badge appearance,
selected/unselected Shopping, larger text and keyboard/nested-sheet return.
Cross-device changes still require foreground, Shopping tab entry or refresh;
this is not live synchronization or an app-icon badge.


Final validation: all 64 mobile suites / 665 tests passed with no skipped tests,
plus TypeScript, lint, whitespace checks and iOS JS export. A subsequent
import-order-only test cleanup was rechecked with both affected suites (13 tests),
TypeScript and lint; application code did not change after the full pass/export.
Initial failed passes exposed test fixtures that assumed the previous focus policy,
used removed test helpers, or resolved a web import to the native file. Those
fixtures were repaired and the complete pass above supersedes the failed runs.
