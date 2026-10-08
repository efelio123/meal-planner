# Meal-planning phone UX follow-up

Status: approved by Felipe; implemented and accepted in Felipe's phone review.

Branch: `codex/household-meal-planning`; preserve all existing uncommitted work.

## Goal and affected areas

Resolve the phone-test issues in the Add/Edit meal sheets, removal confirmation,
shopping-review presentation, and amount-to-buy sheet without changing meal-plan
or Shopping data behavior. This is a mobile-only follow-up; no API, database,
dependency, or cloud change is expected.

Before coding, read `AGENTS.md`, `apps/mobile/AGENTS.md`, the approved
meal-planning plan, `docs/design/meal-plan/README.md`, the applicable PNGs,
and `docs/plans/native-sheets-app-wide.md`. Compare related native sheets and
confirmation actions as well as each approved image.

## Proposed changes

1. Open Add meal and Edit meal at their highest existing native-sheet detent
   (currently 0.96), while retaining the lower detent, visible grabber, and
   smooth drag in both directions. Change only these two routes; smaller
   pickers keep their present initial sizes. The sheet frame must remain below
   the status bar and above the tab/keyboard areas on a phone.
2. In Edit meal, change the warning to **“Remove this meal from the plan?”**.
   While confirmation is showing, hide **Save changes** and any competing
   remove trigger. Show only **Keep meal** and **Remove from plan** as the
   decision actions. Cancel restores the ordinary edit footer without losing
   the draft; successful removal affects only the planned occurrence.
3. In Shopping needs, make **Already on Shopping** a compact, clearly
   non-interactive list with no decorative checkboxes or “Not selected” label.
   Keep names, amounts, and match context legible. The separately selectable
   Ingredients rows and existing-match detection are unchanged.
4. If the selected needs include an existing Shopping match, pressing the
   primary Add button opens an explicit confirmation dialog saying that some
   items are already on the shopping list. Offer **Cancel** and **Add anyway**.
   Cancel leaves the review/amount selections intact and writes nothing;
   confirming sends the same selected lines and adjusted amounts, then opens
   Shopping as it does now. A changed selection or amount requires a fresh
   confirmation. Use a consistent accessible native confirmation on phones
   and an equivalent explicit confirmation on web; do not rely on changing
   the primary button's label as the only warning.
5. Correct the amount-to-buy sheet's phone layout against the approved
   `shopping-amount-sheet.png` reference and Felipe's observed regression
   capture, `actual-amount-sheet-overlap.jpg`. In the current iPhone capture,
   the “Needed for meals” card draws over the header row: “Amount to buy” and
   “Cancel” are partly hidden behind it. Keep the header and scrolling body
   in separate, correctly measured native-sheet layout regions, following the
   established Add/Edit meal sheet structure rather than adding a fragile
   absolute offset. The title and Cancel must be fully visible above the
   first card at both sheet detents, with and without the keyboard. Preserve
   native drag, keyboard reachability, Reset, Cancel, validation, and Done.

## Validation and review

- After all intended edits, run focused actual-router tests for initial sheet
  detents, removal decisions, compact existing-match rows, and duplicate
  Cancel/Add-anyway paths (including adjusted amounts and retry identity),
  plus TypeScript, lint, and whitespace checks. No database tests are needed
  if this remains display/navigation-only. Do not run checks between coding
  steps; run the coordinated check when the edits are complete.
- On iPhone and Android, compare Add/Edit meal and amount-to-buy sheets with
  the saved references. Verify the resting height, drag, keyboard-open layout,
  footer reachability, non-overlapping amount-sheet header, removal
  confirmation, compact Shopping matches, and duplicate dialog. A passing
  component test is not native visual acceptance.
- Leave the work uncommitted for Felipe's review unless separately asked to
  commit; preserve unrelated work and report any visual mismatch explicitly.

## Separate future unit-formatting issue

Felipe also requested singular/plural quantity labels globally, such as
“1 pound” and “2 pounds.” Keep this out of this phone-polish change. A later
shared formatter should use stable built-in unit identity and explicit forms
(including invariant or abbreviated units), compare the numeric amount to
one rather than the raw string, and define a safe policy for custom units.
Apply it consistently in Recipes, Plan, Shopping review, and Shopping, with
tests for decimals, fractions, irregular/invariant labels, and missing units.

## Implementation record

The Add/Edit routes now start at the high detent without changing other pickers.
Edit meal's removal decision temporarily replaces the ordinary footer. Shopping
matches use compact, noninteractive rows, and duplicate additions require an
explicit Cancel/Add anyway confirmation. The amount sheet now separates its
header, scrolling body, and action footer to address the observed iPhone
overlap. This is UI-only; the shopping payload and API remain unchanged.

The focused actual-router and sheet-option tests passed (2 suites, 16 tests),
as did TypeScript, mobile lint, and `git diff --check`. No API/database suite
was run for this UI-only follow-up. Felipe reports the corrected phone screens
look good; this does not assert a separate Android or keyboard-open pass.
