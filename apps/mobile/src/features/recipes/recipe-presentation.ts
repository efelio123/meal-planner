import type { Recipe, RecipeIngredient } from '@/lib/api';

export function recipeInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((word) => Array.from(word)[0]?.toLocaleUpperCase() ?? '').join(' ');
}

export function recipeCoverLabel(recipe: Pick<Recipe, 'name' | 'cover_kind' | 'cover_emoji'>): string {
  return recipe.cover_kind === 'emoji' && recipe.cover_emoji ? recipe.cover_emoji : recipeInitials(recipe.name);
}

export function formatRecipeAmount(amount: string | null | undefined): string {
  if (!amount) return '';
  const match = amount.match(/^(\d+)(?:\.(\d+))?$/u);
  if (!match) return amount;
  const fraction = match[2]?.replace(/0+$/u, '') ?? '';
  return fraction ? `${match[1]}.${fraction}` : match[1];
}

export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours && remainingMinutes) return `${hours} hr${hours === 1 ? '' : 's'} ${remainingMinutes} min`;
  if (hours) return `${hours} hr${hours === 1 ? '' : 's'}`;
  return `${remainingMinutes} min`;
}

export function ingredientMeasure(ingredient: Pick<RecipeIngredient, 'amount' | 'unit_label' | 'custom_unit_label'>): string {
  const builtInUnits: Record<string, string> = {
    cup: 'cup', dozen: 'dozen', 'fluid ounce': 'fl oz', gallon: 'gal', gram: 'g', kilogram: 'kg',
    liter: 'L', milliliter: 'mL', ounce: 'oz', pint: 'pt', pound: 'lb', quart: 'qt',
    tablespoon: 'tbsp', teaspoon: 'tsp', unit: 'unit',
  };
  const unit = ingredient.unit_label
    ? builtInUnits[ingredient.unit_label.toLocaleLowerCase()] ?? ingredient.unit_label
    : ingredient.custom_unit_label;
  const amount = formatRecipeAmount(ingredient.amount);
  if (amount && unit) return `${amount} ${unit}`;
  if (amount) return amount;
  return unit ?? 'To taste';
}
