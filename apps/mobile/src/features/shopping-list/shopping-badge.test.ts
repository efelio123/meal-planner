import { shoppingBadge } from './shopping-badge';
import type { ShoppingListItem } from '@/lib/api';
const row = (checked = false) => ({ is_checked: checked, amount: '6', catalog_item_type: 'household' }) as ShoppingListItem;
it('distinguishes unknown from zero and counts rows rather than amounts', () => {
  expect(shoppingBadge([row()], false)).toEqual({ count: null, label: undefined, accessibilityLabel: 'Shopping' });
  expect(shoppingBadge([row(true)], true)).toEqual({ count: 0, label: undefined, accessibilityLabel: 'Shopping, 0 items to buy' });
  expect(shoppingBadge([row(), row(true)], true)).toEqual({ count: 1, label: '1', accessibilityLabel: 'Shopping, 1 item to buy' });
});
it.each([12, 99, 100, 145])('preserves the exact accessible count of %i', (count) => {
  expect(shoppingBadge(Array.from({ length: count }, () => row()), true)).toEqual({
    count, label: count > 99 ? '99+' : String(count), accessibilityLabel: `Shopping, ${count} items to buy`,
  });
});
