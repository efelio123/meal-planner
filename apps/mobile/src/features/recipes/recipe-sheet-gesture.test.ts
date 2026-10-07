import { ingredientSheetTranslateRange, shouldDismissIngredientSheet } from './recipe-sheet-gesture';

describe('Ingredient Details drag', () => {
  it('clamps upward travel below the safe area while leaving downward travel available', () => {
    expect(ingredientSheetTranslateRange(180, 800)).toEqual({ inputRange: [-180, 0, 800], outputRange: [-180, 0, 800], extrapolate: 'clamp' });
    expect(ingredientSheetTranslateRange(0, 800).inputRange).toEqual([-1, 0, 800]);
  });

  it('returns to Food on a long pull or quick downward flick only', () => {
    expect(shouldDismissIngredientSheet(65, 0)).toBe(true);
    expect(shouldDismissIngredientSheet(20, 900)).toBe(true);
    expect(shouldDismissIngredientSheet(20, 300)).toBe(false);
    expect(shouldDismissIngredientSheet(-80, 900)).toBe(false);
  });
});
