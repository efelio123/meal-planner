import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type GetToken, type MealPlanEntry, type MealPlanWeek } from '@/lib/api';
import { mealPlanScope } from './meal-plan-context';

type StoredState = { scope: string; weekOffset: number; week: MealPlanWeek | null; loading: boolean; refreshing: boolean; error: string | null };

export function useMealPlan() {
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const householdId = selectedHousehold?.id ?? null;
  const scope = mealPlanScope(userId, sessionId, householdId);
  const [weekOffset, setWeekOffset] = useState(0);
  const [state, setState] = useState<StoredState>({ scope: '', weekOffset: 0, week: null, loading: true, refreshing: false, error: null });
  const latestGetToken = useRef<GetToken>(getToken);
  const currentScope = useRef(scope);
  const currentWeekOffset = useRef(weekOffset);
  const requestVersion = useRef(0);
  const stateForScope = state.scope === scope && state.weekOffset === weekOffset
    ? state
    : { scope, weekOffset, week: null, loading: true, refreshing: false, error: null };

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => {
    currentWeekOffset.current = weekOffset;
    if (currentScope.current !== scope) {
      currentScope.current = scope;
      requestVersion.current += 1;
      setState({ scope, weekOffset, week: null, loading: Boolean(householdId), refreshing: false, error: null });
    }
  }, [householdId, scope, weekOffset]);

  const refresh = useCallback(async (options: { quiet?: boolean } = {}) => {
    const requestedHousehold = householdId;
    const requestedScope = scope;
    const requestedOffset = weekOffset;
    const version = ++requestVersion.current;
    if (!requestedHousehold) {
      setState({ scope: requestedScope, weekOffset: requestedOffset, week: null, loading: false, refreshing: false, error: null });
      return null;
    }
    setState((current) => current.scope === requestedScope && current.weekOffset === requestedOffset
      ? { ...current, loading: !current.week && !options.quiet, refreshing: Boolean(current.week) && !options.quiet, error: null }
      : { scope: requestedScope, weekOffset: requestedOffset, week: null, loading: true, refreshing: false, error: null });
    try {
      const result = await api.mealPlan(() => latestGetToken.current(), requestedHousehold, requestedOffset);
      if (version !== requestVersion.current || currentScope.current !== requestedScope) return null;
      setState({ scope: requestedScope, weekOffset: requestedOffset, week: result, loading: false, refreshing: false, error: null });
      return result;
    } catch (reason) {
      if (version === requestVersion.current && currentScope.current === requestedScope) {
        setState((current) => ({ ...current, loading: false, refreshing: false, error: reason instanceof ApiError ? reason.message : 'We couldn’t load this week. Please try again.' }));
      }
      return null;
    }
  }, [householdId, scope, weekOffset]);

  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => { clearTimeout(timer); requestVersion.current += 1; };
  }, [refresh]);

  const mutate = useCallback(async (action: () => Promise<unknown>) => {
    const requestedScope = scope;
    const requestedOffset = weekOffset;
    await action();
    if (currentScope.current !== requestedScope || currentWeekOffset.current !== requestedOffset) return;
    await refresh({ quiet: true });
  }, [refresh, scope, weekOffset]);
  const create = useCallback((values: Pick<MealPlanEntry, 'planned_for' | 'meal_slot' | 'recipe_id'>) => {
    if (!householdId) return Promise.resolve();
    return mutate(() => api.createMealPlanEntry(() => latestGetToken.current(), householdId, values));
  }, [householdId, mutate]);
  const update = useCallback((entryId: string, values: Pick<MealPlanEntry, 'planned_for' | 'meal_slot' | 'recipe_id'> & { expected_revision: number }) => {
    if (!householdId) return Promise.resolve();
    return mutate(() => api.updateMealPlanEntry(() => latestGetToken.current(), householdId, entryId, values));
  }, [householdId, mutate]);
  const remove = useCallback((entryId: string, revision: number) => {
    if (!householdId) return Promise.resolve();
    return mutate(() => api.deleteMealPlanEntry(() => latestGetToken.current(), householdId, entryId, revision));
  }, [householdId, mutate]);

  const changeWeek = useCallback((offset: number) => setWeekOffset((current) => current + offset), []);
  const setTodayWeek = useCallback(async () => {
    setWeekOffset(0);
    requestVersion.current += 1;
  }, []);
  return {
    householdId,
    scope,
    weekOffset,
    week: stateForScope.week,
    loading: stateForScope.loading,
    refreshing: stateForScope.refreshing,
    error: stateForScope.error,
    refresh,
    changeWeek,
    setTodayWeek,
    create,
    update,
    remove,
  };
}
