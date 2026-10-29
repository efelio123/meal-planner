# Shopping list search — F05

Status: approved and implemented October 29, 2026. Felipe directly assigned
implementation to the chat agent. Physical review remains pending. No API,
schema, dependency, deployment or live-data changes.

Planning branch: `codex/shopping-search-plan`, from clean `c2b6b00` after
Felipe accepted F03 purchased-only cleanup. Preserve the accepted family-trial
fixes and SDK 58. Implemented on `codex/shopping-list-search` from clean
`3c991d6`. No push/merge, native rebuild or Mac trial deployment is included.

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

## Approval and implementation

Felipe approved the name-only, Store-aware search and Purchased-match behavior,
and directly requested implementation. Household-wide clear actions retain
F03's accepted scope, with the hidden-item caption clarified as planned.

Search stays local to ShoppingListScreen; source items, row IDs, mutation paths
and API requests are unchanged. The field follows Recipes' existing visual
pattern and uses a cross-platform Clear search action. Purchased's collapse
preference is preserved while search temporarily exposes matches.

For keyboard reachability, the existing measured KeyboardAwareSheet wrapper
now accepts optional `enabled` (default true, preserving all sheet callers).
Screen owns that measured frame inside its native safe-area boundary via a
stable `inlineKeyboardActive` boolean; Shopping activates it only for its
focused input. Blur, tab/sheet departure
and household/session changes remove those subscriptions and derive zero
clearance; old measurements are invalidated. Existing native tab insets and
Screen's sheet-keyboard protection remain unchanged. No second ScrollView or
guessed keyboard/tab padding was introduced.

## Validation results — October 29, 2026

- **274 tests across 8 targeted mobile suites pass**, no skips, across the
  coordinated pass and affected-suite reruns: Shopping screen/hook/swipe,
  API client, actual-router startup/navigation, measured keyboard clearance,
  Screen layout and ChoicePicker. Final four affected suites pass 180 tests;
  the other four passed 94 in the coordinated run and were unchanged afterward.
- Covers case/trim/substring and Household names; excluding non-name fields;
  Store/No store intersections and every existing sort; matching section counts,
  purchased-only visibility/restoration, clear/blank/no-results states, scoped
  query preservation, checkbox/removal/refresh and household-wide cleanup.
- Real routes cover Add/re-add and independent Catalog search, tabs, Details
  cancel/save and Store/Sort return; a late refresh cannot repopulate a new
  household and household/session changes clear the query. Keyboard tests
  cover opt-in/removal, late measurements and existing sheet defaults. Swipe
  tests keep the accepted behavior; search itself closes any revealed action
  without consuming the next intentional checkbox tap.
- TypeScript, Expo lint and whitespace checks pass. Initial test failures were
  fixture issues (missing theme-mode mock, obsolete testing-library helper,
  picker accessible close name, and an unscoped query across mounted tabs).
  Replaced the obsolete helper with subscription-lifecycle assertions and
  scoped the route query to Shopping. Lint caught an unnecessary synchronous
  effect state reset in the new opt-out branch; removed it because disabled
  clearance is derived during render. Relevant checks were rerun successfully.
- Official guidance consulted against installed Expo 58.0.19 / RN 0.88.0:
  [SDK 58](https://docs.expo.dev/versions/v58.0.0/),
  [TextInput](https://reactnative.dev/docs/textinput),
  [ScrollView](https://reactnative.dev/docs/scrollview), and
  [Keyboard](https://reactnative.dev/docs/keyboard).
- **Unrun:** full mobile suite, hosted CI, database suite (UI-only change),
  physical iPhone/Android review, native builds and deployment. Earlier full
  suite/database results remain historical. The Mac trial runtime/data and
  other working copies were untouched.

## Device review before acceptance

Search for a needed item and check several matches quickly with the keyboard
open. Search for a purchased item after collapsing Purchased, then clear search
and confirm the prior collapse is restored. Try Store + search, a no-match
query, edit/save/cancel, Add/re-add and tab return. Verify the query remains,
and that search/filter-hidden rows are still covered by the two clear actions.
On long and short lists, scroll the last result/action above the keyboard and
navigation, release the scroll, then dismiss the keyboard and return from a
sheet: no snapping, lingering bottom space or clipped actions. Compare Recipes'
search field and check larger text in the current theme. Automated results do
not establish native geometry, swipe feel or Android acceptance.


## Phone review follow-up — keyboard gap, October 29

Felipe reports search mostly looks good, with a black strip above the keyboard.
The first implementation wrapped Screen in the measured keyboard frame. The
iOS native tab SafeAreaView reads its ancestor provider's insets even when its
own frame is reduced, leaving the tab/home-indicator allowance inside the
already keyboard-cleared area. Source inspection of installed
react-native-screens 4.30.0 confirmed that provider-based behavior.

Moved the opt-in keyboard frame **inside** Screen's safe area, around its body
and optional footer. The viewport is measured after native insets, so only the
actual remaining overlap is cleared. Other pages keep their default structure;
Shopping always passes its focus boolean, preserving scroll identity across
focus changes. The measured owner disables automatic scroll keyboard insets
for opted-in pages and no fixed offsets or native configuration changed.

Validation: **179 tests / 4 targeted suites pass**, no skips: Screen layout,
measured keyboard clearance, Shopping screen and actual-router navigation.
Regressions place the measured frame below the safe-area owner, keep the same
scroll instance through focus/blur, and simulate top 70/bottom 84 insets in an
844-point window: a keyboard at 500 needs 260 points cleared from the inner
viewport, leaving its content boundary exactly at 500. TypeScript, Expo lint
and whitespace pass. The earlier 274-test result predates this correction;
full mobile suite, physical retest, Android/native builds, hosted CI and database
checks remain unrun for this UI-only follow-up. No API or Mac runtime/data change.

Phone retest: focus Shopping search and confirm the list reaches the keyboard
without the black strip; scroll to the final row/action, dismiss the keyboard,
and open/return from Add or Edit to check for clipping or lingering gaps.
