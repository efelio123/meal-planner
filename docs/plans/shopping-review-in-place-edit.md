# Edit existing Shopping items without leaving review

Status: proposed October 31, 2026; awaiting approval before implementation.
Branch: `codex/personal-planning-ranges`, clean at `3692a74` before this plan.
Follow-up to `personal-planning-ranges.md`. Felipe says the reviewed range UI
looks good and reports this existing navigation problem. Broader device checks
and this repair are not yet accepted or implemented.

## Goal and current defect

In Review shopping needs, Edit under Already on Shopping must open the existing
Shopping item editor above the review. Save, Cancel or Remove returns directly
to the same review, with its range, scroll position and unaffected choices intact.

The current action calls dismissAll, then navigates to Shopping with editItemId.
That intentionally removes the review route. The reusable Shopping details sheet
also hardcodes Shopping-owned routes for Store/Unit pickers, choice Create/Manage,
and Edit Catalog item. Simply changing the first destination is insufficient.

## Affected areas and proposed repair

- Reuse ShoppingItemDetailsSheet/openShoppingDetails, with explicit navigation
  ownership for Shopping versus Plan; do not duplicate editor fields or save
  logic. Present it on a Plan-owned native sheet above the existing review.
- Resolve the referenced Shopping item within the current household/session,
  using the shared store and an authoritative item read as needed. Loading,
  missing/deleted items and Retry stay above the review; never fall back to an
  unrelated entry or silently change tabs. Disable repeated Edit taps/loading
  and Edit while review Add is submitting.
- Carry that navigation owner through nested Store/Unit pickers, Create/Manage
  choice screens and Catalog edit, including their own nested choices. Add thin
  Plan route wrappers around existing shared screens where required. Retain
  existing Shopping behavior as the default and accepted picker Back semantics:
  Manage/Create -> picker -> Shopping editor -> review, with drafts preserved.
- Keep Shopping mutations in the existing shared list owner so check state,
  amounts, removals and tab badge reconcile through the same command path.
  Ordinary Edit must not gain re-add intent or unexpectedly uncheck an item.
- On return, revalidate review matches and token in place. Preserve dates,
  expansions, scroll position, and checked/deselected needs and amount overrides
  whose identity and required quantity are unchanged and still eligible.
  Newly eligible needs after a removal use the returned default selection;
  newly matched needs cannot remain selected. Invalidate unsafe amount overrides
  if the required quantity/identity changes and explain the recalculation.
- Cancel never saves the item or clears review choices. Still reconcile any
  actual changes made in nested Catalog/choice pages. A return-time refresh must
  not trigger the existing initial-load selection reset simply because a native
  sheet hid/revealed the retained screen. Use one review reconciliation path.
- If revalidation fails, retain the review/drafts and offer Retry, with Add
  blocked until a fresh token exists. Ignore late loads, save/remove returns and
  nested results after dismissal, range, household, user or session changes.
  Save failure remains in the editor; do not close it or mark review refreshed.

## Important design decisions

Review stays a pushed `tab-stack` screen. Shopping details and pickers remain
accepted draggable native sheets, with their current single keyboard/inset
owner. Full manage/detail forms keep their native modal/stack frame and visible
Back component. Follow mobile AGENTS and `native-sheets-app-wide.md`; retain
final-action reachability and use shared chevrons/actions. No custom sheet
navigation, duplicate editor, API/schema/dependency change or trial deployment.

## Validation

After intended edits, run targeted actual-router tests for review -> Edit ->
Save/Cancel/Remove -> same review, custom range and unrelated manual amounts/
deselections/expansions retained. Cover repeated edits, expired/missing item,
load/save/revalidation failure and Retry, and stale callbacks after scope/range
changes. Verify ordinary Edit retains purchased state, fresh-token Add works,
and Shopping badge/list updates use the shared owner.

Exercise nested Store/Unit select/Create/Manage/Edit and Edit Catalog returns
from both Plan review and ordinary Shopping, including search/draft retention
and Back to the picker. Run relevant Shopping sheet/state and Plan regressions,
TypeScript, lint, whitespace and iOS JS export. No PostgreSQL rerun is required
unless API/data behavior is changed. Record actual results and unrun checks.

Felipe reviews the native phone flow, keyboard/final actions and scroll retention;
router tests do not prove native layout/drag behavior. Preserve the local servers
unless a restart is necessary. Mac trial, push/merge and deployment remain
separately authorized work.

## Open questions

None needed to define the proposed behavior. Approve this focused navigation
repair before implementation; changing the selected review range continues to
use F11's separately approved reset behavior.
