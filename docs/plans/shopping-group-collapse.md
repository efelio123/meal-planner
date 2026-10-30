# Collapsible Shopping groups — F04 follow-up

Status: proposed October 30, 2026; awaiting review. Planning only.
Felipe accepted the reviewed headings and requested header-tap collapse.
This extends the accepted headings-only scope; no implementation changes yet.

Planning branch: `codex/shopping-group-collapse-plan`, from clean `5f0da9c`.
Preserve accepted family-trial fixes, grouping, search, cleanup and keyboard
layout. No API/schema/dependency changes, push/merge, native build, deployment
or live-data work is included. Felipe's request assigns the follow-up to this
chat; implement after review on a focused branch.

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
5. **Search temporarily reveals every matching group**, matching Purchased's
   accepted behavior. While a nonblank query is active, group headings are
   read-only without a collapse chevron; matches cannot be hidden accidentally.
   Clearing search restores previous collapse choices. Whitespace-only input
   uses normal collapsible behavior. This search exception is a review decision.
6. Keep Purchased's existing top-level collapse behavior outside search. Group
   and main section counts represent matching rows under search/Store filtering,
   independent of collapse; hiding a card must not reduce counts or trigger an
   empty-list message. Truly empty groups still disappear as they do today.
7. Checking/unchecking moves the entry normally. Its destination follows that
   section/group's existing choice (or opens if new). Search reveals it either
   way. Group taps close any revealed swipe action and never edit, check or
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
- Search reveals collapsed needed/purchased groups, disables group collapse
  during search and restores prior choices on clear. Keep checkoffs and row
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

Recommend independent section/mode choices remembered only while this scoped
screen is mounted, and search forcing groups open with read-only headers.
Approve this behavior before implementation under the repository's feature-plan
review rule. If header toggles should also work during search, revise search
visibility/restoration behavior first rather than silently hiding matches.
