import type { RecipeMeasurementUnit } from '@/lib/api';
import type { ChoiceOption } from './choice-picker';

export function recipeUnitChoices(units: readonly RecipeMeasurementUnit[]): ChoiceOption[] {
  return units.map((unit) => ({
    id: unit.code,
    label: unit.label,
    group: `${unit.dimension[0].toUpperCase()}${unit.dimension.slice(1)}`,
  }));
}
