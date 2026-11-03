import { createContext } from 'react';
import type { AppearanceSnapshot, AppearanceStore } from './appearance-store';
export type AppearanceContextValue = AppearanceSnapshot & Pick<AppearanceStore, 'chooseTheme' | 'retry' | 'markChooserPresented'>;
export const AppearanceContext = createContext<AppearanceContextValue | null>(null);
