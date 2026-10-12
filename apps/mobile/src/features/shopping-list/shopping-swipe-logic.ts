export const SHOPPING_REVEAL_WIDTH = 76;

export type ShoppingSwipeRelease = 'close' | 'reveal' | 'delete';

// Keep the full-swipe action deliberately separate from the first reveal.
export function shoppingSwipeRelease(offset: number, rowWidth: number): ShoppingSwipeRelease {
  'worklet';
  if (-offset >= Math.max(rowWidth, 260) * 0.65) return 'delete';
  if (-offset >= SHOPPING_REVEAL_WIDTH * 0.48) return 'reveal';
  return 'close';
}
