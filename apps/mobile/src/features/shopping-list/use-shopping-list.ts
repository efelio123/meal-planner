import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type ShoppingListItem } from '@/lib/api';
import { useHouseholdState } from '@/hooks/use-household-state';

type ShoppingListState = {
  householdId: string | null;
  items: ShoppingListItem[];
  loading: boolean;
  error: string | null;
};

const emptyState = (householdId: string | null, loading = false): ShoppingListState => ({
  householdId,
  items: [],
  loading,
  error: null,
});
const noPendingItemIds: ReadonlySet<string> = new Set();

function orderItems(items: ShoppingListItem[]): ShoppingListItem[] {
  return [...items].sort((first, second) =>
    Number(first.is_checked) - Number(second.is_checked)
    || first.created_at.localeCompare(second.created_at)
    || first.id.localeCompare(second.id),
  );
}

export function useShoppingList() {
  const { getToken, selectedHousehold } = useHouseholdState();
  const [storedState, setStoredState] = useState<ShoppingListState>(() => emptyState(null));
  const householdVersion = useRef(0);
  const loadVersion = useRef(0);
  const inFlightItemMutations = useRef(new Set<string>());
  const [pendingItemsByHousehold, setPendingItemsByHousehold] = useState<Map<string, Set<string>>>(new Map());
  const previousHouseholdId = useRef<string | null>(null);
  const latestGetToken = useRef(getToken);
  const householdId = selectedHousehold?.id ?? null;
  const state = storedState.householdId === householdId
    ? storedState
    : emptyState(householdId, householdId !== null);
  const pendingItemIds = householdId ? pendingItemsByHousehold.get(householdId) ?? noPendingItemIds : noPendingItemIds;

  const beginItemMutation = useCallback((requestedHouseholdId: string, itemId: string) => {
    const key = JSON.stringify([requestedHouseholdId, itemId]);
    if (inFlightItemMutations.current.has(key)) return false;
    inFlightItemMutations.current.add(key);
    setPendingItemsByHousehold((current) => {
      const next = new Map(current);
      const itemIds = new Set(next.get(requestedHouseholdId) ?? []);
      itemIds.add(itemId);
      next.set(requestedHouseholdId, itemIds);
      return next;
    });
    return true;
  }, []);

  const finishItemMutation = useCallback((requestedHouseholdId: string, itemId: string) => {
    const key = JSON.stringify([requestedHouseholdId, itemId]);
    inFlightItemMutations.current.delete(key);
    setPendingItemsByHousehold((current) => {
      const next = new Map(current);
      const itemIds = new Set(next.get(requestedHouseholdId) ?? []);
      itemIds.delete(itemId);
      if (itemIds.size === 0) next.delete(requestedHouseholdId);
      else next.set(requestedHouseholdId, itemIds);
      return next;
    });
  }, []);

  useEffect(() => {
    latestGetToken.current = getToken;
  }, [getToken]);

  // Invalidate old work in the commit before any pending promise can update the new selection.
  useLayoutEffect(() => {
    if (previousHouseholdId.current !== householdId) {
      previousHouseholdId.current = householdId;
      householdVersion.current += 1;
      loadVersion.current += 1;
    }
  }, [householdId]);

  const refresh = useCallback(async () => {
    const requestVersion = ++loadVersion.current;
    const requestedHouseholdId = householdId;
    if (!requestedHouseholdId) {
      setStoredState(emptyState(null));
      return;
    }

    setStoredState((current) => current.householdId === requestedHouseholdId
      ? { ...current, loading: true, error: null }
      : emptyState(requestedHouseholdId, true));
    try {
      const response = await api.shoppingList(() => latestGetToken.current(), requestedHouseholdId);
      if (requestVersion === loadVersion.current) {
        setStoredState({ householdId: requestedHouseholdId, items: orderItems(response.shopping_list.items), loading: false, error: null });
      }
    } catch {
      if (requestVersion === loadVersion.current) {
        setStoredState((current) => current.householdId === requestedHouseholdId
          ? { ...current, loading: false, error: 'We couldn’t load the shopping list.' }
          : current);
      }
    } finally {
      if (requestVersion === loadVersion.current) {
        setStoredState((current) => current.householdId === requestedHouseholdId
          ? { ...current, loading: false }
          : current);
      }
    }
  }, [householdId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const add = useCallback(async (name: string) => {
    const requestedHouseholdId = householdId;
    if (!requestedHouseholdId) return;
    const requestHouseholdVersion = householdVersion.current;
    await api.addShoppingListItem(() => latestGetToken.current(), requestedHouseholdId, name);
    if (requestHouseholdVersion === householdVersion.current) await refresh();
  }, [householdId, refresh]);

  const toggle = useCallback(async (item: ShoppingListItem) => {
    const requestedHouseholdId = householdId;
    if (!requestedHouseholdId) return;
    if (!beginItemMutation(requestedHouseholdId, item.id)) return;
    const requestHouseholdVersion = householdVersion.current;
    const nextChecked = !item.is_checked;
    setStoredState((current) => current.householdId === requestedHouseholdId
      ? {
          ...current,
          items: orderItems(current.items.map((candidate) => candidate.id === item.id
            ? { ...candidate, is_checked: nextChecked }
            : candidate)),
        }
      : current);
    try {
      await api.setShoppingListItemChecked(
        () => latestGetToken.current(),
        requestedHouseholdId,
        item.id,
        nextChecked,
      );
    } catch {
      if (requestHouseholdVersion === householdVersion.current) {
        loadVersion.current += 1;
        setStoredState((current) => current.householdId === requestedHouseholdId
          ? { ...current, loading: false, items: orderItems(current.items.map((candidate) => candidate.id === item.id ? item : candidate)) }
          : current);
      }
      throw new Error('We couldn’t update that item.');
    } finally {
      finishItemMutation(requestedHouseholdId, item.id);
    }
    if (requestHouseholdVersion === householdVersion.current) {
      loadVersion.current += 1;
      setStoredState((current) => current.householdId === requestedHouseholdId
        ? {
            ...current,
            loading: false,
            items: orderItems(current.items.map((candidate) => candidate.id === item.id
              ? { ...candidate, is_checked: nextChecked }
              : candidate)),
          }
        : current);
    }
  }, [beginItemMutation, finishItemMutation, householdId]);

  const remove = useCallback(async (item: ShoppingListItem) => {
    const requestedHouseholdId = householdId;
    if (!requestedHouseholdId) return;
    if (!beginItemMutation(requestedHouseholdId, item.id)) return;
    const requestHouseholdVersion = householdVersion.current;
    try {
      await api.deleteShoppingListItem(() => latestGetToken.current(), requestedHouseholdId, item.id);
      if (requestHouseholdVersion === householdVersion.current) {
        loadVersion.current += 1;
        setStoredState((current) => current.householdId === requestedHouseholdId
          ? { ...current, loading: false, items: current.items.filter((candidate) => candidate.id !== item.id) }
          : current);
        await refresh();
      }
    } finally {
      finishItemMutation(requestedHouseholdId, item.id);
    }
  }, [beginItemMutation, finishItemMutation, householdId, refresh]);

  return {
    add,
    error: state.error,
    householdId,
    items: state.items,
    loading: state.loading,
    pendingItemIds,
    refresh,
    remove,
    toggle,
  };
}
