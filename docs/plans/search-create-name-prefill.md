# Search-to-create name prefill — F08

Status: proposed October 28, 2026; awaiting Felipe's review. Planning only;
no application, schema, dependency, configuration or deployment changes.

Planning branch: `codex/search-create-prefill-plan`, from clean `75d713b`
after the accepted Shopping re-add fix. Preserve the accepted family-trial
fixes, SDK 58 and unrelated website/Android work. Implement only after approval
on a focused `codex/` branch from this baseline; no main-branch changes.
Implementation ownership follows AGENTS.md unless Felipe explicitly assigns
this feature to the chat agent. Do not start another agent during planning.

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

## Review decision

Approve the name-only, once-per-form prefill across the listed entry points,
including Categories and searchable manager screens for consistency. There are
no required product questions beyond confirming this scope. This plan does not
approve another feature, push/merge, native rebuild or trial deployment.
