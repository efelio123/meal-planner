import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { useHouseholdState } from '@/hooks/use-household-state';
import type { MealSlot, Recipe } from '@/lib/api';

export type RecipeCreateReturn = { scope: string; sheetId: string; plannedFor: string; mealSlot: MealSlot; weekOffset: number };
type RecipeCreateResult = { sheetId: string; recipe: Recipe };
type ShoppingAddNotice = { householdId: string; count: number; requestId: string; scope: string };
type MealPlanContextValue = {
  beginRecipeCreate: (intent: RecipeCreateReturn) => void;
  recipeCreateIntentForSheet: (sheetId: string) => RecipeCreateReturn | null;
  completeRecipeCreate: (recipe: Recipe) => RecipeCreateReturn | null;
  recipeCreateResultForSheet: (sheetId: string) => Recipe | null;
  clearRecipeCreate: () => void;
  markShoppingChanged: (householdId: string, count: number, requestId: string) => void;
  shoppingRevisionForHousehold: (householdId: string) => number;
  shoppingAddNoticeForHousehold: (householdId: string) => ShoppingAddNotice | null;
  clearShoppingAddNotice: (requestId: string) => void;
  scope: string;
};

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

export function mealPlanScope(userId: string | null | undefined, sessionId: string | null | undefined, householdId: string | null | undefined) {
  return JSON.stringify([userId ?? '', sessionId ?? '', householdId ?? '']);
}

export function MealPlanProvider({ children }: PropsWithChildren) {
  const { userId, sessionId } = useAuth();
  const { selectedHousehold } = useHouseholdState();
  const scope = mealPlanScope(userId, sessionId, selectedHousehold?.id);
  const [intent, setIntent] = useState<RecipeCreateReturn | null>(null);
  const [result, setResult] = useState<RecipeCreateResult | null>(null);
  const [shoppingRevisions, setShoppingRevisions] = useState<Record<string, number>>({});
  const [shoppingAddNotice, setShoppingAddNotice] = useState<ShoppingAddNotice | null>(null);

  const beginRecipeCreate = useCallback((next: RecipeCreateReturn) => {
    if (next.scope !== scope) return;
    setIntent(next);
    setResult(null);
  }, [scope]);
  const recipeCreateIntentForSheet = useCallback((sheetId: string) =>
    intent && intent.scope === scope && intent.sheetId === sheetId ? intent : null, [intent, scope]);
  const completeRecipeCreate = useCallback((recipe: Recipe) => {
    if (!intent || intent.scope !== scope) return null;
    setResult({ sheetId: intent.sheetId, recipe });
    return intent;
  }, [intent, scope]);
  const recipeCreateResultForSheet = useCallback((sheetId: string) => {
    if (!intent || !result || intent.scope !== scope || result.sheetId !== sheetId || intent.sheetId !== sheetId) return null;
    return result.recipe;
  }, [intent, result, scope]);
  const clearRecipeCreate = useCallback(() => { setIntent(null); setResult(null); }, []);
  const markShoppingChanged = useCallback((householdId: string, count: number, requestId: string) => {
    setShoppingRevisions((current) => ({ ...current, [householdId]: (current[householdId] ?? 0) + 1 }));
    setShoppingAddNotice({ householdId, count, requestId, scope });
  }, [scope]);
  const shoppingRevisionForHousehold = useCallback((householdId: string) => shoppingRevisions[householdId] ?? 0, [shoppingRevisions]);
  const shoppingAddNoticeForHousehold = useCallback((householdId: string) => shoppingAddNotice?.householdId === householdId && shoppingAddNotice.scope === scope ? shoppingAddNotice : null, [scope, shoppingAddNotice]);
  const clearShoppingAddNotice = useCallback((requestId: string) => setShoppingAddNotice((current) => current?.requestId === requestId ? null : current), []);
  const value = useMemo(() => ({ beginRecipeCreate, recipeCreateIntentForSheet, completeRecipeCreate, recipeCreateResultForSheet, clearRecipeCreate, markShoppingChanged, shoppingRevisionForHousehold, shoppingAddNoticeForHousehold, clearShoppingAddNotice, scope }), [beginRecipeCreate, clearRecipeCreate, clearShoppingAddNotice, completeRecipeCreate, markShoppingChanged, recipeCreateIntentForSheet, recipeCreateResultForSheet, scope, shoppingAddNoticeForHousehold, shoppingRevisionForHousehold]);
  return <MealPlanContext.Provider value={value}>{children}</MealPlanContext.Provider>;
}

export function useMealPlanContext() {
  const context = useContext(MealPlanContext);
  if (!context) throw new Error('Meal plan screens must be inside MealPlanProvider.');
  return context;
}

export function useMealPlanContextOptional() {
  return useContext(MealPlanContext);
}
