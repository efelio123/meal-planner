import type { ShoppingListItem } from '@/lib/api';

export function shoppingBadge(items: readonly ShoppingListItem[], known: boolean) {
  const count = known ? items.filter((item) => !item.is_checked).length : null;
  return {
    count,
    label: count && count > 0 ? count > 99 ? '99+' : String(count) : undefined,
    accessibilityLabel: count === null ? 'Shopping' : `Shopping, ${count} ${count === 1 ? 'item' : 'items'} to buy`,
  };
}
