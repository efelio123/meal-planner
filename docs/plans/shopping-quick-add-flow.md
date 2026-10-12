# Shopping quick add and tall sheets

Status: approved by Felipe in the October 9, 2026 request, implemented, and
merged into `main` with Shopping v1. Felipe accepted the current iPhone picker
layout and repeat-add flow; the full manual regression checklist remains open.

## Goal

Make adding an existing Catalog item to Shopping a two-tap task: open Add,
then select the item. Create a Shopping row with amount `1` and that item's
current Catalog shopping unit and preferred store. Keep adjustments in the
existing Edit item sheet, not an intermediate Add details sheet.

## Affected areas and behavior

- Shopping Catalog picker: open at its tallest native detent. Keep its title,
  Cancel action, and search above a scrolling Catalog list. Keep the
  **Create item in Catalog** action in a footer below that list and above the
  keyboard. Add a top-right `+` beside Cancel that invokes the same Catalog
  create route. Both actions remain accessible while a long result list
  scrolls. Tapping an item not on the list immediately calls the
  existing Catalog-backed Shopping API with `amount: "1"`; omit unit/store
  overrides so the API inherits the Catalog defaults. Show progress, prevent
  a second tap during the request, and keep the picker, query, and keyboard
  open after success so another item can be added. Mark the item On list,
  show a brief confirmation, and provide Done to close the picker. Show an
  inline error and allow retry if the request fails. A stale duplicate
  response must not create another row; refresh the list and offer Edit.
- Existing row: tapping an **On list** result opens its Edit item sheet rather
  than submitting an Add request. Creating a new Catalog item from Shopping
  returns to Shopping and adds that item with the same quick-add defaults;
  creation alone must not silently be reported as a Shopping success if the
  follow-up Add fails.
- Details and choices: the Shopping Add/Edit details route opens at its
  tallest detent, including the existing-row Edit sheet. Unit selection opens
  at its tallest detent. Keep Add unit anchored outside the choice list and
  above the keyboard while searching; retain the Store selector's medium
  initial detent, as previously requested. All sheets remain draggable native
  form sheets and keep explicit close/back paths.
- State safety: bind an in-flight add to the signed-in user, session, and
  household. Ignore a late response after that scope changes; never show an
  old household's result. Keep the main list responsive and avoid a whole-page
  loading spinner for the quick add. Preserve Catalog editing, unit/store
  creation, and Shopping edit behavior from the preceding follow-up.

## Design and technical decisions

The saved `shopping-catalog-picker.png` governs the picker hierarchy; its
bottom Create action is retained below the result list and kept above the
keyboard. The header `+` is an intentional addition for faster creation.
Shopping rows retain the reference's right chevron to show they open Edit.
`shopping-edit-details.png` remains the Edit reference. The old
`shopping-add-details.png` is retained as historical design but is no longer
the normal Add flow. Reuse the native sheet registry and existing API contract;
no new dependency, migration, or backend endpoint is needed. The API already
enforces a canonical item and inherits Catalog unit/store when those fields
are omitted. If an inherited choice was archived, surface the API failure
rather than silently changing a shared Catalog preference.

## Validation

Complete code and test edits before running checks. Then run focused actual-
router/state tests for fast Add, existing-row Edit, duplicate/failure handling,
Catalog creation return, and sheet detents/keyboard-safe actions; run the
mobile suite, TypeScript, lint, and whitespace check. No database suite is
required without backend changes. On a phone, compare picker/Edit to the
saved references and verify keyboard-open Create/Add unit visibility, slow and
fast drag, full-height opening, and no clipped header/footer. Record any
unverified device behavior rather than claiming native parity from Jest.

## Open questions

None blocking. The exact native tallest detent may leave a small system margin
by platform; it should be the highest allowed sheet height, not a full-screen
stack page.

## Implementation and validation record

The picker now opens at its tallest native detent, with header Create and
Cancel actions, search, a scrolling result list, and a keyboard-aware Create
Catalog item footer below the results. Selecting an unlisted item sends amount `1` and no
unit/store override, then inserts the returned canonical Shopping row without
reloading the whole page. An item already on the list opens Edit. Concurrent
duplicate, failure/retry, and newly created Catalog-item return paths are
covered in tests. Shopping Details and Unit open tall; Store retains its
medium opening detent. The shared choice sheet keeps Add unit outside the
scrolling choices and within its keyboard-avoiding container.

The full mobile run passed **47 suites / 309 tests**. Focused reruns passed
after test timing adjustments; TypeScript, lint, and `git diff --check` passed.
The first full run exposed outdated Edit-flow timing and assertion assumptions
in tests; after correcting them, the complete rerun passed. No backend or migration
code was changed for this follow-up, so PostgreSQL tests were not run.
No iPhone or Android running-screen comparison was performed in this turn;
native detent motion and keyboard-open footer positioning still need device
acceptance. The work is uncommitted and unpushed.

## Phone follow-up

The first iPhone run exposed two issues the automated checks did not catch.
The picker used a nested results scroller; on the device, its rows painted over
the title and search. It now uses one scroll surface with title and search in
its sticky first child, followed by the results; the Create action sits in a
keyboard-avoiding footer outside that scroller. A focused test checks the
hierarchy and tap handling; the rendered iPhone result still needs rechecking.
The preceding focused picker suite passed **6/6**, TypeScript, mobile lint,
and `git diff --check` passed. That result predates the footer move and row
chevrons; their post-change checks are recorded separately after validation.

