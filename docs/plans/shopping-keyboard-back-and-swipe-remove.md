# Shopping picker, return navigation, and swipe removal

Status: implemented locally after Felipe's approval. Felipe accepted the
current iPhone swipe interaction; broader manual regression remains open.
Work on `codex/household-shopping-redesign`; preserve all existing uncommitted Shopping work and the separate app-wide consistency plan. Do not commit or push without a separate request.

## Goal

Finish the first Shopping slice's phone interactions: keep **Create item in Catalog** visible while searching, return from Catalog editing to the Shopping edit sheet, and make removing one Shopping entry quick by either swiping left or tapping Remove in Edit.

## Affected areas and proposed changes

- **Add-item Catalog picker:** Retain the approved tall native sheet, fixed search, independently scrolling results, header `+`, and a Create action below the results. Felipe previously reported that the Create button was moving up with the keyboard, then later reported that it was hidden again. First compare the current picker and native-sheet changes against that last phone-tested behavior, reproduce the regression, and correct the specific cause. The action must sit immediately above the open keyboard, return below the list when closed, keep the first result visible, and remain usable during keyboard movement and sheet detent changes. Do not auto-scroll the results. Verify the native-sheet layout on a physical iPhone before considering this regression closed.
- **Edit Catalog item round trip:** Add a visible, accessible Back button on the full Catalog edit page opened from the Shopping edit sheet. Back returns to that same Shopping edit sheet with its unsaved amount, unit, and store draft intact. Saving a Catalog change also returns through the existing Shopping flow; check cancellation and a household/session change.
- **Shopping rows:** On both To buy and Purchased entries, a short left swipe reveals one circular red trash action and leaves the row open, matching Felipe's three Messages screenshots except for omitting Messages' second action. Tapping the trash action removes the entry. Continuing a single drag to a deliberate far-left threshold, or dragging an already-open row farther left, expands the red action into a pill behind the row and removes the entry on release. Dragging back closes the action without deleting or opening Edit. The row follows the finger; vertical scrolling, ordinary row/checkbox taps, and an accessible non-swipe Remove path remain usable. Prevent repeated requests and restore the row with an error if deletion fails. Do not remove the Catalog item, recipe ingredient, or meal plan.
- **Edit item sheet:** Tapping **Remove from Shopping** performs the same one-item deletion immediately, with a pending state and inline error if it fails. Remove its alert/confirmation. Preserve the **Clear list** warning because that affects every entry.
- **State:** Make one-item deletion update only that row, without a whole-page loading spinner or a stale refresh resurrecting it. Guard against late responses after user/session/household changes. Store filters, sort order, and Purchased counts should update from the resulting local list.

## Design and technical decisions

The saved [Shopping main](../design/shopping/shopping-main.png), [Add item picker](../design/shopping/shopping-catalog-picker.png), and [Edit details](../design/shopping/shopping-edit-details.png) images remain the resting-screen references. Felipe's October 11 Messages screenshots are the interaction reference: resting row, one round red trash icon after the first swipe, and an expanding red pill under a far-left drag. The resting Shopping row remains unchanged. Immediate one-item removal is an explicit exception to the earlier general rule to confirm destructive actions; whole-list clearing stays confirmed.

