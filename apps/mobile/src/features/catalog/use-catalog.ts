import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, api, type CatalogCategory, type CatalogItem, type CatalogUnits, type GetToken, type CatalogChoice } from '@/lib/api';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useCatalogContext } from './catalog-context';

export function useCatalog() {
  const { sessionId, userId } = useAuth();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { changeKind, markChanged, revision } = useCatalogContext();
  const householdId = selectedHousehold?.id ?? null;
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}`;
  const latestGetToken = useRef<GetToken>(getToken);
  const generation = useRef(0);
  const scopeRef = useRef(scope);
  const loadedScope = useRef<string | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [units, setUnits] = useState<CatalogUnits | null>(null);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [stores, setStores] = useState<CatalogChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeKey, setScopeKey] = useState(scope);
  const currentScope = scopeKey === scope;

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => {
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      generation.current += 1;
      setScopeKey(scope);
      setItems([]);
      setUnits(null);
      setCategories([]);
      setStores([]);
      setError(null);
      setLoading(true);
      setRefreshing(false);
      loadedScope.current = null;
    }
  }, [scope]);

  const refresh = useCallback(async (showPullIndicator = true) => {
    const requestScope = scope;
    const requestHousehold = householdId;
    const requestGeneration = ++generation.current;
    const hasData = loadedScope.current === requestScope;
    setScopeKey(requestScope);
    setLoading(!hasData);
    setRefreshing(showPullIndicator && hasData);
    setError(null);
    if (!requestHousehold) {
      setItems([]);
      setUnits(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const isCurrent = () => generation.current === requestGeneration;
    try {
      const [nextItems, nextUnits, nextCategories, nextStores] = await Promise.all([
        api.catalogItems(() => latestGetToken.current(), requestHousehold),
        api.catalogUnits(() => latestGetToken.current(), requestHousehold),
        api.catalogCategories(() => latestGetToken.current(), requestHousehold),
        api.catalogStores(() => latestGetToken.current(), requestHousehold),
      ]);
      if (!isCurrent()) return;
      setItems(nextItems.items);
      setUnits(nextUnits);
      setCategories(nextCategories.categories);
      setStores(nextStores.stores);
      loadedScope.current = requestScope;
    } catch (reason) {
      if (!isCurrent()) return;
      setError(reason instanceof ApiError ? reason.message : 'We couldn’t load this household’s catalog. Try again.');
    } finally {
      if (isCurrent()) { setLoading(false); setRefreshing(false); }
    }
  }, [householdId, scope]);

  useEffect(() => {
    if (changeKind !== 'items' && changeKind !== 'all') return;
    const timer = setTimeout(() => { void refresh(false); }, 0);
    return () => clearTimeout(timer);
  }, [changeKind, refresh, revision]);

  const mutate = useCallback(async <T,>(operation: (getToken: GetToken, id: string) => Promise<T>) => {
    const startedScope = scope;
    const startedHousehold = householdId;
    if (!startedHousehold) throw new Error('Select a household first.');
    const result = await operation(() => latestGetToken.current(), startedHousehold);
    if (startedScope === scopeRef.current && startedHousehold === householdId) markChanged('items');
    return result;
  }, [householdId, markChanged, scope]);

  return {
    currentScope,
    categories: currentScope ? categories : [],
    error: currentScope ? error : null,
    householdId,
    items: currentScope ? items : [],
    loading: !currentScope || loading,
    mutate,
    refresh,
    refreshing,
    stores: currentScope ? stores : [],
    units: currentScope ? units : null,
    markChanged,
  };
}
