import { SHOPPING_REVEAL_WIDTH, shoppingSwipeRelease } from './shopping-swipe-logic';

describe('Shopping row swipe destinations', () => {
  it('closes when the user drags back before revealing Delete', () => {
    expect(shoppingSwipeRelease(0, 340)).toBe('close');
    expect(shoppingSwipeRelease(-20, 340)).toBe('close');
  });

  it('keeps a short swipe open with only the Delete action visible', () => {
    expect(shoppingSwipeRelease(-50, 340)).toBe('reveal');
    expect(shoppingSwipeRelease(-SHOPPING_REVEAL_WIDTH, 340)).toBe('reveal');
    expect(shoppingSwipeRelease(-220, 340)).toBe('reveal');
  });

  it('deletes only after a deliberate far-left drag', () => {
    expect(shoppingSwipeRelease(-220, 340)).toBe('reveal');
    expect(shoppingSwipeRelease(-221, 340)).toBe('delete');
    expect(shoppingSwipeRelease(-245, 340)).toBe('delete');
    expect(shoppingSwipeRelease(-340, 340)).toBe('delete');
    expect(shoppingSwipeRelease(-120, 0)).toBe('reveal');
  });
});
