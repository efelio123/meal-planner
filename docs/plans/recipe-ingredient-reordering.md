# Recipe ingredient reordering — F01

Status: approved by Felipe October 30, 2026 with "Okay, implement" and
assigned directly to this chat. Implemented on `codex/recipe-ingredient-reordering`
from `24f41e3`; automated validation passes; physical phone acceptance is pending below.
Felipe authorized stopping the active Expo process for the approved installation;
only this checkout's Expo process was stopped. The API stayed running.

Preserve accepted family-trial fixes and SDK 58. No push/merge, native rebuild,
Mac runtime/data changes or paid resources are included in this slice.

## Goal

Arrange recipe ingredients in the desired order during creation or editing,
then preserve that order after Save and reload without changing their details.

## Design references and reviewed animation

Felipe's October 30 attachments supersede the original three-dot/tap-menu idea:

- **Photo 1.jpg:** confirmed handle style is three equal horizontal strokes,
  softly rounded and neutral-colored, aligned at the far right of each row.
  Retain the app's theme and ingredient content; the reference's white surface
  and sample names are not a request to restyle the whole editor.
- **Pasted Image 2.jpg:** the original upload and its re-upload arrived as
  single-frame JPEGs, so those files could not show motion.
- **Working animation:** Felipe subsequently provided
  [the source GIF](https://sarunw.com/images/swiftui-list-reorder-long-press.gif).
  It is an actual 71-frame, 808x683 GIF. Sampled frames across its progression
  confirm a held row lifting above the list with a shadow, following the drag,
  neighbouring rows shifting to make space and the released row settling back.
  John moves from first to third; Bar later moves above Foo. Use this motion
  with Photo 1's handle: the GIF does not display that handle. Do not copy its
  simulated phone chrome, mouse pointer, blue touch circle or light palette.
  Match the visible lift/reflow/drop phases; tune exact timings on-device rather
  than claiming frame sampling establishes precise easing constants.

## Proposed interaction

1. Add a **three-horizontal-line drag handle at the far right** of every
   ingredient row, after existing Edit/Remove controls. Match Photo 1's simple
   three-stroke style using a consistent themed symbol, with a 44-point touch
   target and an accessible label including ingredient name and position.
   Duplicate ingredient names must remain distinguishable.
2. **Hold the handle until the row lifts, then drag** to move an ingredient
   vertically, following the GIF's activation/lift sequence. Activation remains
   handle-only; ordinary scrolling elsewhere stays normal. Tune the hold delay
   during phone review. A plain tap opens no menu and reveals no controls.
3. **No visible Move up/Move down buttons, no tap-to-reveal panel and no reorder
   menu.** Keep the row visually simple as requested. Supply nonvisual
   move-earlier/later accessibility actions and keyboard equivalents where
   supported, using the same movement helper, without introducing visible
   alternatives. Announce the ingredient's new position and retain accessible
   focus on its handle where feasible.
4. **Match the reviewed GIF's reorder animation:** lift the active row above
   the list with a soft shadow and modest separation/emphasis, keep it tracking
   the finger, smoothly shift neighbouring rows to show the insertion position,
   then settle it into the row slot and remove the lift/shadow on release.
   No abrupt jump, exaggerated zoom or added bounce. Compare actual motion with
   the linked GIF during device review. Respect reduced motion without disabling
   reordering. Support variable-height names/notes and edge auto-scroll without
   changing the row's content height during a drag.
5. Keep Edit/Remove and the current ingredient-details sheet. Drag release or
   cancellation must not edit, remove, add or save an ingredient. Reordering
   changes **only the current draft**, persisted by recipe Save, not per move.
   Leaving/cancelling follows existing draft behavior; no new discard warning.
   A single ingredient has a visible but disabled handle; empty lists stay as
   they are. Disable movement while loading/saving or save outcome is unknown.
   During a drag, guard Save and ingredient mutations synchronously, restoring
   controls on completed drop, cancellation or interruption.
6. Apply the same behavior in **Recipes Create/Edit** and **Plan Create**.
   Keep Directions controls, defaults, fractions/To taste, notes, native sheets
   and optional recipe fields unchanged. Recipe sections/importing (F09) remain
   separate; this is one flat ingredient list.

## Source findings and state/persistence changes

- RecipeEditorScreen currently keys rows by Catalog ID + array index, and
  ingredient-detail saves target an index. RecipeIngredientDraft has no stable
  row key. Repeated uses of the same Catalog item must remain distinct.
- Give every local ingredient occurrence an immutable UI key, assigned once
  on load/create and retained through edit/reorder. Replace index-based edit/
  remove callbacks with key-based targeting, including details-sheet callbacks.
  Resolve the current position only at the action boundary. A stale callback
  for a removed/reloaded row must not replace a different ingredient.
- Use one immutable movement helper for drag drops and nonvisual move actions. Validate drag
  results against the current keys and editor generation/scope; ignore late
  results after household/session/recipe change, editor reload/unmount or an
  interrupted drag. Restore the original draft order on cancellation. Moving
  nowhere does not dirty the ingredients; a real move marks ingredientsDirty.
- Keep each occurrence's amount, built-in/custom/no unit, note and Catalog
  reference attached to its key. Local keys never enter API payloads. Preserve
  the existing scoped save/retry and expected_revision conflict safeguards.
- The API already enumerates the submitted ingredients array into positions,
  and detail GET orders by position. No endpoint/schema change is planned.
  Creation sends the draft array order; an order-only edit sends ingredients
  even though individual values are unchanged. Saved detail/reopened editor
  must reproduce it, including duplicate Catalog ingredients.

## Drag implementation and dependency decision

Recommend pinning **react-native-sortables 1.10.1** for a one-column sortable
inside the existing editor scroll, using its custom-handle and drop callbacks.
Its documented Gesture Handler 3/Reanimated 4 support fits the installed
Expo 58 / RN 0.88 / RNGH 3.3 / Reanimated 4.7 / Worklets 0.13 baseline at the
API/dependency-range level; this does not establish device compatibility yet.
Its published development baseline is older than our RN version, so verify the
resolved release and real gestures before claiming support.

- Benefit: existing support for measured sizes, coordinated handles/touchables
  and parent auto-scroll avoids maintaining a new custom drag engine. Commit
  order only on completed drop, not on animation-preview callbacks.
- Keep **one page scroll owner**. Add an opt-in animated-scroll/ref facility to
  shared Screen for this editor's parent auto-scroll, retaining its tab-stack
  safe-area/keyboard contract. Default callers must remain unchanged; do not
  nest a vertical FlatList/ScrollView or recreate the recipe page layout.
- Alternatives reviewed: existing RNGH/Reanimated custom gestures avoid a new
  package but require bespoke variable-height placement, scroll and interruption
  handling. A FlatList-based reorder library would require broader editor/scroll
  changes. Both cost more than the proposed scoped integration.
- The proposed MIT package is free. Its metadata declares an optional native
  haptics dependency; inspect the resolved dependency/autolinking graph rather
  than assuming it is JS-only. Keep haptics disabled, add no haptics feature or
  extra native integration, and verify Expo Go/bundling does not require a new
  native module. Do not silently upgrade SDK/gesture/animation packages or add
  native configuration. If compatibility requires that, revise the plan first.
- Approval includes this named package/lockfile change, subject to that check;
  the named package is now installed. Check new dependency advisories without broad audit-fix
  upgrades. Coordinate package refresh if Expo is actively serving the phone.

Implementation belongs under `features/recipes/`: a focused sortable ingredient
component/helper and editor/form/sheet updates. Keep tests outside `src/app/`.
Route wrappers should stay thin. Shared Screen changes must be opt-in and
regression-tested, preserving the accepted keyboard-gap correction.

## Validation after the complete implementation

- Unit/component tests: handle-only activation, plain tap reveals no controls,
  immutable arbitrary/adjacent moves via drag/accessibility, first/last/no-op,
  duplicate Catalog rows and stable keys, retained measurements/notes, dirty
  flags and payload order without UI keys. Edit/remove after reorder affects
  the intended key; adding an ingredient appends it without scrambling others.
- Actual-router tests: Recipes Create/Edit and Plan Create; move ingredients,
  edit a moved occurrence, save/reload and inspect payload/display order. Cover
  failed/unknown save, revision conflict, native-sheet Back/dismiss and scope/
  recipe changes with late drop/details callbacks. Preserve Directions and
  current fraction/To taste/default-unit cases.
- Targeted API persistence test on **identity-verified local
  meal_planner_disposable_test PostgreSQL only**: create and reorder an existing
  recipe, GET positions/order, preserve repeated Catalog occurrences/details,
  and reject a stale revision. No Mac trial/development DB tests or data changes.
- After intended edits: relevant Recipe/form/router tests, full mobile suite
  once for the dependency/shared-scroll final pass, TypeScript, lint, dependency
  compatibility/advisory checks and whitespace. No full database suite for
  this schema-free client feature; broaden if server behavior changes.
- Phone review: actual handle drag vs ordinary scroll, variable-height rows,
  edge auto-scroll in both directions, long/short lists, nonvisual movement actions,
  keyboard dismissal, interruptions/tab return and last field/action reachability.
  Compare the three-line handle with Photo 1 and lift/reflow/drop motion with
  the linked, reviewed GIF. Confirm moved values survive saved reloads. Run current appearance; report Android, native builds, hosted CI and
  other unperformed cases as unrun. Mocked drag tests cannot prove native feel.

## References and review decisions

Primary references checked October 30:
[Sortables getting started](https://react-native-sortables-docs.vercel.app/getting-started),
[handle](https://react-native-sortables-docs.vercel.app/helper-components/handle),
[touch coordination](https://react-native-sortables-docs.vercel.app/helper-components/touchable),
[grid/drop/parent-scroll API](https://react-native-sortables-docs.vercel.app/grid/props),
[pinned package metadata](https://raw.githubusercontent.com/MatiPl01/react-native-sortables/v1.10.1/packages/react-native-sortables/package.json),
[release history](https://github.com/MatiPl01/react-native-sortables/releases).

Recommend the referenced three-line drag handle with animated movement and no
visible Up/Down controls or tap menu. Use the linked GIF's observed lift,
neighbour reflow and settling phases, tuning exact hold/easing on-device. Felipe subsequently approved this interaction and the pinned dependency and
requested direct implementation in this chat.

Revision history: the initial proposal used trailing dots and tap-to-reveal
Up/Down. Felipe replaced that design with three horizontal lines and drag-only
visible interaction. Nonvisual accessibility/keyboard movement remains possible
without adding visible buttons. Initial uploads were one-frame JPEGs; Felipe
then provided the source URL above, verified as a 71-frame GIF and inspected
across its animation frames. That revised interaction was approved before
implementation.


## Implementation and validation — October 30

- Shared Create/Edit editor now uses a one-column `react-native-sortables`
  1.10.1 grid with a 44-point handle containing three equal neutral strokes.
  Hold delay is 250 ms; lift scale 1.025, shadow opacity 0.18, activation/drop
  180 ms. Reduced motion removes scale/shadow and shortens those phases to zero;
  neighbour movement retains Reanimated's system motion handling. These initial
  values still need comparison with the GIF on a phone.
- Parent Screen opts into Animated.ScrollView/ref only for this editor, retaining
  one scroll owner and existing native safe-area/keyboard handling. Existing
  ingredient grouping is retained without clipping the lifted row's shadow.
- Each local occurrence gets a fresh key on create/load. Drop permutations and
  accessibility/Alt+Arrow movement reuse immutable key-based helpers; Edit/Remove
  and details-sheet saves follow those keys. Keys never enter server payloads.
- The library reports native cancellation and normal release through the same
  drop API. A passive, simultaneous RNGH 3 manual observer records actual native
  release/cancel without stealing drag activation. It releases its own native
  state on pointer-up. Only a confirmed release commits after settling; cancel
  restores the original draft order. No library patch/custom drag engine was added.
- UI-thread interaction ownership and JS scope/generation guards protect Save,
  ingredient mutations and delayed callbacks across blur, background, reload,
  household/session/recipe changes and unmount. Unknown saves disable movement;
  order-only edits participate in the existing revision/recovery path.
- Optional `react-native-haptic-feedback` 3.0.0 resolves in the lockfile. Haptics
  remain false; pinned source loads its native adapters only when enabled. The
  current read-only iOS autolinking graph does not include that optional package.
  No native configuration or native build was changed.
- Test adapters use installed Worklets/Reanimated mocks with persistent shared
  values and scheduled RN callbacks; Reanimated 4.7's native CSS initializer is
  inert in Jest. Router imports the mock subpaths itself, so both entry paths
  share those test semantics. Native gesture/layout is the mocked boundary;
  drafts, navigation, save payloads and recovery stay real. The existing Plan
  detent test now supplies the provider required by its actual layout.

Final automated validation:

- Full mobile Jest suite: **61 suites / 594 tests passed**. Includes real-router
  Recipes Create and Plan Create duplicate-row reorder/edit/save, order-only
  revision conflict/reload, unknown-save recovery without confusing old order
  for success, late drop after leaving/reopening, canceled-drop non-dirty state,
  gesture lock, and existing native-sheet/default-unit/fraction/To taste cases.
  Component tests separately exercise confirmed native release versus cancel,
  plain tap/single-row disabled state, nonvisual movement, and stale activation.
- `npx tsc --noEmit`, `npm run lint`, and `git diff --check`: passed.
- New targeted PostgreSQL recipe order test: **1 passed** after verifying
  `127.0.0.1:5432/meal_planner_disposable_test` by connection identity and bringing
  that disposable database to Alembic head. Covers create, order-only update,
  duplicate occurrences/details, GET positions and stale revision rejection.
  Full database suite was not run for this schema-free client feature.
- Final `expo export --platform ios` succeeded (2146 modules), writing only to a
  temporary directory. This verifies bundling, not an installed native app.
- Read-only `expo-modules-autolinking react-native-config --platform ios --json`
  succeeds; optional haptic feedback is absent from its current native graph.
- `npm audit --json` lists **no advisory for either added package**. Existing
  total is 48 (3 high, 44 moderate, 1 low; 0 critical); no broad audit fix applied.
- `expo install --check` is **not passing**: it now recommends newer patch
  releases for twelve already installed SDK 58 packages, including Expo 58.0.21
  and RN 0.88.1. None concerns the added sortable package. The pinned installed
  baseline remains Expo 58.0.19 / RN 0.88.0 / RNGH 3.3.0 / Reanimated 4.7.1 /
  Worklets 0.13.0; upgrading it is outside this approved dependency change.

Physical handle feel, scrolling/edge auto-scroll, larger text, keyboard show/hide,
reduced motion and interruption review remain pending. No native/Android build,
hosted CI, push/merge or trial deployment has been performed. Expo was left
stopped after the user-authorized package installation; restart it from this
worktree's `apps/mobile` directory with `npx expo start --lan --clear` to review.
The API process and Mac trial runtime/data were not changed.


### Phone review and separator polish — October 30

Felipe reviewed the drag flow positively ("Looks great") and requested that the
row's top separator not lift with it. The row now makes that separator transparent
while active and throughout settling, restoring it only after the lift animation
ends. Its hairline width stays reserved, so row measurements and drag behavior do
not change. This uses the pinned library's per-row activity/animation values.

Follow-up validation: two targeted ingredient/component/router suites, **38 tests
passed**, plus TypeScript, lint and whitespace checks. The preceding 61-suite /
594-test result covers the larger implementation before this styling follow-up;
the full suite and database tests were not rerun for the separator-only change.
The updated separator appearance still needs phone confirmation. Expo remains
under Felipe's control in his own terminal; it was not restarted or stopped here.


### Top-drop separator timing follow-up — October 30

Felipe observed a brief top border when a row landed first, before the separator
moved below it. The prior fix restored border color when lift progress reached
zero, but React still supplied the row's original index until the scheduled
completed-drop callback updated the draft. The separator now reads the library's
UI-thread key-to-index map directly. It stays hidden for visual slot zero and
for the active/settling row, independent of when React commits the new order.
It is an absolute decorative line rather than a layout border, avoiding the
hairline height change when moving into or out of the first slot.

A focused regression models the native order reaching slot zero while the React
draft still has its original order, then checks the committed order as well.
Three targeted component/Recipes/Plan router suites: **55 tests passed**;
TypeScript, lint and whitespace checks also passed. The earlier full-suite result
remains historical; full mobile/database suites and native visual checks were
not rerun for this focused styling/timing follow-up. Phone confirmation of this
specific flicker correction is pending. Expo/API processes were not changed.


### Grab-only haptic feedback follow-up — October 30

Felipe requested a small vibration when an ingredient is grabbed, superseding
this slice's earlier decision to leave all feedback off. This focused follow-up
adds one light iOS impact / native Android drag-start cue on a validated grab,
with no feedback on plain taps, row crossings, drop, cancellation, accessibility
moves or stale callbacks. Keep the sortable library's own haptics disabled
because it emits additional medium start/drop and light crossing impacts.

Use official SDK 58-compatible `expo-haptics` 58.0.7, recommended by both the
installed Expo bundled-module map and versioned documentation. The built-in
React Native Vibration API produces an approximately 400 ms iPhone vibration,
which is unsuitable here. The optional native haptic feedback package is not
available in Expo Go's native graph. This adds one free MIT package without
upgrading SDK/gesture dependencies. Expo Go supports Expo Haptics; separately
installed native apps gain the module on their next rebuild. Its Android VIBRATE
permission is supplied by the module itself. No native configuration file,
Mac trial runtime or installed binary is changed in this follow-up.

Add a small shared helper in `src/lib/haptics.ts`. The resolved module uses
`requireOptionalNativeModule`, so import it normally and catch unavailable-device/
module failures when requesting feedback; older native builds still drag normally. Call it after the editor's existing scope,
focus, loading and interaction guards and deduplicate repeated starts. Do not
await feedback or change gesture timing, persistence or navigation.

Validate grab-only/deduplicated feedback, platform/failure no-op behavior and
existing Recipes/Plan drag routes; run TypeScript, lint, iOS JS export and a
focused dependency/advisory review after intended edits. Tactile strength still
needs phone review. Do not stop Felipe's Expo server or rebuild/deploy the native
trial app for this small package addition.


Grab-feedback validation: four targeted helper/component/Recipes/Plan suites,
**60 tests passed**; TypeScript, lint, whitespace and final iOS JS export also
passed (2150 modules). Tests cover one light iOS impact, native Android grab cue,
web no-op and native failure tolerance; router checks verify one cue despite a
repeated start callback and no extra cue on accessibility movement or canceled
drop. `expo-haptics` 58.0.7 matches Expo's installed `~58.0.7` recommendation and
adds no transitive dependencies. Audit reports no advisory for it; existing audit
totals remain 48 (3 high, 44 moderate, 1 low, 0 critical). No SDK upgrade, native
rebuild, server restart or trial deployment was performed. Full mobile/database
suites were not rerun for this focused follow-up; earlier results are historical.
Actual iPhone/Android tactile review remains pending.
