# Edit existing Shopping items without leaving review

Status: approved October 31, 2026. Felipe explicitly requests direct implementation.
Branch: `codex/personal-planning-ranges`, clean at `3692a74` before this plan.
Follow-up to `personal-planning-ranges.md`. Felipe says the reviewed range UI
looks good and reports this existing navigation problem. The reviewed range UI is accepted at that scope. This repair is implemented;
phone acceptance and broader device checks remain pending.

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

None. Felipe approved this focused navigation repair; changing the selected review range continues to
use F11's separately approved reset behavior.


## Implementation - October 31, 2026

The shared Shopping details editor accepts an explicit Plan/Shopping route owner,
retaining Shopping as its default. Plan has thin native sheet, Catalog edit and
choice-management wrappers around existing shared screens. Store/Unit pickers,
Create/Manage/Edit and Catalog's nested choices stay on the Plan stack. No editor,
Catalog form, command owner or sheet gesture implementation is duplicated.

A small review-owned loader resolves the exact Shopping item authoritatively
before initializing the shared editor. It retains the resolved draft while
nested native pages hide/reveal it and handles missing/load-failure rows in place.
Legacy rows without a Catalog link show an explicit close/retry state rather than
silently switching tabs; the ordinary Shopping editor already requires that link.
Save/Remove use existing shared Shopping commands and preserve purchased state.
Pending mutation and active/scope guards reject duplicate or late navigation.
Ordinary removal remains immediate, including while metadata is loading.

The retained review uses actual sheet removal plus focus to revalidate on return,
including Cancel after nested edits. A single reconciliation helper preserves
unchanged eligible selections/deselections, adjusted amounts and expansions,
applies defaults to newly eligible needs and removes newly matched selections.
It clears unsafe overrides with an explanatory notice. Range changes still reset
as approved for F11. A failed refresh retains the draft and blocks Add pending
Retry with a fresh review token. No scroll reset or review route reconstruction
is introduced; native scroll geometry still requires phone review.

Official references checked against the existing Expo Router 58 / React 19.3
implementation: [Router modals](https://docs.expo.dev/router/advanced/modals/)
and [Activity lifecycle](https://react.dev/reference/react/Activity). In particular,
hiding a retained screen can disconnect its effects without discarding its state;
initial-load effects must not reset selections merely on reveal.


## Validation and review handoff

Final affected coverage: 32 suites / 497 tests pass, with no skipped cases across
the broad validation and complete Plan-router rerun. The broad rerun passed the
other 31 suites / 447 tests; its one remaining failure was a new test using Save
store instead of the existing Create label. After correcting only test labels,
all 50 Plan-router cases passed. This supersedes an earlier single-case probe
whose other 49 cases were unrun. TypeScript, mobile lint, whitespace and iOS JS
export pass. Full mobile and PostgreSQL suites were not rerun for this frontend
repair; the F11 full results are historical, not validation of these later edits.

Coverage includes same-review Save/Cancel/Remove with a custom range, unrelated
manual amount/deselection/expansion retained, purchased state preserved, fresh
review Add, missing matched item, failed Save and revalidation/Retry, late Save
after Cancel, nested Store manage/edit/create, new Unit retained, and Catalog
edit with its own Store picker. Existing Shopping/Recipes/Catalog routing and
native sheet options also pass. The initial run caught an unintended wait for
metadata before ordinary removal; its immediate behavior was restored. Other
initial failures were test fixture timing/queries and the new layout router mock.

Expo and LAN API health were verified. Neither server was restarted, no database
or API/schema/dependency changed, and no Mac trial runtime, installed app, hosted
CI, push/merge or deployment was changed. Native iPhone/Android geometry, drag,
keyboard and exact scroll-position retention remain for physical review. Felipe
owns this follow-up acceptance: edit multiple Already on Shopping rows, try Save,
Cancel, Remove and a nested Store/Catalog page, and confirm the review stays open
with the same dates and unaffected choices.


## Small amount-entry follow-up - October 31, 2026

Felipe requests `.5` in Shopping item edits, normalized to `0.5`. The shared
Shopping amount helper now validates complete leading decimals after normalization;
the editor normalizes on blur and in its save payload, retaining an editable raw
draft while typing. Both Shopping and review entry points reuse this behavior,
including Save before blur. Blank values/fractions are retained; zero, incomplete
and malformed decimals remain invalid. No numeric conversion/rounding or API
change is introduced. This is a small self-contained repair, not a new feature.
All 3 targeted suites / 72 tests, types, lint, whitespace and iOS JS export pass.
Earlier full/broad results predate this follow-up. PostgreSQL/full mobile and
physical-device acceptance were not rerun; no runtime, data or dependency change.


Phone review: Felipe reports "Okay this looks good" after `0777deb`. The reviewed
leading-decimal amount-entry fix is accepted on his phone. This does not imply
completion of every in-place navigation checklist case, Android testing, hosted
CI, native rebuilds or trial deployment. No runtime or data changes accompany
this acceptance record.
