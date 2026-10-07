# Recipes physical-device regression checklist

Felipe considers Recipes v1 finished for now and reports the corrected
ingredient sheets look good on iPhone. This is not a completed pass of every
scenario below; keep this checklist for his later testing.

Use this checklist for repeatable iPhone and Android/emulator acceptance of the
household-scoped Recipes slice. It is a **manual test plan**, not a record of
passing device tests. Compare each live screen side by side with the approved
PNGs in [`../design/recipes/`](../design/recipes/README.md). Record deviations,
including spacing, typography, cards, headers, sheets, and keyboard behavior;
do not infer visual fidelity from automated tests.

### Native-sheet migration retest — October 6, 2026

The first migration opened Catalog Category and Recipes Food as full-screen,
non-draggable pages with status-bar overlap. Moving shared sheet presentation
options to the owning navigator restored the draggable Catalog Category sheet
on Felipe's iPhone. Recipes now uses distinct in-stack routes for Food, Details,
Unit, Cover, and Emoji. An initial iPhone retest of Food → Details still showed
list/form content overlapping sheet headers. The custom-modal-era keyboard
wrapper and nested scroll layout were removed from Food and Details; each
sheet now has one root scrollable surface like the accepted native prototype.
The Recipes route no longer inserts the shared container view above that root.
Felipe reports the ingredient screens look good on iPhone after this correction.
Still check explicitly that both headers and grabbers remain visible with the
keyboard open and closed, Details drags down to the preserved Food search, and
Unit stacks over Details and returns with amount/note intact.
The shared route cleanup now marks a dismissed sheet as already leaving before
removing its saved content, preventing a second fallback Back during a native
swipe. Verify Details → Food → recipe editor dismisses one layer per swipe.
The Android emulator has no installed signed-in app, so Android sheet behavior
is still unverified. Automated routing checks do not establish native geometry.

## Run record and safe setup

### Automated UI correction status — October 5, 2026

The latest mobile-only correction adds explicit cover line heights and larger
emoji scale, human-readable saved ingredient amounts, incomplete-save
guidance, a library search icon, detail metric dividers, and more readable
long-name ingredient rows with labeled Edit/Remove actions. Focused tests
passed 4 suites / 16 tests. Full mobile normal and cold runs each passed 39
suites / 252 tests; TypeScript, lint, and whitespace checks passed. These are
automated results, not manual device acceptance. The Android SDK ADB executable
was present but could not start because it failed to create `\\.android` with
permission denied; no emulator screenshot or live/reference comparison was
captured. iPhone was not tested. All device result blanks below remain **Not
run** until Felipe or another tester completes them on each platform.

### Ingredient selection regression — October 6, 2026

Selecting a Food result now closes the Add ingredient modal and dismisses its
keyboard before opening Ingredient Details, avoiding overlapping native modal
windows. The keyboard-avoidance wrapper also uses `pointerEvents="box-none"` so
its full-screen area does not intercept sheet interactions. The focused
actual-router suite passed 1 suite / 6 tests; TypeScript, lint, and whitespace
checks passed. Native hit testing remains unverified. On iPhone and Android,
select a Food result with the search keyboard both closed and open, scroll the
results, and verify **Done** and **Create Food item in Catalog** still respond.

### Keyboard-safe Recipes entry flow — October 6, 2026

