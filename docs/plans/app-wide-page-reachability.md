# App-wide page reachability and category forms

Status: Felipe explicitly approved the expanded plan October 27, 2026. The
chat agent implemented it on `codex/app-wide-reachability`, based on clean
planning commit `e42d8b2`. Approval includes B08/B09 and B04. Automated validation
passes as recorded below; physical acceptance remains pending.

## Goal and baseline

Every page's last row, field, and action must be reachable and remain visible
after scrolling, above whichever navigation, home indicator, or keyboard is
actually present. Check the whole mobile app, not only the three originally
reported pages. Give future pages an explicit reusable layout contract.

Planning branch: `codex/app-wide-reachability-plan`, starting clean from
`2f65575` on the accepted recipe-reliability branch. Preserve SDK 58, B05,
ingredient defaults, To taste, fraction entry, refresh, and their tests. The
chat agent implements after approval under Felipe's standing authorization.
No API/schema changes, dependencies, Mac runtime/data changes, or deployment.

## Source audit: coverage and findings

Inspected all 64 page-route files plus 11 layout files (including platform
variants), their shared Screen/sheet content, and the accepted category images.
Counts describe route patterns, not every possible ID or `[kind]` value.
This is source evidence, not a claim that every page was exercised on a phone.

| Route family | Page-route files | Coverage and current treatment |
| --- | ---: | --- |
| Plan | 13 | Root; Shopping review; recipe and Food creation; Add/Edit meal, Day, Food, Ingredient details, Unit, Cover, Emoji, Shopping amount sheets. Root, review, and editor/form pages already use the explicit inset pattern. Inspect every custom sheet's last item/footer and keyboard behavior. |
| Recipes | 14 | Root; create/detail/edit; Food creation; choice manager/create/edit for all three kinds; six short sheets. Detail and choice pages omit explicit native-tab bottom handling. Editor/form pages already opt in. Food Create is in the results scroll; shared Unit custom action needs keyboard review. |
| Shopping | 9 | Root; Catalog create/edit; choice manager/create/edit; Picker/Details/Choice sheets. Preserve accepted root/picker behavior. Edit Catalog item and choice pages are full-screen modals: check their actual visible chrome, rather than reserving a nonexistent tab bar based on their route prefix. |
| Catalog | 9 | Root; management home; add; detail/edit; choice manager/create/edit for all kinds; Choice sheet. Management home, item detail, and choice pages omit explicit native-tab bottom handling. Shared item form already opts in. |
| Profile | 9 | Root; account; My households; household create/details/edit; member; invitations; archived recipes. Root uses the accepted native-tab wrapper. All eight nested route files use Screen with left/right edges only and no native-tab bottom handling. |
| Auth/onboarding/startup/error/shared sheet | 10 | Sign-in/up; welcome/create/join/select household/profile completion; startup; API error; shared sheet route. Ordinary pages have no bottom tab bar and must retain standalone insets. Shared sheet content is audited by type, including time zone and emoji. |
| **Total** | **64** | All route patterns classified; native device acceptance is still required. |

Concrete shared omission: all five iOS tab triggers disable automatic content
insets, while many nested pages set `safeAreaEdges={['left', 'right']}` and do
not enable Screen's explicit native-tab bottom treatment. Examples extend to
My account, household forms, member details, invitations, archived recipes,
Manage catalog, Catalog item details, Recipes detail, and Store/Unit managers.
These are additional source-level risks, not individually reproduced failures.

Working reference paths already use explicit bottom handling in the recipe
editor, Catalog item form, and Shopping review. Do not replace that with a
guessed fixed tab height, a global bottom margin, or an extra top inset below
a visible native header. Tab roots, pushed pages, full-screen modals, native
sheets, and standalone auth pages have different safe-area owners.

Keyboard audit includes the shared Choice picker and time-zone picker,
Catalog emoji entry, Recipe Food/Details/Cover/Emoji, Shopping Picker/Details,
and Plan Add/Edit/Day/Shopping amount sheets. Inspect fixed versus scrolling
actions, bounded parents, keyboard-open/closed changes, and sheet dismissal.
Keep the previously accepted Shopping picker footer placement as a regression
reference; do not rewrite it merely to make every sheet structurally identical.

## Proposed changes

