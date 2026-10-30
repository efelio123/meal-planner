# Shopping Category and Store headings — F04

Status: approved and implemented October 30, 2026. Felipe directly assigned
implementation to the chat agent. Felipe accepted the reviewed headings
October 30 and requested collapsible headers as a separate follow-up. Individual
device cases and Android acceptance are not inferred. No API,
schema, dependency, deployment or live-data changes.

Planning branch: `codex/shopping-group-headings-plan`, from clean `49b7848`
after Felipe accepted Shopping search and its keyboard-spacing correction.
Accepted family-trial fixes, SDK 58, search and cleanup are preserved.
Implementation branch: `codex/shopping-group-headings`, from clean plan commit
`44c334c`. No push/merge, native rebuild or Mac trial deployment is included.

## Goal

Make Category and Store sorting easy to scan: users should be able to tell
which group each item belongs to without opening its details.

## Proposed experience and decisions

1. Keep the current **To buy** and **Purchased** sections. Inside each section,
   Category sort adds category headings; Store sort adds Store headings.
   Alphabetical A-Z/Z-A and Recently added retain today's flat lists.
2. Each heading shows its name and a small item count, followed by that group's
   existing bordered item card. Use secondary text smaller than the main section
   titles, consistent with the app's existing group labels. Category emoji may
   appear when already supplied by the API, using EmojiText; Store headings are
   plain text. No new icons or differing row/control styles.
3. **Recommend headings only in this first pass.** No per-category/per-Store
   collapse controls or chevrons. Retain Purchased's existing collapse behavior
   and automatic matching-row reveal during search. This avoids introducing
   another way to hide items while shopping. Group collapsing can be a later
   focused change if family testing shows it would help.
4. Order named groups alphabetically and items A-Z within each group. Put
   **No store** last in Store mode. In Category mode put **Uncategorized food**
   and **Uncategorized household** last, when applicable. This intentionally
   moves missing values from today's unlabelled first position to the end.
5. Group by real category/Store identity, not by display name. Food and Household
   categories remain distinct. If category names collide, qualify the headings
   as e.g. **Pantry (Food)** and **Pantry (Household)**. Determine collisions from
   the full loaded household list, so checking, searching or filtering does not
   unexpectedly rename an existing heading. Missing category/type metadata must
   still retain the row in a safe generic **Uncategorized** fallback; missing
   Store references similarly remain visible. Never drop an item for grouping.
6. Apply the current Store filter and name-only search before building visible
   groups. Show only nonempty groups; their counts describe matching entries
   in that To buy/Purchased section. Main section counts keep their existing
   meaning. In Store mode with one Store selected, keep that Store's heading
   for consistent context. Search continues to match item names, not headings.
7. Checking/unchecking moves the same entry to the corresponding group in the
   other section. Its empty former group disappears. Refresh/edit/rename/delete
   rebuild headings from current data while retaining valid Store, Sort, query
   and Purchased state. No new persistent collapse state or saved setting.
8. Retain row checkboxes, edit arrows and accepted swipe behavior, including
   65% full deletion, tap suppression and closing revealed actions when Sort,
   Store or search changes. Reuse the existing card/border and renderRows path
   per group: separators stop at each group's last row, without stacked borders
   or a different Delete action. Bulk cleanup stays household-wide across all
   groups, hidden search results and Stores, with existing captions/confirmations.

## Source findings and affected areas

- ShoppingListScreen currently sorts by category_name/store_name and renders one
  card for To buy and another for Purchased. Its existing Store/search pipeline,
  counts and scoped state should remain the presentation owner.
- ShoppingListItem already includes category ID/name/emoji, item type and actual
  Shopping Store ID/name. Use the entry's Store, not its Catalog preferred Store.
  The current API joins supply these fields; no extra Catalog requests or server
  grouping is required. Metadata updates arrive via existing refresh paths.
- Add a small pure grouping/ordering helper and tests under
  `features/shopping-list/`, and adapt the screen to use it for Category/Store.
  Use one rendering path for grouped To buy and Purchased; leave ordinary sorts
  alone. Keep helpers/tests outside `src/app/`; no generic shared directory or
  app-wide list refactor. Close any active swipe before changing group modes.
- Keep Screen's `tab-root` contract and focused `inlineKeyboardActive` ownership
  introduced by the accepted gap fix. One scrolling owner; no nested group lists,
  sticky headers, fixed padding, keyboard changes or new sheets.
- No API/schema/migration, dependencies, authentication or permission changes.
  Ingredient ordering (F01), planned-meal swipes (F06), badges and group collapse
  are separate features. Consult current official docs against installed Expo
  58/RN 0.88 before implementation; no package upgrade is proposed.

## Validation after the complete implementation

- Helper/screen tests: Category/Store grouping, identity-based separation,
  same-named Food/Household categories, emoji/fallbacks, missing metadata,
  alphabetical group/item order and missing-value groups last. Ensure each row
  appears exactly once and ordinary sort modes have no subgroup headings.
