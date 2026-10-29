# Search-to-create name prefill — F08

Status: approved by Felipe and implemented October 28, 2026 on
`codex/search-create-prefill`. Phone acceptance is pending. Felipe explicitly
asked the chat agent to implement this feature directly.

Planning branch: `codex/search-create-prefill-plan`, from clean `75d713b`
after the accepted Shopping re-add fix. Preserve the accepted family-trial
fixes, SDK 58 and unrelated website/Android work. Implement only after approval
on a focused `codex/` branch from this baseline; no main-branch changes.
Implementation followed Felipe's direct assignment to the chat agent. No
delegation or unrelated checkout changes were made.

## Goal

Avoid typing the same name twice. Search for `Costco`, tap Create store, and
open the existing Create form with `Costco` already in its editable Name field.
Nothing is created until the user confirms the existing Create/Save action.

## Scope and entry points

| Search origin | Create action / destination |
| --- | --- |
| Recipe ingredient Food picker, including the reused recipe editor under Plan | Create Food item in Catalog; prefill the shared Catalog item's name. |
| Shopping Add picker | Both the footer Create item in Catalog action and header plus use the current Catalog search. Keep Create & add to Shopping behavior. |
| Catalog list | Add catalog item uses the current item search; retain current item-type/default behavior. |
| Store or shopping-unit selector in a Catalog form, including Recipe-created Food and Shopping-created Catalog items | Create store / Create shopping unit uses that selector's own current query. |
| Shopping entry Details Store or Unit selector | Create store / Add unit uses that selector's own current query; retain the Shopping entry return target. |
| Manage Stores / Categories screens with their own search | Their Create action uses the manager's current query. Manage shopping units has no search today; its Create stays blank. |
| Category selectors using the shared ChoicePicker | Include the same name prefill for consistency, retaining Food/Household category type and emoji behavior. |

Apply the seed whenever the user explicitly taps Create while searching,
including when partial matches remain. Do not limit it to zero results or
change when Create is available. Existing duplicate detection still applies.

Recipe-specific custom measurement units are a separate concept: Use custom
unit does not create a persistent shopping unit and is outside this slice.
Recipe-library search/New recipe and unrelated searches are also outside scope.
Do not add search fields where none currently exist.

## Source findings and affected areas

- `features/catalog/choice-picker.tsx` owns its search locally. Its onCreate
  callback currently receives no query. It already guards scope/repeated taps
  and atomically replaces the picker with a route in its owning stack.
- `features/recipes/recipe-native-sheets.tsx` owns the Food query, while
  recipe-editor-screen.openFoodCreate accepts no name and routes using the
  current Recipes/Plan editor base and originScope.
- `features/shopping-list/shopping-sheets.tsx` owns the Shopping Catalog query
  but createCatalogItem forwards only shoppingOriginScope. Shopping Details
  forwards its Catalog identity and shoppingTarget to nested choice forms.
- `features/catalog/catalog-screen.tsx` owns item search; its header plus
  opens Add without it. CatalogChoiceManagement owns manager search but its
  routeToCreate forwards only existing type/return metadata.
- The shared CatalogItemForm, CatalogChoiceFormInternal and CatalogCategoryForm
  initialize blank names. Create forms must gain one common seed contract;
  Edit forms must keep their server-loaded values. CatalogItemForm choice
  refreshes retain formRef, which must continue to preserve the seeded/edited
  name through nested Store/Unit/Category creation.
- Existing route wrappers under Catalog, Recipes, Shopping and Plan remain
  thin routes. Supporting helpers/tests belong outside src/app. Reuse the
  existing scoped native-sheet/context system and shared forms.

## Proposed changes and decisions

1. **Pass the current query explicitly.** Extend ChoicePicker's Create callback
   and RecipeFoodSheet's Create callback to supply the current trimmed query.
   Route callers pass it as optional initialName plus the initiating user's
   household/session scope. Shopping's two Create buttons share one handoff;
   managers use their own query, not a stale earlier selector search. Manage
   itself does not inherit or apply a name seed.
2. **Use structured route params.** Preserve originScope, shoppingOriginScope,
   shoppingTarget, shoppingCatalogItemId, choice kind, itemType and current
   owning-stack paths. Encode via structured params so names containing `&`,
   `+`, `?`, `/`, quotes, accents or emoji cannot alter routing. Treat malformed
   or array-valued name/scope params as absent. Keep text transient; no global
   last-search store, persistence, analytics or logging of names.
3. **Initialize once, only on Create.** A small reusable Catalog feature helper
   validates the optional name seed against the current user/session/household.
   Apply it once for the new form instance, before the normal choice load.
   Outer whitespace is trimmed; preserve spelling, case and internal spacing.
   Blank/whitespace query produces the ordinary blank form. Leave existing
   length/duplicate validation intact; do not silently truncate long names.
