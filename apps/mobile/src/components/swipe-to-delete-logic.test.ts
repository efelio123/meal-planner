import { SWIPE_REVEAL_WIDTH, swipeDeleteRelease } from './swipe-to-delete-logic';

describe('Shopping row swipe destinations', () => {
  it('closes when the user drags back before revealing Delete', () => {
    expect(swipeDeleteRelease(0, 340)).toBe('close');
    expect(swipeDeleteRelease(-20, 340)).toBe('close');
  });

  it('keeps a short swipe open with only the Delete action visible', () => {
    expect(swipeDeleteRelease(-50, 340)).toBe('reveal');
    expect(swipeDeleteRelease(-SWIPE_REVEAL_WIDTH, 340)).toBe('reveal');
    expect(swipeDeleteRelease(-220, 340)).toBe('reveal');
  });

  it('deletes only after a deliberate far-left drag', () => {
    expect(swipeDeleteRelease(-220, 340)).toBe('reveal');
    expect(swipeDeleteRelease(-221, 340)).toBe('delete');
    expect(swipeDeleteRelease(-245, 340)).toBe('delete');
    expect(swipeDeleteRelease(-340, 340)).toBe('delete');
    expect(swipeDeleteRelease(-120, 0)).toBe('reveal');
  });
});

it('keeps the exact 65% boundary and the existing 260-point minimum', () => {
  expect(swipeDeleteRelease(-220.99, 340)).toBe('reveal');
  expect(swipeDeleteRelease(-221, 340)).toBe('delete');
  expect(swipeDeleteRelease(-168.99, 200)).toBe('reveal');
  expect(swipeDeleteRelease(-169, 200)).toBe('delete');
  expect(swipeDeleteRelease(-168.99, 0)).toBe('reveal');
});
