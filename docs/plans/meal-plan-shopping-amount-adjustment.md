# Adjust shopping amounts during weekly review

Status: approved by Felipe on October 7, 2026; implemented and accepted in Felipe's phone review. Final PostgreSQL integration tests were not rerun in this shell.

Branch: `codex/household-meal-planning` (the existing meal-planning worktree has uncommitted changes that must be preserved).

## Goal

Let a member add only the quantity they intend to buy from a week's combined recipe need. For example, when meals need 3 pounds of chicken and the household already has 2 pounds, add 1 pound to Shopping. Do not create or infer pantry inventory, change recipes, or alter the meal plan.

## Affected areas and proposed experience

- Keep the approved week-wide Shopping needs screen, source-meal breakdown, checkboxes, duplicate warning, and fixed confirmation bar. For each selected need with a known quantity, show both the **recipe total** and the **amount to buy**. The amount to buy initially equals the total.
- Tapping the amount opens a short native adjustment sheet using the established draggable sheet pattern. It shows the read-only recipe total and unit, an editable positive amount to buy using the ordinary numeric keyboard, and Cancel/Done. Example: `Needed for meals: 3 Pound` / `Add to Shopping: 1 Pound`. Keep the unit tied to the grouped need; no unit conversion or unit editing in this flow.
- Return to the review row showing `1 Pound to buy · 3 Pound needed` and retain the member's selection. A clear Reset action restores the full recipe total. To buy nothing, deselect the row rather than entering zero. Amounts without a known recipe total remain name-only in this version; they can still be selected or deselected.
- Do not cap the entered amount at the recipe total: buying a larger package can be intentional. Clearly distinguish the entered shopping amount from the recipe total. Do not store the reason for an adjustment or any on-hand amount.
- Keep the fixed confirmation bar above the native tab bar, including while the list scrolls. Follow `docs/design/meal-plan/shopping-review.png` for the existing main screen, `docs/design/meal-plan/shopping-review-adjusted.png` for an adjusted row with the three-meal breakdown retained, and `docs/design/meal-plan/shopping-amount-sheet.png` for the new sheet. Felipe approved the shown direction and copy, including the illustrative `Have 2 pounds already? Enter 1 here.` example. Do not hard-code that example for unrelated ingredients or amounts; use context-appropriate guidance and natural unit wording. Match related Recipes/Catalog sheet styling and keyboard behavior.

## API and data behavior

- Extend the existing add-reviewed-needs request with optional `amount_overrides`, keyed by selected `need_key`. An omitted override keeps today's full-total behavior and old clients compatible. The server, not the phone, uses the current validated review snapshot and applies an override only to its matching selected need.
- Parse positive decimal or supported simple-fraction input consistently with recipe amounts; enforce the existing `NUMERIC(18,6)` shopping limit. Reject zero, negative, invalid, unrepresentable, unknown-key, or unselected-key overrides with a safe validation error. Preserve the need's catalog identity and unit. An unknown-total need remains name-only and cannot receive an override in this first version.
- Include normalized overrides in the idempotency request hash. A lost-response retry must resend the same request ID and exact selections/amounts; changing an amount after a submission attempt generates a new ID. Existing stale-review, household membership, and duplicate-list protections remain in force. No schema migration or new dependency is expected: Shopping items already have nullable decimal amount and unit fields.
- A fresh review resets edited amounts when the recipe total or need identity changes; otherwise preserve valid unsent edits where safe. Never silently apply an old amount to a changed need.

## Validation and handoff

- Add focused API tests for partial, larger-than-total, default/full, invalid, stale, idempotent replay, changed-amount/reused-ID conflict, and household isolation. Run the relevant disposable-PostgreSQL tests against identity-verified `meal_planner_disposable_test`; report skips as unrun.
- Add mobile tests for edit/reset, checkout payload, empty/invalid input, retry preserving the exact amount, changed review handling, and sheet draft/keyboard behavior. After the slice is coded, run one coordinated mobile test/type/lint pass and targeted API validation.
- Compare the running iPhone and Android screens with the approved references. Check that the amount sheet is draggable, the keyboard does not cover Done, the review footer stays reachable above tabs, and Shopping displays the adjusted amount.
- The Codex chat agent owns plan/design review. The VS Code coding agent owns implementation after this approval; preserve all existing work and use focused commits. Do not run checks between incremental code edits; run one coordinated validation pass when the intended edits are complete. No cloud deployment is authorized by this plan.

## Approved decision

Use direct **amount to buy** entry without an on-hand field or inventory record. Keep the `Used in 3 meals` expand/collapse separate from amount editing.

## Final handoff note

The mobile suite passed 45 suites / 297 tests, and TypeScript, lint, API Ruff,
and whitespace checks passed. API pytest passed 88 tests and skipped 51
PostgreSQL-backed tests without `DATABASE_URL`; the final amount-override
integration tests therefore remain unverified in this run. The user reviewed
the corrected phone screens and said they look good.
