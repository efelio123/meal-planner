# Catalog phone UX and visual-parity follow-up

Current status (2026-10-04): the project-owned emoji chooser described in the
historical sections below has been rolled back in favor of the approved ordinary
keyboard text-entry sheet. `emoji-picker-proposal.png` is superseded historical
material, not the current target. See
[`catalog-emoji-picker-rollback.md`](catalog-emoji-picker-rollback.md) for the
implementation and validation record. The category-emoji feature and approved
display locations remain.

The retained category editor reference is `edit-category.png`; the compact
Name/Type card and Emoji row remain. The input sheet uses the ordinary text
keyboard. Its keyboard avoidance uses the installed React Native API rather
than a custom keyboard mode or native implementation. The possible iPhone
emoji-keyboard shortcut remains a future issue, not current implementation.

Status: approved and implemented on `feat/household-catalog`; all work remains
uncommitted and unpushed for review. The project-owned chooser uses the
approved `unicode-emoji-json` 0.9.0 dataset. The narrowly scoped API validator
alignment and its offline parity tests are implemented. Automated results
and outstanding device checks are recorded at the end of this document.
Felipe has since requested a return to the ordinary emoji text-entry sheet;
the proposed targeted rollback is in `catalog-emoji-picker-rollback.md`.
This document preserves the implementation chronology, not the desired final
emoji-entry design.

Latest focused Android correction (2026-10-04): the Android software keyboard
previously covered the emoji sheet because its `KeyboardAvoidingView` used
`height`. The sheet now follows the existing Catalog picker pattern and uses
`padding` on both platforms with a flex-filling keyboard-avoidance area. Safe
area bottom padding is retained while the keyboard is closed and reduced while
it is visible, preserving the iPhone gap correction. The automated normal and
cold mobile results are recorded below; a live emulator recheck was not
possible in this session. At that checkpoint PostgreSQL migration and API-suite
validation were pending; the later independent verification near the end of
this document records the result (90 passed, 0 skipped at
`catalog_category_emoji (head)`).

## Goal and evidence

Correct the remaining iPhone picker, emoji, form, and detail-screen gaps found
during physical testing. Treat the existing `docs/design/catalog/` mockups as
visual targets, not merely inspiration. Compare each affected live screen
side by side with its target, and report any deviation that cannot be matched
with an explanation and screenshot.

Current-state phone captures (diagnostic evidence, **not** design targets):

- `docs/design/catalog/actual-picker-search-2026-10-03.png` — keyboard-open
  picker has unused space, a gray Done action, and singular Manage wording.
- `docs/design/catalog/actual-edit-category-2026-10-03.png` — form layout,
  card styling, and Save action diverge from `edit-category.png`.
- `docs/design/catalog/actual-item-detail-2026-10-03.png` — vertically stacked
  field values and bubbled Edit action diverge from `item-detail.png`.

An Android 37 emulator review on 2026-10-03 independently reproduced the
picker gesture gap: a short, quick downward flick on the grabber left the
Category sheet open, while a longer, slower pull closed it. The emulator also
showed stacked, heavily outlined Item Details and Edit Category fields instead
of the compact reference rows; the Categories list omitted category emojis.
The Catalog root showed the intended Food/Household grouping and category/unit
subtitles, but had extra helper copy, item counts, and stronger outlines than
`catalog-home.png`. Android's header Edit control appeared as plain text, so
the bubbled iPhone header remains a separate iOS-specific finding. The emulator
did not render its software keyboard during search testing, so keyboard-open
sheet spacing and keyboard dismissal are **not** verified on Android.

### Five-flow Android emulator audit (2026-10-03)

This was a live UI review against the images in `docs/design/catalog/`, not
an automated pixel comparison. One uniquely named QA item was created,
edited, and removed through the app; it no longer appears in the active
Catalog. Existing items, categories, and stores were not changed. The
removal is an archive, so the QA row may remain in retained database history.

