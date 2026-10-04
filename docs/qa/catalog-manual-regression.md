# Catalog manual regression checklist

Use this checklist for repeatable emulator and phone QA. It records the five
flows exercised on 2026-10-03; it is **not** an automated test suite. Run it
after Catalog UI changes and before accepting the slice. Compare the live UI
with the images in [`../design/catalog/`](../design/catalog/) side by side.
Record any intentional platform difference instead of silently accepting it.

## Run record

- Date, tester, device/OS, app commit, API environment:
- Household used (dedicated QA household; no personal data):
- Appearance: light / dark (run both when checking visual changes)
- Result for each flow: Pass / Fail / Not run; attach a screenshot for failures
- Keyboard type: software / physical (keyboard-specific checks require the
  software keyboard to be visible)

Use a unique item name such as `QA Catalog <date-time>`. Use an existing Food
category and built-in shopping unit. If the QA household has an existing
store, select it; otherwise mark store selection Not run rather than altering
another household's data. Never edit or remove an existing non-QA item.
The final Remove action archives the QA item; it does not erase its retained
database record.

## 1. Browse, filter, and search

1. Open Catalog. Check the All, Food, and Household filters, including an
   empty filter. Search for an existing item and then clear the search.
2. Check list order, category/unit subtitles without emojis beneath items,
   singular/plural counts, and truthful empty-state text. An empty Household
   filter without a search term
   must not say “No items match your search.”
3. Compare hierarchy, spacing, search field, chips, section headings, and
   row surfaces with [`catalog-home.png`](../design/catalog/catalog-home.png).
   Note any extra helper copy, counts, or tiles absent from the target.

## 2. Add an item and use the pickers

1. Open Add Item and submit with an empty name. Verify a clear validation
   message; type the unique QA name and verify the obsolete error clears.
2. With the name field focused and the software keyboard visible, open
   Category. Confirm the keyboard stays closed after selection. Search for a
   Food category, select it, and verify its emoji appears both in the picker
   and closed field. Choose a built-in shopping unit. If available, select an
   existing store; verify Preferred store is visible without expanding More
   details once that design is approved.
3. In Category and Store sheets, compare layout and action rows with
   [`category-picker.png`](../design/catalog/category-picker.png) and
   [`store-picker.png`](../design/catalog/store-picker.png). Check blue Done,
   concise Create labels, plural Manage labels, icons, and grouped surfaces.
   Try a quick short downward flick and a slow pull from either the grabber
   or the rest of the sheet header: both should close the sheet without
   selecting a row. With search focused, drag the list down: the
   keyboard should dismiss while the sheet remains usable. Check short and
   long result lists for reachable search and actions without a dead gap.
4. Save the item once. Verify it appears under the correct type with category
   and unit, and that its store selection persists if one was chosen.
   Compare the form with [`edit-item.png`](../design/catalog/edit-item.png)
   and, if approved, the proposed
   [`edit-item-preferred-store-v2.png`](../design/catalog/edit-item-preferred-store-v2.png).

## 3. Inspect and edit the QA item

1. Open the new item. Verify name, type, category, unit, store, and recipe
   defaults match the saved values. Compare hero, chips, compact horizontal
   preference rows, surfaces, spacing, and header Edit action with
   [`item-detail.png`](../design/catalog/item-detail.png).
2. Edit the QA name and change its category to a different existing Food
   category. Save once. Confirm Item Details and the Catalog list show the
   updated server values without a manual tab switch, while the unit and
   store remain unchanged. Check Back navigation and the saved form layout.
   The automatic post-edit reload must not leave a pull-to-refresh spinner
   stuck at the top. A deliberate pull should show it, then clear it.

## 4. Manage Catalog, categories, stores, and units

1. Open Manage Catalog. Compare its option cards and navigation with
   [`manage-catalog.png`](../design/catalog/manage-catalog.png). The starter
   preview is intentionally optional and may remain absent.
2. Open Categories. Search for the QA item's new category. Verify its emoji
   appears to the left of the name here, while main Catalog item subtitles
   remain text-only. Open Edit Category without saving any change. Verify the
   active-item count includes the QA item, and compare
   compact rows, emoji row, warning, Delete action, and header Save with
   [`manage-categories.png`](../design/catalog/manage-categories.png) and
   [`edit-category.png`](../design/catalog/edit-category.png). Open the Emoji
   text-entry sheet. Confirm the ordinary keyboard appears, valid emoji can be
   typed or pasted, invalid text shows an inline error and cannot be confirmed,
   Clear requires Done to apply, and Cancel leaves the existing value unchanged.
   `emoji-picker-proposal.png` is superseded and is not an implementation
   target.
