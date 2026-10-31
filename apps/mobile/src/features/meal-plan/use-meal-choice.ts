import { useCallback, useRef, useState } from 'react';
import type { MealEntryType } from '@/lib/api';
import type { MealChoice } from './meal-entry';

export function useMealChoice(initial: MealChoice) {
  const [stored, setStored] = useState(() => ({ kind: initial.kind, recipeId: initial.kind === 'recipe' ? initial.recipeId : null,
    leftovers: initial.kind === 'leftovers' ? initial.detail : '', eating_out: initial.kind === 'eating_out' ? initial.detail : '' }));
  const generation = useRef(0);
  const selectType = useCallback((kind: MealEntryType) => { generation.current += 1; setStored((current) => ({ ...current, kind })); }, []);
  const selectRecipe = useCallback((recipeId: string) => { generation.current += 1; setStored((current) => ({ ...current, kind: 'recipe', recipeId })); }, []);
  const changeDetail = useCallback((detail: string) => {
    generation.current += 1;
    setStored((current) => current.kind === 'recipe' ? current : { ...current, [current.kind]: detail });
  }, []);
  const captureSelection = useCallback(() => generation.current, []);
  const selectionIsCurrent = useCallback((version: number) => generation.current === version, []);
  const choice: MealChoice = stored.kind === 'recipe' ? { kind: 'recipe', recipeId: stored.recipeId } : { kind: stored.kind, detail: stored[stored.kind] };
  return { choice, selectType, selectRecipe, changeDetail, captureSelection, selectionIsCurrent };
}
