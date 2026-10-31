# Leftovers and Eating out in Plan - F07

Status: approved October 31, 2026 with "Plan looks good; implement it" and assigned
directly to this chat. Implementation branch: `codex/meal-plan-special-entries`,
from planning commit `698433e`. Implementation and automated validation are complete;
physical phone review remains pending.
Planning branch: `codex/meal-plan-special-entries-plan`, from clean `bb836a0`,
which records phone acceptance of F13. The small-feature sequence F08, F02-F06,
F01 and F13 is accepted at the recorded review scopes. F07 is recommended next
as the smallest remaining functional slice, ahead of recipe sections/copying,
personal planning ranges, calendar, themes, permissions and widgets.
Felipe explicitly approved implementation directly on the focused branch above.
Push, merge, Mac trial deployment and native rebuild remain separate.

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


## Implementation and validation - October 31, 2026

- Handwritten `meal_plan_special_entries` migration adds typed entry/detail fields
  and permits a null recipe only for special entries. Existing recipe rows retain
  their identity, revision, ownership, dates and contents. Database CHECKs enforce
  combinations and trimmed non-empty details of at most 160 characters; null is
  allowed. Downgrade locks the table and refuses if special entries exist.
- Create/Update/Read return the kind and detail; recipe-only requests still default
  to recipe. Domain validation normalizes blank detail to null and rejects mixed
  variants. Existing membership, composite ownership, slot uniqueness, archived
  recipe rules and revision checks remain. Shopping snapshots explicitly include
  recipe entries only, preserving stale-review protection and idempotent adds.
- Typed mobile inputs/drafts avoid recipe-ID assertions. Shared meal-entry helpers
  and covers supply recipe/special titles, details, icon tiles and accessibility
  hints. Shared special options serve Add/Edit; per-kind drafts survive switching,
  recipe-create return guards reject a newer selection being overwritten, and
  special Save remains usable while the recipe library loads or fails. Recipe
  requests retain their prior payload shape. Plan counts/dots and accepted swipe
  deletion work for all kinds. Shopping and its badge are unchanged.
- Existing tab-root Screen and measured native-sheet keyboard/header/footer owners
  are preserved. Added sheet IDs let tests target the foreground search instead
  of accidentally matching the retained recipe library behind it. No new route,
  custom gesture, guessed inset or dependency was added.

Final automated results: all 66 mobile suites / 679 tests and all 176 API tests
passed with no skips. The API pass used identity-verified local
`meal_planner_disposable_test`, including the populated-row upgrade, CHECK/FK,
downgrade-refusal, revision, access and review behavior. Types, mobile lint, API
Ruff, whitespace and iOS JS export pass. Initial test-only failures (an unavailable
async marker, fixture lint and ambiguous background search query) were repaired;
the full final passes supersede them. No tests ran against development or Mac
trial data. Hosted CI, physical iPhone/Android/browser geometry, keyboard/drag
feel and light/dark release review remain unrun by the agent.

## Local review environment and trial boundary

After validation, the existing local development database was backed up in
PostgreSQL custom format under `%LOCALAPPDATA%/MealPlanner/backups/`, named
`before-special-meals-<timestamp>.dump`. Archive listing and matching container/
Windows SHA-256 verified the copied backup; a full restore was not performed.
The tested migration was then applied to local `127.0.0.1:5432/meal_planner_dev`
for phone review. A digest of every preexisting plan column and all Catalog,
Recipe and Plan row counts matched before/after. This was application of the
approved migration, not testing against development data.

Only the identified worktree API was restarted; Expo remained running. Its health
and OpenAPI kind enum (recipe/leftovers/eating_out) were verified. An initial local
migration invocation omitted the explicit configuration path and stopped before
DDL; the corrected configured invocation completed successfully. No Mac trial
schema, data/runtime, native build, staging/production deployment or paid resource
changed. Trial rollout still needs a fresh Mac backup and coordinated phone/API
upgrade as described above. Felipe owns physical review before acceptance.
