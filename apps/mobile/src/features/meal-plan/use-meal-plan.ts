import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type GetToken, type MealPlanEntryInput, type MealPlanWeek } from '@/lib/api';
import { mealPlanScope } from './meal-plan-context';

type StoredState = { scope: string; weekOffset: number; week: MealPlanWeek | null; loading: boolean; refreshing: boolean; error: string | null };
type Removal = { promise: Promise<void> };
const EMPTY_IDS: ReadonlySet<string> = new Set();

export function useMealPlan() {
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const householdId = selectedHousehold?.id ?? null;
  const scope = mealPlanScope(userId, sessionId, householdId);
  const [weekOffset, setWeekOffset] = useState(0);
  // Object identities distinguish leaving and returning to the same household/week.
  const owner = useMemo(() => ({ scope }), [scope]);
  const view = useMemo(() => ({ owner, weekOffset }), [owner, weekOffset]);
  const [state, setState] = useState<StoredState>({ scope: '', weekOffset: 0, week: null, loading: true, refreshing: false, error: null });
  const [pendingState, setPendingState] = useState({ owner, ids: EMPTY_IDS });
  const [blockedState, setBlockedState] = useState({ owner, ids: EMPTY_IDS });
  const latestGetToken = useRef<GetToken>(getToken);
  const currentOwner = useRef(owner);
  const currentView = useRef(view);
  const latestState = useRef(state);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const removals = useRef(new Map<string, Removal>());
  const confirmedRemovals = useRef(new Set<string>());
  const needsFreshRead = useRef(new Set<string>());
  const stateForScope = state.scope === scope && state.weekOffset === weekOffset
    ? state
    : { scope, weekOffset, week: null, loading: true, refreshing: false, error: null };
  const isCurrentOwner = useCallback(() => mounted.current && currentOwner.current === owner, [owner]);
  const isCurrentView = useCallback(() => mounted.current && currentView.current === view, [view]);

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => { latestState.current = state; }, [state]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestVersion.current += 1; };
  }, []);
  useLayoutEffect(() => {
    currentView.current = view;
    if (currentOwner.current === owner) return;
    currentOwner.current = owner;
    requestVersion.current += 1;
    removals.current.clear();
    confirmedRemovals.current.clear();
    needsFreshRead.current.clear();
    setPendingState({ owner, ids: EMPTY_IDS });
    setBlockedState({ owner, ids: EMPTY_IDS });
    setState({ scope, weekOffset, week: null, loading: Boolean(householdId), refreshing: false, error: null });
  }, [householdId, owner, scope, view, weekOffset]);

  const refresh = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!isCurrentView()) return null;
    const version = ++requestVersion.current;
    if (!householdId) {
      setState({ scope, weekOffset, week: null, loading: false, refreshing: false, error: null });
      return null;
    }
    setState((current) => current.scope === scope && current.weekOffset === weekOffset
      ? { ...current, loading: !current.week && !options.quiet, refreshing: Boolean(current.week) && !options.quiet, error: null }
      : { scope, weekOffset, week: null, loading: true, refreshing: false, error: null });
    try {
      const result = await api.mealPlan(() => latestGetToken.current(), householdId, weekOffset);
      if (version !== requestVersion.current || !isCurrentView()) return null;
      // A read begun before a successful DELETE cannot bring that ID back, even
      // when another entry's delete or a new week read completes concurrently.
      const week = { ...result, entries: result.entries.filter((entry) => !confirmedRemovals.current.has(entry.id)) };
      const next = { scope, weekOffset, week, loading: false, refreshing: false, error: null };
      latestState.current = next;
      setState(next);
      needsFreshRead.current.clear();
      setBlockedState({ owner, ids: EMPTY_IDS });
      return week;
    } catch (reason) {
      if (version === requestVersion.current && isCurrentView()) {
        setState((current) => ({ ...current, loading: false, refreshing: false, error: reason instanceof ApiError ? reason.message : 'We couldn’t load this week. Please try again.' }));
      }
      return null;
    }
  }, [householdId, isCurrentView, owner, scope, weekOffset]);

  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => { clearTimeout(timer); requestVersion.current += 1; };
  }, [refresh]);

  const mutate = useCallback(async (action: () => Promise<unknown>) => {
    if (!isCurrentView()) throw new Error('The selected plan changed. Please try again.');
    await action();
    if (isCurrentView()) await refresh({ quiet: true });
  }, [isCurrentView, refresh]);
  const create = useCallback((values: MealPlanEntryInput) => {
    if (!householdId) return Promise.resolve();
    return mutate(() => api.createMealPlanEntry(() => latestGetToken.current(), householdId, values));
  }, [householdId, mutate]);
  const update = useCallback((entryId: string, values: MealPlanEntryInput & { expected_revision: number }) => {
    if (!householdId) return Promise.resolve();
    if (removals.current.has(entryId) || needsFreshRead.current.has(entryId)) return Promise.reject(new Error('Refresh the plan before changing this meal.'));
    return mutate(() => api.updateMealPlanEntry(() => latestGetToken.current(), householdId, entryId, values));
  }, [householdId, mutate]);
  const remove = useCallback((entryId: string, revision: number): Promise<void> => {
    if (!householdId || !isCurrentView()) return Promise.reject(new Error('The selected plan changed. Please try again.'));
    const pending = removals.current.get(entryId);
    if (pending) return pending.promise;
    if (confirmedRemovals.current.has(entryId)) return Promise.resolve();
    const cached = latestState.current;
    const entry = cached.scope === scope && cached.weekOffset === weekOffset ? cached.week?.entries.find((item) => item.id === entryId) : null;
    if (!entry || entry.edit_revision !== revision || needsFreshRead.current.has(entryId)) {
      return Promise.reject(new ApiError(409, 'This planned meal changed. Refresh before removing it.', 'MEAL_PLAN_REVISION_CONFLICT'));
    }
    const work: Removal = { promise: Promise.resolve() };
    removals.current.set(entryId, work);
    setPendingState({ owner, ids: new Set(removals.current.keys()) });
    work.promise = Promise.resolve().then(async () => {
      if (!isCurrentView()) throw new Error('The selected plan changed. Please try again.');
      try {
        await api.deleteMealPlanEntry(() => latestGetToken.current(), householdId, entryId, revision);
      } catch (reason) {
        if (isCurrentOwner()) {
          needsFreshRead.current.add(entryId);
          setBlockedState({ owner, ids: new Set(needsFreshRead.current) });
          // A successful fresh read is required before another deletion attempt.
          if (isCurrentView()) { requestVersion.current += 1; await refresh({ quiet: true }); }
        }
        throw reason;
      }
      if (!isCurrentOwner()) return;
      confirmedRemovals.current.add(entryId);
      needsFreshRead.current.delete(entryId);
      setBlockedState({ owner, ids: new Set(needsFreshRead.current) });
      // Reconcile only this confirmed ID; never replace a newly selected week
      // with the old operation's week. Recipe IDs and other occurrences survive.
      setState((current) => current.scope === scope && current.week?.entries.some((item) => item.id === entryId)
        ? { ...current, week: { ...current.week, entries: current.week.entries.filter((item) => item.id !== entryId) } }
        : current);
      if (isCurrentView()) {
        requestVersion.current += 1;
        await refresh({ quiet: true });
      }
    }).finally(() => {
      if (!isCurrentOwner() || removals.current.get(entryId) !== work) return;
      removals.current.delete(entryId);
      setPendingState({ owner, ids: new Set(removals.current.keys()) });
    });
    return work.promise;
  }, [householdId, isCurrentOwner, isCurrentView, owner, refresh, scope, weekOffset]);

  const changeWeek = useCallback((offset: number) => setWeekOffset((current) => current + offset), []);
  const setTodayWeek = useCallback(async () => {
    if (weekOffset === 0) { await refresh(); return; }
    setWeekOffset(0);
  }, [refresh, weekOffset]);
  return {
    householdId, scope, weekOffset, week: stateForScope.week,
    loading: stateForScope.loading, refreshing: stateForScope.refreshing, error: stateForScope.error,
    pendingRemovalIds: pendingState.owner === owner ? pendingState.ids : EMPTY_IDS,
    blockedRemovalIds: blockedState.owner === owner ? blockedState.ids : EMPTY_IDS,
    refresh, changeWeek, setTodayWeek, create, update, remove,
  };
}