1. **Browse, filter, and search:** Food/Household filters and item-name
   search worked. With an empty Household filter and no search term, the
   screen incorrectly said “No items match your search.” A single result
   was counted as “1 items.” Compared with `catalog-home.png`, the root adds
   helper copy, counts, initial-letter tiles, and stronger card outlines;
   the reference has a quieter list treatment.
2. **Add Item and pickers:** Empty-name submission showed validation and a
   named item saved with its category, unit, and preferred store. However,
   “Enter an item name” stayed visible after the field was corrected until
   submission. The selected Category field omitted its emoji. Preferred
   store required expanding More details. Category Done was gray and the
   action read “Manage category”; store actions read “Create preferred store”
   and “Manage preferred store.” Unit actions similarly used the entire field
   label (“Create/Manage typical shopping unit”) instead of concise names.
   The options were plain divided rows rather than the reference's softly
   grouped card treatment. Category/unit search and selection worked.
3. **Item Details and Edit:** Saving a new name and category refreshed the
   mounted detail and Catalog list with server values. Compared with
   `item-detail.png`, preference values were stacked below labels inside
   heavily outlined cards instead of compact horizontal rows on subdued
   surfaces. `edit-item.png` also differs in form hierarchy and surfaces;
   a saved Preferred store is hidden again under collapsed More details.
4. **Manage Catalog, Categories, and Stores:** The routes and Category/Store
   searches worked. Manage Catalog combines the three options into one card
   instead of the reference's separate option cards; omission of the optional
   starter preview remains accepted. Category rows omit their emojis, while
   the picker shows them. Edit Category correctly showed the QA item's
   active count, but its form layout and borders differ from
   `edit-category.png`. Emoji editing still asks users to switch keyboards.
   Edit Store incorrectly says “Add a household store” for an existing store.
   Shopping Units says “No active shopping units yet” when it means no
   **custom** units; built-ins are still available in the picker.
5. **Remove Item:** The QA item displayed a confirmation, completed removal,
   and disappeared from the active Catalog. The confirmation's primary
   Remove action was blue rather than visually destructive; review its
   semantic styling against the red Remove text in `item-detail.png`.

These findings supplement the proposed changes below; they do not approve
implementation or establish iPhone parity. The emulator did not show its
software keyboard during search, so the iPhone keyboard-open sheet and
keyboard-dismissal issues remain physically unverified here. User-visible
Expo Go development overlays were excluded from the app UI assessment.

Approved existing targets remain `category-picker.png`, `store-picker.png`,
`edit-category.png`, and `item-detail.png`. Two **proposed** updated targets
are `edit-item-preferred-store-v2.png` (store visible beneath shopping unit)
and `emoji-picker-proposal.png` (an in-app emoji-only chooser). The latter is
conceptual: native emoji artwork varies by OS, and the grid/data source still
needs a technical decision. Do not silently treat a generated mockup as
implementable or pixel-perfect platform output.

## Diagnosis to verify before coding

- `choice-picker.tsx` dismisses only when downward gesture distance exceeds
  64 points. It does not inspect gesture velocity, so a fast short flick can
  fail. Its fixed maximum heights and keyboard-avoiding wrapper can leave
  excessive space above the keyboard when search is active. The options
  scroller has no downward keyboard-dismiss behavior. Done explicitly uses a
  secondary text color.
- `catalog-item-form.tsx` places Preferred store under More details, and the
  selected category field renders only the name. Category management rows in
  `catalog-choice-management.tsx` also omit the emoji.
- The category editor uses a regular text input for Emoji. React Native 0.86
  does not expose an emoji-only system `keyboardType`; the current input can
  accept non-emoji text until validation. Use an explicit chooser if the user
  should not have to switch keyboards.
- `catalog-item-detail.tsx` stacks each label over its value. The category
  form similarly stacks fields. The header-right Edit/Save controls are
  rendered inside iOS system button backgrounds rather than the plain blue
  text shown by the references. Confirm which SDK 57-supported native header
  styling can change that before proposing a custom header workaround.

## Proposed changes

