import { categoryEmojiValidationError, isValidCategoryEmojiText } from './catalog-emoji-validation';

describe('category emoji text validation', () => {
  it('accepts an empty value or one supported emoji sequence', () => {
    for (const value of ['', '   ', '🥬', '👋🏻', '👩‍🍳', '🇺🇸', '1️⃣', '©️']) {
      expect(isValidCategoryEmojiText(value)).toBe(true);
      expect(categoryEmojiValidationError(value)).toBeNull();
    }
  });

  it('rejects text, multiple emojis, and incomplete sequences without transforming input', () => {
    for (const value of ['produce', '🥬🥕', '👩‍', '🏴\u{E0067}\u{E0062}']) {
      expect(isValidCategoryEmojiText(value)).toBe(false);
      expect(categoryEmojiValidationError(value)).toBe('Enter one emoji, or leave the field empty.');
    }
  });

});
