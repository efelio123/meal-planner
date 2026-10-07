import { createContext, type PropsWithChildren, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type NativeSheetOptions = {
  detents?: number[];
  initialDetent?: number;
  onDismiss?: () => void;
};

export type NativeSheetEntry = {
  id: string;
  scope: string;
  content: ReactNode;
  detents: number[];
  initialDetent: number;
};

type NativeSheetContextValue = {
  scope: string;
  present: (content: ReactNode, options?: NativeSheetOptions) => string;
  get: (id: string) => NativeSheetEntry | null;
  remove: (id: string) => void;
};

const NativeSheetContext = createContext<NativeSheetContextValue | null>(null);

export function NativeSheetProvider({ children, scope }: PropsWithChildren<{ scope: string }>) {
  const [entries, setEntries] = useState<Record<string, NativeSheetEntry>>({});
  const entriesRef = useRef(entries);
  const callbacks = useRef<Record<string, (() => void) | undefined>>({});
  const currentScope = useRef(scope);
  const nextId = useRef(0);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    if (currentScope.current === scope) return;
    currentScope.current = scope;
    callbacks.current = {};
    entriesRef.current = {};
    setEntries({});
  }, [scope]);

  const present = useCallback((content: ReactNode, options: NativeSheetOptions = {}) => {
    const id = `sheet-${Date.now().toString(36)}-${++nextId.current}`;
    const detents = options.detents ?? [0.55, 0.92];
    callbacks.current[id] = options.onDismiss;
    const nextEntries = {
      ...entriesRef.current,
      [id]: { id, scope, content, detents, initialDetent: options.initialDetent ?? 0 },
    };
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    return id;
  }, [scope]);

  const get = useCallback((id: string) => {
    const entry = entriesRef.current[id];
    return entry?.scope === currentScope.current ? entry : null;
  }, []);

  const remove = useCallback((id: string) => {
    const callback = callbacks.current[id];
    delete callbacks.current[id];
    if (entriesRef.current[id]) {
      const next = { ...entriesRef.current };
      delete next[id];
      entriesRef.current = next;
      setEntries(next);
    }
    callback?.();
  }, []);

  const value = useMemo(() => ({ scope, present, get, remove }), [get, present, remove, scope]);
  return <NativeSheetContext.Provider value={value}>{children}</NativeSheetContext.Provider>;
}

export function useNativeSheetFlow() {
  const value = useContext(NativeSheetContext);
  if (!value) throw new Error('Native sheets must be opened inside NativeSheetProvider.');
  return value;
}