1. **Picker gesture and keyboard.** A quick downward flick from the grabber
   closes the sheet, even with short travel; a slow deliberate pull also
   closes it. Do not steal an upward list scroll or an ordinary tap. When
   search is focused, a downward drag on the choice list/background dismisses
   the keyboard and unfocuses search while leaving the sheet open. The
   grabber and Done always close the sheet. Measure the keyboard-visible area
   and size the sheet's content to its actual results so the search field and
   action card remain reachable without a large dead gap. Preserve Back,
   backdrop, selected choice, and item-form draft behavior.
2. **Picker appearance and wording.** Done uses the semantic blue action
   color in light and dark mode. Use the existing grouped-card reference for
   options and action rows. Category actions read “Create category” and
   “Manage categories”; store actions read “Create store” and “Manage stores”.
   Keep icons, leading indentation, accessible names, and no-category/
   no-store options. Show a category's emoji to the left in every category
   option and in the closed, selected Category field.
3. **Add/Edit item.** Preferred store is an always-visible field immediately
   below Typical shopping unit, before More details. More details retains
   recipe-specific fields only. Match `edit-item-preferred-store-v2.png` for
   layout; apply the same order to Add Item. Keep store optional and preserve
   form state across picker/manage navigation.
4. **Emoji selection.** Replace free-form Emoji text entry with an in-app,
   emoji-only chooser. Users select one emoji without switching the OS
   keyboard; support clearing an optional selection. Render the same Unicode
   sequence using each OS's native emoji font—do not store platform-specific
   values. Reject invalid/non-emoji values at the UI boundary and keep the
   existing server validation as defense in depth. The chooser should offer
   a useful, searchable full emoji set rather than only the ten starter
   emojis. Show selected emojis in category management rows, picker rows,
   selected form field, and item details without duplicating the glyph.
   Keep the category/unit subtitles under items on the main Catalog screen
   text-only. Use the proposed chooser image for hierarchy, not for literal
   emoji artwork.
5. **Visual parity.** Rework Edit Category to match `edit-category.png`:
   compact Name/Type form group, separate Emoji and active-item count rows,
   deletion explanation and action, top alignment, and subdued card
   surfaces. Rework Item Details to match `item-detail.png`: retain the hero
   and chips, but use compact horizontal label/value rows within softly
   filled Shopping preferences and Recipe measurement cards. Make header
   Edit and Save plain blue actions if supported by the installed SDK 57
   native stack; investigate documented native-toolbar options and verify on
   an iPhone. Do not hide a platform limitation with an undocumented layout
   hack. Keep all current loading/retry, archival confirmation, household
   scope, light/dark, and accessibility behavior.
6. **Audit polish.** Use a truthful empty-filter message when no search is
   entered; pluralize item counts correctly; clear a corrected validation
   error as soon as the name becomes valid. Give Store and Shopping Unit
   picker actions concise, plural management labels. Make Edit Store copy
   describe editing, and distinguish absent custom shopping units from the
   available built-ins. Compare Catalog home and Manage Catalog with their
   references, retaining the approved omission of the starter preview and
   reporting any remaining intentional differences. Review the removal
   confirmation's destructive-action styling without weakening its explicit
   confirmation or the backend archive behavior.

## Implementation boundary and approved decision

The chooser work is primarily mobile; the category emoji field and validation
already exist in the API. Felipe has approved the project-owned approach using
`unicode-emoji-json` 0.9.0, and that data-only dependency is installed. Do not
add the ready-made emoji keyboard or FlashList. Do not claim React Native can
force the system emoji keyboard. Felipe approved the narrowly scoped API
validator alignment below on 2026-10-03; do not silently ship a reduced grid
or broaden server behavior beyond that alignment.

## Validation and acceptance

Repeat the five live flows in
[`../qa/catalog-manual-regression.md`](../qa/catalog-manual-regression.md)
on the emulator and iPhone; that checklist is manual QA, not Jest coverage.

- Focused gesture tests for short fast flick, slow long drag, upward scroll,
  tap, keyboard-focused downward drag, and touch conflict with a scrolling
  long choice list. Rendered tests for keyboard-visible short/long result
  lists, visible search/actions, blue Done, action labels, and selected emoji.
