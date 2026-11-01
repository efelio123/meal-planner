# Warn before discarding an unsaved recipe

Status: approved November 1, 2026. Felipe confirmed Edit coverage and explicitly
assigned implementation to this chat. Implemented; automated checks pass. Included
in the recipe slice Felipe accepts November 1; individual native exit cases
remain unreported rather than assumed tested.
Branch: `codex/recipe-unsaved-changes`, based on the ongoing recipe section work
at `0b3d46f`. Preserve that work; this is an incremental mobile-only follow-up.

## Goal

Prevent accidental loss of a recipe draft when leaving Create/Edit through Back,
a back gesture, Android Back, or tapping the active Recipes tab again to return
to its root. Apply the same behavior to the shared recipe editor opened from Plan.

## Interaction and decisions

- Show **Discard recipe changes?** with **Keep editing** (safe/cancel action)
  and **Discard changes** (destructive action) only when leaving would remove
  unsaved recipe work. Explain that the changes have not been saved.
- Keep editing dismisses the warning and preserves fields, ingredient amounts,
  notes, sections/order and directions. Discard continues the exact attempted
  navigation once. Repeated Back/tab taps must not stack warnings or replay exits.
- A blank new recipe and an unchanged saved recipe leave without a warning.
  Compare the draft with its new/loaded baseline, covering all editable content;
  expanding More details, opening a picker or canceling a drag is not a change.
- Opening or returning from ingredient/section/Catalog sheets must not warn:
  those flows retain the editor. Switching tabs normally retains its stack and
  draft, so only actual removal requires confirmation.
- Successful Save exits normally without a discard warning. Failed/conflicted
  or unconfirmed saves retain protection. While a save request is in flight,
  prevent removal and explain that saving is in progress rather than letting
  Discard race an unresolved write. After an unknown save outcome, the warning
  must clarify that leaving abandons the local draft, not undo a possible save.
- Household/session resets must still clear the old scoped draft; a late discard
  callback must never navigate a different household/session/editor.

## Affected areas and approach

Use Expo Router SDK 58's public `usePreventRemove` in the shared recipe editor,
with its documented `repeat()`/`disablePrevention()` continuation. Do not use
removed `beforeRemove` APIs or replace the native tab bar. Verify that the
native tab's pop-to-root is intercepted; if a platform bypasses it, route that
specific action through the same guard while preserving normal tab behavior.

Keep comparison/guard helpers and tests under `src/features/recipes/`, with
route files limited to navigation. Use the app's existing destructive
confirmation styling and accessible actions; dismissal always means Keep editing.
No new packages, API/database changes, autosave or device draft storage.

## Validation

After intended code and test edits are complete, run targeted recipe helper,
actual-router and relevant native-tab tests plus TypeScript/lint. Cover new/edit
and Plan origin; Back/pop-to-root keep/discard; unchanged and reverted drafts;
section-only/ingredient-order/direction/optional-field changes; normal nested
returns; save success/failure/in-flight/unknown outcomes; repeated and stale
confirmations. Report earlier full-suite results as historical, not this change.

Phone acceptance: iOS header Back and swipe Back, double-tap/reselect Recipes,
switch away/back without losing work, Keep editing/Discard, nested sheets,
and saved return. Android hardware Back/native tab behavior remains unverified
until tested. Component tests cannot prove native tab/gesture interception.
No live Mac deployment or changes to family testing data.

## Review

Felipe approved Create and Edit coverage and requested implementation here.
No product questions are currently open.

Official references, checked against the SDK 58 Router API:
- [Prevent screen removal](https://docs.expo.dev/router/advanced/prevent-screen-removal/)
- [SDK 58 continuation API](https://docs.expo.dev/router/migrate/sdk-57-to-58/#prevent-a-screen-from-being-removed)
- [Native tabs dismiss behavior](https://docs.expo.dev/router/advanced/native-tabs/#dismiss-behavior)

## Implementation and validation — November 1

- Shared Create/Edit/Plan editor compares all editable draft values with its
  new/loaded baseline. Local IDs and refreshed Catalog display labels do not
  count as changes. Clearing a focused zero time field is also ignored.
- SDK 58 `usePreventRemove` guards removal rather than blur, preserving normal
  nested flows and tab switching. Its native `preventNativeDismiss` path
  retries a blocked pop-to-root through the same confirmation and exact action.
  Installed Screens source confirms native tab reselect calls pop-to-root and
  the stack cancels protected native dismissals with their original dismiss count.
- Confirmation matches existing destructive dialogs and scrolls for larger text.
  Repeated attempts do not stack; stale or repeated callbacks cannot replay an
  exit. Save success disables prevention before its normal destination; pending
  writes cannot be discarded, and unknown outcomes explain the local-draft limit.
- 214 distinct focused tests pass across 11 recipe/navigation suites with no
  skips. The 10 non-hook suites pass together; after correcting the native
  Pressable test adapter, all 5 isolated guard tests pass separately. TypeScript
  and lint pass on the final source. No dependency refresh interrupted Expo.
- Actual-router checks cover both Create origins, edited native pop-to-root,
  Keep/Discard, blank/unchanged/reverted forms, normal tab retention, section-only
  edits, nested returns and save success/conflict/in-flight outcomes. Helpers
  cover ordered content/fields; hook cases cover unknown saves and stale/repeated
  callbacks, scope changes and unmount.

Physical iPhone Back/swipe/tab-reselect confirmation and dialog appearance remain
unrun. Android native/hardware Back remains unrun. Full mobile normal/cold runs,
native exports and API/database tests were not rerun for this mobile-only change;
earlier F09 results remain historical. No live Mac rollout or data changes.

## Slice acceptance — November 1

Felipe accepts the overall recipe feature after the final UI adjustments and
calls it complete. This warning is included in that slice; there is no separate
report confirming every native Back/swipe/tab reselect combination. Preserve the
physical checklist above for release review. The accepted code is committed and
has not been merged or deployed to the live Mac trial in this session.
