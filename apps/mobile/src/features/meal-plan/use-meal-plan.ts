import { calendarDay, currentWindow, isCalendarDate, weekday } from './planning-dates';
import { usePlanningWeekday } from './use-planning-weekday';
import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type GetToken, type MealPlanEntryInput, type MealPlanWeek } from '@/lib/api';
import { mealPlanScope } from './meal-plan-context';

type StoredState = { scope: string; windowKey: number | string; week: MealPlanWeek | null; loading: boolean; refreshing: boolean; error: string | null };
type Removal = { promise: Promise<void> };
const EMPTY_IDS: ReadonlySet<string> = new Set();

export function useMealPlan() {
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const householdId = selectedHousehold?.id ?? null;
  const scope = mealPlanScope(userId, sessionId, householdId);
  const { weekday: preferredWeekday, error: preferenceError, save: saveWeekday } = usePlanningWeekday(userId);
  const [chosenWindow, setChosenWindow] = useState<{ scope: string; value: number | string }>({ scope, value: 0 });
  const windowKey = chosenWindow.scope === scope ? chosenWindow.value : 0;
  const setWindowKey = useCallback((next: number | string | ((current: number | string) => number | string)) => {
    setChosenWindow((current) => ({ scope, value: typeof next === 'function' ? next(current.scope === scope ? current.value : 0) : next }));
  }, [scope]);
  // Object identities distinguish leaving and returning to the same household/week.
  const owner = useMemo(() => ({ scope }), [scope]);
  const view = useMemo(() => ({ owner, windowKey }), [owner, windowKey]);
  const [state, setState] = useState<StoredState>({ scope: '', windowKey: 0, week: null, loading: true, refreshing: false, error: null });
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
  const stateForScope = state.scope === scope && state.windowKey === windowKey
    ? state
    : { scope, windowKey, week: null, loading: true, refreshing: false, error: null };
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
    setState({ scope, windowKey, week: null, loading: Boolean(householdId), refreshing: false, error: null });
  }, [householdId, owner, scope, view, windowKey]);

  const refresh = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!isCurrentView()) return null;
    const version = ++requestVersion.current;
    if (!householdId) {
      setState({ scope, windowKey, week: null, loading: false, refreshing: false, error: null });
      return null;
    }
    setState((current) => current.scope === scope && current.windowKey === windowKey
      ? { ...current, loading: !current.week && !options.quiet, refreshing: Boolean(current.week) && !options.quiet, error: null }
      : { scope, windowKey, week: null, loading: true, refreshing: false, error: null });
    try {
      let result = await api.mealPlan(() => latestGetToken.current(), householdId, windowKey);
      if (version !== requestVersion.current || !isCurrentView()) return null;
      if (windowKey === 0) {
        const aligned = currentWindow(result.local_today, preferredWeekday);
        if (aligned !== result.week_start) result = await api.mealPlan(() => latestGetToken.current(), householdId, aligned);
      }
      if (version !== requestVersion.current || !isCurrentView()) return null;
      // A read begun before a successful DELETE cannot bring that ID back, even
      // when another entry's delete or a new week read completes concurrently.
      const week = { ...result, entries: result.entries.filter((entry) => !confirmedRemovals.current.has(entry.id)) };
      const next = { scope, windowKey, week, loading: false, refreshing: false, error: null };
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
  }, [householdId, isCurrentView, owner, preferredWeekday, scope, windowKey]);

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
    const entry = cached.scope === scope && cached.windowKey === windowKey ? cached.week?.entries.find((item) => item.id === entryId) : null;
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
  }, [householdId, isCurrentOwner, isCurrentView, owner, refresh, scope, windowKey]);

  const changeStart = useCallback((start: string, remember = true) => {
    if (!isCalendarDate(start) || !isCurrentView()) return;
    if (remember) saveWeekday(weekday(start));
    setWindowKey(start);
  }, [isCurrentView, saveWeekday, setWindowKey]);
  const changeWeek = useCallback((offset: number) => {
    if (!isCurrentView()) return;
    const current = latestState.current;
    const start = typeof windowKey === 'string' ? windowKey : current.scope === scope && current.windowKey === windowKey ? current.week?.week_start : null;
    if (start) changeStart(calendarDay(start, offset * 7), false);
    else setWindowKey((value) => typeof value === 'number' ? value + offset : calendarDay(value, offset * 7));
  }, [changeStart, isCurrentView, scope, setWindowKey, windowKey]);
  const setTodayWeek = useCallback(async () => {
    if (windowKey === 0) { await refresh(); return; }
    setWindowKey(0);
  }, [refresh, setWindowKey, windowKey]);
  return {
    householdId, scope, windowKey, week: stateForScope.week,
    loading: stateForScope.loading, refreshing: stateForScope.refreshing, error: stateForScope.error,
    pendingRemovalIds: pendingState.owner === owner ? pendingState.ids : EMPTY_IDS,
    blockedRemovalIds: blockedState.owner === owner ? blockedState.ids : EMPTY_IDS,
    refresh, changeWeek, changeStart, setTodayWeek, create, update, remove,
    preferredWeekday, preferenceError,
  };
}
