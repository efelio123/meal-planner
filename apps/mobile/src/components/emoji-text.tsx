import { ThemedText, type ThemedTextProps } from './themed-text';

type EmojiTextProps = Omit<ThemedTextProps, 'type' | 'allowFontScaling' | 'numberOfLines'> & { size?: number };

/** Emoji are fixed-size icons. Let the system font supply their full glyph metrics. */
export function EmojiText({ size = 24, style, ...props }: EmojiTextProps) {
  return <ThemedText {...props} allowFontScaling={false} numberOfLines={1} style={[style, {
    fontSize: size,
    fontFamily: undefined,
    fontWeight: '400',
    // Clear ThemedText's ordinary line height and any caller's text metrics.
    lineHeight: undefined,
    letterSpacing: 0,
    includeFontPadding: true,
  }]} />;
}
