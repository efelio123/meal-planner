import type { RecipeIngredientDraft } from './recipe-form-utils';

/** A drop is a permutation of the CURRENT occurrences, never a snapshot of values. */
export function reorderIngredients(current: RecipeIngredientDraft[], keys: readonly string[]): RecipeIngredientDraft[] {
  if (keys.length !== current.length || new Set(keys).size !== keys.length) return current;
  const byKey = new Map(current.map((item) => [item.key, item]));
  if (byKey.size !== current.length || keys.some((key) => !byKey.has(key))) return current;
  if (keys.every((key, index) => key === current[index].key)) return current;
  return keys.map((key) => byKey.get(key)!);
}

export function moveIngredient(current: RecipeIngredientDraft[], key: string, direction: -1 | 1): RecipeIngredientDraft[] {
  const index = current.findIndex((item) => item.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= current.length) return current;
  const keys = current.map((item) => item.key);
  [keys[index], keys[target]] = [keys[target], keys[index]];
  return reorderIngredients(current, keys);
}

export function saveIngredientByKey(current: RecipeIngredientDraft[], ingredient: RecipeIngredientDraft, existingKey: string | null): RecipeIngredientDraft[] {
  if (existingKey === null) return current.some((item) => item.key === ingredient.key) ? current : [...current, ingredient];
  if (!current.some((item) => item.key === existingKey)) return current;
  return current.map((item) => item.key === existingKey ? { ...ingredient, key: existingKey } : item);
}
