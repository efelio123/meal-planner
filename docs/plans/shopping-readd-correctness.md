# Shopping re-add correctness — B12

Status: proposed October 27, 2026; awaiting Felipe's review. This document does
not authorize implementation, merge, native rebuild, or trial deployment.

## Goal and baseline

Tapping an item in Shopping's Add picker means the user needs it. An existing
purchased item must return to To buy even when its amount is unchanged. Keep
the accepted fast multi-add flow, with the picker open and a small confirmation.

Planning branch: `codex/shopping-readd-plan`, based on clean `2561f98` after
Felipe accepted the reviewed UI and emoji fixes. Preserve that baseline and
unrelated website/Android work. After approval, the chat agent implements on
a focused branch under Felipe's standing authorization for these bug fixes.

## Established cause and existing support

- ShoppingCatalogPickerSheet.selectItem opens Details for every existing
  Catalog-linked Shopping row, whether purchased or still needed.
- Details.save updates amount/unit/store but omits is_checked. An unchanged
  amount therefore never changes the purchased status.
- The API already accepts a partial PATCH containing only is_checked:false.
  shopping_lists.update_item clears checked_at/checked_by_user_id in that case;
  other fields are updated only when explicitly present. Catalog identity is
  household-scoped and duplicate POST requests return SHOPPING_ITEM_ALREADY_EXISTS.
- The mobile hook has per-item pending-mutation tracking and household/session
  scope guards. Preserve rapid independent checkoffs and stale-result rejection.

No API contract, schema, migration, or Catalog-default change is proposed.

## Proposed behavior

| User action / state | Result |
| --- | --- |
| Add picker: item is absent | Existing quick create: quantity 1 plus saved Catalog shopping unit/store. |
| Add picker: item is purchased | Reuse the same Shopping row; explicitly set unchecked; preserve its current amount/unit/store. Keep picker open and show the existing confirmation. |
| Add picker: item is already To buy | Keep one row, same amount/unit/store. Explicitly ensure unchecked so a stale phone snapshot cannot turn this into a toggle/recheck. Give an appropriate Already on list confirmation. |
| Open an item from the main Shopping list and save edits | Update the chosen fields and retain its purchased/needed status. Editing is not re-adding. |
| Repeated taps during one add attempt | One in-flight operation; no extra row or quantity increment. Retain the accepted per-picker completed-item guard. |

Example: purchased Chicken, amount 2, Pound, Costco -> Add Chicken -> the same
2 Pound / Costco row becomes To buy. It does not become 1 Pound or 4 Pounds,
and a newer Catalog default does not replace this shopping entry's choices.
Null amounts and recipe-derived/custom units are preserved too.

Intentional picker change for review: existing needed rows currently open Edit.
Under this proposal every picker selection has Add intent; editing an existing
row happens from the main list. This keeps the earlier two-tap/multi-add design
consistent and makes stale cross-phone purchased state safe to handle.

## Implementation approach

1. Make add/re-add intent explicit in the picker-to-list action. Resolve an
   existing row by Catalog identity and send a state-only PATCH rather than
   calling toggle or overwriting quantity preferences. Merge the canonical
   response into the list through the existing scoped state owner.
2. Preserve the sheet, search, keyboard/footer layout, confirmation, and existing
   checked-row/rapid-tap safeguards. Reflect completion only after a successful
   response; errors stay visible with retry available. Do not globally block
   unrelated Shopping checkoffs.
3. Handle a concurrent duplicate POST by finding the existing row and applying
   the same explicit unchecked intent, with a bounded recovery attempt. Never
   retry-create indefinitely or increment the amount. If another device deletes
   the row, refresh/reconcile and show a clear retry instead of false success.
4. Keep ordinary Details editing separate. Do not put is_checked:false on every
   edit save. If implementation reveals a retained Add-origin Details path,
   give that path explicit re-add intent; never infer intent from row status.
5. Invalidate old list loads when applying a successful mutation, reject old
   household/session results, and keep existing store/sort filters. A store
   filter can hide a correctly re-added item; do not silently change that filter.

Use the current native sheets and scoped contexts. No new presentation or
dependency is needed. Do not alter swipe deletion, list sorting, category
grouping, role permissions, Catalog defaults, or bulk clearing in this slice.

## Validation

After all intended implementation/test edits are complete:

- Targeted picker, hook, screen and actual-router regressions: checked item
  re-added with unchanged amount; preserve amount/unit/store and identity;
  already-needed item; new-item defaults; ordinary edits retain checked status;
  multi-add stays open; duplicate taps, failed PATCH/retry, concurrent duplicate,
  row deletion, stale load, household/session switch, rapid independent checkoffs.
- Cover built-in, household-custom and recipe-derived units, null amounts, and
  changed Catalog defaults without converting or overwriting the existing entry.
- Run TypeScript, lint, and diff checks. For the server contract, run relevant
  Shopping integration tests against an identity-verified disposable PostgreSQL
  database, extending its state-only uncheck/preserved-details case if needed.
  No full database suite for an unchanged API/schema; report any unrun check.
- iPhone check: purchase an item, re-add without changing amount, see it in To
  buy after closing the picker and refreshing; repeat ordinary Edit while
  purchased and verify it stays purchased. Confirm the second phone sees the
  same result after refresh. Use local disposable test data, not destructive
  tests against the live Mac database. Android remains a separate device check.

Clear purchased items (F03) and other Shopping features remain later slices.

## Decision requested

Approve preserving the existing Shopping amount/unit/store on re-add, with
every Add-picker tap having Add intent and ordinary editing staying on the
main list. If Felipe prefers reset-to-Catalog defaults or preserving the
current already-needed picker Edit action, revise this plan before coding.
