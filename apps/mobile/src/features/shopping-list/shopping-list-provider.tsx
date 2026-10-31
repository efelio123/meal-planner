import { createContext, type PropsWithChildren, useContext, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { AppState, Platform } from 'react-native';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useShoppingContext } from './shopping-context';
import { useShoppingListState } from './use-shopping-list-state';
import { shoppingBadge } from './shopping-badge';

type ShoppingState = ReturnType<typeof useShoppingListState>;
const Context = createContext<ShoppingState | null>(null);

export function ShoppingListProvider({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn } = useAuth();
  const { destination, selectedHousehold } = useHouseholdState();
  const enabled = Boolean(isLoaded && isSignedIn && destination === 'app' && selectedHousehold);
  const value = useShoppingListState(enabled);
  const { refresh, invalidate } = value;
  const { scope, revisionForHousehold } = useShoppingContext();
  const revision = selectedHousehold ? revisionForHousehold(selectedHousehold.id) : 0;
  const previous = useRef({ scope, revision });
  useEffect(() => {
    const prior = previous.current;
    previous.current = { scope, revision };
    if (enabled && prior.scope === scope && prior.revision !== revision) void invalidate();
  }, [enabled, revision, scope, invalidate]);
  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
      const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
    }
    let state = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      const wasInactive = state !== 'active';
      state = next;
      if (next === 'active' && wasInactive) void refresh();
    });
    return () => subscription?.remove();
  }, [enabled, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useShoppingList() {
  const value = useContext(Context);
  if (!value) throw new Error('Shopping data must be inside ShoppingListProvider.');
  return value;
}

export function useShoppingBadge() {
  const { items, known } = useShoppingList();
  return shoppingBadge(items, known);
}