3. Open Stores. Search for an existing store and open its editor without
   saving. Its copy should describe editing, not adding. Open Shopping Units;
   if no custom units exist, the empty state must say *custom* units are
   absent without implying built-in units are unavailable.
4. Compare the rendered destructive actions across Edit Category, Edit Store,
   and Edit Shopping Unit. Delete category, Remove store, and Remove shopping
   unit should use consistent full-width surfaces, insets, text treatment, and
   disabled states. Do not judge each page only against its own reference;
   note any intentional difference. Do not trigger removal of an existing
   non-QA choice during this visual check.

## 5. Remove only the QA item

1. Open the exact uniquely named QA item. Tap Remove item, read the
   confirmation, and choose Cancel once; the item must remain visible.
2. Reopen the confirmation and approve removal. Verify navigation returns
   to Catalog, the active count updates, and the QA item is absent after a
   refresh. Do not remove any other item. Record that the action archives
   the item; retained data is not a cleanup failure.

## Known baseline gaps from the 2026-10-03 run

The initial Android emulator run passed the basic create/edit/search/remove
behavior but found the visual and wording gaps documented in
[`../plans/catalog-phone-ux-followup.md`](../plans/catalog-phone-ux-followup.md).
The emulator did not display its software keyboard, so keyboard-open sheet
behavior was Not run there. The iPhone screenshots in `../design/catalog/`
remain evidence for those failures. This checklist should be rerun after the
approved fixes; do not mark the whole feature accepted from automated tests
or emulator screenshots alone.

## Follow-up implementation check — 2026-10-03

- Tester/device/app build: Codex desktop session; no app or emulator was
  available to this session.
- Automated result: focused mobile Catalog/router tests passed 67/67; full
  normal and cold mobile suites each passed 221/221. This is not a manual
  device run.
- Android five-flow checklist: **Not run**. No Android emulator or running
  app was exposed, so there are no post-fix Android screenshots.
- iPhone visual, keyboard, header, and emoji acceptance: **Not run**; Felipe's
  physical-device check is still required.
- The existing October 3 Android observations above remain the baseline
  findings. They are not being relabeled as passing after the code changes.

## Focused Android visual pass — 2026-10-03

- Tester/device: Codex, running Pixel 10a Android emulator, light appearance,
  local app/API. No existing household data was changed.
- Browse/filter: Food rows and the empty Household filter were inspected;
  the empty message was accurate and the quieter rows were present. Search
  and create/edit/remove were **not** rerun as end-to-end mutations.
- Add Item: Category and Preferred store placements, Category sheet labels,
  grouped choices, blue Done, and selected-field emoji were inspected.
  After correcting the Android keyboard offset, the software keyboard left
  the filtered choices and Create/Manage actions visible and reachable. The
  item-name-keyboard-to-picker transition was **not** rerun.
- Management: Manage Catalog cards, Categories, Edit Category with item count,
  Stores/search, and Shopping Units empty state were inspected. A subsequent
  correction restored emojis to Categories and removed them from the main
  Catalog item subtitles.
- Item Details: the Milk hero, compact preference rows, plain Edit action,
  and missing last-row separator were inspected. The iPhone-specific glyph
  clipping cannot be validated on this emulator.
- Gesture: the emulator's automated mouse drag did not reliably produce a
  native dismiss gesture, even from the grabber. The expanded header touch
  area has a component test, but a real-finger fast flick from header text
  and blank header space still requires device verification.

## iPhone post-edit refresh report — 2026-10-03

Felipe reported that an edit's new values appear in the main Catalog list,
but the top pull-to-refresh spinner remains visible on iPhone until a manual
pull. Android did not reproduce it. The Catalog hook now reserves the native
refresh indicator for deliberate pulls; automatic post-edit reloads still
update the list. Automated hook coverage checks both behaviors. Felipe reported
that the post-fix iPhone flow looks good; the persistent post-edit spinner is
no longer reported.

