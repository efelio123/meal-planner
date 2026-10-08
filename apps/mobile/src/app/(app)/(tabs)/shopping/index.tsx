import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useMealPlanContextOptional } from '@/features/meal-plan/meal-plan-context';
import ShoppingListScreen from '@/features/shopping-list/shopping-list-screen';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function ShoppingRoute() {
  const { selectedHousehold } = useHouseholdState();
  const mealPlanContext = useMealPlanContextOptional();
  const notice = selectedHousehold ? mealPlanContext?.shoppingAddNoticeForHousehold(selectedHousehold.id) : null;
  const clearNotice = mealPlanContext?.clearShoppingAddNotice;

  useFocusEffect(useCallback(() => {
    if (!notice) return;
    const timer = setTimeout(() => clearNotice?.(notice.requestId), 8000);
    return () => {
      clearTimeout(timer);
      clearNotice?.(notice.requestId);
    };
  }, [clearNotice, notice]));

  return <ShoppingListScreen />;
}
