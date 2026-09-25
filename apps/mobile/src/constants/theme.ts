/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: { screen: '#ffffff', surface: '#f5f5f7', surfaceSelected: '#e7e7ec', text: '#1c1c1e', textSecondary: '#5d6068', border: '#767680', inputBackground: '#ffffff', inputText: '#1c1c1e', inputPlaceholder: '#5d6068', primary: '#155eef', primaryText: '#ffffff', link: '#155eef', error: '#b42318', errorSurface: '#fef3f2', disabled: '#a5a5ad', activity: '#155eef' },
  dark: { screen: '#101114', surface: '#1d1e22', surfaceSelected: '#2b2d33', text: '#f5f5f7', textSecondary: '#c4c5cc', border: '#a9abb5', inputBackground: '#1d1e22', inputText: '#f5f5f7', inputPlaceholder: '#c4c5cc', primary: '#84adff', primaryText: '#101114', link: '#9abaff', error: '#ffb4ab', errorSurface: '#4a1715', disabled: '#71737c', activity: '#84adff' },
} as const;

export type ThemeMode = keyof typeof Colors;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export const resolveThemeMode = (scheme: string | null | undefined): ThemeMode => scheme === 'dark' ? 'dark' : 'light';

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