- Form/router tests for Preferred store order, optional value, draft
  preservation, category selection, and never reopening the item-name
  keyboard. Emoji tests for selection, clear, invalid values, and category
  display across picker, form, manager, item list, and item detail.
- Visual-structure tests for compact Edit Category and Item Details rows,
  plus header action styling where testable. Run normal/cold mobile tests,
  TypeScript, lint, and whitespace checks. Run API/database tests only if
  backend behavior changes; do not use `meal_planner_dev` for tests.
- Focused checks for empty filter wording, singular/plural counts, corrected
  name-error clearing, Store/Shopping Unit action labels, Edit Store copy,
  custom-unit empty wording, and a confirmed item archive disappearing from
  the active list.
- On iPhone, compare Add/Edit Item, keyboard-open/closed Category and Store
  sheets, Edit Category, Item Details, and Categories list with their target
  images in both appearances. Physically verify a fast flick, slow drag,
  keyboard dismissal, search accessibility, emoji picking, and header action
  appearance. Repeat the visual and gesture checks in the available Android
  emulator; its screen capture can support iteration, but physical Android
  acceptance remains outstanding.

## Implementation status and current verification — 2026-10-03

Implemented independently of the emoji-chooser decision:

- Choice sheets now dismiss on a short, fast downward flick or a deliberate
  longer pull, while upward list motion does not trigger dismissal. Dragging
  the option list dismisses the search keyboard without closing the sheet;
  selection blurs search and dismisses the keyboard before returning to the
  form. The keyboard-visible sheet height accounts for keyboard and safe-area
  space, with the search and action rows kept reachable.
- Done uses the semantic link-blue token. Category/store/unit action labels
  use concise names and plural Manage labels. Preferred store is directly
  below Typical shopping unit. Selected category fields, category choices,
  Categories management rows, and item details show the category emoji.
  Following Felipe's clarification, the main Catalog item subtitles do not.
- Item Details and Edit Category use compact grouped rows/surfaces. The
  Catalog list uses the corrected empty-state text, singular/plural item
  counts, and softer row borders. Corrected-name validation clears promptly;
  Edit Store and the no-custom-shopping-units copy are accurate. Removal
  confirmation uses destructive styling. Manage Catalog uses separate
  option cards.
- iOS detail/category header actions use the installed native stack toolbar's
  plain text action. Android/web retain accessible text-action fallbacks; the
  actual native presentation still needs device confirmation.
- The sheet's gesture responder now covers its full header, not only the
  grabber. Item Details gives the large initial and title enough line height
  for iOS glyphs and omits the separator under the last shopping row.
- The Android emulator exposed a collapsed sheet while its search keyboard
  was open. Using keyboard padding rather than height adjustment keeps the
  filtered choices and bottom actions visible above the software keyboard;
  the Android live screen was rechecked. iPhone still needs its own check.

The searchable emoji-only in-app chooser was not implemented in the earlier
UX pass; the field still uses text entry and the platform keyboard. The
following comparison records the decision history:

| Option | Proposed baseline | Compatibility and maintenance |
| --- | --- | --- |
| `@softwhere-uz/react-native-emoji-keyboard` | 0.10.0; approximately 3.32 MB installed package, with its emoji data about 64 KB gzipped. It also **requires** `@shopify/flash-list` 2.x, which is not installed; Expo SDK 57 recommends FlashList 2.0.2. | The ready-made searchable grid reduces our UI work and is intended for iOS, Android, web, and Expo Go. It is a newer package with limited maintenance history, adds two direct dependencies, and its built-in layout would still need adaptation to the approved reference. Its documented device verification does not cover our exact SDK 57 setup. |
| Project-owned picker using `unicode-emoji-json` | 0.9.0; approximately 422 KB of bundled JSON data; no picker or FlashList dependency. | A virtualized React Native grid can closely follow `emoji-picker-proposal.png`: selected/clear row, search, category filters, and emoji-only cells. We own accessibility, filtering, performance, platform testing, and Unicode-data updates. The dataset consolidates skin-tone variants, so a separate design decision would be needed to expose those variants. |

