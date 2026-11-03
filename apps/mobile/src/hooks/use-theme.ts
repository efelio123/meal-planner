import { useContext } from 'react';
import { ThemePalettes, resolveThemeMode } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppearanceContext } from '@/features/appearance/appearance-context';

export function useTheme() {
  const appearance = useContext(AppearanceContext);
  return ThemePalettes[appearance?.themeId ?? 'system'][useThemeMode()];
}
export function useThemeMode() { return resolveThemeMode(useColorScheme()); }