### 1. Shared page layout and exhaustive migration

- Give Screen a required, typed layout choice for tab root, tab-stack page,
  full-screen stack modal, or standalone page. Native short sheets keep their
  existing scoped sheet containers. Replace scattered combinations of inset
  booleans with these named contracts, retaining refresh, scroll, and footer APIs.
- Migrate every Screen call site, including startup, auth, onboarding, and
  fallback screens. Let TypeScript catch future callers that omit the choice.
  For a component used under multiple presentations, pass the layout from the
  route/owner; do not infer it from a pathname or assume all Shopping routes
  have the same visible tab bar.
- Preserve the established iOS native-tab SafeAreaView behavior and Android's
  native bottom-inset ownership. Full-screen modal content must reserve its
  visible safe area without a phantom tab-bar gap. Web retains its actual tab
  layout rather than iOS compensation.
- Keep one bounded page scroll surface, with fixed actions outside its scroll
  body when appropriate. Last content and actions must clear visible chrome
  without snapping back below it; avoid double keyboard/inset adjustment.
- Keep all existing native presentations, Back behavior, headers, and drafts.
  If a distinct navigation defect is discovered, record it separately under
  B05 rather than silently expanding this layout repair into a routing rewrite.

### 2. Keyboard-reachable actions (B08/B09)

- Recipe Food search keeps its header/search visible and its Create Food item
  action outside the independently scrolling results, pinned above the keyboard.
  Searching a long list must reveal the first results rather than retain an
  unusable old scroll position. Preserve selection, Back, and the underlying draft.
- The shared Unit picker's Use custom unit action must stay fully visible and
  tappable while search is focused; verify custom-entry Save/Cancel too. Check
  Store/Category Create/Manage actions and time-zone/emoji actions under the same
  keyboard/safe-area rules. Change only flows that violate those rules.
- Preserve native sheet dragging; do not reintroduce the old wrapper/nested
  scrolling approach that broke header placement and touch behavior. Choose one
  keyboard-adjustment owner per layer and validate actual keyboard coordinates.

### 3. Empty Household disclosure (B04)

Only render Catalog item's More details disclosure when its item type has
applicable extra fields. Household has none today; Food keeps recipe measurement
fields. Switching type must not strand an expanded empty section. Cover Catalog,
Shopping, and recipe Food form reuse without changing saved default-unit rules.

### 4. Category form consistency (B13)

This is a layout repair of the existing shared category form, not new category
behavior. Create/Edit are already shared through CatalogChoiceForm; preserve
one implementation across Catalog, Recipes, and Shopping entry routes.

Observed differences:

- Create's Name is a standalone bordered ThemedInput placed inside a compact
  horizontal label/value row. Edit applies an inline, flexible, right-aligned
  input style. Create therefore lacks the same space constraints/alignment.
- Create's Food/Household buttons sit beside Type inside another compact row;
  the two buttons also flex inside their own row. They need a clearly bounded,
  full-width selection area rather than competing with the label for space.
- Name/Type card, Emoji row, count row, and primary/destructive actions use
  several local spacing/border definitions. Align those with accepted shared
  grouped-row, chevron, input, and action styles instead of adding more variants.

Proposed treatment:

- Keep the accepted grouped Name/Type card. Give Name's editable value flexible
  width and a usable minimum touch target in both modes; prevent long values
  from pushing past the card or colliding with the label.
- On Create, give Food/Household equal-width controls across the available row
  beneath its Type label; initialize from the entry context when supplied.
  On Edit, keep Type read-only, showing the saved value with no navigation arrow.
  Changing an existing category's type is outside this plan.
- Use the same card edge, inner padding, separators, text roles, and section
  spacing for both forms. Emoji remains the same reusable selectable row and
  native entry sheet, with the shared disclosure chevron.
- Edit-only item count stays aligned at the trailing edge. Preserve delete
  confirmation and the explanation that active items move to Uncategorized.
- Retain the app's current action convention: Create category at the bottom
  on Create, Save in the native header on Edit. Make both reachable with the
  keyboard and preserve loading/error/retry and duplicate-save protection.
- Test Food and Household from manager and item/recipe/shopping contexts,
  context preselection, long names, keyboard/emoji open and closed, Save/Back,
  and draft preservation. Do not change category data or duplicate-name rules.

