# Native sheets for app-wide selection and entry — approved, branch prepared

## Goal and decision

Felipe accepted the physical iPhone feel of the development-only, stacked
Expo Router `formSheet` prototype in Recipes. Use that native, finger-following
sheet behavior for the app's existing short selection and entry flows. Keep
their approved visual content, accessibility, and draft behavior; this is a
presentation change, not permission to redesign every screen.

Do **not** turn ordinary detail/edit/manage pages or destructive confirmations
into sheets solely for consistency. A Delete household or Remove member warning
must remain a deliberate confirmation, not become easy to dismiss by accident.

Felipe approved this plan and requested a separate branch and focused commits.
Recipes merged through PR #14 as `ac5dcf0`, and
`feat/native-sheets-app-wide` now starts from that commit. The accepted
prototype proves the iPhone gesture feel for synthetic Food and Ingredient
Details; it does not yet validate production data, Android, web, or other
sheet flows. No native-sheet migration is implemented on this branch yet.

PR #14's two hosted Mobile checks failed only at `expo install --check` because
five Expo SDK 57 patch recommendations moved; its two PostgreSQL API checks
passed. Felipe explicitly approved merging Recipes despite that CI result and
approved patch alignment for a later follow-up. Do not silently bundle those
dependency updates into this sheet migration just to change CI status. The
affected packages are `@expo/ui`, `expo`, `expo-constants`, `expo-linking`, and
`expo-router`; record their exact target ranges and revalidate when the
separate patch follow-up is scheduled.

## Inventory and scope

| Flow | Current presentation | Proposed treatment |
| --- | --- | --- |
| Recipes Food selection → Ingredient Details | Transparent `Modal` with custom drag code | Replace with stacked native `formSheet` routes. Preserve search, selection, Back-to-Food, Cancel-all, edits, Catalog-item creation/return, and unsaved draft rules. |
| Recipes cover choice → emoji entry | Transparent `Modal` sheets | Native sheets with the same back/close semantics and keyboard-safe entry. |
| Recipes ingredient Unit | Shared Catalog `ChoicePicker` opened from Details | Native sheet presentation that does not break the underlying Details sheet or its draft. Test sheet-on-sheet behavior on both platforms before rollout. |
| Catalog Category, Store, Shopping Unit, Recipe Measurement and Base Unit selection | Shared `ChoicePicker` custom `Modal`/PanResponder | One reusable native-sheet route/presentation pattern; preserve search, selected value, No selection, custom-unit option, Create/Manage navigation, and the item draft. |
| Catalog category Emoji entry | Custom keyboard-aware `Modal` | Small native entry sheet with Clear/Cancel/Done, inline emoji validation, safe keyboard positioning, and preserved category draft. |
| Household time zone selection in onboarding and household editing | Full-screen React Native `Modal` | Native searchable selection sheet if the real-device keyboard/list behavior is sound; retain a usable full-page fallback if not. |
| Catalog item/category and Recipes archive/delete warnings; household/member `Alert` confirmations | Centered dialogs/system alerts | Keep as confirmations. Review styling and accessibility separately, but no gesture-dismiss migration. |
| Catalog Create/Manage pages, recipe and household details/edit pages | Stack screens | Keep full pages with native headers and Back history. |

Search for any new `Modal` or custom sheet added while this plan is pending and
classify it by the same rule before implementation. Do not convert auth,
onboarding, or loading screens merely because they are modal-looking.

## Proposed implementation

1. Finish the Recipes ingredient flow first. Move real Food/Details content
   behind route-only files in `src/app/`, with state and tests in
   `src/features/recipes/`. Keep draft state in a household/session-bound
   feature owner rather than route params. A downward dismissal of Details
   must reveal Food with its search intact; a downward dismissal of Food
   returns to the recipe editor. Preserve the create-Catalog-item round trip
   and remove the old custom gesture/translation code only after parity.
