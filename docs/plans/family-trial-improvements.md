# Family-trial improvements: inventory and release plan

Current checkpoint — November 1, 2026: the original confirmed bug fixes and
F01-F08, F11 and F13 are shipped in the accepted release on both iPhones. See
`family-trial-release.md` for final validation, backup/migration and native-build
facts. Earlier per-slice statements below describe historical validation, not
current deployment state. B11 remains unreproduced and on watch; no speculative
Catalog loading repair is proposed. Broader per-origin/device cases remain part
of the testing week, not newly confirmed bugs.

Remaining unimplemented feature inventory: F12 calendar sync and F16 widgets.
F14 themes is implemented locally on `codex/app-themes`, awaiting phone review. F15 configurable member permissions is implemented locally on
`codex/member-permissions` and awaiting phone acceptance; see its dedicated plan. Felipe accepts F09 ingredient
sections and its recipe-editor follow-ups on November 1 and calls the feature
complete. Work is committed on `codex/recipe-unsaved-changes` (including the
original sections branch). F10 Import from recipe was approved and implemented directly in this chat on
`codex/recipe-import`; Felipe accepts it as complete for this iteration. See
`recipe-copying.md` for validation, acceptance and the future sectioned-directions note.
Acceptance does not merge or deploy this work to the live family-trial release.

Historical planning/implementation record:

Status: inventory and sequencing reviewed October 25, 2026; initial product
clarifications recorded. Felipe approved starting with batch A (B05); the
dedicated repair plan is approved. Felipe subsequently assigned these bug-fix
implementations directly to the chat agent, on focused main-based branches. This is not
approval to implement every listed feature in one iteration or deploy changes.

October 27: Felipe approved batch B (B06/B07/B10), implemented directly by the
chat agent on `codex/recipe-entry-reliability`, based on the clean tested
`codex/nested-choice-edit-fix` tip `4e4cad6` so local iPhone testing retains SDK
58 and the accepted B05 follow-up. Keep a focused batch commit and regressions
for each defect. No dependency, API/schema, or live Mac changes.

Batch B implementation scope: carry Catalog recipe-unit code/label through
both existing-Food selection and newly created-Food return, initialize only new
ingredient drafts, and preserve existing unit overrides (including custom/no
unit). Use the ordinary amount keyboard with autocorrect/capitalization off;
retain current number/fraction validation. Connect the library's existing
refresh state/function to the shared Screen refresh control without resetting
search or grid/list mode. Validate actual-router default/override/save and
refresh success/error/retry flows, plus recipe helpers, library/request-scope
tests, TypeScript, and lint. Device keyboard/gesture acceptance remains separate.

Batch B validation (October 27): all 4 targeted suites / 34 tests passed, no
skips, plus TypeScript, lint, and whitespace checks. Actual-router checks cover
saved/no default units independent of shopping units, new Food return with a
saved recipe unit, existing built-in/custom/no-unit ingredients, explicit unit
changes and clearing, mixed-fraction submission and invalid fraction rejection,
and grid/list refresh from empty/short content with success, offline error,
retry, and retained search/view. The first run's extended Catalog regression
opened a unit picker before choices finished loading; waiting for the form's
ready action fixed that test timing. No production loading change was made.
At that automated pass, physical iPhone checks were pending; Felipe's later
acceptance is recorded below. Android, hosted CI, native builds,
and PostgreSQL checks remain unrun for this frontend-only batch. Earlier full SDK
suite results remain historical. No live Mac database/runtime changes occurred.

