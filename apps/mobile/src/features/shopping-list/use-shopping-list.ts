import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type ShoppingListItem, type ShoppingListItemInput } from '@/lib/api';
import { useHouseholdState } from '@/hooks/use-household-state';

type ShoppingListState = { scope: string; householdId: string | null; items: ShoppingListItem[]; loading: boolean; error: string | null };
const emptyState = (scope: string, householdId: string | null, loading = false): ShoppingListState => ({ scope, householdId, items: [], loading, error: null });
const noPending: ReadonlySet<string> = new Set();

function orderItems(items: ShoppingListItem[]) {
  return [...items].sort((a, b) => Number(a.is_checked) - Number(b.is_checked) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

export function useShoppingList() {
  const { userId, sessionId } = useAuth();
  const { getToken, selectedHousehold } = useHouseholdState();
  const householdId = selectedHousehold?.id ?? null;
  const scope = JSON.stringify([userId ?? '', sessionId ?? '', householdId ?? '']);
  const [stored, setStored] = useState(() => emptyState(scope, householdId));
  const visible = stored.scope === scope ? stored : emptyState(scope, householdId, Boolean(householdId));
  const [pendingByScope, setPendingByScope] = useState<Map<string, Set<string>>>(new Map());
  const pendingMutations = useRef(new Set<string>());
  const latestToken = useRef(getToken);
  const previousScope = useRef(scope);
  const scopeVersion = useRef(0);
  const loadVersion = useRef(0);
  const pendingItemIds = pendingByScope.get(scope) ?? noPending;

  useEffect(() => { latestToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    scopeVersion.current += 1;
    loadVersion.current += 1;
    setStored(emptyState(scope, householdId, Boolean(householdId)));
  }, [householdId, scope]);

  const refresh = useCallback(async () => {
    const startedScope = scope;
    const version = ++loadVersion.current;
    if (!householdId) { setStored(emptyState(scope, null)); return; }
    setStored((current) => current.scope === startedScope ? { ...current, loading: true, error: null } : emptyState(startedScope, householdId, true));
    try {
      const result = await api.shoppingList(() => latestToken.current(), householdId);
      if (version === loadVersion.current && previousScope.current === startedScope) {
        setStored({ scope: startedScope, householdId, items: orderItems(result.shopping_list.items), loading: false, error: null });
      }
    } catch {
      if (version === loadVersion.current && previousScope.current === startedScope) {
        setStored((current) => current.scope === startedScope ? { ...current, loading: false, error: 'We couldn’t load the shopping list.' } : current);
      }
    } finally {
      if (version === loadVersion.current && previousScope.current === startedScope) {
        setStored((current) => current.scope === startedScope ? { ...current, loading: false } : current);
      }
    }
  }, [householdId, scope]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const begin = useCallback((startedScope: string, itemKey: string) => {
    const key = JSON.stringify([startedScope, itemKey]);
    if (pendingMutations.current.has(key)) return false;
    pendingMutations.current.add(key);
    setPendingByScope((current) => {
      const next = new Map(current);
      const keys = new Set(next.get(startedScope) ?? []);
      keys.add(itemKey); next.set(startedScope, keys); return next;
    });
    return true;
  }, []);
  const finish = useCallback((startedScope: string, itemKey: string) => {
    pendingMutations.current.delete(JSON.stringify([startedScope, itemKey]));
    setPendingByScope((current) => {
      const next = new Map(current); const keys = new Set(next.get(startedScope) ?? []); keys.delete(itemKey);
      if (keys.size) next.set(startedScope, keys); else next.delete(startedScope); return next;
    });
  }, []);

  const add = useCallback(async (catalogItemId: string, values: ShoppingListItemInput = {}) => {
    const startedVersion = scopeVersion.current;
    if (!householdId) return;
    await api.addShoppingListItem(() => latestToken.current(), householdId, catalogItemId, values);
    if (startedVersion === scopeVersion.current) await refresh();
  }, [householdId, refresh]);

  const toggle = useCallback(async (item: ShoppingListItem) => {
    const startedScope = scope; const startedVersion = scopeVersion.current;
    if (!householdId || !begin(startedScope, item.id)) return;
    const nextChecked = !item.is_checked;
    setStored((current) => current.scope === startedScope ? { ...current, items: orderItems(current.items.map((candidate) => candidate.id === item.id ? { ...candidate, is_checked: nextChecked } : candidate)) } : current);
    try {
      await api.updateShoppingListItem(() => latestToken.current(), householdId, item.id, { is_checked: nextChecked });
      if (startedVersion === scopeVersion.current) loadVersion.current += 1;
    } catch {
      if (startedVersion === scopeVersion.current) {
        loadVersion.current += 1;
        setStored((current) => current.scope === startedScope ? { ...current, items: orderItems(current.items.map((candidate) => candidate.id === item.id ? item : candidate)) } : current);
      }
      throw new Error('We couldn’t update that item.');
    } finally { finish(startedScope, item.id); }
  }, [begin, finish, householdId, scope]);

  const update = useCallback(async (item: ShoppingListItem, values: ShoppingListItemInput) => {
    const startedScope = scope; const startedVersion = scopeVersion.current;
    if (!householdId || !begin(startedScope, item.id)) return;
    try {
      await api.updateShoppingListItem(() => latestToken.current(), householdId, item.id, values);
      if (startedVersion === scopeVersion.current) await refresh();
    } finally { finish(startedScope, item.id); }
  }, [begin, finish, householdId, refresh, scope]);

  const remove = useCallback(async (item: ShoppingListItem) => {
    const startedScope = scope; const startedVersion = scopeVersion.current;
    if (!householdId || !begin(startedScope, item.id)) return;
    try {
      await api.deleteShoppingListItem(() => latestToken.current(), householdId, item.id);
      if (startedVersion === scopeVersion.current) {
        loadVersion.current += 1;
        setStored((current) => current.scope === startedScope ? { ...current, items: current.items.filter((candidate) => candidate.id !== item.id) } : current);
        await refresh();
      }
    } finally { finish(startedScope, item.id); }
  }, [begin, finish, householdId, refresh, scope]);

  const clear = useCallback(async () => {
    const startedVersion = scopeVersion.current;
    if (!householdId) return;
    await api.clearShoppingList(() => latestToken.current(), householdId);
    if (startedVersion === scopeVersion.current) {
      loadVersion.current += 1;
      setStored((current) => current.scope === scope ? { ...current, items: [], loading: false, error: null } : current);
    }
  }, [householdId, scope]);

  return { add, clear, error: visible.error, householdId, items: visible.items, loading: visible.loading, pendingItemIds, refresh, remove, toggle, update };
}
