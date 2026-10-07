# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

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
