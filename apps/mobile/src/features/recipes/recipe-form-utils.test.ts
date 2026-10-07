import type { Recipe } from '@/lib/api';
import {
  draftFromRecipe,
  ingredientDraftFromRecipe,
  ingredientInputFromDraft,
  isValidRecipeAmount,
  moveDirectionStep,
  newRecipeDraft,
  recipeOptionalFieldsError,
  recipeDurationParts,
} from './recipe-form-utils';
import { formatDuration, formatRecipeAmount, ingredientMeasure, recipeCoverLabel } from './recipe-presentation';

const recipe: Recipe = {
  id: 'recipe-1', household_id: 'household-1', name: 'Soup', cover_kind: 'emoji', cover_emoji: '🍲',
  servings: 4, prep_minutes: 75, cook_minutes: 30, notes: 'Taste and adjust.', source_url: null,
  edit_revision: 1, created_at: '', updated_at: '', archived_at: null, ingredient_count: 1,
  ingredients: [{
    id: 'ingredient-1', catalog_item_id: 'food-1', catalog_item_name: 'Tomato', category_emoji: null,
    amount: '1/2', unit_code: 'cup', custom_unit_label: null, note: 'diced', position: 0, unit_label: 'Cup',
  }],
  steps: [{ id: 'step-1', position: 0, instruction: 'Simmer.' }],
};

describe('recipe form and presentation helpers', () => {
  it('accepts positive whole, decimal, fraction, and mixed-fraction amounts, but not ranges or invalid fractions', () => {
    for (const amount of ['1', '0.25', '1/2', '1 1/2']) expect(isValidRecipeAmount(amount)).toBe(true);
    for (const amount of ['0', '-1', '1-2', '1/0', '0/2', 'one']) expect(isValidRecipeAmount(amount)).toBe(false);
    expect(isValidRecipeAmount('')).toBe(true);
  });

  it('converts a loaded recipe to an editable draft and preserves optional recipe fields', () => {
    expect(draftFromRecipe(recipe)).toEqual({
      name: 'Soup', coverKind: 'emoji', coverEmoji: '🍲', servings: '4',
      prepHours: '1', prepMinutes: '15', cookHours: '0', cookMinutes: '30',
      notes: 'Taste and adjust.', sourceUrl: '',
    });
    expect(newRecipeDraft()).toMatchObject({ name: '', coverKind: 'initials', prepHours: '0', cookMinutes: '0' });
    expect(recipeDurationParts(null)).toEqual(['0', '0']);
  });

  it('validates optional servings and minute ranges before the editor sends a save', () => {
    const draft = newRecipeDraft();
    expect(recipeOptionalFieldsError(draft)).toBeNull();
    expect(recipeOptionalFieldsError({ ...draft, servings: '0' })).toBe('Servings must be a positive whole number.');
    expect(recipeOptionalFieldsError({ ...draft, prepMinutes: '60' })).toBe('Minutes must be between 0 and 59. Add an hour instead.');
  });

  it('keeps linked food identity and optional unit/note values when mapping an ingredient', () => {
    const draft = ingredientDraftFromRecipe(recipe.ingredients![0]);
    expect(draft.catalogItemId).toBe('food-1');
    expect(ingredientInputFromDraft({ ...draft, customUnitLabel: 'pinch', unitCode: 'cup', note: '  finely chopped  ' })).toEqual({
      catalog_item_id: 'food-1', amount: '1/2', unit_code: null, custom_unit_label: 'pinch', note: 'finely chopped',
    });
  });

  it('formats saved decimal precision for people in the editor and ingredient details', () => {
    expect(formatRecipeAmount('2.000000')).toBe('2');
    expect(formatRecipeAmount('1.500000')).toBe('1.5');
    expect(formatRecipeAmount('0.125000')).toBe('0.125');
    expect(formatRecipeAmount('1/2')).toBe('1/2');
    expect(ingredientDraftFromRecipe({ ...recipe.ingredients![0], amount: '1.500000' }).amount).toBe('1.5');
    expect(ingredientMeasure({ ...recipe.ingredients![0], amount: '2.000000' })).toBe('2 cup');
  });

  it('reorders directions without mutating the source and ignores out-of-bounds moves', () => {
    const initial = ['first', 'second', 'third'];
    expect(moveDirectionStep(initial, 1, -1)).toEqual(['second', 'first', 'third']);
    expect(initial).toEqual(['first', 'second', 'third']);
    expect(moveDirectionStep(initial, 0, -1)).toBe(initial);
    expect(moveDirectionStep(initial, 2, 1)).toBe(initial);
  });

  it('formats the selected cover, preparation time, and ingredient measurement', () => {
    expect(recipeCoverLabel(recipe)).toBe('🍲');
    expect(recipeCoverLabel({ ...recipe, cover_kind: 'initials', cover_emoji: null, name: 'Tomato Soup' })).toBe('T S');
    expect(formatDuration(65)).toBe('1 hr 5 min');
    expect(formatDuration(30)).toBe('30 min');
    expect(ingredientMeasure(recipe.ingredients![0])).toBe('1/2 cup');
    expect(ingredientMeasure({ ...recipe.ingredients![0], amount: '1', unit_label: 'Pound' })).toBe('1 lb');
  });
});
