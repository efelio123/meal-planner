import type { RecipeIngredientDraft } from './recipe-form-utils';
import { ingredientDraftFromRecipe, ingredientInputFromDraft } from './recipe-form-utils';
import { moveIngredient, reorderIngredients, saveIngredientByKey } from './recipe-ingredient-order';

const first: RecipeIngredientDraft = { key: 'first', catalogItemId: 'butter', catalogItemName: 'Butter', categoryEmoji: null, amount: '2 2/3', unitCode: 'tbsp', unitLabel: 'Tablespoon', customUnitLabel: '', note: 'softened' };
const second = { ...first, key: 'second', amount: '', customUnitLabel: 'pinch', note: 'for the pan' };
const third = { ...first, key: 'third', catalogItemId: 'milk', catalogItemName: 'Milk', amount: '1/2', unitCode: '', unitLabel: '', note: '' };
const rows = [first, second, third];

it('moves arbitrary occurrences immutably, retaining duplicate Catalog references and every detail', () => {
  const moved = reorderIngredients(rows, ['third', 'first', 'second']);
  expect(moved).toEqual([third, first, second]);
  expect(moved[1]).toBe(first);
  expect(rows).toEqual([first, second, third]);
  expect(moved.map(ingredientInputFromDraft)).toEqual([
    { catalog_item_id: 'milk', amount: '1/2', unit_code: null, custom_unit_label: null, note: null },
    { catalog_item_id: 'butter', amount: '2 2/3', unit_code: 'tbsp', custom_unit_label: null, note: 'softened' },
    { catalog_item_id: 'butter', amount: null, unit_code: null, custom_unit_label: 'pinch', note: 'for the pan' },
  ]);
});

it.each([[], ['first'], ['first', 'first', 'third'], ['first', 'second', 'missing'], ['first', 'second', 'third']].map((keys) => ({ keys })))('returns the same draft for invalid or unchanged keys: $keys', ({ keys }) => {
  expect(reorderIngredients(rows, keys)).toBe(rows);
});

it('moves adjacent rows by occurrence key and ignores edge/stale actions', () => {
  expect(moveIngredient(rows, 'third', -1)).toEqual([first, third, second]);
  expect(moveIngredient(rows, 'first', 1)).toEqual([second, first, third]);
  expect(moveIngredient(rows, 'first', -1)).toBe(rows);
  expect(moveIngredient(rows, 'third', 1)).toBe(rows);
  expect(moveIngredient(rows, 'missing', 1)).toBe(rows);
});

it('edits/removes the right duplicate after reorder, appends once and ignores a removed occurrence', () => {
  const moved = reorderIngredients(rows, ['second', 'third', 'first']);
  const edited = saveIngredientByKey(moved, { ...first, key: 'wrong', amount: '4' }, first.key);
  expect(edited.map((row) => [row.key, row.amount])).toEqual([['second', ''], ['third', '1/2'], ['first', '4']]);
  const removed = edited.filter((row) => row.key !== first.key);
  expect(saveIngredientByKey(removed, first, first.key)).toBe(removed);
  expect(saveIngredientByKey(removed, first, null)).toEqual([...removed, first]);
  expect(saveIngredientByKey(rows, first, null)).toBe(rows);
});

it('assigns fresh occurrence keys on every load and never serializes them', () => {
  const saved = { id: 'server-row', catalog_item_id: 'butter', catalog_item_name: 'Butter', category_emoji: null, amount: null, unit_code: 'tbsp', unit_label: 'Tablespoon', custom_unit_label: null, note: null, position: 0 };
  const a = ingredientDraftFromRecipe(saved); const b = ingredientDraftFromRecipe(saved);
  expect(a.key).not.toBe(b.key);
  expect(ingredientInputFromDraft(a)).not.toHaveProperty('key');
});