References inspected: `docs/design/catalog/edit-category.png` and
`actual-edit-category-ios-2026-10-04.jpg`. The mockup's Type chevron is not
reintroduced because the actual form intentionally does not edit category type.
The historical screenshot's count alignment must not be assumed to reproduce
on current code; verify the present form before changing that row.

## Prevention for new pages

Record the standing reachability requirement in root/mobile AGENTS.md now at
Felipe's request. After approval, the required Screen layout choice makes the
ownership decision visible in code. Maintain shared layout contract tests and a
route-family audit/acceptance checklist. New direct ScrollView/FlatList or native
sheet pages must identify their own bounded viewport, chrome, and keyboard owner.

For each new or materially changed page, check long content, its actual final
control after finger release, empty/short states, keyboard show/hide, and return
from nested sheets. Passing structural tests alone cannot establish native
coordinates or scroll settling. Keep page components and tests in their accepted
folders; do not put helpers/tests in src/app.

## Delivery and validation

1. Shared layout contracts and all full-page callers, with route-family tests.
2. Sheet action reachability and empty Household disclosure, preserving B05/B.
3. Shared category create/edit alignment and cross-origin regressions.

Complete each intended slice before validation. Because Screen changes affect
the whole app, run full mobile normal and cache-disabled tests, TypeScript,
lint, web export, and diff checks after the final slice. Use placeholder config
for exports. No database tests for this frontend-only work; report them unrun.

Maintain a per-page-family iPhone checklist: every final row/action remains
visible above the real tab bar/home indicator after scrolling; no excess gap,
duplicate top padding, header/search overlap, scroll snap-back, or stale keyboard
inset after sheet dismissal. Include populated/empty lists, longer names, and
larger text. Verify both already-correct and repaired pages, and each modal
presentation/origin separately. Use current appearance for routine checks;
dedicated light/dark review remains a major-deployment gate. Android device
checks remain unrun until a device is available; test the Android layout paths
automatically and smoke-check web without calling those native acceptance.

No live household mutations or destructive tests on the Mac. No merge, push,
phone rebuild, or deployment is authorized by this planning update.

## Approved decisions

- Explicit shared layout modes and app-wide migration, covering every page
  family rather than only the originally reported pages.
- Category Create layout above; retain Edit's read-only Type and existing
  Create-versus-Save action convention.
- B08/B09 and B04 are already accepted in principle; integrate them with this
  reviewed shared-layout scope. No additional product clarification is needed.

## Official references and installed baseline

Expo 58.0.19 / Router 58.0.26, React Native 0.88.0. Inspected installed
expo-router/build/native-tabs/types.d.ts: Android applies the bottom inset,
whereas iOS automatic scroll insets are disabled by the current tab triggers.

