import { Colors, ThemePalettes, resolveThemeMode } from './theme';

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

function luminance(hex: string) {
  const rgb = hex.replace('#', '').match(/../gu)!.map((channel) => parseInt(channel, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
for (const [id, appearances] of Object.entries(ThemePalettes)) {
  for (const [mode, palette] of Object.entries(appearances)) {
    it(`${id}/${mode} provides every semantic role and readable assigned foreground/background pairs`, () => {
      expect(Object.keys(palette).sort()).toEqual(Object.keys(Colors.light).sort());
      const pairs: [string, string, number][] = [];
      for (const surface of [palette.screen, palette.surface, palette.elevatedSurface, palette.surfaceSelected]) {
        pairs.push([palette.text, surface, 4.5], [palette.textSecondary, surface, 4.5], [palette.border, surface, 3]);
      }
      for (const surface of [palette.screen, palette.surface, palette.elevatedSurface]) pairs.push([palette.link, surface, 4.5], [palette.error, surface, 4.5]);
      pairs.push([palette.primaryText, palette.primary, 4.5], [palette.inputText, palette.inputBackground, 4.5], [palette.inputPlaceholder, palette.inputBackground, 4.5], [palette.error, palette.errorSurface, 4.5], [palette.avatarText, palette.avatarBackground, 4.5], [palette.destructiveText, palette.destructive, 3]);
      for (const [foreground, background, minimum] of pairs) {
        if (contrast(foreground, background) < minimum) throw new Error(`${id}/${mode}: ${foreground} on ${background} is ${contrast(foreground, background).toFixed(2)}; needs ${minimum}`);
      }
    });
  }
}
