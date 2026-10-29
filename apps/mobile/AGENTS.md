# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.
For this SDK migration, also follow https://docs.expo.dev/router/migrate/sdk-57-to-58/.

## Screen and reference-image checks

- Treat a native stack header, a native tab root, and a modal sheet as different
  safe-area owners. For a nested screen below a visible native stack header,
  do not also apply `Screen`'s top safe-area edge. Keep tab-root, auth, and
  onboarding inset behavior separate. Check the first content position on an
  actual device after changing layout; a passing component test is not proof
  that native insets are correct.
- For UI work with images in `docs/design/`, inspect each applicable image
  before implementation. Reproduce its hierarchy, spacing, grouping, and
  controls as closely as the platform permits. State any necessary deviation
  and its reason in the review handoff instead of silently substituting a
  different design. Validate keyboard-open, keyboard-closed, and sheet-dismiss
  states in addition to the resting screen.
- During visual review, compare the rendered screen with related screens in
  the app, not only its reference image. Same-purpose actions (especially
  primary, destructive, and navigation actions) should share the same visual
  treatment, spacing, and interaction states unless a difference is intentional
  and documented. Use the current appearance for routine feature review; save
  a dedicated light/dark pass for major deployments.

## Page reachability standard

- Every page must explicitly identify its layout/safe-area owner and reuse the
  shared Screen contract where applicable. Tab roots, pushed pages below native
  headers, full-screen modals, native sheets, and standalone auth/onboarding
  pages have different visible chrome. A route inside a tab folder does not
  prove the tab bar is visible. Shared feature screens must receive the correct
  layout from their presentation owner when reused in different frames.
- A page's last row, field, and action must be reachable above its visible tab
  bar, home indicator, and keyboard and stay visible after releasing the scroll.
  Keep bounded scrolling parents and one inset/keyboard owner per layer. Do not
  compensate with guessed tab heights, blanket padding, or duplicate top insets.
- Verify long and short/empty content, keyboard show/hide, larger text, and
  return from nested sheets. Fixed Create/Add/Save actions belong outside long
  result lists when they must stay visible. Preserve native sheet dragging,
  headers/search, and existing draft/Back behavior. Tests for wrapper properties
  do not prove device geometry or scroll settling; report physical checks as
  unrun when they have not been performed.
- Pass the required Screen `layout` explicitly: `tab-root`, `tab-stack`,
  `stack-modal`, or `standalone`. Shared Catalog forms/managers receive the
  layout from their route wrapper. Do not restore the old inset booleans or
  directly export a shared form that requires layout props as a route.
- Fixed-footer sheets use KeyboardAwareSheet with a measured native View root;
  a sheet already resized by the keyboard must receive zero additional overlap.
  Single-scroll forms use their scroll view's keyboard inset handling instead.
  Do not combine these owners or assume keyboard height equals sheet overlap.
- For inline input on a tab page, pass Screen a stable `inlineKeyboardActive`
  boolean. Its measured keyboard frame belongs inside the native safe area.
  Do not wrap Screen in KeyboardAwareSheet: the tab bottom inset would remain
  inside the reduced frame and create an extra gap above the keyboard.
- The approved audit and layout repair are recorded in
  `docs/plans/app-wide-page-reachability.md`; retain its acceptance checklist.

## Emoji rendering

- Render emoji icons/previews with the shared `EmojiText` component. It keeps
  their intended icon size and lets the system emoji font supply natural glyph
  metrics. Do not enlarge ordinary ThemedText for emoji: its inherited line
  height can clip them. Keep adjacent readable labels in ordinary themed text.
- Use shared EmojiInput for editable emoji. Its padded native multiline engine
  avoids the single-line glyph rectangle, and blurAndSubmit keeps Done from
  inserting a newline. Preserve each flow's validation and explicit save action.

## Native-sheet standard

- Before adding a short selection or entry flow, read
  `docs/plans/native-sheets-app-wide.md` and inspect the existing
  `src/app/native-sheet/[sheetId].tsx` route and `src/features/native-sheets/`
  context, screen, and route options. Reuse that scoped native `formSheet`
  pattern rather than a custom `Modal`, `PanResponder`, or a full-screen page
  that only looks like a sheet. Full detail/manage screens stay in their
  ordinary native stacks; destructive actions need explicit confirmation.
- Give each sheet an in-content title and accessible Back/Cancel/Done actions;
  native route headers may not render inside a form sheet on every platform.
  Use content-appropriate detents and a visible grabber. Keep the top below
  the status bar and the bottom above the keyboard/safe area, with no large
  empty gap or clipped controls. Long content must scroll without blocking an
  intentional downward drag or quick flick from the sheet header.
- For stacked sheets, dismissing the top layer must reveal the previous layer
  with its search and form draft intact. A drag never saves or confirms a
  destructive action. Household, user, or session changes must clear the
  sheet flow and ignore stale results. Provide a usable explicit close path on
  web, where native drag behavior cannot be assumed.
- After the intended implementation is complete, verify these behaviors on a
  device as well as in route/state tests. Automated tests alone do not prove
  native presentation, drag feel, keyboard placement, or visual fidelity.
