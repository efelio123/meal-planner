# Collapsible Shopping groups — F04 follow-up

Status: approved with revision and implemented October 30, 2026. Felipe chose
interactive group headers during search. Plan revised before implementation;
physical review remains pending. No API/schema/dependency or live-data changes.

Planning branch: `codex/shopping-group-collapse-plan`, from clean `5f0da9c`.
Preserve accepted family-trial fixes, grouping, search, cleanup and keyboard
layout. No API/schema/dependency changes, push/merge, native build, deployment
or live-data work is included. Felipe's request assigns the follow-up to this
chat. Implemented on `codex/shopping-group-collapse` from revised plan commit
`54a96c6`, preserving accepted fixes.

## Goal

Collapse or expand a Category/Store group by tapping its heading, keeping the
heading/count visible and preserving quick checkoff and search behavior.

## Proposed behavior and decisions

1. Start every group expanded. Make its whole heading a button with a minimum
   44-point touch height, name/count, `accessibilityState.expanded`, and the shared
   **ExpansionChevron** (same 18-point icon in both states). Keep category emoji
   and existing small label styling. Avoid another arrow component or gesture.
2. Collapsing hides the group's item card, not its heading/count. Expanding
   restores the same row controls. No empty bordered card or stray separator
   remains under a collapsed heading. Alphabetical/Recently added stay flat.
3. Track choices by **sort mode + To buy/Purchased section + real group ID**.
   To buy Dairy and Purchased Dairy can be collapsed independently; Category
   and Store choices do not affect each other. Rename keeps the choice, and
   same-named Food/Household categories remain separate. Use existing fallback
   group keys for uncategorized/No store groups, which are collapsible too.
4. Keep choices in this screen's memory across refresh, edits, tabs, Store
   filters and switching sort modes. Temporarily absent/filtered groups retain
   their choice if they reappear while this scoped screen is mounted. New groups
   start open. Clear choices on household/user/session change and successful
   **Clear entire list**. No device storage or household-wide preference.
5. **Group headers remain tappable during search**, as Felipe chose. Each new
   normalized query initially opens matching groups, and the user can collapse
   or expand them. Keep these temporary choices through refresh, edits, filters
   and sort/tab changes for that query. A different trimmed/case-normalized
   query resets search-only choices and opens matches again; case/whitespace-only
   edits do not reset them. Clearing search restores normal collapse choices.
   Whitespace-only input uses normal collapsible behavior. Purchased's existing
   top-level search reveal remains unchanged; this revision concerns subgroups.
6. Keep Purchased's existing top-level collapse behavior outside search. Group
   and main section counts represent matching rows under search/Store filtering,
   independent of collapse; hiding a card must not reduce counts or trigger an
   empty-list message. Truly empty groups still disappear as they do today.
7. Checking/unchecking moves the entry normally. Its destination follows that
   section/group's existing choice (or opens if new), including explicit
   temporary choices during search. Group taps close any revealed swipe action and never edit, check or
   delete an entry. Preserve accepted tap suppression and 65% swipe deletion.
8. Clear purchased/entire list keep their current household-wide scope,
   confirmations and eligibility, including rows hidden by collapse. Preserve
   query/sort/Store and pending-write guards. Only successful full clear resets
   group choices; failure/Cancel do not. Keep inline keyboard ownership and
   the accepted safe-area correction unchanged.

## Affected areas and design

- Local state and conditional group rendering in ShoppingListScreen. Reuse
  identity keys from `shopping-list-groups.ts`; do not modify source items,
  mutation hooks, API requests or grouping/count rules to implement visibility.
- Use shared ExpansionChevron and existing Pressable feedback conventions;
  preserve group labels, cards and one scroll owner. No height-animation library,
  nested scrolling, native sheet, guessed bottom padding or app-wide refactor.
- Tests/helpers stay under the Shopping feature, outside `src/app/`. Consult
  current official guidance against installed Expo 58/RN 0.88 before coding.

## Validation after the complete implementation

