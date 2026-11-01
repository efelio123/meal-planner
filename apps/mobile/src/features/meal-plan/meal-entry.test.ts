import { choiceFromEntry, mealDraftPayload, mealSubtitle, mealTitle, validMealChoice } from './meal-entry';
import type { MealPlanEntry } from '@/lib/api';
const recipe: MealPlanEntry = { id: 'meal', planned_for: '2026-10-05', meal_slot: 'dinner', recipe_id: 'soup', recipe_name: 'Soup', edit_revision: 1 };
it('retains legacy recipe presentation and request compatibility', () => {
  expect(mealTitle(recipe)).toBe('Soup');
  expect(mealSubtitle(recipe)).toBe('Household meal');
  expect(mealDraftPayload({ plannedFor: recipe.planned_for, mealSlot: 'dinner', choice: choiceFromEntry(recipe) })).toEqual({ planned_for: recipe.planned_for, meal_slot: 'dinner', recipe_id: 'soup' });
});
it.each(['leftovers', 'eating_out'] as const)('formats %s and sends only its valid fields', (kind) => {
  const entry: MealPlanEntry = { ...recipe, recipe_id: null, recipe_name: null, entry_type: kind, detail: 'Chicken tacos' };
  expect(mealTitle(entry)).toBe(kind === 'leftovers' ? 'Leftovers' : 'Eating out');
  expect(mealSubtitle(entry)).toBe('Chicken tacos');
  expect(mealDraftPayload({ plannedFor: recipe.planned_for, mealSlot: 'lunch', choice: { kind, detail: '  Chicken tacos  ' } })).toEqual({ planned_for: recipe.planned_for, meal_slot: 'lunch', entry_type: kind, recipe_id: null, detail: 'Chicken tacos' });
  expect(mealDraftPayload({ plannedFor: recipe.planned_for, mealSlot: 'lunch', choice: { kind, detail: '  ' } }).detail).toBeNull();
});
it('validates blank selection, trimmed character limits and Unicode code points', () => {
  expect(validMealChoice({ kind: 'recipe', recipeId: null })).toBe(false);
  expect(validMealChoice({ kind: 'leftovers', detail: 'x'.repeat(161) })).toBe(false);
  expect(validMealChoice({ kind: 'leftovers', detail: ' x'.trim().repeat(160) + ' ' })).toBe(true);
  expect(validMealChoice({ kind: 'eating_out', detail: String.fromCodePoint(0x1f370).repeat(160) })).toBe(true);
  expect(() => mealDraftPayload({ plannedFor: recipe.planned_for, mealSlot: 'dinner', choice: { kind: 'leftovers', detail: 'x'.repeat(161) } })).toThrow('160');
});
