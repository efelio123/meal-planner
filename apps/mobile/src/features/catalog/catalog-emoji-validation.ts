const additionalEmojiBases = new Set([
  0x1f004, 0x1f0cf, 0x1f170, 0x1f171, 0x1f17e, 0x1f17f, 0x1f18e,
  0x1f191, 0x1f192, 0x1f193, 0x1f194, 0x1f195, 0x1f196, 0x1f197,
  0x1f198, 0x1f199, 0x1f19a, 0x1f201, 0x1f202, 0x1f21a, 0x1f22f,
  0x1f232, 0x1f233, 0x1f234, 0x1f235, 0x1f236, 0x1f237, 0x1f238,
  0x1f239, 0x1f23a, 0x1f250, 0x1f251,
]);

const subdivisionFlags = new Set([
  '\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}',
  '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}',
  '\u{1f3f4}\u{e0067}\u{e0062}\u{e0077}\u{e006c}\u{e0073}\u{e007f}',
]);
const keycapBases = new Set([0x23, 0x2a, ...Array.from({ length: 10 }, (_unused, digit) => 0x30 + digit)]);
const nonEmojiTextError = 'Enter one emoji, or leave the field empty.';

function isEmojiBase(codePoint: number) {
  return additionalEmojiBases.has(codePoint)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    || (codePoint >= 0x2600 && codePoint <= 0x27bf)
    || [0x00a9, 0x00ae, 0x203c, 0x2049, 0x2122, 0x2139, 0x24c2, 0x3030, 0x303d, 0x3297, 0x3299].includes(codePoint)
    || (codePoint >= 0x2194 && codePoint <= 0x21aa)
    || (codePoint >= 0x2300 && codePoint <= 0x23ff)
    || (codePoint >= 0x25aa && codePoint <= 0x25fe)
    || (codePoint >= 0x2934 && codePoint <= 0x2935)
    || (codePoint >= 0x2b05 && codePoint <= 0x2b55);
}

function consumeEmojiComponent(codePoints: number[], offset: number): number | null {
  if (offset >= codePoints.length || !isEmojiBase(codePoints[offset])) return null;
  let next = offset + 1;
  if (codePoints[next] === 0xfe0f) next += 1;
  if (codePoints[next] >= 0x1f3fb && codePoints[next] <= 0x1f3ff) next += 1;
  return next;
}

/** Keep this one-emoji check aligned with the API's catalog._clean_emoji validator. */
export function isValidCategoryEmojiText(value: string) {
  const emoji = value.trim();
  if (!emoji) return true;
  if (subdivisionFlags.has(emoji)) return true;

  const codePoints = Array.from(emoji, (character) => character.codePointAt(0)!);
  if (codePoints.length === 2 || codePoints.length === 3) {
    if (keycapBases.has(codePoints[0]) && codePoints[codePoints.length - 1] === 0x20e3) {
      const middle = codePoints.slice(1, -1);
      if (middle.length === 0 || (middle.length === 1 && middle[0] === 0xfe0f)) return true;
    }
  }
  if (codePoints.length === 2 && codePoints.every((codePoint) => codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)) return true;

  let offset = consumeEmojiComponent(codePoints, 0);
  if (offset === null) return false;
  while (offset < codePoints.length) {
    if (codePoints[offset] !== 0x200d) return false;
    offset = consumeEmojiComponent(codePoints, offset + 1);
    if (offset === null) return false;
  }
  return true;
}

export function categoryEmojiValidationError(value: string) {
  return isValidCategoryEmojiText(value) ? null : nonEmojiTextError;
}
