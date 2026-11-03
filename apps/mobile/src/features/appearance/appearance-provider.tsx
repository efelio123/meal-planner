import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppearanceContext } from './appearance-context';
import { createAppearanceStore, type AppearanceStore } from './appearance-store';

export function AppearanceProvider({ children, store: providedStore }: PropsWithChildren<{ store?: AppearanceStore }>) {
  const [store] = useState(() => providedStore ?? createAppearanceStore(AsyncStorage));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.load(); }, [store]);
  const value = useMemo(() => ({ ...snapshot, chooseTheme: store.chooseTheme, retry: store.retry, markChooserPresented: store.markChooserPresented }), [snapshot, store]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
