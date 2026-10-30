# Recipe ingredient reordering — F01

Status: proposed October 30, 2026; awaiting review. Planning only: no application,
API, schema, dependency installation, configuration, deployment or data changes.

Branch: `codex/recipe-ingredient-reorder-plan`, from clean `af33f4a` after Felipe
accepted searchable Shopping group collapse. Preserve accepted family-trial
fixes and SDK 58. Implement after approval on a focused feature branch; ownership
follows AGENTS.md unless Felipe directly assigns implementation to this chat.
No push/merge, native rebuild, Mac runtime/data changes or paid resources.

## Goal

Arrange recipe ingredients in the desired order during creation or editing,
then preserve that order after Save and reload without changing their details.

## Proposed interaction

1. Add the requested **three-dot control at the far right** of every ingredient
   row, after existing Edit/Remove controls. Give it a 44-point touch target and
   an accessible label including the ingredient name and position (duplicates
   may share a name). Use existing themed symbols and disabled/pressed styling.
2. **Hold and drag the dots** to move that ingredient vertically. Dragging starts
   only from this handle after a short hold; scrolling elsewhere remains normal.
   Show a modest lifted-row treatment and insertion feedback; neighbouring rows
   move smoothly. Support variable-height names/notes and auto-scroll near the
   viewport edges. Keep row text readable; avoid a dramatic scale effect.
3. **Tap the dots** to reveal that row's **Move up / Move down** buttons inline,
   using the established direction-step movement styling. A second tap closes
   them; opening another row's controls closes the previous ones. This provides
   touch, keyboard and screen-reader access without dragging or a new sheet.
   Disable Up on the first row and Down on the last. Add a short visible hint
   when two or more ingredients exist: hold to drag, tap for move controls.
4. Keep Edit/Remove behavior and the existing ingredient details sheet. Drag
   release must not open movement controls, edit, remove or add an ingredient.
   Announce successful moves (name/new position) for assistive technology and
   preserve focus on the moved ingredient's controls where feasible.
5. Reordering updates **only the current draft**, persisted with the existing
   recipe Save action. No auto-save/request per move. Leaving/cancelling follows
   existing editor draft behavior; do not add a new discard-warning flow.
   A single ingredient keeps a visible but disabled handle; empty lists stay as
   they are. Disable all movement when the editor is loading/saving or its save
   outcome is unknown. While a drag is active, guard Save and other ingredient
   mutations synchronously; restore controls on drop, cancellation or interruption.
6. Support the shared editor from **Recipes Create/Edit** and **Plan Create**.
   Keep Directions reordering, defaults, fractions/To taste, notes, native sheets
   and optional recipe fields unchanged. Recipe sections/importing (F09) are
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
- Use one immutable movement helper for drag drops and Up/Down. Validate drag
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
  no installation yet. Check new dependency advisories without broad audit-fix
  upgrades. Coordinate package refresh if Expo is actively serving the phone.

Implementation belongs under `features/recipes/`: a focused sortable ingredient
component/helper and editor/form/sheet updates. Keep tests outside `src/app/`.
Route wrappers should stay thin. Shared Screen changes must be opt-in and
regression-tested, preserving the accepted keyboard-gap correction.

## Validation after the complete implementation

- Unit/component tests: immutable arbitrary/adjacent moves, first/last/no-op,
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
  edge auto-scroll in both directions, long/short lists, tap movement controls,
  keyboard dismissal, interruptions/tab return and last field/action reachability.
  Confirm arrows/controls match related screens and moved values survive saved
  reloads. Run current appearance; report Android, native builds, hosted CI and
  other unperformed cases as unrun. Mocked drag tests cannot prove native feel.

## References and review decisions

Primary references checked October 30:
[Sortables getting started](https://react-native-sortables-docs.vercel.app/getting-started),
[handle](https://react-native-sortables-docs.vercel.app/helper-components/handle),
[touch coordination](https://react-native-sortables-docs.vercel.app/helper-components/touchable),
[grid/drop/parent-scroll API](https://react-native-sortables-docs.vercel.app/grid/props),
[pinned package metadata](https://raw.githubusercontent.com/MatiPl01/react-native-sortables/v1.10.1/packages/react-native-sortables/package.json),
[release history](https://github.com/MatiPl01/react-native-sortables/releases).

Recommend direct hold-and-drag on the trailing dots, tap-to-reveal Up/Down,
and the named drag dependency with the compatibility check above. Approve this
interaction and dependency scope before implementation. If an explicit global
reorder mode or menu is preferred, revise the interaction first.
