export const SWIPE_REVEAL_WIDTH = 76;

export type SwipeDeleteRelease = 'close' | 'reveal' | 'delete';

// Keep the full-swipe action deliberately separate from the first reveal.
export function swipeDeleteRelease(offset: number, rowWidth: number): SwipeDeleteRelease {
  'worklet';
  if (-offset >= Math.max(rowWidth, 260) * 0.65) return 'delete';
  if (-offset >= SWIPE_REVEAL_WIDTH * 0.48) return 'reveal';
  return 'close';
}
