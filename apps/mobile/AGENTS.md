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
  and documented. Check this in light and dark appearance where available.