- Screen tests: header toggle/count/expanded state, card absence/restoration,
  missing-value and same-named groups, independent modes/sections and renames.
  Retain choices through filters, refresh and tab/edit return; newly seen groups
  start open. Scope changes and successful full clear reset choices, but failed
  clear and Cancel preserve them. Counts and no-match/empty states stay correct.
- New searches reveal collapsed needed/purchased groups; headers still toggle
  during search, temporary choices survive updates, different queries reset them
  and clearing search restores normal choices. Keep checkoffs and row
  identities correct when moving into a collapsed destination. Verify group
  taps close a revealed swipe without invoking row actions.
- Actual-router test toggles real group headers, searches/clears, edits/returns
  and checks/unchecks entries; retains proper navigation and keyboard behavior.
  Run targeted grouping/screen/hook/swipe/router tests, TypeScript, Expo lint
  and whitespace checks. No database suite for this UI-only follow-up.
- Device review: touch targets, consistent arrow size/direction, counts and
  grouped card borders; rapid toggles/checkoffs, Purchased interaction, searches
  and swipe cancellation, short/long content and final actions with keyboard
  open/closed. Physical/native geometry, Android, hosted CI and full-suite
  results remain explicit unrun checks unless actually performed.

## Review decisions

Felipe chose tappable headers even during search ("Yeah let the user do it even
during a search. If I don't like it we can change this later"). This supersedes
the proposed read-only search exception. Independent normal and temporary
search choices retain the planned scoped memory/reset behavior. Implementation
is directly assigned to this chat; no additional approval is required for
this requested revision. Deployment/native builds remain outside scope.


## Implementation and validation — October 30, 2026

ShoppingListScreen owns independent in-memory Sets for normal and search-only
choices, keyed by mode/section/group identity. Whole-heading Pressables keep
labels/counts visible, announce expanded state and reuse the existing 18-point
ExpansionChevron with a 44-point minimum touch height. Only item cards hide;
row identity, count/group rules and source mutations remain unchanged.

A different normalized query resets temporary choices, including when a query
is cleared. Case/whitespace-only changes, refresh, edits, filter/sort and tab
return retain the current query's choices. Scope changes reset both Sets, and
successful full clear resets both under the existing scope guard. Cancel,
failed clear and purchased-only cleanup do not reset normal choices. Group
presses close revealed swipe actions without invoking row actions. Purchased's
existing top-level search reveal and the accepted keyboard boundary are intact.

- **281 tests / 7 targeted suites passed**, no skips, in the coordinated pass:
  Shopping screen/group helper/hook/swipe, actual-router navigation, API client
  and shared visual roles/expansion arrows. TypeScript, Expo lint and whitespace
  checks passed. No validation failures or test skips in this slice.
- Coverage includes toggle/card visibility and unchanged totals; independent
  modes/sections and same-named categories; missing-value groups; renames,
  filter/removal/reappearance and new-group defaults; normal vs temporary search
  choices and normalized query changes; scope resets; success/failure/Cancel
  full-clear outcomes, purchased-only cleanup and swipe-safe header taps.
- The actual-router test collapses normal and searched groups, changes query,
  edits an amount and saves, leaves/returns via another tab, clears search and
  checks an item into a collapsed Purchased destination without losing its
  saved amount. Existing grouped/search and mutation regressions remain passing.
- Official guidance checked against installed Expo 58/RN 0.88:
  [SDK 58](https://docs.expo.dev/versions/v58.0.0/),
  [Pressable](https://reactnative.dev/docs/pressable), and
  [Accessibility state](https://reactnative.dev/docs/accessibility#accessibilitystate).
- **Unrun:** full mobile suite, database/API suites (UI-only change), hosted CI,
  physical iPhone/Android review, native builds and deployment. Historical full
  results do not establish this follow-up's native geometry or touch feel.
  No Mac runtime/data or unrelated-worktree changes.

Phone review: tap needed/purchased category and Store headers; verify consistent
arrows, retained counts and reachable rows. Collapse during search, change the
query, clear it, and verify the chosen restore behavior. Try refresh, edit/tab
return, checkoff into a collapsed destination, swipe then header tap and full
clear/Cancel. Verify last actions remain reachable with the keyboard open.
