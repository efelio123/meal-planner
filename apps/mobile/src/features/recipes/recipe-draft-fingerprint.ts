import type { RecipeDirectionDraft, RecipeDraft, RecipeIngredientDraft } from './recipe-form-utils';
import type { RecipeSectionDraft } from './recipe-sections';

/** Compare editable content, independent of local occurrence IDs or refreshed Catalog labels. */
export function recipeDraftFingerprint(draft: RecipeDraft, ingredients: RecipeIngredientDraft[], sections: RecipeSectionDraft[], steps: RecipeDirectionDraft[]) {
  return JSON.stringify({
    draft: {
      ...draft,
      // Focusing a zero-valued time field clears it; this is not a content edit.
      prepHours: Number(draft.prepHours || 0), prepMinutes: Number(draft.prepMinutes || 0),
      cookHours: Number(draft.cookHours || 0), cookMinutes: Number(draft.cookMinutes || 0),
    },
    sections: sections.map(({ name }) => name),
    ingredients: ingredients.map((item) => ({
      catalogItemId: item.catalogItemId, amount: item.amount, unitCode: item.unitCode,
      customUnitLabel: item.customUnitLabel, note: item.note,
      section: item.sectionKey ? sections.findIndex((section) => section.key === item.sectionKey) : null,
    })),
    steps: steps.map(({ instruction }) => instruction),
  });
}
