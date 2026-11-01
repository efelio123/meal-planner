import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { EmojiText } from './emoji-text';
import { ThemedText } from './themed-text';
import { EmojiInput } from './themed-controls';

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

  it('gives editable emoji room in the native multiline engine while keeping Done as submit/blur', async () => {
    const onChangeText = jest.fn();
    const view = await render(<EmojiInput accessibilityLabel="Emoji entry" value="👩‍🍳" onChangeText={onChangeText} returnKeyType="done" />);
    const input = view.getByLabelText('Emoji entry');
    expect(input.props.multiline).toBe(true);
    expect(input.props.submitBehavior).toBe('blurAndSubmit');
    expect(input.props.returnKeyType).toBe('done');
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({ fontSize: 24, height: 60, lineHeight: undefined, includeFontPadding: true });
    await fireEvent.changeText(input, '🇺🇸');
    expect(onChangeText).toHaveBeenCalledWith('🇺🇸');
  });
});
