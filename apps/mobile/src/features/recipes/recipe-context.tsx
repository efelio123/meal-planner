import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
import type { CatalogItem } from '@/lib/api';

export type RecipeViewMode = 'grid' | 'list';
export type CreatedRecipeFood = { originScope: string; item: CatalogItem };

type RecipeContextValue = {
  revisionForHousehold: (householdId: string) => number;
  markChanged: (householdId: string) => void;
  viewMode: RecipeViewMode;
  setViewMode: (mode: RecipeViewMode) => void;
  createdFood: CreatedRecipeFood | null;
  setCreatedFood: (result: CreatedRecipeFood | null) => void;
};

const RecipeContext = createContext<RecipeContextValue | null>(null);

export function RecipeProvider({ children }: PropsWithChildren) {
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<RecipeViewMode>('grid');
  const [createdFood, setCreatedFood] = useState<CreatedRecipeFood | null>(null);
  const revisionForHousehold = useCallback((householdId: string) => revisions[householdId] ?? 0, [revisions]);
  const markChanged = useCallback((householdId: string) => {
    setRevisions((current) => ({ ...current, [householdId]: (current[householdId] ?? 0) + 1 }));
  }, []);
  const value = useMemo(() => ({
    revisionForHousehold,
    markChanged,
    viewMode,
    setViewMode,
    createdFood,
    setCreatedFood,
  }), [createdFood, markChanged, revisionForHousehold, viewMode]);
  return <RecipeContext.Provider value={value}>{children}</RecipeContext.Provider>;
}

export function useRecipeContext() {
  const value = useContext(RecipeContext);
  if (!value) throw new Error('Recipe screens must be inside RecipeProvider.');
  return value;
}
