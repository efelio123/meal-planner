# Shopping list search — F05

Status: proposed October 29, 2026; awaiting Felipe's review. Planning only.
No application, API, schema, dependency, deployment or live-data changes.

Planning branch: `codex/shopping-search-plan`, from clean `c2b6b00` after
Felipe accepted F03 purchased-only cleanup. Preserve the accepted family-trial
fixes and SDK 58. Implementation needs approval and a focused feature branch;
no push/merge, native rebuild or Mac trial deployment is included.

## Goal

Find an item in a long Shopping list and check/uncheck it quickly, without
losing the current search, Store selection or sorting.

## Proposed experience and decisions

1. Add **Search shopping list** below the Shopping title and above Store/Sort.
   Match the Recipes search field's themed surface, border, magnifying-glass
   icon and sizing, using ThemedInput and existing symbols. Include an
   accessible, cross-platform Clear search button when there is text; no
   autofocus or new dependency. Keep the header's Add action unchanged.
2. Search **item names only** with the existing app convention: trimmed,
   case-insensitive substring matching. Whitespace-only input means no search.
   Do not search amounts, stores or category names in this first version;
   Store already has a dedicated filter. No fuzzy matching or API requests.
3. Compose search with the selected Store, then apply the existing sorting and
   split results into To buy/Purchased. Counts describe matching rows within
   that Store, consistent with today's Store-filtered counts. Typing must not
   change Store/sort or fetch the list again.
4. Search both purchased and needed entries. During a nonblank search, show
   matching Purchased rows even if that section was previously collapsed.
   Render its heading without a collapse action/chevron while search is active;
   restore the user's previous expansion choice when search clears. A matched
   item moves between these sections when checked/un-checked and remains
   findable under the same query. Do not hide a purchased-only match behind a
   closed section or silently change the saved expansion preference.
5. If no rows match, show **No items match your search.** If a Store filter is
   active, also suggest trying another name or changing that filter. Do not
   display the ordinary 'Nothing to buy yet' message or duplicate empty-state
   messages as if the household list were empty. Keep errors/loading distinct.
   Clearing search restores normal empty and Purchased states.
6. Retain the query through check/uncheck, edit/save/cancel, swipe deletion,
   Add/re-add, pull-to-refresh, ordinary tab navigation and F03 cleanup while
   this scoped screen stays mounted. Household/user/session changes clear the
   query alongside existing Store/sort state. No persistent storage is needed.
   Add's Catalog search stays independent; this is not another F08 name seed.
7. Checking, editing and swiping use the existing row IDs and mutation paths.
   Search changes/focus/clear close any revealed swipe, without changing the
   accepted 65% full-delete behavior or suppressing the next intentional tap.
   Keep rapid independent checkoffs and existing pending/bulk guards intact.
8. Both clear actions keep F03's **whole household, all Stores** scope, even
   when search matches nothing. Eligibility uses the full loaded list, never
   search results. Clarify the existing action-area caption to **Applies to all
   stores, including hidden items.** Retain their explicit confirmations and
   server behavior; search must never narrow bulk deletion silently.

## Source findings and affected areas

- `features/shopping-list/shopping-list-screen.tsx` currently owns Store/sort,
  Purchased expansion, scope resets, row actions and local rendering. The hook
  owns the full list, mutations, pending flags and refresh. Keep search in the
  presentation layer; it must not rewrite the source list or mutation inputs.
- Reuse the existing Recipes search treatment and themed input. A small pure
  Shopping filter helper/test under `features/shopping-list/` is appropriate
  if it makes composition clearer; no generic shared directory or unrelated
  screen refactor. Tests stay outside `src/app/`.
- Continue the **tab-root Screen** safe-area contract and one scrolling owner.
  Its existing handled-tap policy supports checkbox taps with the keyboard up;
  drag dismisses it. Submit search dismisses the keyboard without clearing text.
  Before presenting Add/Edit/Store/Sort sheets, dismiss the inline keyboard and
  preserve the query. Do not enable keyboard insets for every tab root: Screen
  deliberately avoids stale sheet-keyboard insets. Check lower result/action
  reachability with this inline field; if additional keyboard handling is
  required, make it opt-in to Shopping's inline input with a single owner, and
  test keyboard dismissal/return from sheets. No guessed keyboard/tab padding,
  nested result ScrollView, or layout rewrite.
- No API, schema/migration, dependency, authentication or permission changes.
  Category/Store group headings (F04), badges, pagination, offline storage and
  a shared app-wide search redesign are separate slices.

## Validation after the complete implementation

- Screen/helper tests: case/substring/trim/blank behavior, Food and Household
  names, Store intersections/No store, all existing sorts, both sections and
  accurate result counts. Purchased-only search reveals matches then restores
  prior expansion; no-results copy differs from an empty household.
- Preserve query/filter/sort after check/uncheck, refresh, removal and cleanup.
  Verify F03 remains all-list scope with zero visible matches. Clear search
  restores rows; no search-triggered GET or API-side filtering.
- Actual-router tests: search -> edit -> Back/save and Add/re-add -> return
  preserve the query and drafts; household/session changes clear it and stale
  responses do not populate another scope. Exercise checkbox taps while the
  input is focused, clear control, swipe-close behavior and pending/bulk guards.
- Targeted Shopping/client/router/swipe regressions, TypeScript, Expo lint and
  whitespace checks. No database suite for this UI-only slice; broaden only if
  implementation changes server/data behavior. Consult current official Expo
  SDK 58 / React Native 0.88 guidance against installed versions before coding.
- Device review: long/short/empty lists, keyboard open/closed, quick multi-item
  checkoff, purchased-only/no-match searches, sheet return, pull-to-refresh,
  larger text and final actions fully reachable above navigation/keyboard after
  scroll settles. Compare Recipes and Shopping search appearance in the current
  theme. Report physical iPhone/Android checks as unrun until actually tested;
  automated checks do not prove native geometry or swipe feel.

## Open decisions for review

Recommend name-only matching, respecting Store, and automatically revealing
Purchased matches during search. No blocking product questions beyond approval
of this scope. Household-wide clear actions retain their already accepted scope.