The API process listening on local port 8000 currently advertises an older
Shopping add contract requiring `name`. This branch's app and API instead use
`catalog_item_id`, so that running process returns HTTP 422 for a quick add.
Do not fall back to name-based Shopping entries: restart the user-owned API
process on the current branch, then recheck the two-tap add on the phone.

Felipe then requested the Create action below the picker list, as shown in the
saved reference, while keeping it above the keyboard. The picker now has one
scrolling results surface and a sibling footer within a keyboard-avoiding
container. The header `+` remains. To buy and Purchased rows now show a small
right chevron inside the existing Edit target. Focused Shopping tests passed
**2 suites / 15 tests**; TypeScript, mobile lint, and `git diff --check` passed.
Native footer positioning with the keyboard open and the chevron appearance
remain for physical-device review. No backend or database tests were needed for
this UI-only follow-up. The work remains uncommitted and unpushed.

Felipe's next iPhone screenshot showed that wrapping the Shopping picker in a
keyboard-avoiding view made the entire scroll content blank, leaving only the
Create footer. That device result supersedes the preceding footer-validation
claim. The picker has returned to the previously rendering root ScrollView,
with the footer as its third child after the results. iOS automatic keyboard
insets keep the footer reachable above the keyboard when scrolled into view;
the header `+` remains immediately available. This avoids a second nested
scroller or a non-scroll root wrapper. The restored native rendering and the
keyboard-open footer still require another iPhone check. The focused Shopping
tests passed **2 suites / 15 tests** after this correction; TypeScript, mobile
lint, and `git diff --check` also passed. These checks do not establish native
visual acceptance.

Felipe's keyboard-open iPhone check then showed that inset adjustment alone
left the bottom Create action behind the keyboard. The single root scroll
layout remains; when the search keyboard opens, the picker scrolls its footer
into the visible area, and keeps it there when the filtered content size
changes. It stops auto-scrolling after the keyboard closes. This preserves
Create below the list rather than moving it into the sticky header or adding
a second keyboard accessory. Physical iPhone confirmation remains pending.

Felipe's next check showed that this auto-scroll hid the first search results.
The auto-scroll is removed. The picker now has a non-collapsing native root,
fixed title/search and Create footer, and only the results area scrolls. A
keyboard-avoiding footer moves the Create action above the keyboard while
leaving search results at their current position. This differs from the
earlier failed whole-sheet keyboard-avoiding wrapper, which blanked the list
on iPhone. The updated component test checks the three sibling regions and
filtered results; the keyboard-open layout and native sheet rendering still
require Felipe's physical iPhone confirmation. Focused Shopping tests passed
**2 suites / 16 tests**; TypeScript, mobile lint, and `git diff --check`
passed. The test renderer still emits non-failing React `act` warnings in the
existing asynchronous add/error cases. No backend or database tests were run
for this UI-only correction.

Felipe's keyboard-open iPhone screenshot showed that the fixed footer still
sits behind the keyboard. The picker keeps its fixed header, independent
results scroller, and fixed Create footer, but no longer relies on the footer's
`KeyboardAvoidingView`. It now measures the actual native sheet's bottom
against the keyboard frame and adds only their overlap below the Create row.
This should put the action immediately above the keyboard without scrolling
away the first matching item, while avoiding a double offset if a platform
already resizes the sheet. The calculation is reset when the keyboard hides
and remeasured if the sheet changes size. The final iPhone keyboard-open
position still needs a physical recheck. Focused Shopping tests passed **2
suites / 17 tests**; TypeScript, mobile lint, and `git diff --check` passed.
The existing asynchronous Shopping tests continue to emit non-failing React
`act` warnings. No backend or database behavior changed.

Felipe's next iPhone screenshot showed that the measured overlap moved the
footer somewhat but still left it behind the keyboard. On iOS, the search
field now links to a native `InputAccessoryView` containing the Create action,
so the keyboard itself owns the keyboard-open control position. The normal
footer remains below the results for keyboard-closed use, and the header `+`
remains available. The overlap calculation remains for Android only. This is
still pending physical iPhone verification, including React Native's documented
bottom-tab-bar limitation for keyboard accessories; component tests cannot
establish the native position. The focused Shopping sheet suite passed **9/9**,
and TypeScript, mobile lint, and `git diff --check` passed. The suite still
emits its existing non-failing asynchronous React `act` warnings. No API or
database behavior changed.

The Catalog item form opened from Shopping could not scroll its final
“Create & add to Shopping” action above the iPhone tab bar. The shared form
now requests the established native-tab bottom inset, as the Shopping needs
page already does. The related screen-layout suite passed **14/14**, and
TypeScript, mobile lint, and `git diff --check` passed. Physical iPhone
confirmation remains pending.

For the shared Catalog item form, Category and Typical shopping unit now open
at the tall native sheet detent (94%); Preferred store opens at the medium
detent (58%). All three retain both detents so the user can drag between them.
Because Catalog and Shopping use the same form component, these starting
heights apply to both entry points. The focused picker suite passed **6/6**;
TypeScript, mobile lint, and `git diff --check` passed. Native iPhone and
Android starting heights remain for device confirmation.

Closeout follow-up (October 12, 2026): The picker now stays open after a
successful quick add, briefly confirms the addition, marks that result On
list, and offers Done. Felipe accepted the current iPhone keyboard/footer
position and repeat-add experience. Earlier failed layout attempts above are
retained as historical diagnosis, not current behavior. Android and the
remaining manual regression scenarios are not yet recorded as passed.
