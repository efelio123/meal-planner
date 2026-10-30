# Shopping Category and Store headings — F04

Status: proposed October 29, 2026; awaiting Felipe's review. Planning only.
No application, API, schema, dependency, deployment or live-data changes.

Planning branch: `codex/shopping-group-headings-plan`, from clean `49b7848`
after Felipe accepted Shopping search and its keyboard-spacing correction.
Preserve accepted family-trial fixes, SDK 58, search and cleanup. After approval,
implement on a focused feature branch. No push/merge, native rebuild or Mac
trial deployment is included. Implementation ownership follows AGENTS.md unless
Felipe directly assigns implementation to this chat agent.

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

## Review decisions

Recommend **headings and counts without new collapse controls**, within both
existing sections, with missing-value groups last. Approve this scope before
implementation. If collapsing is desired now, revise this plan first to define
search reveal, counts, persistence and accessible controls together.