Do not assume the existing iOS accessory is the cause of this recurrence: Felipe's earlier phone check reported improved keyboard movement, and the exact regression has not been isolated. React Native 0.86 does document a [bottom-tab-bar limitation](https://reactnative.dev/docs/0.86/inputaccessoryview) for `InputAccessoryView`, so test that interaction explicitly, but preserve the prior working solution if a smaller regression fix restores it. Do **not** add a dependency under this plan. If the current approach proves unreliable even after the regression is isolated, return with evidence and a separate choice between a project-owned layout fix and Expo SDK 57's supported `react-native-keyboard-controller` 1.21.9 ([Expo documentation](https://docs.expo.dev/versions/v57.0.0/sdk/keyboard-controller/)); obtain approval before installing it.

For swipe, use the already installed Expo-compatible `react-native-gesture-handler` 2.32 and Reanimated 4.5; no swipe dependency is proposed. The earlier [Reanimated Swipeable](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/components/reanimated_swipeable/) has one open snap point and cannot provide both a stable reveal and a far-left, full-row drag. Replace only the Shopping row with a focused Gesture Handler Pan + Reanimated translation and two release thresholds. Keep row-local animation on the UI thread and invoke one-item removal only after the full-swipe exit animation or an explicit trash tap. Do not use `PanResponder` or alter native sheet dragging.

## Validation

Complete the intended code and test edits first, then run one coordinated mobile validation pass: focused Shopping hook, row/gesture, sheet, and router tests; full mobile suite; TypeScript; lint; whitespace check. No API or database behavior is expected to change, so no PostgreSQL run is required for this follow-up. Report any test/mock limitations around native gesture and keyboard animation rather than treating component tests as device proof.

On iPhone, test keyboard open/closed, search with zero/one/many results, footer during a keyboard drag and sheet resize, Catalog edit Back with an unsaved Shopping draft, both short and long left swipes, checkbox and row taps, deletion failure, and Remove in Edit. Check Android for the same flows in the current appearance. Compare the resting screens against the three saved images and related Catalog/Recipes controls. Do not repeat a dark-mode pass until the next major deployment.

Implementation record (2026-10-11): The Catalog edit page has an explicit Back control. Shopping rows use the existing gesture library for a left-swipe Remove action; the Edit sheet's Remove action deletes immediately, while Clear list still confirms. One-item removal updates only that row and restores it on failure. No dependency or API change was made. Focused Shopping/router tests passed (4 suites, 104 tests), followed by the full mobile run (47 suites, 316 tests), TypeScript, and lint. Existing non-failing React `act(...)` warnings still appear in Shopping sheet tests.

Follow-up iPhone checks: The first screenshot showed that the keyboard still hid the Create footer, failing keyboard acceptance. A subsequent `KeyboardAvoidingView` attempt made the footer visible but clipped the fixed header and search even with the keyboard closed; that attempt was reverted. The picker now retains a non-collapsible native root/header inside the form sheet, keeps the header and results in fixed/scrolling layout, and positions only the footer from the keyboard's screen coordinate using [React Native 0.86 keyboard events](https://reactnative.dev/docs/0.86/keyboard). Felipe reported that the picker looked good with that structure. The temporary development layout readout used during diagnosis was then removed without changing the native root/header. Focused Shopping sheet tests (9/9), TypeScript, and lint passed after its removal. The full 316-test mobile run predates these follow-ups and is historical, not validation of the latest edit. A final post-cleanup device check and native swipe acceptance remain unrecorded.

Swipe follow-up: iPhone testing found that a swipe release could also trigger the row's Edit action, whether the swipe was cancelled or completed. The first attempt added tap suppression and a farther single release threshold; focused Shopping screen tests passed (11/11), as did TypeScript, lint, and whitespace checks, but Felipe did not accept its feel. His newer three-state Messages reference supersedes that single-threshold behavior. Device acceptance of the two-stage replacement remains pending.

Two-stage replacement (2026-10-11): Shopping rows now use one focused Gesture Handler Pan and Reanimated translation. A short left drag settles with a single 56-point, bright-red circular trash action; a far-left drag expands it into a red pill, moves the row offscreen, then removes that entry. The trash button also removes the revealed entry. Dragging back closes without deleting or opening Edit, and only one row is left revealed at a time. A failed delete restores the row, reports an error, and resets the action for retry. No dependency, API, database, or native-sheet behavior changed. Focused mobile checks passed (3 suites / 17 tests), plus TypeScript and lint; native animation, touch competition, and pixel-level visual fidelity still require Felipe's iPhone check. The earlier full mobile/API results are historical and were not rerun for this row-only follow-up.

## Open questions

None blocking implementation. No new dependency was added. An Undo action is not included in this first pass; a shorter swipe must never delete, and the existing Edit path remains the accessible alternative.

Closeout follow-up (October 12, 2026): After iPhone review, the full-delete
threshold was set to 65% of the row width. A later fix restored the stable
short-swipe reveal at that threshold. Felipe confirmed the final behavior
looks right: the red trash action stays open for tapping, while a deliberate
far-left drag deletes. The reveal also closes on refresh, scrolling, or other
list actions. This supersedes the earlier pending swipe-acceptance notes;
Android, failure/retry, and every checklist scenario are not claimed as tested.