Official references checked against Expo 58.0.19 / React Native 0.88.0:
[SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[RefreshControl](https://reactnative.dev/docs/refreshcontrol), and
[TextInput keyboard](https://reactnative.dev/docs/textinput#keyboardtype).

October 27 device follow-up: Felipe accepts fraction entry and recipe refresh,
and confirms the default recipe unit populates. He requests restoration of
blank amount -> To taste even when a unit is selected. Update both editor-row
and saved-recipe measurement displays to prioritize a blank amount. Keep the
amount serialized as null and retain the selected unit as metadata so entering
an amount later still uses it; do not alter the Catalog default or existing data.
Two targeted suites / 33 tests, TypeScript, lint, and whitespace checks passed.
Regressions cover built-in/custom/no-unit blank and whitespace amounts, create
and edit submissions, and saved detail/editor displays. Felipe subsequently
confirmed all three fixes, including To taste, look good on his iPhone at
`5d8d5fa`. Batch B is device-accepted at that scope; this does not imply Android,
hosted CI, native-build, or trial-deployment acceptance. No API/schema or Mac
changes were needed.

## Goal

October 27 batch C scope clarification: Felipe reports that bottom clipping
affects more than B01-B03 and requests an audit/repair across every page plus
a standing new-page rule. He accepts B08/B09 and B04 in principle and asks for
the concrete category-form changes before implementation. See
[app-wide reachability and category plan](app-wide-page-reachability.md): all
64 page-route files and 11 layout files classified, additional source-level
risks recorded. Felipe then explicitly approved this expanded plan. It is now
implemented on `codex/app-wide-reachability`: required shared layout modes,
all-page migration, measured keyboard-safe sheet actions, Household disclosure
cleanup, and category Create/Edit alignment. Full normal and cache-disabled
mobile runs each passed 55 suites / 400 tests with no skips; TypeScript, lint,
and web export passed. Root/mobile AGENTS.md records the prevention rule and
required layout contract. Native geometry remains a physical acceptance check;
see `docs/qa/app-wide-reachability.md`. Felipe subsequently accepts the reviewed
iPhone UI, including the final emoji-input fix at `fa3186f`. Individual matrix
cases and Android acceptance are not inferred from that report. No API, schema,
or Mac changes. Batch D (B12) was subsequently approved, implemented and accepted
in review October 28; see `shopping-readd-correctness.md`. F08 search-to-create
name prefill was then approved and implemented. Felipe accepts the reviewed
Shopping picker return follow-up October 29; the broader device checklist is
not individually established. See `search-create-name-prefill.md`. F02 was
subsequently approved and implemented on `codex/recipe-unit-list`; 7 targeted
suites / 184 tests, TypeScript and lint pass. Felipe accepts F02 in review
October 29; individual device-checklist cases/Android remain unestablished.
See `recipe-measurement-unit-list.md`. F03 was subsequently approved and implemented directly on
`codex/clear-purchased-items`: all-store purchased-only cleanup alongside Clear
entire list, explicit bulk confirmation and exact removed-ID reconciliation.
218 targeted mobile tests, 25 local disposable-PostgreSQL API tests, TypeScript
and lint pass. Felipe accepts the reviewed change October 29; individual device
checklist cases and Android acceptance are not inferred. No Mac runtime/data changes. See
`clear-purchased-shopping-items.md`. F05 search was then approved and implemented
directly on `codex/shopping-list-search`; 274 targeted tests, types and lint
pass. Device review remains pending; see `shopping-list-search.md`.

Ship a safer, more usable build for the next week of family testing. Fix the
reported failures in coherent batches, then take on small features individually.
Keep larger ideas recorded for future iterations. Preserve real household data,
the current iPhone installations, and the separate website and Android work.

## Baseline, safety, and ownership

- Felipe and his wife report more than a week of everyday use. The reports below
  are user observations, not yet independently reproduced device failures.
- Before triage, the Mac API's database target was verified as
  `meal_planner_trial`. A full custom-format backup was made locally:
  `~/.config/meal-planner-trial/backups/meal-planner-trial-20261025T173820Z.dump`.
  It restored into a newly created isolated database: 19 tables, 70 Catalog
  items, 9 recipes, and 41 recipe-ingredient rows. All table counts matched the
  live source. The verification database was removed; the live database was
  unchanged. A private verification JSON sits beside the dump on the Mac.
- Preserved planning branch: `codex/family-trial-improvements`, isolated checkout based on
  `a4b9986`. Local `main` and `origin/main` currently point to `129264d`; the
  planning base also retains the later local iOS trial/signing/scene fixes.
  Check remote state and preserve these fixes before any future merge.
- Website work remains in `codex/product-showcase-demo`; Android setup remains
  in `codex/android-family-trial`. Neither checkout's uncommitted work is moved.
- Chat agent owns inventory, clarification, plans, review, and these bug-fix
  implementations by Felipe's explicit request. First repair branch:
  `codex/recipe-choice-navigation-fix`, starting clean from `origin/main`
  at `129264d`. Felipe owns physical-device acceptance.
- Do not reset household data or test destructively against the live Mac DB.
  Schema/API changes require a reviewed migration and compatibility plan, an
  additional fresh backup immediately before deployment, and appropriate tests.
  No paid services, dependency upgrades, or trial deployment are approved by
  this inventory alone.

## Bug inventory

Each ID remains stable as reproduction details and status are added. Separating
the three clipped pages makes it possible to verify each one independently.

| ID | Report | Expected result | Proposed batch |
| --- | --- | --- | --- |
| B01 | Household details bottom is covered by navigation. | Last content/actions are reachable and remain visible after scrolling. | C iPhone review accepted; detailed matrix not individually recorded |
| B02 | My households bottom is covered by navigation. | Same bottom-inset/scroll behavior as comparable Profile stack pages. | C iPhone review accepted; detailed matrix not individually recorded |
| B03 | Manage Categories bottom is covered by navigation. | All categories/actions can scroll above navigation. | C iPhone review accepted; detailed matrix not individually recorded |
| B04 | Household-type Catalog item shows an empty More details disclosure. | Hide the disclosure when there are no applicable extra fields; retain Food details. | C iPhone review accepted; detailed matrix not individually recorded |
| B05 | Create/Manage Store or Shopping Unit from nested recipe-ingredient creation opens a hidden page and breaks return/dismiss flow. | The intended page is visibly presented; Save/Back/Cancel returns to the correct draft without stranded routes or lost input. | A shipped in November 1 trial; broader per-origin matrix not individually recorded |
| B06 | Saved Catalog recipe base unit is ignored when adding an ingredient. | Initialize a new ingredient from its saved recipe unit; retain intentional edits and existing recipe-specific units. Blank amount remains To taste. | B implemented; including To taste, Felipe accepts on iPhone October 27 |
| B07 | Ingredient amount uses a keypad that cannot enter mixed fractions. | Ordinary keyboard supports `2 2/3`, `1/2`, and decimals; existing positive-value validation remains. | B implemented; Felipe accepts on iPhone October 27 |
| B08 | Ingredient unit selector's Use custom unit action is obscured by the keyboard. | Action remains visible and tappable while searching and entering a custom unit. | C iPhone review accepted; detailed matrix not individually recorded |
| B09 | Add ingredient's Create Food item action is pushed below a long result list. | Pin the create action below the scrollable results and above the keyboard; retain a visible search/header. | C iPhone review accepted; detailed matrix not individually recorded |
| B10 | Recipes cannot be refreshed to see another household member's additions. | Pull-to-refresh works in both grid and list, including short/empty lists, and preserves search/view state. | B implemented; Felipe accepts on iPhone October 27 |
| B11 | Catalog Edit item previously opened with blank fields. Felipe retested October 25 and existing values now populate correctly. | Currently unreproduced, not a confirmed fix. Retain as a regression watch; investigate if it recurs with concrete reproduction steps. | Watch; no speculative fix |
| B12 | Re-adding a purchased Shopping entry leaves it purchased, including when its amount is unchanged. | Explicit re-add restores it to To buy even when all quantity/unit/store values stay the same. Ordinary editing must not silently change purchased state. | D implemented; Felipe accepts reviewed fix October 28; full cross-phone/Android checks not established |
| B13 | Create category and its related forms are misaligned/inconsistent. | Review Food/Household category variants and all entry origins; reuse accepted field, action, header, and spacing standards. | C iPhone review accepted; detailed matrix not individually recorded |

## Feature inventory

Unlabelled requests that introduce new behavior are tracked as features too;
their importance is not reduced by this classification. Features remain
individual slices, even when they depend on the same bug fixes.

| ID | Request and preserved intent | Initial recommendation / dependencies |
| --- | --- | --- |
| F01 | Reorder recipe ingredients using a far-right three-line drag handle, with animated movement; persist order on create/edit. No visible Up/Down controls or tap menu (revised October 30). | **Shipped in the November 1 iPhone trial.** Historical slice record: Approved and implemented October 30 on `codex/recipe-ingredient-reordering`; Felipe accepts the reviewed interaction, separator polish and grab cue October 30. Broader device cases remain unverified. Shared Recipes/Plan editor, stable occurrence keys, guarded completed drops, existing ordered Save API, and pinned Sortables 1.10.1 with automatic haptics disabled; the requested grab-only cue uses Expo Haptics 58.0.7. Validation is recorded in `recipe-ingredient-reordering.md`; no live trial deployment. |
| F02 | Choose a recipe measurement unit from one complete list; remove the separate Volume/Mass/Count picker. | **Shipped in the November 1 iPhone trial.** Historical slice record: Implemented and accepted in review October 29 on `codex/recipe-unit-list`. Optional API-backed picker infers dimension and preserves existing data/shopping preferences. 7 targeted suites / 184 tests, types and lint pass; broader device/Android coverage not inferred. See `recipe-measurement-unit-list.md`. |
| F03 | Clear only purchased Shopping entries while retaining needed ones. | **Shipped in the November 1 iPhone trial.** Historical slice record: Approved and implemented October 29 on `codex/clear-purchased-items`. All-store scope, one confirmation, distinct purchased/all actions and atomic server-current-status deletion with removed-ID reconciliation. 218 mobile / 25 API tests, types and lint pass; Felipe accepts the reviewed change October 29, without implying every device/Android check. See `clear-purchased-shopping-items.md`. |
| F04 | Category and Store sorting show labelled sections, optionally collapsible. Alphabetical/Recently added show no such headings. | **Shipped in the November 1 iPhone trial.** Historical slice record: Approved and implemented October 30 on `codex/shopping-group-headings`. Headings/counts inside To buy/Purchased, identity-based groups with missing values last, no new collapse controls. 256 targeted tests across 6 suites, types and lint pass. Felipe accepts reviewed headings October 30. Collapse follow-up approved with tappable search headers and implemented on `codex/shopping-group-collapse`: 281 targeted tests across 7 suites, types/lint pass. Felipe accepts reviewed collapse October 30; broader device/Android checks are not inferred. See `shopping-group-collapse.md`. See `shopping-group-headings.md` for initial validation. |
| F05 | Search the Shopping list to find and check items quickly. | **Shipped in the November 1 iPhone trial.** Historical slice record: Approved and implemented October 29 on `codex/shopping-list-search`. Name search respects Store/sort, reveals Purchased matches and preserves the query across actions; F03 remains household-wide. Initial 274 targeted tests pass; phone review reports a keyboard gap. Follow-up moves clearance inside native safe areas: 179 targeted tests, types and lint pass. Felipe accepts reviewed search and spacing October 29 after `23140e9`; broader device/Android cases are not inferred. See `shopping-list-search.md`. |
| F06 | Swipe a planned meal left to reveal Delete; continue the swipe to delete, matching Shopping exactly. | **Shipped in the November 1 iPhone trial.** Historical slice record: Approved and implemented directly October 30 on `codex/planned-meal-swipe-delete`, from `6559fe4`. Shared Shopping/Plan circular trash and exact 65% policy, stable reveal and canceled/release Edit guards, scoped per-occurrence pending/conflict handling and confirmed-delete reconciliation. All 62 mobile suites / 633 tests, types, lint, whitespace and iOS JS export pass; 1 targeted API case passes on verified local disposable PostgreSQL. Felipe accepts the reviewed swipe feature on his phone October 31 at `55382a0`; broader checklist/Android coverage is not inferred. No API/schema/dependency or live trial changes. See `planned-meal-swipe-delete.md`. |
| F07 | Meal-slot recipe selection includes Leftovers and Eating out, with optional meal/restaurant text displayed in Plan. | **Shipped in the November 1 iPhone trial.** Historical slice record: Approved and implemented directly October 31 on `codex/meal-plan-special-entries`, from `698433e`. Typed recipe/leftovers/eating_out entries and optional details reuse Add/Edit and swipe; special entries are explicitly excluded from shopping needs. Additive migration preserves recipe data and guards downgrade. All 66 mobile suites / 679 tests, 176 API tests on verified disposable PostgreSQL, types/lint and iOS JS export pass. Local development backed up/migrated and API restarted for review; reviewed phone interaction subsequently accepted. Mac trial/native apps unchanged; coordinated rollout/fresh Mac backup remain separate. October 31 requested follow-up implements compact side-by-side choices with immediate blank-detail Add; Edit retains optional details and Save. Latest 65 targeted Plan tests, types/lint and iOS JS export pass; initial full results predate this client-only follow-up. Felipe accepts the reviewed interaction, including compact quick Add, on his phone October 31 at `f6a969a`; broader checklist/Android coverage is not inferred. See `meal-plan-special-entries.md`. |
| F08 | Search then Create Food item/ingredient, Store, or Shopping Unit prepopulates the name with the unfulfilled search. | **Shipped in the November 1 iPhone trial.** Historical slice record: Implemented October 28; Shopping picker-return follow-up accepted in review October 29. Current search seeds the name once and preserves drafts. Latest full mobile validation: 58 suites / 479 tests, types and lint pass. Broader per-origin/Android device checks not individually established. See `search-create-name-prefill.md`. |
| F09 | Optional ingredient sections within a recipe, e.g. Chicken and Mashed potatoes. | Accepted by Felipe November 1 after UI/editor follow-ups; feature complete. Committed on `codex/recipe-unsaved-changes`, including the original sections implementation. Initial full mobile/API validation and later focused checks are recorded in `recipe-ingredient-sections.md`; do not infer unreported native/Android acceptance. Optional ingredient-only sections, saved order, section picker and safe removal. F10 copying follows separately. Not merged/deployed. |
| F10 | Copy another recipe's ingredients and directions into an editable recipe draft without modifying the source. | Approved and implemented November 1 on `codex/recipe-import`; see `recipe-copying.md` for validation. Import from the Add ingredient footer below Create Food item in Catalog; searchable expandable recipes offer whole-recipe or singular-section ingredients. Append independent occurrences without scaling. Felipe confirms that whole-recipe imports include all directions, while singular sections import ingredients only; no section-to-direction association is inferred. Accepted by Felipe as complete for this iteration. Sectioned directions are a future companion feature requiring separate planning; current section imports remain ingredients-only. Merge, deployment and unreported release checks remain pending. |
| F11 | Each user independently adjusts the visible week horizontally. Its leftmost date defaults Review shopping needs to seven days, and the review also offers an editable start/end date range for any desired shopping period. | **Shipped in the November 1 iPhone trial.** Historical slice record: Larger planning-range feature. Personal view only; never move or alter shared planned meals or another person's view. Update API range validation and consolidation for arbitrary ranges, not merely a Monday/Sunday switch. Approved and implemented directly October 31 on `codex/personal-planning-ranges`: day-snapping seven-day strip, shared calendar sheets, per-user device-local weekday preference and inclusive 1-31-day shopping review. Explicit endpoints bind review/retry identity while old successful requests remain replayable. Full mobile 714 tests and disposable-PostgreSQL API 187 tests pass; after a compiler-only selected-day rewrite, 105 Plan tests, types/lint and iOS JS export pass. Local API restarted for review; Expo remains running. Felipe accepts the reviewed range UI, then approves the in-place Shopping edit follow-up in `shopping-review-in-place-edit.md`. That repair is implemented: shared editor/nested routes stay on Plan, and review return preserves unaffected choices with a fresh token. All 497 affected tests across 32 suites, types/lint and iOS JS export pass; phone acceptance of the repair remains pending. No schema/dependency, Mac trial, push/merge or deployment changes. See `personal-planning-ranges.md`. |
| F12 | Optional Apple/Android Calendar integration, preferably automatic sync of planned meals. | Future integration plan. Automatic sync is the desired behavior; a one-off export button is an alternative, not an approved substitute. Research consent, updates/deletes, duplicates, household changes, and realistic background behavior. |
| F13 | Shopping tab badge shows the number of unpurchased items. | **Shipped in the November 1 iPhone trial.** Historical slice record: Approved and implemented directly October 31 on `codex/shopping-tab-badge`, from `65c8e50`. One scoped Shopping owner for list, mutations, Plan reconciliation and native/web badges; count all unchecked household rows, hide zero/unknown, show 99+ with exact accessible count. Lifecycle/tab-focus freshness without polling; accepted sheet returns and rollback preserved. All 64 mobile suites / 665 tests, types, lint, whitespace and iOS JS export pass, plus 13 targeted tests after import-only polish. Felipe accepts the reviewed badge on his phone October 31 at `5bebb90`; broader checklist/Android/browser coverage is not inferred. No API/schema/dependency, live trial or deployment changes. See `shopping-tab-badge.md`. |
| F14 | Three color presets: phone/system light-dark, website Apricot/Chocolate/Navy, and saved alternate green; choose in settings and during first use. | Approved and implemented November 2 on `codex/app-themes`; shared semantic registry, Profile Appearance, first-use native chooser, installation-local persistence and light/dark variants for all three choices. Full normal/cold 851 each, 33 focused final action tests, types/lint/compatibility, contrast and iOS/Android JS exports pass; see `app-color-themes.md` for validation boundaries. Phone review pending; no merge/deployment. |
| F15 | Owners have all permissions and exclusive household administration. Newly invited Members start with full product access. Owners can customize per-member action checkboxes. Owner-to-Member demotion also starts with all product actions enabled; household administration stays owner-only. | Approved and implemented November 1 on `codex/member-permissions`: 25 transactionally enforced actions, four section master checkboxes with individual controls and explicit Save, invitation/lifecycle defaults and app-wide nested-flow guards. Full mobile normal/cold 819 each; later focused refresh follow-up 142; full disposable-PG API 232; types/lint/compatibility and native JS exports pass. Local DB backed up/migrated with content counts preserved. Permission-page appearance accepted by Felipe November 2; broader cross-phone checks remain unreported. Live Mac release unchanged, no merge/deployment. See `household-member-permissions.md`. |
| F16 | Home-screen widgets: small unpurchased-item count; medium/large checkable Shopping and complete weekly meal view with a two-view/tab concept. Explore Android equivalent. | Major separate native/platform plan. Research iOS WidgetKit and Android App Widgets/Glance, supported mode switching, layout limits, background updates, secure shared state, signing capabilities, and checkoff policy/offline behavior. Do not promise an embedded copy of the app UI or any paid entitlement. |

## Initial source inspection (not device reproduction)

- `features/catalog/choice-picker.tsx` dismisses its route and invokes Create/
  Manage through `requestAnimationFrame`. Some callers use root native-sheet
  routes while recipe ingredient sheets are owned by the Recipes stack. This
  is a concrete navigation boundary to investigate, not yet a proven cause.
- `features/recipes/recipe-native-sheets.tsx` reduces selected Catalog items to
  id/name/emoji, omitting saved recipe-unit metadata. The editor's new ingredient
  draft explicitly starts with empty unit fields. Existing ingredient drafts
  take a different path and must not be reset by B06.
- The Ingredient Details amount field explicitly uses `decimal-pad`; fraction
  and mixed-fraction validation already exists in `recipe-form-utils.ts`.
- `RecipeLibraryScreen` obtains `refresh`/`refreshing`, but its `Screen` does
  not receive the refresh props. The shared Screen already supports refresh.
- Recipe Food results and its Create action currently share a root ScrollView;
  there is no independent pinned footer in that flow.
- Several affected Profile/manage stack screens omit the accepted native-tab
  bottom-inset treatment. Compare route ownership before changing shared Screen;
  do not fix these by guessing global padding or changing every sheet detent.
- Catalog form has guarded initial-item and later choices-only loads. Their
  generations, route params, and context revision were investigation leads,
  not a demonstrated defect. Felipe can no longer reproduce B11; do not change
  this loading code speculatively or claim the cause is known.
- Shopping opens Details for an existing Catalog-linked entry; saving those
  details does not explicitly send `is_checked: false`. The API already supports
  explicit checked-state patches. Keep re-add and ordinary Edit intentions distinct.
- Recipes API stores ingredient `position` from submitted array order. F01
  validation confirms repeated Catalog occurrences retain separate details and
  positions; F09/F10 still need explicit section and recipe-copy behavior.
- Planning API currently rejects review windows that do not start on Monday.
  F11 therefore needs an end-to-end range change, not just calendar styling.

## Proposed delivery order and cut line

1. **A — Nested navigation repair, B05 only.** Use the dedicated
   [navigation repair plan](recipe-choice-navigation-repair.md). Reproduce,
   repair, and device-check it before mixing in appearance work or search-prefill.
2. **B — Recipes data and entry reliability: B06, B07, B10.** Keep focused
   commits/tests per defect, including existing-item versus new-item behavior.
   B11 is currently unreproduced and stays on the regression checklist rather
   than blocking this batch or prompting an unproven loading-code change.
3. **C — Reachability and form consistency: B01-B04, B08-B09, B13.** Review the
   named pages and related shared forms together; keep native stack pages as
   stack pages. Pin footer actions without hiding headers/search or causing
   double keyboard avoidance, scroll snap-back, or excess bottom gaps.
4. **D — Shopping correctness: B12.** Make re-add semantics explicit and verify
   unchanged amounts, repeated taps, cross-phone refresh, and ordinary edits.
5. **Small features, individually approved:** recommend F08, then F02; next
   F03 and F05. F04 headings, F01 ingredient ordering, F06 meal swipes, and F13
   badge are the next bounded candidates. Reassess scope after bug acceptance;
   this is an order of candidates, not a promise to fit them all into one week.
6. **November 1 checkpoint:** all confirmed bug batches and F01-F08/F11/F13 are
   now in the live two-iPhone trial. F09 ingredient sections was then approved
   for direct implementation on its own branch; F10 recipe copying follows
   separately after section acceptance. F15 is now implemented locally pending phone acceptance. F12/F14/F16
   still need separate plans and prioritization. Permissions should inform later calendar/widget mutations.
   B11 stays on regression watch unless concrete reproduction returns.

The initial improved build should deliver accepted bug batches without waiting
for a major feature. Add small features only while leaving time to test and
build the next private iPhone release. No feature is silently dropped or
implemented as a shortcut that changes the requested behavior.

## Design decisions and clarifications

Confirmed by Felipe, October 25:

1. **B11:** retesting now shows prefilled Catalog edit fields. The earlier
   failure remains unexplained; mark currently unreproduced, not fixed by us.
2. **F15:** members can add Shopping items and check/uncheck them by default,
   while retaining read access to the same product content. Owners have full
   access and can configure each member's allowed actions on an owner-only
   page with a list of action checkboxes. This expands the original fixed-role
   request into per-member permissions and requires its own design/migration
   plan. Permission configuration itself must remain owner-only. Do not infer
   that a checkoff grant also permits quantity edits, deletion, or bulk clearing.
3. **F11:** the week view is independent for each user and changes only that
   person's displayed dates and the default Review shopping needs range.
   Default review is seven days beginning at the view's leftmost date. Let the
   user override both start and end dates in review, including periods shorter
   or longer than a week. Shared meal entries remain the same for everyone;
   all review totals/selections must correspond to the selected date range.

Confirmed by Felipe, October 28:

- **B12:** preserve the purchased entry's current Shopping amount/unit/store
  when re-adding. Every quick-picker tap has Add intent and explicitly ensures
  unchecked state; main-list Details remains ordinary editing and retains
  purchased state. Approved and implemented under
  `shopping-readd-correctness.md`; Felipe subsequently accepts the reviewed fix
  October 28 (“okay this looks good”). Full cross-phone and Android acceptance
  are not inferred from that report. F08 search-to-create name prefill was then
  separately approved and implemented, with phone acceptance still pending.

Resolve when the corresponding feature is scheduled:

- F03 resolved: approved all-Store household scope, explicit scope and one
  bulk confirmation. Implemented under `clear-purchased-shopping-items.md`;
  Felipe accepts the reviewed change October 29. Broader device checks and trial
  deployment remain separate.
- F01: `recipe-ingredient-reordering.md` now specifies the referenced three-line
  drag handle and no visible Up/Down/menu. Initial uploads were static; the
  subsequent source GIF is verified/reviewed and specifies lift/reflow/drop.
  Felipe approved implementation October 30; it is now implemented on its feature
  branch, with phone acceptance and trial deployment still pending.
- F04 initial headings accepted October 30 under `shopping-group-headings.md`.
  Collapsing was approved with interactive search headers and implemented under
  `shopping-group-collapse.md`; normal/query choices are independent, and new
  queries open matching groups. Felipe accepts the reviewed collapsing October
  30; broader device/Android cases are not inferred.
- B13: obtain a reference screenshot if source inspection is insufficient to
  identify which category variants look wrong; compare related forms as well.
- F07/F09/F10: optional text versus recipe association for leftovers, section
  scope for directions, duplicate ingredients, and copied recipe yield/order.
- F12/F16: exact platform/native-build constraints and background freshness;
  do not imply automatic sync or interactive widgets are proved by mockups.
- F11: whether to remember the personal view across launches/devices; date-range
  limits, inclusive date labels, and handling of selected quantities when the
  review range changes. These details must preserve arbitrary-length review.
- F14/F15: theme persistence, onboarding/appearance, and a complete permission
  matrix including own profile, invitations, leave-household, role changes,
  bulk actions, and which administrative actions can be delegated. Define how
  existing members receive defaults and how permission changes affect active
  sessions, cached screens, and attempted actions.

## Validation and release expectations

- Record reproduction steps and expected behavior against each ID; test the
  actual native iPhone flow, not only a mocked router. No live destructive tests.
- Complete intended edits per approved slice before coordinated validation:
  relevant mobile route/component/state tests, TypeScript, lint, and official
  Expo SDK 58 guidance checked against installed versions. Do not upgrade
  dependencies merely to try to cure navigation symptoms.
- For data/API changes, run relevant tests against an identity-verified disposable
  PostgreSQL DB. Run the full disposable suite for substantial schema or role
  changes. Never point tests or seed/reset commands at the Mac trial database.
- Device matrix for repaired flows includes keyboard open/closed, long/empty
  lists, search, Save/Cancel/Back/swipe-dismiss, errors/retry, draft preservation,
  and household/session changes. Keep the current appearance during routine
  checks; perform the dedicated light/dark pass before a major deployment.
- Verify a representative complete loop on both iPhones after the new build:
  create/edit Catalog -> create/edit recipe -> plan -> partial Shopping review
  -> rapid checkoffs/re-add/refresh. Android acceptance stays explicitly unrun
  until the father's phone is available and independently exercised.
- Report exact passing/failed/unrun checks, source/build/API revision, migration
  head where relevant, and remaining risks. Prepare a reviewable implementation
  handoff per batch and preserve a rollback route to the current trial build.

## Initial platform references

- [Android App Widgets overview](https://developer.android.com/develop/ui/views/appwidgets/overview):
  home-screen collection/control widgets and responsive sizing; this is the
  Android counterpart to research for F16.
- [Apple WidgetKit](https://developer.apple.com/documentation/widgetkit): entry
  point for the later iOS design/signing/integration investigation.
- [Native-sheet agreement](native-sheets-app-wide.md) and mobile `AGENTS.md`
  remain the accepted behavior for all short selection and entry fixes.