4. **The user's draft wins.** Typing, clearing the name, loading/retrying choices,
   context revisions, rerenders and nested picker round trips must not reapply
   the seed. Saved Edit values always win, even if seed params are present.
   Opening a different Create later uses its own latest search. Existing
   selected unit/store/category and quantity defaults are not inferred from
   the query or changed by this feature.
5. **Preserve navigation and return results.** Keep accepted replace-in-owning-
   stack transitions and single-action guards; no Back-then-delayed-Push.
   Preserve the parent recipe/Catalog/Shopping draft and any still-mounted
   search. Cancel/Back never creates or selects anything. Successful creation
   follows the existing result-selection, refresh and return behavior. A picker
   already replaced by Create continues returning to its existing parent;
   restoring that discarded picker as an extra navigation layer is not proposed.
6. **Prevent cross-scope carryover.** A household switch, sign-out or new session
   invalidates the seed and old draft/result. A retained or newly mounted route
   cannot apply a name from the previous scope; returning to that earlier scope
   must not replay an already consumed seed. Preserve existing stale-response
   guards and never send a Create implicitly.

No new screens, layout/detent/keyboard changes, API/schema/migrations,
dependencies, signing/native build or hosting changes are needed. Category
coverage is an explicit small extension to F08 through the same shared picker.
Consult current official Expo SDK 58/Router and React documentation against the
installed versions before implementation, as required by the working agreement.

## Validation after all intended implementation and test edits

- Focused ChoicePicker tests: latest query reaches Create exactly once; blank
  input, partial matches, query cleared/changed before Create, stale scope and
  repeat taps. Manage remains a distinct action with no accidental name seed.
- Shared form tests: Create prefilled, editable and clearable; Edit ignores
  initialName; asynchronous choice loads/retries and nested creation preserve
  user changes; a later Create uses a fresh seed; scope switches and malformed
  params do not expose or replay an old name. Test whitespace, Unicode and
  route punctuation without changing existing validation.
- Actual-router regressions across Recipes and Plan ingredient creation,
  Shopping footer/header Create, Catalog list Add, and choice creation from
  Catalog/Recipes/Shopping forms and manager search. Verify correct owning
  stack, parent draft, successful result selection and Back/Cancel without
  an API write. Retain B05 nested-navigation and B12 multi-add/re-add coverage.
- Run relevant Catalog choice/form/navigation, recipe router, Shopping picker
  and actual-router suites, TypeScript, lint and diff checks in one coordinated
  pass. Fix failures and rerun affected checks. No database suite for unchanged
  API/data behavior; prior full-suite results remain historical.
- Physical iPhone check in the current appearance: search -> Create -> change
  name -> nested unit/store/category -> return -> Save/Cancel. Check keyboard
  open/closed, fixed Create actions, sheet dismissal and parent draft. Check
  Recipes, Catalog and Shopping origins; Plan's reused editor gets a route
  regression and a device spot check. Record Android and any unrun checks
  explicitly. No live Mac writes/build/deployment as part of automated testing.

## Approved decision and implementation

Felipe approved the name-only, once-per-form prefill across the listed entry
points, including Categories and searchable manager screens for consistency.
The shared catalog-name-prefill helper supplies and validates optional scoped
route params; all three shared forms use it only in lazy state initializers.
Existing scope-reset behavior clears the draft without replaying a consumed
seed. Manager search now resets with its household/session scope as well.
Create actions pass current search through structured route params, preserving
the accepted owning-stack transitions and origin/type/return metadata. Edit,
save validation, custom recipe units, layouts and keyboard handling are unchanged.

## Validation results — October 28, 2026

- Coordinated targeted mobile run: **10 suites / 219 tests passed**, no skips
  (57.62s): name-prefill helper, ChoicePicker, choice management/navigation,
  Catalog screen, recipe router integration, Shopping picker/screen/state and
  actual Expo Router startup/navigation. This includes the accepted B05 nested
  Store/Unit round trips and B12 Shopping regressions.
- After extending the actual-router manager check to open Create from its
  header and cancel back with search intact, that suite passed again:
  **89 tests**, no skips (25.255s). This extends an existing test rather than
  increasing the coordinated run's total test count.
- TypeScript `tsc --noEmit`, Expo lint and diff checks passed. Tests cover
  punctuation/Unicode, whitespace and partial results, edited/cleared names,
  delayed choice loads, scope switches without replay, Edit ignoring a seed,
  Recipes/Plan Food creation, Shopping header/footer Create and nested unit/
  store creation, Category creation, and manager search/Create/Back.
- No API/schema/dependencies changed; database suites were not run. Full mobile
  suite, native builds, physical iPhone/cross-phone and Android checks are unrun
  for this slice. Previous full-suite results remain historical. No live Mac
  data/runtime, deployment, push or merge was performed.
