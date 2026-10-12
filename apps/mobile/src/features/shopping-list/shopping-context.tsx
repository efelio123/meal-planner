import { createContext, type PropsWithChildren, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { useHouseholdState } from '@/hooks/use-household-state';
import type { CatalogItem } from '@/lib/api';
import type { CatalogChoiceKind } from '@/features/catalog/catalog-context';

export type CreatedShoppingCatalogItem = { scope: string; item: CatalogItem };
export type CreatedShoppingChoice = { scope: string; catalogItemId: string; kind: CatalogChoiceKind; id: string };
type ShoppingContextValue = {
  scope: string;
  createdItem: CreatedShoppingCatalogItem | null;
  setCreatedItem: (result: CreatedShoppingCatalogItem | null) => void;
  createdChoice: CreatedShoppingChoice | null;
  setCreatedChoice: (result: CreatedShoppingChoice | null) => void;
  markChanged: (householdId: string) => void;
  revisionForHousehold: (householdId: string) => number;
};
const ShoppingContext = createContext<ShoppingContextValue | null>(null);

export function shoppingScope(userId: string | null | undefined, sessionId: string | null | undefined, householdId: string | null | undefined) {
  return JSON.stringify([userId ?? '', sessionId ?? '', householdId ?? '']);
}

export function ShoppingProvider({ children }: PropsWithChildren) {
  const { userId, sessionId } = useAuth();
  const { selectedHousehold } = useHouseholdState();
  const scope = shoppingScope(userId, sessionId, selectedHousehold?.id);
  const [createdItem, setCreatedItem] = useState<CreatedShoppingCatalogItem | null>(null);
  const [createdChoice, setCreatedChoice] = useState<CreatedShoppingChoice | null>(null);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const previousScope = useRef(scope);
  useLayoutEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    setCreatedItem(null);
    setCreatedChoice(null);
  }, [scope]);
  const markChanged = useCallback((householdId: string) => setRevisions((current) => ({ ...current, [householdId]: (current[householdId] ?? 0) + 1 })), []);
  const revisionForHousehold = useCallback((householdId: string) => revisions[householdId] ?? 0, [revisions]);
  const value = useMemo(() => ({ scope, createdItem: createdItem?.scope === scope ? createdItem : null, setCreatedItem, createdChoice: createdChoice?.scope === scope ? createdChoice : null, setCreatedChoice, markChanged, revisionForHousehold }), [createdChoice, createdItem, markChanged, revisionForHousehold, scope]);
  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>;
}

export function useShoppingContext() {
  const context = useContext(ShoppingContext);
  if (!context) throw new Error('Shopping screens must be inside ShoppingProvider.');
  return context;
}

export function useShoppingContextOptional() { return useContext(ShoppingContext); }
