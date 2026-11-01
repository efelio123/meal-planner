# Copy a household recipe into the current recipe — F10

Status: proposed November 1, 2026; awaiting Felipe's review. Planning only.
Branch: `codex/recipe-copy-plan`, based on accepted recipe work at `917d661`.
F09 and its editor follow-ups are committed but not merged/deployed; preserve
that baseline. Implementation follows the approved agent assignment under AGENTS.

## Goal and original request

While creating Chicken and mashed potatoes, copy an existing Mashed potatoes
recipe's ingredients and directions as an editable starting point. Changes to
this copy must never change the saved Mashed potatoes recipe. Support the shared
Create/Edit editor in Recipes and recipe creation from Plan.

## Proposed flow

1. Add **Copy from recipe** alongside the main bottom **Add ingredient** action.
   Do not crowd the Ingredients heading with another link. The existing section
   plus buttons still add individual ingredients.
2. Open a searchable native sheet of active recipes in the current household,
   reusing the existing recipe cover/list presentation. Exclude the recipe being
   edited. Loading, empty, retry and refresh states keep the parent draft intact.
3. Selecting a recipe loads its full contents and opens a preview with its name,
   source servings (when known), ingredient sections and directions. Show
   **Amounts will be copied as written**. A flat source gets an editable default
   section name based on the recipe name, validated at 1–80 characters.
4. **Copy into recipe** appends the previewed contents to the current draft.
   Back/Cancel/native dismiss adds nothing. Show a small accessible confirmation
   such as **Mashed potatoes copied** and return directly to the same editor.
5. The user can edit, move, reorder or remove the copied rows and directions.
   Only the normal recipe Save persists anything. Existing unsaved-change
   warnings protect the combined draft when leaving.

## Copy rules and review defaults

- **Append, never replace.** Keep the destination's existing ingredients,
  sections and directions. Imported directions follow existing directions and
  continue the ordinary numbering; directions remain one editable list.
- **Flat source:** place all copied ingredients in one new section, defaulting
  to the source recipe name. Generate a valid shortened default if needed and
  show it in the preview; renaming it never renames the source recipe.
- **Sectioned source:** append fresh copies of its sections in their saved order,
  including empty sections. Keep names as written. Append its unassigned rows
  after the destination's existing Other ingredients rows; Other ingredients
  stays visually last. Do not introduce nested sections or merge same-name groups.
- **Keep duplicate ingredients separate.** Butter in Chicken and Butter in Mash
  retain their own quantities, units and notes. Existing Shopping consolidation
  continues to combine occurrences under its current rules.
- **No automatic scaling.** Copy stored amounts, built-in/custom units, To taste
  values and ingredient notes faithfully. Destination servings do not change or
  silently multiply a side dish. Scaling can be designed separately later.
- **Keep destination metadata.** Do not replace name, cover, servings, timings,
  source-link field or existing notes with source metadata. When the source has
  an external source URL, append one readable attribution line to Notes containing
  its recipe name and URL, preserving existing notes and avoiding duplicate lines.
  General source recipe Notes are not part of this ingredients/directions copy.
- **Independent identity.** Generate new local keys for every copied section,
  ingredient occurrence and direction. Keep only the existing same-household
  Food Catalog references. No source recipe/child IDs become live links.
  Quantities, units, notes and directions are independent; editing the shared
  Food Catalog item itself remains a household-wide change, as it is today.
- **Atomic application.** Check the entire addition before changing the draft:
  20 sections, 200 ingredients, 200 directions, section-name and Notes limits.
  If it cannot fit, explain the limit and retain the preview/draft unchanged.
  Never truncate copied ingredients, directions or attribution to make it fit.
- Validate referenced Food against active household Catalog data. If any item
  is unavailable/archived or data cannot be verified, name the problem and allow
  retry; do not silently omit or relink ingredients. Existing Save validation
  remains authoritative if an item changes after copying.
