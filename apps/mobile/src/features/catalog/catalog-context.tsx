import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';

export type CatalogChangeKind = 'items' | 'choices' | 'all';
export type CatalogChoiceKind = 'category' | 'store' | 'shopping-unit';
export type CatalogChoiceResult = { kind: CatalogChoiceKind; id: string; label: string; itemType?: 'food' | 'household' };

type CatalogContextValue = {
  revision: number;
  changeKind: CatalogChangeKind;
  markChanged: (kind: CatalogChangeKind) => void;
  choiceResult: CatalogChoiceResult | null;
  setChoiceResult: (result: CatalogChoiceResult | null) => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: PropsWithChildren) {
  const [revision, setRevision] = useState(0);
  const [changeKind, setChangeKind] = useState<CatalogChangeKind>('items');
  const [choiceResult, setChoiceResult] = useState<CatalogChoiceResult | null>(null);
  const value = useMemo(() => ({
    revision,
    changeKind,
    markChanged: (kind: CatalogChangeKind) => { setChangeKind(kind); setRevision((current) => current + 1); },
    choiceResult,
    setChoiceResult,
  }), [changeKind, choiceResult, revision]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalogContext() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('Catalog screens must be inside CatalogProvider.');
  return value;
}
