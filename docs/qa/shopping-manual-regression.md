# Shopping v1 physical-device regression checklist

Status: partial iPhone review completed; the complete checklist remains open.
Felipe accepted the current picker layout and keyboard-safe Create action,
repeat-add flow, rapid checkoffs, and two-stage swipe feel on October 12,
2026. Individual checks below have not all been recorded as Pass, and Android
and two-device checks remain unverified. Record device/OS, app build or reload
time, date, and Pass/Fail/Not run for each scenario. Test the current theme;
reserve a dedicated light/dark comparison for a major deployment.

Use a test household or disposable QA Catalog items where practical. Do not
clear a household's real Shopping list just to complete this checklist.
Compare the Shopping screen and sheets with the approved images in
`docs/design/shopping/`, and compare common actions with Catalog and Recipes.
Capture a screenshot and the exact action sequence for any failure.

## Core flow

1. **Open Shopping.** The title, subtitle, `+`, Store and Sort controls, To buy,
   Purchased, and counts are visible without clipped text or overlap with the
   status bar or tab bar. Scrolling through a short and long list works, including
   gestures started in blank space. The page cannot be scrolled permanently
   offscreen.
2. **Repeat quick add.** Tap Shopping `+`, then one Catalog item not already on
   the list. The picker opens tall with a visible grabber; the item is added
   without an intermediate details step or HTTP 422. The picker stays open and
   briefly confirms the addition; that row changes to “On list” and cannot be
   added again. Add a second item without reopening the picker, then tap Done.
   Each new row appears once, with amount `1`, the item's active default
   shopping unit and preferred store (if configured). The rest of Shopping
   does not blank or show a full-page spinner.
3. **Search and keyboard.** Open Add item, focus Search, type a name, and
   check that the first result stays visible and tappable. The header `+` and
   “Create item in Catalog” footer action are visible and tappable above the keyboard;
   neither is covered by the keyboard. Clear the query, dismiss the keyboard,
   check the ordinary Create action in the footer below the results.
   Add a filtered result: the query, keyboard, and scroll position stay in place.
   Done returns to Shopping.
4. **Duplicate handling.** Reopen Add and find the item from step 2. It reads
   “On list.” Tap it: Edit opens instead of creating another row. Search for the
   same name with different capitalization; it must not create a duplicate.
5. **Create from Shopping.** In Add item, use either the header `+` or bottom
   Create action to open the shared Catalog form. Scroll to its bottom: “Create
   & add to Shopping” must be fully visible and tappable above the tab bar,
   without snapping out of reach. Create a uniquely named QA item. Returning
   to Shopping adds it exactly once. The same item is present in Catalog.
   Category and Typical shopping unit pickers open tall; Store opens medium;
   all remain draggable. A failed Shopping add must report that Catalog
   creation succeeded but Shopping add failed, with a retry path.

## Edit, display, and list behavior

6. **Edit a row.** Tap a Shopping row or its right chevron. Edit opens tall;
   change amount to a fraction such as `2 2/3`, change unit and store, and Save.
   The row shows the readable amount and store separated by a middle dot.
   Reopen Edit to verify values persist. Changing this trip's unit/store does
   not silently change the Catalog item's defaults. If the unit or store is
   missing, use the sheet's create/manage action and return to the draft.
7. **Catalog edit shortcut.** From the Shopping Edit sheet, change an amount
   without saving, then open its Catalog item edit action. The visible Back
   button returns to that same Shopping Edit sheet with the unsaved amount
   intact. Reopen Catalog edit, change non-destructive Catalog metadata, save,
   and verify the Shopping edit flow remains usable and reflects the update.
8. **Check off and undo.** Tap a checkbox. Only that row changes immediately;
   it moves to Purchased and the counts update, without a whole-page reload.
   Check three or more different rows quickly, without pausing between taps;
   every tap must register even though no swipe gesture started.
   Expand Purchased, uncheck it, and confirm it returns to To buy. Tapping the
   row body opens Edit rather than toggling the checkbox.
9. **Filter and sort.** Add items for at least two stores and one with no store.
   Check All stores, each named store, and No store; both To buy and Purchased
   and their counts reflect the chosen filter. Try every Sort option: Recently added,
   Name A–Z, Name Z–A, Store, and Category. Sorting changes order, not item
   values or checked state. Leaving and returning to Shopping should not show
   stale results from a previous household or filter.
10. **Meal-plan handoff.** From a week containing a planned recipe, review
    Shopping needs and add one selected ingredient. Shopping opens with a
    visible confirmation; the item appears once. Revisiting the review must
    recognize items already on Shopping rather than duplicate them. The Plan
    tab returns to its main week page, not the stale review screen.

## Safety and cross-device checks

11. **Remove one item.** Compare with Felipe's three iPhone Messages reference
    screenshots: the resting row is unchanged; a short left swipe stays open and
    reveals exactly one circular red trash icon; a continued far-left drag
    expands that red circle to a pill behind the finger-following row. First
    reveal then drag back/right: the row closes without deletion or opening Edit.
    Reveal again and tap the trash button: only that QA row is removed without
    confirmation or a page reload. Add it again and perform one uninterrupted
    far-left swipe: the row exits and is removed on release. Repeat on a
    Purchased row, and check vertical scrolling, checkbox taps, ordinary Edit
    taps, and tapping an open row to close it. Remove in Edit remains immediate.
    The Catalog entry must remain. If deletion fails, the row returns with an
    error and can be retried.
12. **Clear list — QA household only.** With only disposable Shopping rows,
    tap Clear list. Cancel first and verify nothing changes. Confirm next and
    verify both To buy and Purchased are empty for the shared household.
    Never confirm this step on a real household list.
13. **Two-device sync — if available.** Open the same household on a second
    device. Add, edit, and check an item on the first device; refresh on the
    second and confirm the same canonical row and values. Switching households
    must not show the previous household's items or stale search results.
14. **Failure/retry — optional.** While a QA row is visible, temporarily
    disconnect the device from the API and toggle its checkbox or attempt an
    add. The operation reports an error and rolls back rather than silently
    appearing saved. Reconnect and retry successfully. Do not use this to
    test with real household data.

## Acceptance note

Shopping v1 is device-accepted only for the scenarios actually run and marked
Pass. A passing component suite does not establish native sheet drag feel,
keyboard placement, safe-area spacing, or visual parity. Record iPhone and
Android separately; a pass on one does not imply a pass on the other.