- Copy the loaded preview snapshot. Later source edits do not update it. Reopen
  the source selection to get a newer copy. Repeating an intentional copy is
  allowed; double taps on one confirmation must apply only once.

## Affected areas and implementation approach

`src/features/recipes/recipe-editor-screen.tsx` owns the destination draft and
Recipes/Plan reuse. Add a focused pure merge helper and scoped picker/preview
components under that feature folder, using `recipe-form-utils.ts`,
`recipe-sections.ts` and the current draft fingerprint/leave guard. Validate and
build the complete merged result, then update ingredient/section/step refs and
state together; do not let intermediate grouping updates drop newly copied rows.
Copy against the latest destination draft, not a captured old array.

Existing `api.recipes` returns summaries; `api.recipe` returns full sections,
ingredients, directions, servings and source URL. Reuse those authorized reads
and active Catalog reads. Existing create/update requests already support all
resulting data, with revisions and independent child rows. No new API endpoint,
schema migration, dependency, paid resource or live deployment is proposed.
No autosave, external website import, full-recipe Duplicate action, selective
ingredient/direction import, serving conversion or linked sub-recipes in F10.

Capture household/session/editor generation and sheet identity when opening.
Ignore late fetches/results after Back, scope changes, reload or editor removal.
Disable import during drag, save or unresolved-save handling. Repeated taps,
request retries and delayed responses must not add the same confirmation twice.
Source load failure never mutates the destination or marks it dirty.

## Native layout and consistency

The editor stays in its existing tab-stack Screen frame. Picker and preview are
short native formSheet flows in both owning Recipes/Plan stacks, configured
before navigation and rendered directly through the accepted scoped sheet pattern.
Use medium/expanded detents for the searchable picker and open the longer preview
expanded. Preserve picker search/selection when returning from preview.

Reuse the accepted header/body/footer structure: real non-collapsible native
root/header/footer Views, one bounded scroll owner, measured keyboard handling
where an editable section name is shown, and reachable Copy actions outside long
content. Use the existing KeyboardAwareSheet for that fixed-footer preview, with
no second keyboard-inset owner in its body. Header and bottom Copy actions share
one validation/submit guard.
Follow `apps/mobile/AGENTS.md` and `native-sheets-app-wide.md`; no guessed padding,
extra flex wrapper, custom sheet gesture or native header-only navigation.
Compare controls with current Food/Ingredient details, sections and recipe rows.

## Validation after implementation

- Pure helper coverage: flat/sectioned sources, empty sections, unassigned rows,
  existing destination content, identical names, duplicate Catalog occurrences,
  new stable keys, quantities/fractions/custom units/To taste/notes, directions,
  source attribution, repeated copies, and all-or-nothing limit failures.
- Actual-router cases from Recipes Create/Edit and Plan Create: search, refresh,
  preview/Back/Cancel/dismiss, correct sheet height/frame, copy once, independent
  edits, unchanged metadata, normal Save/reload, dirty warning and save conflicts.
  Cover request failures, archived/unavailable Food, stale scope/response and
  destination state changes while the flow is open. Verify no write goes to source.
- After intended edits, run full mobile normal/cold suites, types/lint and native
  JS exports for the completed feature. Existing results remain historical.
  No DB behavior change is intended; if an API/data change proves necessary,
  revise this plan before implementation and include disposable-PG validation.
- Phone review in the current appearance: both editor origins, short/long lists,
  large text, initial/expanded detents, keyboard, nested returns and retained
  drafts. Record Android and other unrun checks separately. The dedicated
  light/dark and both-phone release pass belongs before a later major rollout.
- No testing, migrations or writes against the Mac trial DB or source recipe.

## Review decisions

Recommended first-version defaults are append both ingredients and directions,
create/preserve sections as above, retain duplicate occurrences, and copy amounts
without scaling. Felipe can revise these before approval. Implementation is not
authorized by this planning request; source code remains unchanged.