- [Expo Native tabs](https://docs.expo.dev/router/advanced/native-tabs/)
- [React Native ScrollView](https://reactnative.dev/docs/scrollview)
- [Accepted native-sheet plan](native-sheets-app-wide.md)

The original documentation/source audit did not run app tests. Implementation
results below must not be attributed to that earlier audit.

## Implementation and validation (October 27)

- Screen requires `layout`: tab-root, tab-stack, stack-modal, or standalone.
  All callers were migrated. Shared Catalog item/choice forms and managers
  require the owning layout from their route wrappers, including Shopping's
  full-screen modal exceptions. Native-tab bottom handling stays separate from
  standalone/modal safe areas and native headers. Automatic scroll compensation
  is disabled to avoid applying it twice. Android keeps its native bottom owner.
- Recipe Food search has distinct, unflattened native header, results, and
  Create footer views. Search resets results to the first match. The footer
  is outside the list; keyboard clearance uses the measured sheet frame.
- KeyboardAwareSheet compares the root's window bounds to the keyboard's top.
  An already resized viewport receives zero extra padding. It handles a keyboard
  already open on mount, detent/layout changes, hiding, and stale measurement
  callbacks. Shared choice custom/create/manage actions and Plan fixed-footer
  forms use this one owner. Ingredient/Shopping single-scroll details instead
  use native scroll keyboard insets. Existing accepted Shopping picker placement,
  time-zone picker, and Catalog emoji keyboard behavior were retained.
- Household Catalog items have no empty More details control. Food keeps its
  recipe measurement fields and existing creation/return behavior.
- Category Create and Edit use the same flexible inline Name field and grouped
  card. Create's equal-width type controls use a full-width row beneath Type;
  Edit's Type remains read-only. Emoji, count, delete confirmation, and native
  Save conventions are preserved. Cover selection now scrolls at larger text.
- Mobile AGENTS.md documents the required layout and keyboard owners. The
  physical acceptance matrix is in `docs/qa/app-wide-reachability.md`.

Final validation:

- Full mobile normal run: 55 suites / 400 tests, no skips, passed (59.447 s).
- Full `--no-cache` run: 55 suites / 400 tests, no skips, passed (91.401 s).
- TypeScript and lint passed without remaining errors/warnings.
- Web static export passed with non-secret placeholder configuration. Output
  remains in the ignored mobile dist directory; no hosting was changed.
- Diff whitespace check passed before the final documentation record.

The first run passed existing regressions but failed 16 new assertions: the
route fixture retained tab roots, making a global Screen query ambiguous, and
category-create fixtures lacked NativeSheetProvider. The tests now identify
the one pushed-page frame and provide its real context. A missing mock API type
and a named test component resolved the new type/lint findings. No production
behavior assertion was skipped or suppressed to make tests pass.

Still unrun: post-change iPhone/Android geometry, scroll settling, native drag,
keyboard/large-text visual checks, interactive browser review, dedicated light/
dark review, native builds, hosted CI, and PostgreSQL tests (no backend edits).
Automated platform/inset and measured-keyboard simulations do not establish
native device appearance. The QA matrix remains pending for physical checks.
No API/schema, dependency, paid resource, Mac runtime/data, existing phone
installation, unrelated website/Android checkout, merge, push, or deployment
was changed by this implementation.

## Emoji clipping follow-up (October 27)

Felipe reports slight top clipping wherever emojis appear. Source inspection
finds emoji-only labels enlarged to 24/52 points while inheriting ThemedText's
24-point line height; recipe covers also impose fixed line heights and text
weights on emoji glyphs. This is a bounded typography correction in this slice.

Use shared EmojiText for configured emoji icons/previews. It explicitly clears
inherited line height/font family, uses normal weight and natural system glyph
metrics, and retains Android font padding. Decorative icons keep their intended
size, like the app's symbol icons, independently of label text scaling. Apply
it to category lists/pickers/edit previews, recipe covers at every size, recipe
emoji preview/choice, and the category badge. Separate badge glyph/label layout
retains its combined accessible label. Ordinary text and emoji inputs retain
their existing typography. Mobile AGENTS.md records this reusable standard.

Six targeted suites / 126 tests passed, plus TypeScript, lint, and whitespace
checks. Regressions cover sizes 16 through 72, flags and joined family emoji,
normal text metrics, cover variants, category icons, and recipe/category route
flows. One old badge assertion expected a single text node; it now checks the
preserved accessible label and separate glyph/label. No assertion was skipped.
The earlier full 400-test normal/cache-disabled results precede this follow-up;
they are historical. Full suite, exports, native builds, interactive browser,
and physical glyph-boundary checks were not rerun for this small typography fix.
Actual top/bottom appearance remains an iPhone retest, not proven by style tests.

### Editable emoji follow-up

Felipe confirms most display clipping is gone, but the Category emoji input
still clips. The prior fix explicitly did not change inputs. Category and
Recipe entry still used the standard single-line native TextInput. Shared
EmojiInput now uses the native multiline engine for glyph layout, a padded
60-point field with 24-point normal-weight emoji, and no forced line height.
Done uses blurAndSubmit, preserving an explicit sheet Save/Done rather than
inserting a newline or implicitly saving the category. Both emoji-entry flows
reuse it; normal inputs and the existing validators are unchanged. Post-change
phone confirmation is still required. Official React Native TextInput docs
and the installed single-line native text-rectangle implementation were checked.
Validation: 3 targeted suites / 110 tests passed, TypeScript and lint passed,
and whitespace checks passed. Existing create/edit/emoji validation, Clear,
Save/Cancel and return regressions remain active. No full-suite/native build or
physical glyph review is claimed for this follow-up; earlier results remain
historical. No API, database, dependency, or deployment change.
