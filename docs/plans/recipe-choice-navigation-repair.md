# B05: nested recipe Store/Shopping Unit navigation repair

Status: approved by Felipe October 25, 2026 as the first bug-fix batch.
Felipe explicitly assigned implementation to the chat agent on October 25.
Work branch: `codex/recipe-choice-navigation-fix`, from refreshed `origin/main`
at `129264d`. Earlier trial/setup and planning commits remain preserved on
their existing branches; no trial native configuration is bundled here. Approval
covers B05 within the boundaries below, not unrelated features or deployment.
Standalone first bug batch from [the trial inventory](family-trial-improvements.md).

## Goal

From a recipe draft's ingredient/Catalog-item flow, Create or Manage Store and
Shopping Unit must visibly open the intended page and return to the correct
draft. Eliminate hidden routes and stranded sheets without losing unsaved work
or changing accepted native sheet presentation.

## Report and current evidence

Felipe reports that choosing an existing Store/Shopping Unit works. Create or
Manage appears to do nothing, but the target page actually opens behind the
visible flow, sometimes under another tab. Saving subsequently can persist
data while leaving the user on the wrong page or unable to dismiss correctly.

Source inspection found:

- Shared `ChoiceSheet.runRouteAction` calls `router.back()` and schedules the
  requested route action with `requestAnimationFrame`.
- `CatalogItemForm.routeToChoices` selects Recipes, Shopping, or Catalog paths
  using its origin flags. ChoicePicker defaults to a root native-sheet route,
  while Recipes Food/Details/Unit sheets have their own stack routes.
- Recipe Food creation also dismisses a sheet and schedules a route action on
  a frame. Native dismissal completion and JS frame timing are different
  concerns; inspect actual native route ownership and transition events.
- Catalog/Recipe/native-sheet contexts hold origin, created-choice results,
  draft state, and household/session scope. Returning a result must not consume
  another form's state or restore an obsolete household/session.

These are investigation leads, not a proven root cause. Do not substitute
arbitrary delays, a full-screen fake sheet, or dismissal of every route.

## Affected areas

- `apps/mobile/src/features/catalog/choice-picker.tsx`
- `apps/mobile/src/features/catalog/catalog-item-form.tsx`
- `apps/mobile/src/features/catalog/catalog-choice-management.tsx` and context
- `apps/mobile/src/features/recipes/recipe-editor-screen.tsx`,
  `recipe-native-sheets.tsx`, and recipe context
- `apps/mobile/src/features/native-sheets/` registry, screen, and route options
- Owning root/Recipes/Catalog/Shopping layouts and route wrappers in `src/app/`
- Existing recipe/router/native-sheet tests; new supporting tests belong in
  feature directories, never `src/app/`.

## Proposed investigation and implementation

1. Reproduce against the installed trial baseline or equivalent private test
   build. Record the actual visible route and each owning navigator before and
   after Create/Manage. Use disposable/synthetic entries; do not edit real data
   to force the bug. Confirm the exact entry sequence when the phone is available.
2. Trace these cases separately: existing/new recipe; choose existing Food;
   create Food from ingredient search; then Category/Store/Shopping Unit
   selection, Create, and Manage. Also check direct Catalog and Shopping-origin
   use of the shared forms. Inventory all remaining presented sheet layers.
3. Make the transition contract explicit: which layer closes, which navigator
   presents the destination, which draft remains alive, and which destination
   receives the result. Use the existing owner-stack/scoped flow pattern. Wait
   for a relevant navigation lifecycle transition when needed rather than
   assuming one animation frame equals native dismissal completion.
4. Choose the smallest verified correction after tracing: route on the visible
   owner stack, or deliberately suspend and restore the sheet flow while its
   ordinary create/manage page is active. If draft ownership must change
   substantially, revise this plan before implementing that expansion.
5. On Save, refresh active choices, select a newly created choice when appropriate,
   and return one level to its initiating draft. Back/Cancel returns without
   silently saving. Back from Manage returns to the correct choice/form flow.
   Finishing Catalog Food creation then resumes the same recipe ingredient flow.
6. Clear/ignore results on sign-out or household/session change. Prevent duplicate
   pushes from repeated taps and stale callbacks after the flow has dismissed.
   Keep fields, search, selections, and the recipe draft on legitimate returns.

## Decisions and boundaries

- Preserve draggable native short sheets and real full-page create/manage pages.
  Reuse the in-content Back/Cancel conventions and the accepted keyboard behavior.
- No data model, database migration, role policy, dependency upgrade, redesign,
  search-name prefilling, or unrelated layout fixes in this repair.
- Preserve both iPhone trial installs and Mac data while developing. No live
  API deployment is needed for a navigation-only fix.
- Chat agent implements and reviews this approved repair at Felipe's request.
  Felipe reviews the physical flow.

## Implementation decision (October 25)

Source tracing establishes a root-selector/child-stack ownership mismatch and
a split Back/frame-scheduled Push in the reported path. Keep Catalog form
selectors in their Recipes/Catalog/Shopping owner stack. Replace a selector
with its Create/Manage destination in one action, retaining the form beneath
it; do the same for recipe Food-search -> Create Food. Preserve full-page
destinations and existing scoped result handling. Guard repeated route-action
taps and reject selector callbacks from a changed household/session scope.
Actual native visibility remains an iPhone acceptance check, not a source-only
claim of reproduction.

## Validation and acceptance

After intended edits are complete, run relevant route/context/recipe/shared
picker tests plus TypeScript and lint. Add meaningful regressions for the
cross-navigator transition, originating draft/result, Back/Cancel, duplicate
taps, scope changes, and Save return path. No PostgreSQL suite is required for
a frontend-only correction; explicitly report it as unrun.

Physical iPhone acceptance is required for native layering: Create and Manage
Store and Shopping Unit must open visibly, including with a search keyboard;
return correctly on Save, Back, Cancel, and native dismissal; preserve recipe
and Food drafts; and leave no hidden page on another tab. Repeat direct Catalog
and Shopping-origin round trips to detect shared-picker regressions. Exercise
network failure/retry and a completed recipe save. Check Android later on an
available device and do not infer its native behavior from iPhone or JS tests.

If this requires regenerated native projects or broader draft architecture,
stop at a concrete revised plan for review. Report the established cause, exact
change, observed device outcomes, automated results, and remaining unrun cases.
