import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { EmojiText } from './emoji-text';
import { ThemedText } from './themed-text';

describe('shared emoji glyph metrics', () => {
  it.each([
    { size: 16, glyph: '🧀' }, { size: 24, glyph: '🥬' },
    { size: 28, glyph: '🇺🇸' }, { size: 48, glyph: '👨‍👩‍👧‍👦' },
    { size: 52, glyph: '🙂' }, { size: 72, glyph: '🍲' },
  ])('uses natural font metrics for a $size-point $glyph icon, including multi-codepoint emoji', async ({ size, glyph }) => {
    const view = await render(<EmojiText size={size} style={{ lineHeight: 24, fontWeight: '700' }}>{glyph}</EmojiText>);
    const text = view.getByText(glyph);
    const style = StyleSheet.flatten(text.props.style);
    expect(style).toMatchObject({ fontSize: size, lineHeight: undefined, fontWeight: '400', includeFontPadding: true });
    expect(text.props.allowFontScaling).toBe(false);
    expect(text.props.numberOfLines).toBe(1);
  });

  it('retains regular text typography and scaling independently of icon metrics', async () => {
    const view = await render(<ThemedText>Category name</ThemedText>);
    expect(StyleSheet.flatten(view.getByText('Category name').props.style)).toMatchObject({ fontSize: 16, lineHeight: 24 });
    expect(view.getByText('Category name').props.allowFontScaling).not.toBe(false);
  });
});
