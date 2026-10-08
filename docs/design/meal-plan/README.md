# Meal-planning visual references

The four original dark-theme PNGs capture the views Felipe approved on October
7, 2026. Two additional PNGs capture the approved partial-amount follow-up.
They are visual targets for the household-scoped Plan slice, not a replacement
for the behavior and edge cases in
`docs/plans/household-scoped-meal-planning.md`.

| View | Reference |
| --- | --- |
| Monday-start weekly Plan, selected day, and centered small meal chevrons | `weekly-plan.png` |
| Whole-week shopping review and three-meal ingredient breakdown | `shopping-review.png` |
| Add-meal sheet | `add-meal-sheet.png` |
| Edit-planned-meal sheet | `edit-planned-meal.png` |
| Shopping review after changing chicken from 3 Pound needed to 1 Pound to buy, retaining the three-meal expansion | `shopping-review-adjusted.png` |
| Draggable amount-to-buy sheet with the approved illustrative chicken copy | `shopping-amount-sheet.png` |

The images were rendered from Felipe-approved interactive concepts. The
partial-amount examples are illustrative, not fixed ingredient data or copy
for every unit and amount. Compare
each running screen side by side with its reference, and compare related
screens to each other for typography, spacing, cards, actions, and navigation.
The system-owned sheet frame, status bar, and tab bar may vary by platform;
report any other intentional visual difference instead of silently accepting
it. The rendered examples contain synthetic recipes and dates, not product
seed data or fixed copy requirements.

`actual-amount-sheet-overlap.jpg` is Felipe's October 8 iPhone capture of a
layout defect, **not** an approved design target. It shows the first card
overlapping and partly hiding the “Amount to buy” title and Cancel action.
Use it alongside `shopping-amount-sheet.png` to verify that this specific
overlap is corrected on a running phone.

## Deferred concept: optional side

`future-optional-side.png` records Felipe's preferred direction for a later
version: a side appears beneath the main recipe for one planned meal, without
changing the saved main recipe. It is **not** an approved v1 implementation
reference. The side's data, editing, and shopping-review behavior need their
own product decisions and plan before implementation.
