# Leftovers and Eating out in Plan - F07

Status: proposed October 31, 2026; awaiting Felipe's review. Plan only.
Planning branch: `codex/meal-plan-special-entries-plan`, from clean `bb836a0`,
which records phone acceptance of F13. The small-feature sequence F08, F02-F06,
F01 and F13 is accepted at the recorded review scopes. F07 is recommended next
as the smallest remaining functional slice, ahead of recipe sections/copying,
personal planning ranges, calendar, themes, permissions and widgets.
Implementation needs approval and a separate focused branch; assignment follows
AGENTS.md unless Felipe explicitly assigns implementation directly.

## Goal and user behavior

Fill any Breakfast, Lunch or Dinner slot without inventing a saved recipe.

- In the existing Add meal sheet, show Leftovers and Eating out as fixed choices
  above the filtered saved recipes. Keep them available when the recipe library
  is empty, search has no matches, or the library request fails. Recipe creation,
  recipe search and the existing explicit Add action remain available.
- Selecting Leftovers shows `Which meal? (optional)`, e.g. Chicken tacos.
  Selecting Eating out shows `Restaurant (optional)`, e.g. Our favorite cafe.
  Use ordinary keyboard input, trimmed plain text up to 160 characters; blank
  saves as null. Do not require either detail or a link to another recipe.
- Plan cards display Leftovers or Eating out as the title and the entered detail
  underneath when present. Use theme-aware, platform-supported icons at the
  existing cover size, not fake recipes or saved Catalog items. Recipe cards
  retain their real name, cover and archived status. Count special entries as
  planned meals and show their day dots normally.
- Edit supports changing day, meal slot, entry kind, recipe and optional detail.
  Preserve in-progress kind-specific drafts when switching choices; submit only
  fields valid for the final kind. Cancel/dismiss does not save. Existing slot
  occupancy rules remain one entry per household/day/meal slot.
- All entry kinds share the accepted swipe reveal/full-delete behavior and Edit
  removal confirmation. Deleting an occurrence never deletes another meal or
  a recipe. Shopping review ignores special entries completely: it does not
  guess ingredients from text or copy leftovers' original recipe needs.

## Current findings and affected areas

- `household_meal_plan_entries` currently requires a non-null recipe_id with a
  household-scoped foreign key. Its server Create/Update and mobile MealDraft /
  MealPlanEntry also require a recipe. This is a schema/API feature, not just
  two client-side dropdown options.
- `get_week` already left-joins recipe presentation, while shopping calculations
  join recipe ingredients. Special-entry exclusion should become explicit rather
  than rely on a null join accidentally dropping rows.
- Reuse `meal-plan-sheets.tsx`, its existing native routes and flow context,
  `meal-plan-card.tsx`, the guarded `use-meal-plan.ts` owner, and shared swipe UI.
  Audit all MealPlanEntry/recipe_id consumers, API fixtures and review token/
  idempotency tests. Do not reorganize unrelated recipes or onboarding code.

## Proposed data and API design

- Handwrite an additive migration after the current Alembic head: add entry_type
  (`recipe`, `leftovers`, `eating_out`) defaulting existing rows to recipe; add
  nullable detail text; allow recipe_id to be null for special entries only.
  Keep IDs, dates, slots, authors, edit revisions, unique occupancy and composite
  recipe ownership constraints unchanged. No synthetic recipe rows or deletion
  of existing plans. Enforce a database CHECK for valid combinations and the
  detail length limit as well as request validation.
- Recipe entries require recipe_id and have null detail; special entries require
  null recipe_id and allow optional detail. Reject invalid/mixed payloads rather
  than silently ignore a supplied foreign recipe ID. Preserve household access,
  active-recipe validation and existing archived-recipe edit rules. Do not
  revalidate an unchanged archived recipe merely to move its planned occurrence.
- Extend Create/Update/Read to return entry_type/detail consistently. Keep omitted
  entry_type defaulting to recipe for existing recipe-only request clients.
  Continue full entry updates with expected_revision: a kind/detail edit bumps
  the revision and a stale edit/delete returns the existing conflict. Do not
  automatically retry against another person's newer meal.