- Search + Store intersections, visible counts, no empty group cards, no-match
  states, Purchased collapse/search reveal, and stable labels when searching or
  checking items. Preserve query/filter/sort after refresh, edit and cleanup;
  household/session changes retain existing scoped resets and stale-result guards.
- Reuse existing Shopping hook/swipe/client coverage. Add actual-router cases
  for choosing Category/Store, checking an item into Purchased, editing its
  Shopping Store and refreshing changed category metadata. Verify proper return
  navigation, unchanged row identity/amount/unit, and household-wide cleanup
  even when only one group is visible.
- Run targeted grouping/Shopping/router/swipe tests, TypeScript, Expo lint and
  whitespace checks after implementation. No database suite for this UI-only
  change; broaden if actual implementation changes API/data behavior.
- Phone review in current appearance: long/short/mixed Food/Household lists,
  group labels/emoji/counts, No store/uncategorized rows, search with keyboard,
  rapid checkoffs and Purchased collapse, short/full swipe and border appearance,
  edit/refresh return and last row/clear actions above keyboard/navigation after
  scroll settles. Compare related group labels and larger text. Report unrun
  physical/Android/native-build checks explicitly; tests do not prove geometry.

## Approval and implementation

Felipe approved the proposed scope and directly requested implementation on
October 30. Headings/counts are shown within To buy and Purchased for Category
and Store modes only. New group collapse is deferred; Purchased keeps its
accepted collapse/search-reveal behavior. Missing-value groups come last.

- Added the pure `shopping-list-groups.ts` helper under the Shopping feature.
  It uses real category/Store IDs, preserves each row object, sorts by displayed
  group name then item name, and distinguishes colliding Food/Household category
  labels using the full loaded list. Same-named Stores retain separate IDs.
- Metadata fallbacks keep every row visible. A Store ID with no label appears
  as Unknown store; absent Store IDs appear under No store last. Categories
  without a usable name/ID use the applicable uncategorized label, retaining an
  existing ID when present; missing item type uses generic Uncategorized.
- Both sections share the existing card/row rendering path. Small semibold
  secondary labels follow the existing group-label treatment; category emoji
  use EmojiText. Accessible headers announce name/count without implying an
  action. Separators stop at each group's final row and cards retain one border.
- No hook/API, schema, dependencies, keyboard ownership, or native-sheet changes.
  Normal sorts, filter/search state, exact row mutations, swipe controls and
  household-wide cleanup are preserved.

## Validation results — October 30, 2026

- **256 tests across 6 targeted mobile suites pass**, no skips: grouping helper,
  Shopping screen/hook/swipe, actual-router navigation and API client. The final
  affected 3 suites pass 174 tests; the other 3 passed 82 in the coordinated run
  and were unchanged afterward.
- Helper/screen coverage includes identity separation, Food/Household label
  collisions, alphabetical names with IDs deliberately out of order, missing
  metadata, source-row preservation, actual Shopping Store vs Catalog default,
  fallback groups last, counts, emoji, per-card separators, flat modes, search
  and Store intersections, Purchased reveal/restoration, checkoff movement,
  metadata refresh and whole-household cleanup under a narrowed visible list.
- Actual-router coverage selects Category/Store, checks/unchecks a row, edits
  its Store while preserving ID/amount/unit, refreshes a renamed category under
  search, and clears hidden purchased rows without clearing needed entries.
  Existing navigation/scope/keyboard and swipe regression cases remain passing.
- TypeScript, Expo lint and whitespace checks pass. Initial validation found
  one test querying a decorative emoji intentionally hidden from accessibility;
  corrected the query to include hidden decorative elements. Final review moved
  ordering after category qualification so displayed labels determine order,
  with a reversed-ID regression. Relevant checks were rerun successfully.
- Consulted [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) and
  [React Native Text/accessibility](https://reactnative.dev/docs/text), checked
  against the installed SDK 58 / RN 0.88 baseline. No new library was needed.
- **Unrun:** full mobile suite, database/API suites (UI-only change), hosted CI,
  physical iPhone/Android checks, native builds and deployment. Earlier full
  results remain historical. Mac trial runtime/data and other worktrees were
  untouched. Tests do not establish native spacing, reachability or swipe feel.

## Device review before acceptance

Choose Category and Store in Sort. Check headings/counts in both sections,
category emoji, alphabetical ordering and missing-category/No store placement.
Check several items quickly, collapse Purchased, search for a purchased match,
clear search and verify the prior collapse returns. Try Store + search, edit
an entry's Store, refresh and clear purchased while some rows are hidden. Swipe
short/full distances and inspect group/card borders. On long/short lists and
larger text, confirm the final row and clear actions stay above navigation and
the keyboard after scrolling settles. No added group collapse controls are
expected in this version.


October 30 review: Felipe reports "That looks good" and accepts the reviewed
headings, then requests header-tap collapsing. The follow-up in
`shopping-group-collapse.md` was revised to allow toggles during search, approved
and implemented October 30 on `codex/shopping-group-collapse`. It passes 281
targeted tests, types and lint. Felipe subsequently accepts the reviewed
collapsing behavior October 30; broader device cases are not inferred.
This supersedes the headings-only limit for the current implementation.
