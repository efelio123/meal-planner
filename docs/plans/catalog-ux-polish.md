# Catalog UX correction plan

Status: approved by Felipe on 2026-10-02 for implementation. Preserve the
uncommitted Catalog work on `feat/household-catalog`, including unrelated
changes. The plan and new design image remain uncommitted for review.

## Goal and references

Bring the implemented Catalog screens back to the approved visual references,
fix the observed iPhone layout and keyboard behavior, and add searchable
choice management, category emoji, and safe deletion of used categories.
`docs/design/catalog/item-detail.png` **already exists** and is the missing
implementation reference. `catalog-home.png`, `category-picker.png`,
`store-picker.png`, `manage-catalog.png`, and `manage-categories.png` remain
visual references. The new `edit-category.png` shows the emoji control and
current active-item count. Its pictured count and category are sample data,
not hard-coded app data. Mockups are design targets, not screenshots of a
working platform implementation. The older mockups' “Pantry Staples” label is
superseded by “Pantry” in this plan.

Before coding, compare each affected live page with its reference side by
side. Match hierarchy, grouped cards, leading icons/indentation, spacing,
header actions, and semantic colors as closely as possible. Report any
platform limitation or intentional deviation with a screenshot and reason.
Do not add the optional starter-category preview to Manage catalog.

## Current-code diagnosis to verify on device

- `Screen` defaults to all four safe-area edges. All nested Catalog pages
  currently call `<Screen contentAlignment="top">` without overriding those
  edges, even though their native Stack already provides a header and top
  clearance. The established nested Profile pages use left/right edges only.
  This is the likely source of repeated extra top spacing. Correct safe-area
  ownership across Add/Edit Item, Item Detail, Manage catalog, choice lists,
  and Create/Edit Category/Store/Unit. Audit every `Screen` consumer so this
  does not regress in other tabs; preserve tab-root and intentionally centered
  auth/onboarding/loading behavior. Also compare the Catalog tab root against
  the Profile and Shopping roots: it uses a separate NativeTabs automatic
  scroll-inset path, so do not assume its larger-looking gap has the same
  cause as nested pages. Verify on iPhone; code inspection alone cannot
  measure the exact native offset.
- `ChoicePicker` puts a near-full-height sheet inside an iOS
  `KeyboardAvoidingView` with `behavior="padding"`, without sizing the sheet
  against the keyboard-reduced viewport. This plausibly pushes its search bar
  under the status bar. The grabber has no gesture recognizer, so drag-to-
  dismiss is not implemented. The picker also leaves the underlying item-name
  input focused, allowing its keyboard to reopen after selection. Confirm
  these causal paths with keyboard-open device checks before finalizing a fix.
- Item Detail currently renders a bordered hero, generic “Catalog details”
  card, and body Edit button instead of the existing reference's centered
  hero, type/category chips, Shopping preferences and Recipe measurement
  cards, and header Edit action. Keep current data, loading/retry, household
  scope, and Remove confirmation behavior while changing presentation.

## Proposed visual and interaction changes

- Catalog home: prefer the simpler `catalog-home.png` hierarchy—Food and
  Household section headings, grouped item cards, and category in each row's
  secondary line with optional unit (e.g. `Dairy · Gallon`). Remove the extra
  Dairy/Meat subsection headers and the redundant `Food · Gallon` subtitle.
  Search and type filters stay. This replaces the earlier plan's compromise
  that inserted category subsections. Felipe approved this simpler layout.
- Add/Edit and Item Detail: align with their references and remove doubled top
  inset. Make header Edit and other controls accessible on iOS, Android, and
  web. Do not invent inventory, recipe linkage, photos, or quantities.
- Category and store sheets: group options in rounded cards; use the reference
  leading icons and left-aligned, indented Create/Manage action rows, selected
  indication, and a grabber with reliable downward dismissal. Keep backdrop,
  Done, Android Back, accessibility, short-store-sheet sizing, and a scrollable
  long list. Search must remain visible and usable with the keyboard open,
  including small screens. Blur/dismiss the name field before opening a sheet;
  selecting or closing it must not resurrect that keyboard. Keep form drafts.
  Do not add a gesture dependency without explaining its benefit and obtaining
  approval.
- Manage Categories and Manage Stores gain top search, filtering visible
  active choices locally without losing Food/Household category distinction.
  Keep explicit no-results, loading, stale-data, and retry states. Manage
  Shopping Units may use the same reusable search pattern if it genuinely
  simplifies code, but it is not required by this request.
- Rename the default Food category “Pantry Staples” to “Pantry” for future
  households and plan a safe, one-time update for existing active matching
  rows. Preserve renamed, archived, and deleted-household rows. If an active
  Food “Pantry” already exists in a household, do not force a duplicate or
  silently merge categories; document/test the conflict outcome.
- Category emoji: store one Unicode emoji string per category, not separate
  iPhone/Android values. Each platform renders that same sequence using its
  own emoji font. Seed accessible, editable defaults: Produce 🥬, Dairy & Eggs
  🧀, Meat & Seafood 🥩, Bakery 🍞, Pantry 🫙, Frozen ❄️, Beverages 🥤,
  Cleaning 🧽, Paper Goods 🧻, Personal Care 🧴. Include an emoji control in
  Create/Edit Category and show it in pickers/management where the references
  use icons. Define optional/clear behavior and validate a single emoji
  grapheme or approved sequence; do not mistake UTF-16 length for one emoji.
  Backfill only clearly matching, currently unset active categories; no
  migration should overwrite a user's later emoji choice.
- Edit Category displays an authoritative active-item count. On Delete,
  confirm with the count and explain that active items become Uncategorized.
  On confirmation, within one household-locked transaction, clear category
  references from active items, then archive the category. Preserve archived
  item history unless a separate retention decision says otherwise. Recheck
  the count on the server so a newly attached item is not silently moved based
  on a stale confirmation; refresh and reconfirm if it changed. Store/unit
  removal rules stay unchanged. Failures must not partially move items.

## Validation and acceptance

- Add focused rendered and actual-router mobile tests for safe-area ownership,
  reference structure, no redundant type subtitle, searchable category/store
  managers, sheet action icons/cards, gesture dismissal, keyboard-open search,
  and name-field focus staying dismissed after a selection. Test short and
  long lists, small screens, light/dark mode, and draft preservation.
- Add API and disposable-PostgreSQL tests for emoji create/update/backfill,
  Pantry rename and duplicate collision, item counts, category deletion with
  0 and N active items, count-change race, rollback/authorization/isolation,
  and retained archived records. Use only a URL verified as
  `meal_planner_disposable_test`, never `meal_planner_dev`, for integration
  tests. Existing dev data must be migrated separately only when approved.
- Run normal/cold mobile tests, TypeScript, lint, API Ruff, relevant API tests,
  and whitespace checks. Perform side-by-side iPhone acceptance for every
  named screen and keyboard/sheet state; Android remains explicitly unverified
  until a device is available. Report any mockup mismatch instead of claiming
  exact parity based only on automated tests.

## Approved visual choices

1. Use the simpler Catalog list from `catalog-home.png`: category in each row's
   subtitle, without category subsection headings.
2. Tapping Emoji opens a focused field using the system emoji keyboard, not a
   custom emoji-grid dependency. Store one Unicode value and let each platform
   render its native artwork.
3. The deletion warning counts and moves **active** items to Uncategorized.
   Archived item rows retain their historical category reference while the
   category is archived.
