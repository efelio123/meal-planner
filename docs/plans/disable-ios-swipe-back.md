# Disable swipe-right page Back

Status: proposed, unapproved follow-up. No implementation changes are
authorized by this note. It is retained for later review after the Catalog,
Recipes, and native-sheet slices.

## Goal

Use the visible Back arrow for in-app page navigation rather than allowing an
iPhone swipe from left to right to pop a stack screen. Keep downward dismissal
of Catalog picker sheets and normal scrolling and tab switching.

## Scope and approach

- Inventory every Expo Router `Stack` layout, including the shared tab stack,
  Profile, Catalog, auth, and onboarding, before changing options. Apply the
  SDK 57 `gestureEnabled: false` stack option to pushed screens where the
  horizontal Back gesture is currently available. Avoid one-off screen
  handlers or changes to navigation history.
- Preserve the visible Back arrow, programmatic Back, and existing route
  behavior. Do not disable Android hardware/system Back or web browser Back;
  Expo documents `gestureEnabled` as iOS-only.
- Do not change React Native `Modal` or the Catalog picker sheet's downward
  dismissal gesture. Treat any other modal presentation separately if the
  stack option would alter its intended vertical dismissal.

## Validation

- Add focused navigation tests checking the option on the relevant stacks and
  that Back controls still return to the preceding page. Run normal mobile
  tests, TypeScript, lint, and whitespace checks.
- On iPhone, try both short edge swipes and longer rightward swipes from
  Catalog and Profile detail pages; neither should navigate Back. Confirm the
  header Back arrow still works and Catalog picker sheets still close by a
  downward drag. On Android, confirm system Back remains usable when a device
  is available. Automated tests alone cannot prove native gesture behavior.

## Decision for review

This plan interprets Felipe's request as applying to in-app iPhone stack
Back gestures throughout the app, not just Catalog. Confirm that scope before
implementation if a narrower rule is intended.

Reference: [Expo Router SDK 57 stack options](https://docs.expo.dev/versions/v57.0.0/sdk/router/)
(`gestureEnabled` is iOS-only).