## Emoji chooser validation gate — 2026-10-03

This historical section records the chooser proposal and the earlier API
compatibility check. The chooser UI has since been removed; the data/API
compatibility findings still explain why the expanded server validator and its
fixture remain.

- Felipe approved the project-owned chooser and `unicode-emoji-json` 0.9.0.
- Before UI implementation, the dataset was checked against the API's actual
  one-emoji validator: 1,879 entries accepted and 35 valid-looking RGI entries
  rejected. The chooser remains unimplemented until the proposed validator
  alignment is reviewed; no unsupported subset was exposed.
- No manual picker comparison was possible in that desktop session: no
  running app or Android emulator was exposed. Keyboard-closed/open Android
  screenshots and iPhone acceptance were **Not run** then.
- After dependency installation, the full mobile normal and cold runs each
  passed 33 suites / 224 tests; TypeScript, lint, and whitespace checks passed.
  These automated results do not replace the manual checklist.

## Emoji text-sheet rollback validation — 2026-10-04

- The chooser route and mobile `unicode-emoji-json` package were removed. The
  category Emoji row now opens a themed text-entry sheet. The editor keeps its
  compact `edit-category.png` layout, and category emoji display locations and
  starter values are unchanged. `emoji-picker-proposal.png` is superseded and
  is not a target.
- Focused validator and actual-router tests passed (58 tests). They cover
  ordinary text-input settings, editable composition/paste-style insertion,
  invalid and multiple emoji feedback, name/type draft retention, unchanged
  existing emoji, explicit Clear, and reset of an open draft after household
  scope changes.
- Full mobile normal and cold runs each passed 34 suites / 230 tests. The first
  normal run had two 5-second timeouts; both affected tests passed individually
  and a complete rerun passed. TypeScript, lint, API Ruff, 21 API category emoji
  validator tests, and whitespace checks passed.
- Database compatibility gate: `services/api/.env` points to
  `meal_planner_dev`; no database was contacted. The expanded API allowance and
  its pinned fixture/tests remain, and no stored category data was changed.
- Device checks were not run. iPhone and Android keyboard presentation,
  emoji-key navigation, paste, clear, and sheet positioning remain unverified.

## Felipe's iPhone emoji-editor review — 2026-10-04

Felipe reports that the restored text-entry flow looks fine, with two visual
corrections remaining. The Edit Category trailing values for Name, Type, and
Items in this category do not align to one right-hand inset. The emoji input
sheet leaves excessive blank space between its actions and the open iPhone
keyboard. Compare the current captures
`docs/design/catalog/actual-edit-category-ios-2026-10-04.jpg` and
`docs/design/catalog/actual-emoji-sheet-ios-2026-10-04.jpg` against
`docs/design/catalog/edit-category.png`. Keep these as focused UI follow-ups;
the screenshots do not establish Android behavior or full emoji-flow acceptance.

Follow-up: Felipe reports that the coding agent's alignment and keyboard-gap
fixes now look good on his iPhone. This accepts those two visual corrections
only; the screenshots above remain the before-state record. Android behavior
and the rest of the emoji-entry checklist are not implied to have passed.

## Android emulator rerun — 2026-10-04

- Tester/build: Codex on the running Pixel 10a Android emulator, light
  appearance, using the current uncommitted `feat/household-catalog` app.
  The API environment was not independently checked. No automated suite was
  rerun for this manual pass.
- Browse/filter/search: **Pass.** Food and Household filters, the empty
  Household state, Rice search/clear, text-only Catalog item subtitles, and
  existing item detail values behaved as expected. The Android light-theme
  hierarchy was compared with the saved dark-theme references, not claimed
  pixel-identical.
- Add Item: **Pass.** Empty-name submission showed an error; entering a name
  cleared it. Category opened while the item-name keyboard was visible;
  selecting Bakery left the keyboard closed. Category choices and the closed
  field showed emojis; Preferred store remained outside More details. The
  store and unit pickers offered grouped choices and the expected Create/
  Manage actions. A synthetic `QA Catalog 1004-1420` Food item was saved with
  Bakery, Gallon, and Target and appeared in Catalog.
- Inspect/edit: **Pass.** Item Details showed the saved values and a plain
  header Edit action. Renaming the QA item to `QA Catalog 1004-1420 Edited`
  and changing its category to Beverages updated Item Details and the main
  Catalog list without a manual refresh; Gallon and Target were preserved.
  No stuck spinner appeared after returning to Catalog on Android.
