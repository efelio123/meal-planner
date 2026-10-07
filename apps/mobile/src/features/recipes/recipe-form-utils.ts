import type { Recipe, RecipeIngredient, RecipeIngredientInput } from '@/lib/api';
import { formatRecipeAmount } from './recipe-presentation';

export type RecipeIngredientDraft = {
  catalogItemId: string;
  catalogItemName: string;
  categoryEmoji: string | null;
  amount: string;
  unitCode: string;
  unitLabel: string;
  customUnitLabel: string;
  note: string;
};

export type RecipeDirectionDraft = { key: string; instruction: string };

export type RecipeDraft = {
  name: string;
  coverKind: 'initials' | 'emoji';
  coverEmoji: string;
  servings: string;
  prepHours: string;
  prepMinutes: string;
  cookHours: string;
  cookMinutes: string;
  notes: string;
  sourceUrl: string;
};

export function newRecipeDraft(): RecipeDraft {
  return { name: '', coverKind: 'initials', coverEmoji: '', servings: '', prepHours: '0', prepMinutes: '0', cookHours: '0', cookMinutes: '0', notes: '', sourceUrl: '' };
}

export function newCreateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function recipeDurationParts(minutes: number | null): [string, string] {
  if (minutes === null) return ['0', '0'];
  return [String(Math.floor(minutes / 60)), String(minutes % 60)];
}

export function ingredientDraftFromRecipe(ingredient: RecipeIngredient): RecipeIngredientDraft {
  return {
    catalogItemId: ingredient.catalog_item_id,
    catalogItemName: ingredient.catalog_item_name,
    categoryEmoji: ingredient.category_emoji,
    amount: formatRecipeAmount(ingredient.amount),
    unitCode: ingredient.unit_code ?? '',
    unitLabel: ingredient.unit_label ?? '',
    customUnitLabel: ingredient.custom_unit_label ?? '',
    note: ingredient.note ?? '',
  };
}

export function ingredientInputFromDraft(ingredient: RecipeIngredientDraft): RecipeIngredientInput {
  return {
    catalog_item_id: ingredient.catalogItemId,
    amount: ingredient.amount.trim() || null,
    unit_code: ingredient.customUnitLabel.trim() ? null : ingredient.unitCode || null,
    custom_unit_label: ingredient.customUnitLabel.trim() || null,
    note: ingredient.note.trim() || null,
  };
}

export function moveDirectionStep<T>(steps: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps;
  const next = steps.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function isValidRecipeAmount(value: string): boolean {
  const amount = value.trim();
  if (!amount) return true;
  if (/^\d+(?:\.\d+)?$/u.test(amount)) return Number(amount) > 0;
  const mixed = amount.match(/^(\d+)\s+(\d+)\/(\d+)$/u);
  const fraction = amount.match(/^(\d+)\/(\d+)$/u);
  const parts = mixed ?? fraction;
  if (!parts) return false;
  const numerator = Number(mixed ? parts[2] : parts[1]);
  const denominator = Number(mixed ? parts[3] : parts[2]);
  return denominator > 0 && numerator > 0 && (mixed ? Number(parts[1]) >= 0 : true);
}

export function recipeOptionalFieldsError(draft: RecipeDraft): string | null {
  if (draft.servings.trim() && (!Number.isInteger(Number(draft.servings)) || Number(draft.servings) <= 0)) {
    return 'Servings must be a positive whole number.';
  }
  if ([draft.prepMinutes, draft.cookMinutes].some((value) => Number(value || 0) > 59)) {
    return 'Minutes must be between 0 and 59. Add an hour instead.';
  }
  if ([draft.prepHours, draft.cookHours].some((value) => Number(value || 0) > 999999)) {
    return 'That duration is too large.';
  }
  return null;
}

export function draftFromRecipe(recipe: Recipe): RecipeDraft {
  const [prepHours, prepMinutes] = recipeDurationParts(recipe.prep_minutes);
  const [cookHours, cookMinutes] = recipeDurationParts(recipe.cook_minutes);
  return {
    name: recipe.name,
    coverKind: recipe.cover_kind,
    coverEmoji: recipe.cover_emoji ?? '',
    servings: recipe.servings === null ? '' : String(recipe.servings),
    prepHours,
    prepMinutes,
    cookHours,
    cookMinutes,
    notes: recipe.notes ?? '',
    sourceUrl: recipe.source_url ?? '',
  };
}
