import { Colors, resolveThemeMode } from './theme';

describe('theme selection', () => {
  it('uses light for null and unspecified schemes', () => {
    expect(resolveThemeMode(null)).toBe('light');
    expect(resolveThemeMode('unspecified')).toBe('light');
  });
  it('selects complete palettes for both appearances', () => {
    expect(resolveThemeMode('dark')).toBe('dark');
    for (const palette of [Colors.light, Colors.dark]) {
      expect(palette.screen).toBeTruthy();
      expect(palette.inputText).toBeTruthy();
      expect(palette.error).toBeTruthy();
    }
  });
});
