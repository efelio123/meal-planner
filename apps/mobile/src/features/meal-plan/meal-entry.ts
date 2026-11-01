import type { MealEntryType, MealPlanEntry, MealPlanEntryInput, MealSlot } from '@/lib/api';

export type MealChoice = { kind: 'recipe'; recipeId: string | null } | { kind: 'leftovers' | 'eating_out'; detail: string };
export type MealDraft = { plannedFor: string; mealSlot: MealSlot; choice: MealChoice };
export const SPECIAL_MEALS = [
  { kind: 'leftovers', title: 'Leftovers', field: 'Which meal? (optional)' },
  { kind: 'eating_out', title: 'Eating out', field: 'Restaurant (optional)' },
] as const;
export function mealType(entry: Pick<MealPlanEntry, 'entry_type'>): MealEntryType { return entry.entry_type ?? 'recipe'; }
export function mealTitle(entry: Pick<MealPlanEntry, 'entry_type' | 'recipe_name'>) {
  return SPECIAL_MEALS.find((option) => option.kind === mealType(entry))?.title ?? entry.recipe_name ?? 'Recipe';
}
export function mealSubtitle(entry: Pick<MealPlanEntry, 'entry_type' | 'detail' | 'archived_at'>) {
  return mealType(entry) === 'recipe' ? entry.archived_at ? 'Archived recipe' : 'Household meal' : entry.detail;
}
export function choiceFromEntry(entry: MealPlanEntry): MealChoice {
  return entry.entry_type === 'leftovers' || entry.entry_type === 'eating_out'
    ? { kind: entry.entry_type, detail: entry.detail ?? '' }
    : { kind: 'recipe', recipeId: entry.recipe_id };
}
export function validMealChoice(choice: MealChoice) {
  return choice.kind === 'recipe' ? Boolean(choice.recipeId) : Array.from(choice.detail.trim()).length <= 160;
}
export function mealDraftPayload(draft: MealDraft): MealPlanEntryInput {
  if (!validMealChoice(draft.choice)) throw new Error('Choose a recipe or enter details of 160 characters or fewer.');
  const common = { planned_for: draft.plannedFor, meal_slot: draft.mealSlot };
  if (draft.choice.kind === 'recipe') {
    if (!draft.choice.recipeId) throw new Error('Choose a recipe.');
    return { ...common, recipe_id: draft.choice.recipeId };
  }
  return { ...common, entry_type: draft.choice.kind, recipe_id: null, detail: draft.choice.detail.trim() || null };
}