- Management: **Partial.** Manage Catalog cards, Category/Store search,
  category-list emojis, Pantry label, store edit copy, and the custom-unit
  empty state were inspected. Edit Category showed aligned trailing values
  and Beverages correctly reported one active item. **Fail:** opening the
  Category emoji text-entry sheet and then showing the Android software
  keyboard hid the entire sheet behind the keyboard, including its field and
  Clear/Cancel/Done controls. Dismissing the keyboard restored the sheet;
  Cancel left the existing emoji unchanged. Emoji entry cannot be accepted
  on Android until this is fixed and retested.
- Sheet gesture: **Inconclusive.** Desktop mouse drags did not reliably
  emulate a touch flick, even from the grabber; test quick and slow downward
  swipes from the full header with a finger before accepting the gesture.
- Remove QA item: **Pending action-time approval.** The uniquely named item
  remains active at the time of this record; no existing non-QA item or
  category was edited or removed. Dark appearance, iPhone-specific rendering,
  and the full emoji paste/Clear/Done flow were not rerun here.

## Android emoji-sheet keyboard correction — 2026-10-04

The preceding emulator pass found that the Android software keyboard moved the
Category emoji text-entry sheet behind itself. The sheet now uses the same
`KeyboardAvoidingView` `padding` behavior as the working Catalog choice picker
on both platforms. Its keyboard-avoidance container fills the available area,
and its bottom padding switches from the safe-area inset while closed to a
compact 12-point gap while the keyboard is visible. The ordinary keyboard,
inline validation, Clear/Cancel/Done actions, and keyboard-closed safe-area
layout are retained.

- Focused actual-router suite: 58 passed, including the Android behavior and
  compact-open/closed-padding regression checks.
- Full mobile normal and cold runs: 34 suites / 232 tests passed in each.
- TypeScript, lint, and `git diff --check`: passed.
- Android device retest: **Not verified.** An emulator process was present,
  but ADB could not attach because its Android user configuration location
  resolved to an unwritable `\\.android` path. Keyboard-open and keyboard-
  closed screenshots must still be captured on a reachable emulator/device.
- iPhone: Felipe's earlier report accepted the alignment and compact
  keyboard-gap corrections only. The current cross-platform sheet change has
  not been checked on his iPhone in this session.
- At this checkpoint, PostgreSQL migration and API-suite validation were
  pending and were not run for the UI-only correction. The later independent
  verification below supersedes that status: the chat agent verified the
  disposable database and reported 90 passed, 0 skipped at
  `catalog_category_emoji (head)`. Never use `meal_planner_dev`.
- Synthetic `QA Catalog 1004-1420 Edited`: untouched in this follow-up; no
  archival or other data action was taken.

## Independent follow-up verification — 2026-10-04

- On the running Pixel 10a Android emulator in light appearance, opening the
  Category emoji sheet and focusing its field kept the sheet title, input,
  Clear, Cancel, and Done visible above the software keyboard with a compact
  gap. Cancel preserved Bakery's existing emoji. The keyboard-closed sheet
  was also visible. This verifies the previously blocked Android layout, not
  the full emoji paste, validation, save, or gesture flow.
- The Store editor displayed **Remove store** as a bordered destructive action,
  consistent with **Delete category**. No removal was attempted.
- On an isolated, volume-free PostgreSQL 17 test container, both the database
  URL name and `SELECT current_database()` were verified as
  `meal_planner_disposable_test`. Alembic reached
  `catalog_category_emoji (head)` and the full API suite passed **90 tests,
  0 skipped**. The temporary container and its synthetic data were removed
  afterward; `meal_planner_dev` was not contacted.
- iPhone behavior after the cross-platform keyboard fix, Android touch-flick
  dismissal, and the remaining five-flow device checklist are still open.
  The synthetic `QA Catalog 1004-1420 Edited` item remains active.

## Felipe-reported iPhone emoji-sheet check — 2026-10-04

Felipe reports that the Category emoji sheet looks good on iPhone. This is a
focused visual acceptance only; it does not establish broader gesture/device
acceptance or completion of the five-flow checklist. The synthetic QA Catalog
item remains active.