The main editor already uses the shared scrollable `Screen` (iOS keyboard
insets; Android's Expo default `softwareKeyboardLayoutMode: "resize"`). Recipe
emoji entry and Ingredient Details now share a reusable keyboard-avoiding,
bounded scroll-sheet wrapper. Food Catalog search uses the
same wrapper while retaining its own scrollable results list. Nested Unit and
Category pickers already used keyboard avoidance and persistent-tap scroll
lists; at this earlier baseline, the shared Catalog choice/emoji sheets and
time-zone modal were left unchanged. The Recipes
focused suite passed 5 suites / 22 tests; TypeScript, lint, and whitespace
checks passed. No native device was available: Android ADB failed with a
permission error creating `\\.android`; iPhone was not connected. Therefore
keyboard geometry, real touch handling, and small-screen reachability remain
unverified on both platforms.

### Focused follow-up checks — October 6, 2026

These corrections have automated coverage but have not yet been visually
accepted on a phone. In the current appearance, check that Ingredient Details
Back returns to the Food search results, including after opening the keyboard.
Open Unit: the sheet should be compact, its group labels and rows inset inside
the card, and **Use custom unit** should enter a per-ingredient label without
leaving the picker. Select a built-in unit afterward to ensure the custom value
clears. Open Create Food item: it should use the full Catalog form, preserve
the recipe name while creating or managing a category/store, then return the
new Food item to Ingredient Details. Tap a displayed zero in each prep/cook
field and type without first deleting it. Tap Save with no recipe name and
verify a visible inline error. On Recipe detail, compare ingredient column
spacing and the plain iOS Edit action with `recipe-detail.png`. Record phone
results separately from the normal and final no-cache automated mobile runs
(39 suites / 258 tests each).

### Recipe navigation and ingredient-sheet correction — October 6, 2026

The Recipes tab stack now owns Library → Recipe detail → Edit history, so the
native Back arrow on detail should return to Library and Back from Edit should
return to detail. Edit Save uses a plain iOS toolbar action, like detail's Edit.
Food search and Ingredient Details now share one native modal; Back to Food
search clears its filter and should show all Food items without another load.
Its Back icon has a 44-point target. The bounded sheet disables overscroll
bounce so dragging upward should not expose the backdrop or hide the header.
Automated routing checks passed, including the create→detail→Library and
Library→detail→Edit→detail→Library paths and Food-list restoration. Full mobile
tests passed 39 suites / 259 tests, plus TypeScript and lint. Native header
appearance and physical drag behavior are **not yet verified**. On iPhone,
check the Back and Save controls, then drag the Ingredient Details sheet upward
with the keyboard both open and closed. Repeat the navigation and drag checks
on Android when available; record any clipping or modal movement.
Pull Ingredient Details downward from its header, including a short quick
flick: it should return to the full Food list, not close the whole flow.
**Cancel** should still close the flow. Check both with the keyboard open and
closed; this gesture behavior remains pending physical-device verification.
The subsequent handle refinement makes only Ingredient Details' visible bar
52 × 8 points with a 34-point grab area. Its sheet should track a downward
pull, spring back after a short non-dismissal drag, and slide down before the
Food list returns after a completed drag. Focused Recipes router tests passed
10/10, plus TypeScript and lint; motion smoothness is still a device check.
Felipe then reported that this first animation did not track his finger. The
follow-up removes the scroll view around the *entire* sheet (which could
intercept drags and clip the top), keeps a separate scroll view for the form,
and lets the header track upward and downward movement within the available
safe-area space. Felipe reported that the header still did not move at all on
iPhone. The next focused correction uses the already-installed native gesture
handler inside the modal and a native-driven position animation instead of the
JavaScript touch responder. Focused tests (12/12), TypeScript, lint, and
whitespace checks passed; these do not prove physical gesture behavior. Check
that both directions follow the finger, the top stays visible, the bottom
does not expose a gap on upward pulls, short pulls spring back, and a completed
downward pull returns to the Food list. With the keyboard open, verify the form
can still scroll to its lower fields and Save action. This correction is not
yet accepted on a device.

Native-sheet prototype (development builds only): from New recipe or Edit
recipe, tap **Try native sheet prototype** under Add ingredient. This uses
synthetic Milk, Chicken, and Rice entries and saves nothing. On iPhone, slowly
drag the Food sheet up/down, search for Chicken, open Details, then slowly drag
Details up/down. A downward flick should reveal Food with the search still in
place; Back should do the same. Open the Amount and Note keyboards and repeat.
Cancel should return to the recipe editor without changing the recipe draft.
If the two native sheets do not stack or the upper one does not follow the
finger, stop the migration and report the observed behavior. The prototype's
router test passes, and Felipe reports that its native sheet feel on iPhone is
"perfect." This is not acceptance of the production ingredient flow or a
complete keyboard/Android/web check.

- Date, tester, device/OS, app commit, API environment, appearance (light/dark):
- Household A and Household B: dedicated QA households, with synthetic data only.
- Account 1 and Account 2: active members of A; at least one account is also a
  member of B. Note each account's active household before starting.
- Results: mark each numbered scenario **Pass / Fail / Not run** on each device.
  Capture a screenshot and exact reproduction steps for every failure. Do not
  mark a platform passed based on the other platform's result.
- Use unique names such as `QA Soup <date-time>` and `QA Onion <date-time>`.
  Do not edit or archive anyone's non-QA recipe or Catalog item. Use a safe
  synthetic URL such as `https://example.com/recipe` if testing Source.
- The local API and its database must be at `household_recipes (head)` before
  testing. If testing staging instead, coordinate its migration/deployment
  separately. Never point this checklist's disposable tests at production data.
- At the end, archive only QA recipes and note any QA Catalog items created.
  Archiving is not permanent erasure; do not claim the retained rows are gone.

## 1. Library, search, and view modes

1. Open Recipes in an empty or QA-only household. Verify the empty message and
   create action. The tab root should be top-aligned and headerless, with no
   duplicate top inset or content hidden behind the bottom bar.
2. In a household with at least two QA recipes, verify **grid is the initial
   view**. Switch to list and back. Both modes must show the same recipes and
   counts; both must open the same detail page. Switch tabs and return: the
   selected view should remain. Search by a partial recipe name, test no
   matches, and clear search.
3. Compare grid and list with `recipes-library-grid.png` and
   `recipes-library-list.png`. Check card/row proportions, initials or emoji,
   search, switcher, counts, long names, and light/dark contrast.

Result — iPhone: ___  Android: ___  Notes/screenshots: ___

## 2. Required fields and draft preservation

1. Tap Create Recipe. Try to save with no name and no ingredient, then with a
   name but no ingredient. The recipe must not be created; the missing fields
   must be clear. Do not interpret a disabled Save control as a failed test.
2. Enter `QA Soup <date-time>`. Open and close the cover and ingredient sheets,
   expand/collapse More details, and briefly switch tabs if the route remains
   mounted. Verify the unsaved name and other entered fields remain. Back out
   without saving, reopen Create, and check that a fresh draft does not expose
   the abandoned one.
3. Check the single native header and Back behavior. Compare the full form and
   disclosure with `recipe-editor.png` and `recipe-editor-more-details.png`.

Result — iPhone: ___  Android: ___  Notes/screenshots: ___

## 3. Ingredient search, inline Catalog creation, and editing

1. Open Add ingredient. Search for an existing active **Food** Catalog item;
   a Household-type item must not be offered. Select a Food item with the
   search keyboard closed, then repeat with it open. Ingredient Details must
   open in both cases. Scroll the results and verify **Done** and **Create Food
   item in Catalog** remain responsive. Enter amount
   `1 1/2`, select a measurement unit, and enter note `diced`. Add it. Check
   that the editor shows the chosen ingredient and `Note: diced`, not
   “optional note.” Reopen Edit for that ingredient, change the amount to
   `1/2` and the note, and save the ingredient. Confirm the change persists.
2. Add a second Food ingredient with no amount or unit (“to taste”). Try a
   custom unit such as `pinch` on a separate QA ingredient if available. The
   custom label must apply only to that ingredient, not appear as a shared
   Catalog unit. Remove one ingredient, then add it again; the recipe must
   retain at least one before final Save.
3. Search for a missing Food item. Use **Create Food item in Catalog** to make
   `QA Onion <date-time>` with an existing category. Return to the recipe: the
   name, ingredients, cover, directions, and More details draft must remain.
   The new Food item should be selectable/used without restarting the recipe.
   Confirm the item exists in Household A's Catalog, not Household B's.
4. Compare these states with `ingredient-search.png`,
   `ingredient-details.png`, and `ingredient-create-food.png`. Check search
   focus, keyboard clearance, sheet dismissal, buttons, and category picker.
5. On a small phone, focus each editor and sheet input in turn: Recipe name,
   recipe emoji, Food Catalog search, ingredient Amount/custom unit/note, and
   Food item name. Confirm the focused field, sheet header, and relevant action
   remain reachable; scroll the sheet when needed; dismiss the keyboard; and
   verify Unit/Category rows and sheet buttons respond with the keyboard open
   and closed. Confirm changing nested choices preserves the recipe draft.

Result — iPhone: ___  Android: ___  Notes/screenshots: ___

## 4. Cover, directions, and optional details

1. With the QA recipe named `QA Soup`, verify the default cover uses name
   initials. Change to one valid emoji using the normal keyboard or paste,
   save the cover, and verify the preview. Invalid text or two emojis must
   show an error and not be accepted. Clear the emoji and verify initials
   return. Do not expect a dedicated emoji keyboard or photo choice.
2. Add three direction steps. Edit the middle step, move the last step up,
   remove one step, and add another. Confirm visible numbering/order matches
   the final sequence. Directions are optional, so an empty step must not be
   saved as a blank direction.
3. Expand **More details (optional)**. Enter servings `4`, prep `0 hours / 15
   minutes`, cook `5 hours / 10 minutes`, notes, and the synthetic source URL.
   Check that the software keyboard does not obscure the active field or Save.
   Collapse/reopen More details and verify its values remain.
4. Compare with `cover-choice-initials-emoji.png`, `cover-emoji-entry.png`,
   `directions-editor-section.png`, `recipe-editor.png`, and
   `recipe-editor-more-details.png` in light and dark appearance.

Result — iPhone: ___  Android: ___  Notes/screenshots: ___

## 5. Save, detail, edit, and refresh

1. Save the QA recipe once. Verify it appears in both library views and opens
   Details. Check the cover, title, servings, natural hours/minutes display,
   ingredient order/amounts/units/notes, numbered directions, notes, and
   Source link. There must be no Add to Shopping List or photo control.
2. Compare the full page with `recipe-detail.png`: hero, grouped sections,
   row spacing, header Edit action, safe areas, and archive action. Check for
   clipped initial/title glyphs and unwanted separators on iPhone as well as
   Android.
3. Tap Edit. Change the name, one ingredient amount/note, a direction, and
   one optional field. Save. Details and both library modes should show the
   new values without a manual tab switch. The automatic reload must not
   leave a pull-to-refresh spinner stuck. Confirm Back returns to the
   expected screen and the prior editor is not restored unexpectedly.
4. If a Save response is interrupted after reaching the API, use the offered
   check/retry action; do not tap a new Create repeatedly. Verify only one QA
   recipe exists. Mark **Not run** if this cannot be induced safely.

Result — iPhone: ___  Android: ___  Notes/screenshots: ___

## 6. Two members, two households, and stale data

1. On Account 2 in Household A, refresh/reopen Recipes and confirm the QA
   recipe from Account 1 appears with its latest edits. Edit a QA field on
   Account 2; refresh Account 1 and confirm the shared change appears. Both
   members should have the same create/edit/archive permissions regardless
   of owner/member role.
2. Switch one account to Household B. Recipes from A must not appear in B,
   including while loading or after switching tabs. Create a uniquely named
   QA recipe in B, then switch back to A: B's recipe must not appear there.
   Search and a pending request from the prior household must not relabel or
   populate the new household's screen.
3. If possible, start a slow refresh and switch household or sign out before
   it resolves. No previous household/account recipe data should flash after
   the switch. Mark **Not run** if the timing cannot be reproduced reliably.

Result — iPhone: ___  Android: ___  Notes/screenshots: ___

## 7. Archive, restore, and household-specific history

1. Open the exact QA recipe in A. Tap Archive recipe and **Cancel** first;
   the recipe must remain active. Confirm archive on the second attempt. It
   must leave the active library on both devices after refresh.
2. Open Profile → My households → Household A → Archived recipes. Confirm the
   QA recipe appears with the correct household context. Restore it. It must
   leave Archived recipes and reappear in A's library with ingredients and
   directions intact. A member, not only an owner, should be able to restore.
3. With B selected as the active household, open **A's** household details and
   Archived recipes. The list and Restore action must still affect A, not B.
   Compare this screen with `archived-recipes.png`.

Result — iPhone: ___  Android: ___  Notes/screenshots: ___

## 8. Loading, retry, accessibility, and final visual sweep

1. While the API is temporarily unavailable, open/reload the library and a
   QA detail. Existing data, if shown, must be marked as potentially stale;
   errors must offer a usable Retry. Restore the API and retry without
   creating a duplicate. Do this only with a local QA API you can safely
   stop; otherwise mark **Not run**.
2. Check all nested pages and sheets for one header, visible Back, top-aligned
   content, reachable controls above the software keyboard, and no extra
   safe-area gap. Use a short and long recipe name; check small-screen and
   larger-text behavior if available.
3. With VoiceOver/TalkBack, verify Create, grid/list, Edit, ingredient actions,
   step reorder/remove, Save, Archive, Restore, and sheet close controls have
   understandable labels and states. Confirm touch targets and color contrast
   in light and dark themes. Report native-platform differences separately.
4. Review all twelve approved PNG states. Record each mismatch rather than
   saying only “looks close.” Note any screen or interaction that could not be
   exercised and why.

Result — iPhone: ___  Android: ___  Notes/screenshots: ___

## Final outcome

- Scenarios passed / failed / not run on iPhone:
- Scenarios passed / failed / not run on Android:
- Visual deviations and screenshots:
- Functional bugs and reproduction steps:
- QA recipes archived/retained; QA Catalog items created for later review:
- Open acceptance gaps (do not count Not run as Pass):
