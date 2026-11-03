import type { Recipe, RecipeIngredientInput } from '@/lib/api';
import { ingredientDraftFromRecipe, ingredientInputFromDraft, newCreateRequestId, type RecipeIngredientDraft } from './recipe-form-utils';
import { reorderIngredients } from './recipe-ingredient-order';

export type RecipeSectionDraft = { key: string; name: string };
export function loadRecipeSections(recipe: Recipe) {
  const sections = (recipe.ingredient_sections ?? []).map((section) => ({ key: `section-${newCreateRequestId()}`, name: section.name }));
  const byPosition = new Map((recipe.ingredient_sections ?? []).map((section, index) => [section.position, sections[index].key]));
  const ingredients = (recipe.ingredients ?? []).map((item) => ({ ...ingredientDraftFromRecipe(item), sectionKey: item.section_position == null ? null : byPosition.get(item.section_position) ?? null }));
  return { sections, ingredients };
}
export function sectionIngredients(items: RecipeIngredientDraft[], key: string | null) {
  return items.filter((item) => (item.sectionKey ?? null) === key);
}
export function orderedSectionIngredients(items: RecipeIngredientDraft[], sections: RecipeSectionDraft[]) {
  return [null, ...sections.map((section) => section.key)].flatMap((key) => sectionIngredients(items, key));
}
export function sectionedIngredientInputs(items: RecipeIngredientDraft[], sections: RecipeSectionDraft[]): RecipeIngredientInput[] {
  if (sections.length === 0) return items.map(ingredientInputFromDraft);
  return orderedSectionIngredients(items, sections).map((item) => ({
    ...ingredientInputFromDraft(item),
    section_position: item.sectionKey ? sections.findIndex((section) => section.key === item.sectionKey) : null,
  }));
}
export function removeRecipeSection(items: RecipeIngredientDraft[], key: string) {
  // Appending preserves the existing order of both unassigned and removed rows.
  return [...items.filter((item) => item.sectionKey !== key), ...items.filter((item) => item.sectionKey === key).map((item) => ({ ...item, sectionKey: null }))];
}
export function reorderSectionIngredients(items: RecipeIngredientDraft[], key: string | null, keys: string[]) {
  const group = sectionIngredients(items, key); const next = reorderIngredients(group, keys);
  if (next === group) return items;
  let index = 0;
  return items.map((item) => (item.sectionKey ?? null) === key ? next[index++] : item);
}
export function sectionsMatchSaved(recipe: Recipe, expected: { name: string }[], ingredients?: RecipeIngredientInput[]) {
  if (!recipe.ingredient_sections) return expected.length === 0;
  if (JSON.stringify(recipe.ingredient_sections.map(({ name }) => ({ name }))) !== JSON.stringify(expected.map(({ name }) => ({ name })))) return false;
  return !ingredients || (recipe.ingredients?.length === ingredients.length && ingredients.every((item, i) => (item.section_position ?? null) === (recipe.ingredients?.[i]?.section_position ?? null)));
}