2. Convert Recipes cover/emoji and Catalog selection/emoji flows in small
   groups, testing one on-device before reusing its route/state pattern.
   Avoid a generic component abstraction until the real flows show a stable
   shared contract. Never put components, hooks, or tests in `src/app/`.
3. Convert the time-zone picker last, after checking onboarding and editing
   on a phone. Maintain a web interaction that is keyboard/mouse-accessible;
   web cannot be assumed to inherit native drag behavior. Keep a clear
   Done/Cancel or Back control on every platform.
4. Use explicit content headers/actions inside sheets. Expo documents that
   Android native-stack headers and nested stacks do not render inside a
   `formSheet`; do not rely on route-header buttons there. Choose detents for
   each flow by content, keep them sorted, and use no more than three for
   Android. Prevent clipped titles, inaccessible actions, status-bar overlap,
   tab-bar collision, and empty filler space. Ensure long lists scroll while
   the sheet follows intentional header drags.
5. Remove the development-only synthetic prototype entry/routes when the
   production Recipes flow passes its acceptance checks. Do not leave a
   duplicate test-only UI visible to users. No backend, migration, or new
   dependency is proposed.

The installed mobile baseline is Expo `~57.0.26`, Expo Router `~57.0.24`, and
React Native `0.86.3`. Expo's [form-sheet guidance](https://docs.expo.dev/router/advanced/modals/)
supports detents and notes the Android header limitation. The accepted
prototype uses only that installed native-stack support. No third-party
bottom-sheet library is proposed; revisit only if a required nested flow
cannot be made reliable with the native route approach.

## State and dismissal safeguards

- A drag dismissal is equivalent to the visible Back/Cancel action for that
  specific layer, never an implicit Save. Keep the previous layer mounted and
  its search/form draft intact until the whole flow closes.
- Explicitly handle unsaved category/recipe edits, pending Catalog creation,
  keyboard focus, and a save response arriving after a sheet was dismissed.
- Household/session changes invalidate every open sheet and pending result;
  no previous household's choices or sensitive draft may appear afterward.
- Create/Manage navigation from a Catalog picker must return to the item form
  with the draft intact and any newly created choice selected only when valid.
- Keep destructive actions behind their existing explicit confirmation; no
  downward gesture can confirm them.

## Validation and acceptance

- Focused actual-router tests for sheet stack depth, dismissal/back behavior,
  search/draft retention, Catalog choice creation/return, stale household and
  session responses, keyboard entry, and no accidental save. Retire custom
  gesture tests only after their behavior is covered by route/state tests.
- Mobile normal/cold tests, TypeScript, lint, web export, and whitespace check
  after the migration. No database suite is required for UI-only work.
- Capture the running iPhone and Android screens and compare each against the
  existing `docs/design/recipes/` and `docs/design/catalog/` references.
  Check both slow drag and quick flick; expanded/collapsed detents; keyboard
  open/closed; touch target and VoiceOver/TalkBack labels; long search results;
  tab/safe-area clearance; and the create/edit/back paths. The reference
  images govern visual content; the accepted prototype governs motion.
- Follow the standing light-mode-first QA preference. Reserve a dedicated
  light/dark review for a major deployment rather than repeating it for each
  migrated sheet. Report any reference mismatch or platform limitation
  explicitly instead of claiming exact parity from automated tests.

## Rollout boundary

Implement this as a separate slice on `feat/native-sheets-app-wide`, which was
created from updated `main` at `ac5dcf0`. Use focused commits that do not mix
native-sheet migration with the merged Recipes feature work. Preserve the
existing uncommitted timezone-picker files and unrelated unapproved swipe-Back
plan; inspect them before editing overlapping code. Do not ship a duplicate
development-only prototype entry in the finished migration. Push or deploy
only after the implementation and validation are reviewed.

If a flow cannot safely use native sheets (especially Unit over Ingredient
Details or the web fallback), stop that flow, keep its existing working
presentation, and report the limitation for a separate decision rather than
introducing a new dependency or custom drag framework.