Decision: Felipe approved the project-owned option and `unicode-emoji-json`
0.9.0. The package has been added exactly to the mobile manifest and lockfile;
it is data-only and does not add native code. The implementation and
validator-gate outcome are recorded in the final section. The mockup's
category Type disclosure is not an editable control: category type remains
immutable in the approved behavior, so the screen displays it without
implying that it can be changed.

Compatibility references: [React Native 0.86 TextInput keyboard types](https://reactnative.dev/docs/0.86/textinput),
[Expo SDK 57 FlashList version](https://docs.expo.dev/versions/v57.0.0/sdk/flash-list/),
[emoji-keyboard package installation and peers](https://www.npmjs.com/package/@softwhere-uz/react-native-emoji-keyboard),
and [Unicode Emoji JSON's data format](https://github.com/muan/unicode-emoji-json/blob/main/README.md).

### Dataset/API compatibility gate

Before building the chooser, all 1,914 entries in the package's
`data-by-emoji.json` were passed through the existing
`meal_planner_api.catalog._clean_emoji` function. The validator accepted 1,879
and rejected 35:

- 2 playing-card/Mahjong symbols (`joker`, `mahjong red dragon`);
- 15 enclosed Latin-letter/button symbols (including A/AB/B, OK, and SOS);
- 15 Japanese button symbols; and
- 3 subdivision-flag tag sequences (England, Scotland, and Wales).

These are meaningful, valid-looking RGI entries. The chooser must not quietly
filter them out. Felipe approved this focused backend follow-up on 2026-10-03:
extend the existing one-emoji validator with
an explicit allowlist for the missing RGI base symbols and the exact England,
Scotland, and Wales tag-flag sequences. Do not broaden Unicode ranges or
accept arbitrary tag strings. Continue rejecting text, incomplete sequences,
and multiple emoji. Add focused positive and negative API tests for each new
family plus parity coverage for all 1,914 entries in the pinned 0.9.0 dataset.
The API test must use a checked-in, attributed fixture or another stable source;
it must not require `apps/mobile/node_modules` or network access in the
separately installed API CI job. The longest dataset entry has eight Unicode
code points, below the current 16-character request/database limit, so this
follow-up needs no schema or length change. Keep the current emoji text-entry
UI in place until the validator and full chooser are implemented and tested.

Automated validation for this implementation run:

- Focused Catalog/router checks: 6 suites, 67 tests passed.
- Full mobile normal run: 32 suites, 221 tests passed.
- Full mobile cold run (`--no-cache`): 32 suites, 221 tests passed.
- TypeScript, mobile lint, and `git diff --check`: passed.
- No API or database behavior changed; API and PostgreSQL tests were not run
  for this mobile-only follow-up. The earlier 64/64 disposable-database result
  predates the starter-category migration; after that migration, the latest
  reported full run was 67 passed / 1 failed, and the requested cleanup-test
  rerun has not been reported. Do not treat this UI validation as closing that
  separate database-validation item.

Visual/device status:

- The reference assets were inspected and the component hierarchy was
  adjusted against them, but this desktop session had no running app or
  Android emulator exposed. The saved five-flow Android manual checklist was
  therefore not rerun, and no before/after running-screen captures are
  available from this run. The October 3 baseline findings above remain the
  recorded device evidence, not a post-fix acceptance result.
- Felipe must still check the iPhone keyboard-open sheet layout, fast flick,
  header action appearance, emoji keyboard/chooser behavior, and light/dark
  screens. Do not claim iPhone acceptance from Jest or Android results.

The follow-up Android emulator visual pass and its partial coverage are
recorded in [`../qa/catalog-manual-regression.md`](../qa/catalog-manual-regression.md).
It does not establish iPhone clipping or gesture acceptance.

Focused correction validation after Felipe's iPhone report: 3 Catalog suites
and 13 tests passed; full mobile normal and cold runs each passed 32 suites
and 223 tests. TypeScript, lint, and `git diff --check` passed. No backend or
database code changed, so API/PostgreSQL tests were not rerun. The prior
starter-category database rerun remains a separate outstanding check.

Felipe subsequently reported that the main Catalog list shows an edited
item's new values on iPhone but leaves its top refresh spinner visible until
a deliberate pull. Automatic Catalog revision reloads now update data without
activating the native pull-to-refresh control; explicit pulls still show and
clear it. The distinction is covered by a deferred hook test. Felipe reported
that the post-fix iPhone flow looks good; the persistent post-edit spinner is
no longer reported.

For this refresh correction, full mobile normal and cold runs each passed
33 suites / 224 tests; TypeScript and lint passed. No backend code changed.

## Historical approved emoji-data follow-up — validation gate, 2026-10-03

Felipe approved the project-owned picker using `unicode-emoji-json` 0.9.0.
The exact dependency was installed in `apps/mobile/package.json` and
`apps/mobile/package-lock.json`; no ready-made keyboard, FlashList, or other
dependency was added. The package's documented `data-by-emoji.json` entries
provide emoji keys and searchable English names; the pinned package's grouped
data is 422 KB. The package requires no native module, so it does not require
an Expo prebuild or development-client rebuild. ([Package documentation](https://github.com/muan/unicode-emoji-json/blob/main/README.md),
[Expo SDK 57 / React Native version map](https://docs.expo.dev/versions/v57.0.0/)).

The pre-implementation compatibility audit invoked the actual API validator:
1,879/1,914 entries pass and 35 are rejected. Because this is a meaningful
set, implementation stopped before writing chooser UI or exposing a subset.
The exact categories and approved server-side alignment are recorded above.
No backend, schema, or database files were changed in that paused run.

After installing the data dependency, mobile normal and cold runs each passed
33 suites / 224 tests; TypeScript, lint, and `git diff --check` passed. No
focused chooser tests exist yet because no chooser UI was introduced. Expo
Go/Android runtime screenshots were not possible in this session: the desktop
exposed no running app or emulator. There are no post-install visual captures.
The iPhone comparison remains for Felipe after the validator decision and
implementation.

## Historical emoji chooser implementation and validation — 2026-10-03

This section records the implementation that was later rolled back; it is not
the current UI or a requirement for future work.

Implemented on the existing branch, preserving the existing Catalog work:

- Added a native-stacked `Choose emoji` route with the reference hierarchy:
  selected value and Clear, searchable name field, All/Food/Nature/Objects
  filters, and a virtualized four-column emoji-only grid. It uses semantic
  theme tokens, accessible result labels and selected states, and the ordinary
  keyboard only for search.
- Replaced category free-text emoji entry with a navigation row. Selection is
  held as a scope-bound, transient Catalog draft while the category form stays
  mounted; returning from the chooser applies only a valid dataset value to the
  same category form. Household/session/screen-scope changes invalidate stale
  drafts. The main Catalog item subtitles still do not show emojis.
- Updated the category form’s actual-router regression test to preserve its
  name and type while selecting an emoji, then save the selected value.
- Added focused chooser tests for search, Food filtering, selection and
  selected accessibility state, Clear, rejection of text/multiple/incomplete
  values, and accessible search/filter/result controls.
- The API validator has an explicit set of the missing dataset base symbols
  and permits only the exact England, Scotland, and Wales subdivision-tag
  sequences. Other/incomplete tag strings, text, and multiple emoji remain
  rejected. Added an attributed checked-in fixture independent of mobile
  `node_modules` and network access.

Validation actually run:

- API validator tests: 21 passed, including parity over all 1,914 entries in
  the pinned 0.9.0 dataset; full API Ruff check passed. No database tests were
  run for this validator-only backend change; no schema or migration was
  changed for it.
- Mobile normal run: 34 suites, 230 tests passed.
- Mobile cold run with Jest cache disabled: 34 suites, 230 tests passed.
- TypeScript, mobile lint, and `git diff --check` passed.
- Actual-router flow passed and confirms the category form draft survives
  navigating to and returning from the picker.

Visual/device status:

- Both requested reference images were opened before UI implementation and
  used for hierarchy and styling. A live Android emulator was not available
  in this session (`adb` was not installed and the desktop exposed no emulator
  surface), so no running-screen side-by-side comparison or screenshot was
  possible. Visual parity on a device remains unverified; any platform font,
  grid-spacing, safe-area, or keyboard-open differences still need review.
- Felipe’s iPhone acceptance of the chooser is also unverified. No Android or
  iPhone device acceptance is claimed from automated tests.

## Historical review follow-up — preserve existing valid emoji

The API already accepts some emoji that are not separate keys in the pinned
chooser dataset, including skin-tone variants such as `👋🏻`; the package
consolidates those variants under their base emoji. The follow-up now carries
the loaded value into the chooser without making it a selectable grid choice.
Returning unchanged leaves the category emoji intact; only an explicit Clear
or replacement changes it. Actual-router tests cover unchanged-save and
explicit-Clear-save behavior. Felipe reported focused mobile tests 60/60,
TypeScript, lint, and whitespace checks passing for this correction; those
results were not independently rerun in this review. Live visual/device
acceptance remains outstanding.

## Android emoji-entry sheet keyboard correction — 2026-10-04

The prior Pixel 10a audit recorded that opening the Android software keyboard
covered the entire Category emoji text-entry sheet, including the input and
Clear/Cancel/Done actions. The previous Android `height` behavior differed
from the existing Catalog choice sheet, which uses `KeyboardAvoidingView`
padding. The emoji sheet now uses the same padding behavior on Android and
iOS, with a flex-filling avoidance container. When the keyboard is visible it
uses compact bottom spacing instead of reserving the device's home-indicator
safe inset; when the keyboard is closed it retains the existing safe-area
padding. The emoji editor remains ordinary text entry, and its validation,
Clear/Cancel/Done actions, and form draft behavior are unchanged.

Validation actually run for this correction:

- Focused router suite: 58 tests passed, including the Android keyboard
  behavior/padding check and Edit Category trailing-value alignment.
- Full mobile normal run: 34 suites / 232 tests passed.
- Full mobile cold run (`npx jest --runInBand --no-cache`): 34 suites / 232
  tests passed.
- TypeScript, mobile lint, and `git diff --check`: passed.
- No API or database tests were run. PostgreSQL migration and API-suite
  validation are pending with the Codex chat agent and must use only a
  verified `meal_planner_disposable_test` database; `meal_planner_dev` was not
  accessed.

Device status: the reference `edit-category.png` and prior Android
reproduction in the manual QA record were reviewed. A Pixel emulator process
was present, but this session could not attach ADB because its Android user
configuration path resolved to an unwritable `\\.android` location. Therefore
keyboard-open/closed behavior was not visually verified on the emulator, and
no after screenshot is available. Felipe's earlier iPhone confirmation of the
alignment and compact keyboard gap remains limited to those checks; this
Android fix still needs a live-device recheck. The synthetic `QA Catalog
1004-1420 Edited` item was not opened, changed, or archived; its archival
remains unapproved.

Independent follow-up on 2026-10-04: the Codex chat agent verified the
keyboard-open and keyboard-closed Category emoji sheet on the running Pixel
10a Android emulator. The input and all actions remained visible above the
software keyboard with a compact gap; Cancel left the existing emoji intact.
The Store editor's bordered **Remove store** action also rendered consistently
with **Delete category**. This is focused visual coverage, not the full Android
five-flow or iPhone acceptance. Separately, a volume-free PostgreSQL 17
container was checked by both URL name and `SELECT current_database()` as
`meal_planner_disposable_test`; migration reached `catalog_category_emoji
(head)` and the full API suite passed 90/90 with no skips. The temporary
container was stopped and removed. No connection to `meal_planner_dev` was
made, and no Catalog item was deleted.
