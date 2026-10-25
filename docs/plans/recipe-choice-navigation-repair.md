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

## Implementation and validation result (October 25)

Implemented on the main-based repair branch:

- Catalog form pickers now use a locally registered native choice-sheet route
  in Recipes, Catalog, or Shopping. Detents are resolved by the owning layout
  before presentation; ordinary Create/Manage destinations remain full pages.
- Create/Manage replaces that local selector in one navigation action. Recipe
  Food-search -> Create Food uses the same replacement contract. Removed the
  Back/frame-scheduled Push pair in these paths, retaining the initiating form
  or recipe editor beneath the replacement.
- Selector actions reject repeated taps and old household/session scope. Food
  creation also checks the originating editor and sheet scope before routing.
- Existing result/choice refresh handling and database/API contracts are retained.

Validation: all 8 targeted suites / 103 tests passed across the final relevant
runs, including actual Expo Router recipe creation with Category/Store/Unit
round trips, failed Store save/retry, draft retention, Catalog and Shopping form
origins, owning-layout presentation options, duplicate actions, scope rejection,
shared picker/choice management, and startup routing. The first cold run hit
the existing startup test's five-second timeout; it passed on rerun without a
timeout increase. A new scope test initially reused the same React element,
skipping the intended rerender; correcting that test made it exercise and pass
the scope rejection. Existing Shopping tests emitted act warnings; no production
change was made to suppress them. TypeScript and lint passed after restoring
the fresh checkout's standard ignored Expo type-reference file and naming a
test helper. Dependencies were reused from an identical lockfile, not upgraded.

Official Expo SDK 57 Router docs and the installed Router 57.0.26 dispatch code
were consulted: replace targets the navigator where the current and destination
routes diverge. Co-locating selector/destination makes that the owner stack.

Still unrun: actual iPhone/Android presentation, keyboard and gesture acceptance,
web export, full mobile suite, PostgreSQL tests (no backend/data changes), native
builds, and deployment. No live trial data or installed phone was changed.
The earlier trial/signing/scene commits remain on their preserved branches;
integrate the navigation fix into the verified trial baseline before rebuilding
for family testing rather than discarding those native settings.

Felipe's next device check: in a recipe draft, Add ingredient -> Create Food,
then Create and Manage both Store and Shopping Unit with the keyboard open.
Verify visible destinations, Save/Back returns to the same Food draft, a new
choice is selected, and Create & use ingredient returns to the same recipe.
Also repeat a Cancel/native dismissal and direct Catalog/Shopping round trip.

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