- Version guidance checked against installed Expo 58.0.19, Router 58.0.26 and
  React 19.3: [SDK 58](https://docs.expo.dev/versions/v58.0.0/),
  [Router navigation](https://docs.expo.dev/router/basics/navigation/), and
  [lazy state initialization](https://react.dev/reference/react/useState).

Phone acceptance after reloading local Expo:

1. Search for a new ingredient and choose Create: its name is filled in. Edit
   it, create a Store/Shopping Unit from a search inside the form, and return;
   the edited ingredient name and parent recipe draft remain intact.
2. Repeat from Shopping's header plus and footer Create action, and Catalog
   Add. Clear/change the name and navigate through a nested picker: the search
   must not overwrite that name. Verify Cancel creates nothing.
3. Search within Manage Stores/Categories and tap Create; verify that search
   becomes the name, while Back retains manager search. Edit an existing item
   or store and confirm its saved name still loads.
4. Verify fixed actions and sheet headers remain usable with keyboard open/
   closed. Scope switches must clear old drafts/searches, not carry them to
   another household. Record actual checks rather than assuming full coverage.

## Shopping choice Back follow-up — October 29, 2026

Felipe reports that Shopping -> Create Catalog item -> Store -> Create store
or Manage stores has no visible Back arrow, trapping the user. These Shopping
choice routes use fullScreenModal presentation and had no explicit headerLeft;
the Shopping Catalog edit modal already used the shared AppBackButton for this
case. Earlier router tests used programmatic Back, which checked draft/route
return without establishing that a native modal exposed a usable Back action.

On `codex/shopping-choice-back-navigation`, the Shopping stack now gives all
three choice routes (Manage, Create and Edit) the same explicit AppBackButton.
It pops exactly one route, returning to a manager when appropriate and then to
the retained Catalog/Shopping draft. The dynamic routes cover Stores, Shopping
Units and Categories. Full-screen modal presentation and its existing layout
owner remain unchanged; no custom modal/header or new route is introduced.
Related Catalog/Recipes choice pages retain their ordinary stack headers.

New regressions render and press the modal header arrow, exercise Create and
Manage from Shopping's new-item form for all three choice kinds, and walk
Store Manage -> Edit/Create -> Back -> Manage -> Back -> Catalog draft without
saving. Physical iPhone retest remains pending. This is a small follow-up to
the approved slice, not approval for another feature or deployment.

Validation: the coordinated choice-navigation and actual-router run passed
2 suites / 102 tests, no skips (54.046s); TypeScript, Expo lint and diff checks
passed. No API/database changes; database tests, full mobile suite, native build
and physical-device checks are unrun for this follow-up. The earlier 219-test
feature result is historical and is not claimed as a rerun of this edit.

### Return destination correction — October 29

Felipe clarifies that Back must return to the Store picker, not directly to
the item form. This supersedes the earlier replacement/Back destination for
Shopping-origin choice flows. Keep the real native picker in the Shopping
stack while presenting full-screen Create/Manage above it. Back from Manage
or a directly opened Create reveals the same picker/search; nested Edit/Create
returns to its manager first. Re-enable picker actions on focus and synchronize
its choices/selection with the parent so management changes are visible.
Direct Create success still selects the choice and returns to the form by
closing both Create and picker; Create inside Manage still returns to Manage.
Apply the same behavior to Store, Unit and Category in Shopping Catalog forms
and Shopping entry Details. Retain the earlier atomic replacement contract for
ordinary Catalog/Recipes stacks, which do not use these full-screen modals.
No delayed Back/Push pair or custom modal is introduced.

Implemented on the same focused follow-up branch. Shared ChoicePicker resets
its navigation guard when its route regains focus and subscribes to its field's
current choices/selection without remounting its search. NativeSheetScreen keeps
one removal subscription through Activity hide/show and releases it on actual
route removal, including a hidden picker popped together with a successful
Create. Shopping-origin direct Create is explicitly marked; only this modal
case dismisses two routes after Save. Create/Edit reached from a manager keeps
its ordinary one-level Save/Back return to that manager.

Final validation for this correction: full normal mobile run **58 suites /
479 tests passed**, no skips (49.158s); TypeScript, Expo lint and diff checks
passed. An initial run found a legacy cross-origin test still expecting Back
to skip Shopping's selector; its Store/Unit expectations now reflect Felipe's
clarification while Catalog/Recipes expectations remain unchanged. Tests cover
the retained query, repeated Create after Back, live Store edits/selection,
direct Create/Save for all three kinds, Shopping entry amount preservation,
and Activity-covered sheet cleanup. This full result includes all current
mobile edits and supersedes the earlier targeted-only result for this checkout.

No API/schema/dependencies or live Mac changes. Database tests, cache-disabled
mobile run, native builds and physical iPhone/Android tests are unrun for this
correction. On iPhone, verify Store Create -> Back and Manage -> Back both reveal
the Store picker (same query/scroll/detent), then Done reveals the unchanged item
draft. Repeat Create from the returned picker to ensure it remains responsive;
Save should select the new choice and return to the draft. Physical visibility
of the full-screen modal above the retained picker still requires this retest.
