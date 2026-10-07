import { recipeSheetOptions } from './recipe-sheet-options';

describe('Recipes sheet navigator options', () => {
  it('uses the prototype-style native presentation for each Recipes layer', () => {
    expect(recipeSheetOptions([0.58, 0.94], '#202020', 'ios')).toMatchObject({
      presentation: 'formSheet',
      sheetAllowedDetents: [0.58, 0.94],
      sheetInitialDetentIndex: 0,
      sheetGrabberVisible: true,
      headerShown: false,
    });
    expect(recipeSheetOptions([0.52, 0.92], '#202020', 'ios').sheetAllowedDetents).toEqual([0.52, 0.92]);
  });

  it('keeps Android native and web fallback presentations distinct', () => {
    expect(recipeSheetOptions([0.58, 0.94], '#202020', 'android').presentation).toBe('formSheet');
    expect(recipeSheetOptions([0.58, 0.94], '#202020', 'web').presentation).toBe('modal');
  });
});
