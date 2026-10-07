# Native ingredient sheets for Recipes — prototype accepted

## Goal

Make Food selection and Ingredient Details feel like a standard mobile bottom
sheet: the sheet follows a finger immediately, stays attached to the bottom,
settles smoothly, and never disappears behind the status bar. Pulling Ingredient
Details down should reveal the Food list, not close the entire ingredient flow.

Felipe reports that the current Ingredient Details sheet still does not move
while dragging its handle on iPhone. The existing React Native `Modal` plus
custom responder/native-pan experiments are not accepted. Do not treat passing
gesture-threshold or router tests as evidence of physical drag behavior.

## References and interaction

- [Apple Maps' place card](https://support.apple.com/en-euro/guide/iphone/iph1df24639/26/ios/26)
  is the interaction reference: drag the top of the card up or down to resize.
- [Google Maps' Explore panel](https://support.google.com/maps/answer/10014587?hl=en)
  is a second familiar example of content revealed by swiping up from the
  bottom; it is inspiration for the interaction, not a layout to copy.
- [Apple's sheet guidance](https://developer.apple.com/design/human-interface-guidelines/sheets)
  calls for a visible grabber, resting heights (detents), and a swipe to
  dismiss; Back in a multi-step sheet goes to the previous step.
- [Android's partial bottom sheet guidance](https://developer.android.com/develop/ui/compose/components/bottom-sheets-partial)
  shows the corresponding expand/drag/dismiss interaction.
- Preserve the approved visual content in
  `docs/design/recipes/ingredient-search.png` and
  `docs/design/recipes/ingredient-details.png`. These images govern the layout;
  the references above govern motion. Do not copy Maps branding.

Expected behavior: Food selection opens at a useful partial height and can
expand for results. Choosing Food presents Ingredient Details above it. The
Details header/grabber follows upward and downward drags; a short pull returns
smoothly to its resting height. A completed downward dismissal reveals the
same Food list. Back does the same. Cancel closes the whole flow. Long form
content scrolls without moving the sheet unexpectedly. The keyboard must not
cover Amount, Unit, Note, or Save. Unsaved ingredient details must not be
silently saved when the user backs out.

## Proposed implementation

1. First make a minimal, disposable prototype of two stacked Expo Router
   `formSheet` routes using the installed SDK 57 native-stack support. Prove on
   Felipe's iPhone that the upper sheet follows the finger, a downward swipe
   pops only Details, Food selection remains visible, and opening the keyboard
   does not break the motion. Do not migrate the production flow until this
   works. Android may be checked on the emulator afterward.
2. If the prototype works, move the Food selection and Ingredient Details
   steps out of the current transparent React Native `Modal` into those sheet
   routes. Keep the recipe editor's draft in a session/household-scoped
   feature context rather than route parameters. Preserve Food search and the
   create-Catalog-item return path. Replace the custom drag handler and its
   filler/translation code; keep only necessary scroll and keyboard behavior.
3. Use native detents, grabber, and themed content for iOS/Android. Tune
   resting heights on phones against the references rather than assuming one
   fixed pixel height. Account for the native-stack limitation that Android
   form sheets do not render nested headers; put the title and actions in the
   sheet content. Give web an explicit non-gesture route/dialog fallback.
4. If stacked native sheets fail the iPhone prototype or cannot preserve the
   required Back behavior, stop and report the observed limitation. Propose a
   separate alternative before adding a bottom-sheet dependency or another
   custom gesture system. `@gorhom/bottom-sheet` is not the default here: its
   [published v5 guidance](https://gorhom.dev/react-native-bottom-sheet/)
   documents Reanimated v1–3 while this app has Reanimated 4.5.1; compatibility
   would need a focused version/device proof before approval.

## Affected areas and validation

- Mobile Recipes routes/layout, editor draft context, Food selection, Ingredient
  Details, focused tests, and the Recipes manual QA record. No API, database,
  environment, or dependency change is proposed for the native-sheet trial.
- Tests: actual-router Back/swipe-result state, draft preservation, Food create
  and return, household/session invalidation, and keyboard-open form access.
  Router tests can verify state transitions but cannot establish drag fidelity.
- Acceptance: Felipe's iPhone check of slow up/down drags, quick downward
  flick, short-drag snap-back, top/bottom clipping, keyboard open/closed,
  Back/Cancel, and reselecting Food. Check Android layout and gesture on the
  emulator when available. Follow the existing light-mode-first QA preference;
  dark-mode review can wait for major-deployment testing.

Felipe approved the first prototype step. A development-only entry in
the recipe editor now opens synthetic Food and Details form-sheet routes; it
does not edit a recipe or call the API. An actual-router test verifies
Food → Details → Back preserves Food search and Cancel returns to the editor.
Felipe subsequently tried it on iPhone and reported, "There we go that's
perfect." This accepts the prototype's sheet feel, not production data or
other platform flows. The current production ingredient flow has not been
replaced. The broader app-wide migration is proposed separately in
`docs/plans/native-sheets-app-wide.md`; its detailed scope still needs review
before implementation. The Recipes implementation is committed locally; the
unrelated unapproved swipe-Back plan remains untracked and excluded.
