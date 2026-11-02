/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Every palette supplies the same semantic roles; screens never select theme IDs. */
export type ThemeMode = 'light' | 'dark';
export type ThemeId = 'system' | 'apricot' | 'green';
export type ThemeTokens = {
  screen: string; surface: string; elevatedSurface: string; surfaceSelected: string;
  text: string; textSecondary: string; border: string; inputBackground: string;
  inputText: string; inputPlaceholder: string; primary: string; primaryText: string;
  link: string; error: string; errorSurface: string; disabled: string; activity: string;
  destructive: string; destructiveText: string; scrim: string; grabber: string;
  avatarBackground: string; avatarText: string;
};
const lightFeedback = { error: '#b42318', errorSurface: '#fef3f2', destructive: '#ff3b3b', destructiveText: '#ffffff', scrim: 'rgba(0,0,0,0.45)' };
const darkFeedback = { error: '#ffb4ab', errorSurface: '#4a1715', destructive: '#ff3b3b', destructiveText: '#ffffff', scrim: 'rgba(0,0,0,0.6)' };

/** Current phone palettes remain available for existing consumers/tests. */
export const Colors: Record<ThemeMode, ThemeTokens> = {
  light: { ...lightFeedback, screen: '#ffffff', surface: '#f5f5f7', elevatedSurface: '#ffffff', surfaceSelected: '#e7e7ec', text: '#1c1c1e', textSecondary: '#5d6068', border: '#767680', inputBackground: '#ffffff', inputText: '#1c1c1e', inputPlaceholder: '#5d6068', primary: '#155eef', primaryText: '#ffffff', link: '#155eef', disabled: '#a5a5ad', activity: '#155eef', grabber: '#5d6068', avatarBackground: '#e7e7ec', avatarText: '#1c1c1e' },
  dark: { ...darkFeedback, screen: '#101114', surface: '#1d1e22', elevatedSurface: '#26282e', surfaceSelected: '#2b2d33', text: '#f5f5f7', textSecondary: '#c4c5cc', border: '#a9abb5', inputBackground: '#1d1e22', inputText: '#f5f5f7', inputPlaceholder: '#c4c5cc', primary: '#84adff', primaryText: '#101114', link: '#9abaff', disabled: '#71737c', activity: '#84adff', grabber: '#c4c5cc', avatarBackground: '#2b2d33', avatarText: '#f5f5f7' },
};

export const ThemePalettes: Record<ThemeId, Record<ThemeMode, ThemeTokens>> = {
  system: Colors,
  apricot: {
    light: { ...lightFeedback, error: '#9b2119', screen: '#E2C4A6', surface: '#f7eddf', elevatedSurface: '#fbf5eb', surfaceSelected: '#edd7c0', text: '#56352D', textSecondary: '#684a3f', border: '#85664f', inputBackground: '#fbf5eb', inputText: '#56352D', inputPlaceholder: '#684a3f', primary: '#2A3244', primaryText: '#fbf5eb', link: '#2A3244', disabled: '#b99a83', activity: '#2A3244', grabber: '#684a3f', avatarBackground: '#edd7c0', avatarText: '#56352D' },
    dark: { ...darkFeedback, screen: '#1c202a', surface: '#272a32', elevatedSurface: '#30333c', surfaceSelected: '#394051', text: '#f7eddf', textSecondary: '#d9c1aa', border: '#a58c7c', inputBackground: '#272a32', inputText: '#f7eddf', inputPlaceholder: '#d9c1aa', primary: '#E2C4A6', primaryText: '#2A3244', link: '#E2C4A6', disabled: '#756557', activity: '#E2C4A6', grabber: '#d9c1aa', avatarBackground: '#394051', avatarText: '#f7eddf' },
  },
  green: {
    light: { ...lightFeedback, screen: '#E2E9DF', surface: '#FFFDF3', elevatedSurface: '#FFFDF3', surfaceSelected: '#d8e2d3', text: '#284D3F', textSecondary: '#52624e', border: '#6f806e', inputBackground: '#FFFDF3', inputText: '#284D3F', inputPlaceholder: '#52624e', primary: '#164939', primaryText: '#FFFDF3', link: '#164939', disabled: '#aab8a9', activity: '#164939', grabber: '#52624e', avatarBackground: '#d8e2d3', avatarText: '#284D3F' },
    dark: { ...darkFeedback, screen: '#111d18', surface: '#1a2b23', elevatedSurface: '#21352b', surfaceSelected: '#2d4738', text: '#FFFDF3', textSecondary: '#c4d4bc', border: '#869c81', inputBackground: '#1a2b23', inputText: '#FFFDF3', inputPlaceholder: '#c4d4bc', primary: '#c6d9b5', primaryText: '#164939', link: '#d0e3bf', disabled: '#52624e', activity: '#c6d9b5', grabber: '#c4d4bc', avatarBackground: '#2d4738', avatarText: '#FFFDF3' },
  },
};
export const themeChoices: readonly { id: ThemeId; name: string; description: string }[] = [
  { id: 'system', name: 'Phone theme', description: 'The familiar look, following your phone.' },
  { id: 'apricot', name: 'Apricot, Chocolate & Navy', description: 'Warm apricot with chocolate and navy.' },
  { id: 'green', name: 'Green', description: 'Soft sage, cream and deep green.' },
];
export type ThemeColor = keyof ThemeTokens;
export const resolveThemeMode = (scheme: string | null | undefined): ThemeMode => scheme === 'dark' ? 'dark' : 'light';
export const isThemeId = (value: unknown): value is ThemeId => value === 'system' || value === 'apricot' || value === 'green';

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
