# Shopping redesign references

These images capture Felipe-approved Shopping v1 mockups. Match their visible
hierarchy, spacing, row content, controls, and action styling as closely as the
native platforms permit. The native Catalog/Recipes sheet implementation remains
the interaction reference for dragging, nested navigation, keyboard placement,
and safe areas.

- `shopping-main.png`: list with Catalog-only Add in the header, amount and store
  on each row, To buy and Purchased sections, and Clear list.
- `shopping-store-filter.png`: store picker beside Sort.
- `shopping-sort.png`: available sort choices.
- `shopping-clear-confirm.png`: explicit destructive confirmation.
- `shopping-catalog-picker.png`: choose an existing Catalog item or create one.
  The later approved quick-add flow adds a fixed Create action and header `+`;
  choosing an item adds it immediately with Catalog defaults. The subsequently
  approved repeat-add flow keeps this sheet, search, and keyboard in place after
  each success, briefly confirms the addition, marks the row “On list,” and uses
  Done to return to Shopping.
- `shopping-add-details.png`: historical initial flow. New rows no longer open
  this intermediate sheet; amount, unit, and store are adjusted in Edit.
- `shopping-edit-details.png`: edit amount, unit, and store; show meals using it.

The mockups illustrate layout and copy, not pixel-identical system status bars,
tab bars, or native sheet frames. Document any material in-app deviation and
why it was needed.
