import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type GetToken, type Recipe } from '@/lib/api';
import { useRecipeContext } from './recipe-context';

export function useRecipes(archived = false, search?: string, householdIdOverride?: string | null, enabled = true) {
  const { sessionId, userId } = useAuth();
  const { getToken, selectedHousehold } = useHouseholdState();
  const householdId = householdIdOverride === undefined ? selectedHousehold?.id ?? null : householdIdOverride;
  const { revisionForHousehold } = useRecipeContext();
  const revision = householdId ? revisionForHousehold(householdId) : 0;
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${archived ? 'archived' : 'active'}`;
  const latestGetToken = useRef<GetToken>(getToken);
  const generation = useRef(0);
  const scopeRef = useRef(scope);
  const loadedScope = useRef<string | null>(null);
  const lastRequestKey = useRef<string | null>(null);
  const requestKey = JSON.stringify([scope, revision, search?.trim() ?? null]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateScope, setStateScope] = useState(scope);
  const currentScope = scope === stateScope;

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    generation.current += 1;
    setStateScope(scope);
    setRecipes([]);
    setError(null);
    setLoading(true);
    setRefreshing(false);
    loadedScope.current = null;
  }, [scope]);

  const refresh = useCallback(async (showIndicator = true) => {
    const requestScope = scope;
    const requestHouseholdId = householdId;
    const requestGeneration = ++generation.current;
    lastRequestKey.current = requestKey;
    const hasData = loadedScope.current === requestScope;
    setStateScope(requestScope);
    setLoading(!hasData);
    setRefreshing(showIndicator && hasData);
    setError(null);
    if (!requestHouseholdId) {
      setRecipes([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const isCurrent = () => generation.current === requestGeneration && scopeRef.current === requestScope;
    try {
      const result = await api.recipes(() => latestGetToken.current(), requestHouseholdId, archived, search);
      if (!isCurrent()) return;
      setRecipes(result.recipes);
      loadedScope.current = requestScope;
    } catch (reason) {
      if (!isCurrent()) return;
      setError(reason instanceof ApiError ? reason.message : 'We couldn’t load recipes. Please try again.');
    } finally {
      if (isCurrent()) { setLoading(false); setRefreshing(false); }
    }
  }, [archived, householdId, requestKey, scope, search]);

  useEffect(() => {
    if (!enabled || lastRequestKey.current === requestKey) return;
    lastRequestKey.current = requestKey;
    const timer = setTimeout(() => { void refresh(false); }, 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [enabled, refresh, requestKey]);

  return {
    error: currentScope ? error : null,
    householdId: currentScope ? householdId : null,
    loading: !currentScope || loading,
    recipes: currentScope ? recipes : [],
    refresh,
    refreshing: currentScope && refreshing,
  };
}