- Model mobile drafts and payloads as typed variants, retaining old recipe rows
  in fixtures as a legacy/default recipe kind where needed. Remove unsafe recipeId
  non-null assertions. Centralize entry title/subtitle/cover derivation so cards,
  sheets, error/confirmation labels and swipe accessibility agree.
- Explicitly restrict shopping review sources and shopping-add validation to
  recipe entries. A recipe replaced by a special entry invalidates old review
  ingredients; changing only a special entry's free text does not create needs.
  Preserve request idempotency, quantity overrides, the shared Shopping count
  provider and the existing generated-entry reconciliation path.
- A downgrade must refuse before altering data if special entries exist; never
  silently delete them to restore recipe_id NOT NULL. Document a reversible
  downgrade only when no incompatible rows remain. Test both cases locally.

## Layout, state and rollout decisions

Existing Plan stays `Screen layout="tab-root"`; Add/Edit and their short pickers
stay within the accepted draggable native-sheet routes. Use their measured
keyboard/footer or single-scroll owners as appropriate, with visible headers,
search, Back/Cancel and fully reachable final actions. No guessed bottom padding,
custom drag gesture, new full-screen modal or duplicate sheet implementation.
Preserve date/slot selection and typed text through nested recipe creation and
Back, and clear drafts/ignore stale results across household/session changes.
Do not reset a newer special-entry choice when a previously opened recipe flow
returns late. Keep new special choices usable independently of recipe loading.

Local implementation/migration validation does not authorize Mac trial changes,
production/staging deployment, native rebuilds, main merge or paid resources.
The installed old phone apps are not assumed able to display special entries:
recipe-only request compatibility does not guarantee old readers understand the
new response. A later coordinated trial rollout must update both phones and the
API/schema before special entries are used there, with a fresh local Mac backup
and a verified recovery path. Keep all live trial data intact; test migrations
only against identity-verified local `meal_planner_disposable_test`.

## Validation after the complete implementation

- Migration/API tests: preserve populated recipe rows, valid/invalid variants,
  blank/trim/length validation, kind transitions, nullable recipe ownership,
  archived recipe rules, occupied slots, member/outsider access, revision conflicts
  and occurrence-only deletion. Test downgrade refusal without data loss.
- Review/add tests: special-only week yields no ingredient needs; mixed weeks
  include only recipe sources; changing recipe -> special invalidates an old
  review; special -> recipe introduces its needs; idempotent add/replay and
  Shopping counts remain correct. No invented leftovers ingredient inference.
- Mobile unit/actual-router tests: all three slots/kinds, optional text and edit
  initialization, switching/canceling, existing and archived recipes, empty/
  failed recipe library, nested Create/Back, stale return/scope callbacks, revision
  conflict reload, shared swipe persistence and ordinary Edit, meal counts/dots
  and shopping review. Cover prior recipe-only fixtures deliberately.
- Run one coordinated final pass: targeted migration/API/mobile cases, then full
  disposable-PostgreSQL and full mobile suites because persisted planning data
  changes; TypeScript, lint, whitespace and iOS JS export. Verify database identity
  before every migration/test run. No tests touch development or Mac trial data.
- Phone review in the current appearance: Add/Edit each kind with/without detail,
  long text, keyboard and final action visibility/scroll settling, nested sheet
  return, swipe/delete, day/week changes and mixed shopping review. Check related
  recipe cards and Shopping interactions. Mark unrun device/Android/accessibility
  checks explicitly; automation does not prove native geometry or drag feel.

## Proposed decisions for review

One optional free-text detail per special occurrence; fixed choices above recipes;
editable kind; no recipe link or grocery needs for leftovers/eating out. New special
entries use the same occupied-slot and revision rules. No restaurant directory,
leftover inventory, arbitrary note-only meal, recipe copy, personal week range,
calendar sync, permissions, theme or widget work is included. No blocking product
question is known; Felipe may revise these choices before implementation.
