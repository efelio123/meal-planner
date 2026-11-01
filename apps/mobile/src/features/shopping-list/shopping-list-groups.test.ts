import type { ShoppingListItem } from '@/lib/api';
import { groupShoppingItems } from './shopping-list-groups';

function row(id: string, overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return { id, name: id, is_checked: false, checked_at: null, checked_by_user_id: null, created_by_user_id: 'user', created_at: '', catalog_item_type: 'food', ...overrides };
}

describe('Shopping groups', () => {
  it('orders category groups and their rows alphabetically, then missing categories, without changing source rows', () => {
    const rows = [row('uncategorized'), row('b', { name: 'Banana', category_id: 'produce', category_name: 'Produce', category_emoji: '🥬' }), row('a', { name: 'apple', category_id: 'produce', category_name: 'Produce', category_emoji: '🥬' }), row('dairy', { category_id: 'dairy', category_name: 'Dairy' }), row('soap', { catalog_item_type: 'household' })];
    const before = JSON.stringify(rows);
    const groups = groupShoppingItems(rows, 'category');
    expect(groups.map((group) => group.label)).toEqual(['Dairy', 'Produce', 'Uncategorized food', 'Uncategorized household']);
    expect(groups[1].items).toEqual([rows[2], rows[1]]);
    expect(groups[1].emoji).toBe('🥬');
    expect(JSON.stringify(rows)).toBe(before);
    expect(groups.flatMap((group) => group.items).sort((a, b) => a.id.localeCompare(b.id))).toEqual([...rows].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('separates same-named Food/Household categories by ID and keeps qualified labels under filtering/checking', () => {
    const food = row('food', { category_id: 'z-food', category_name: 'Pantry' });
    const household = row('household', { catalog_item_type: 'household', category_id: 'a-household', category_name: 'Pantry', is_checked: true });
    expect(groupShoppingItems([food, household], 'category').map((group) => group.label)).toEqual(['Pantry (Food)', 'Pantry (Household)']);
    expect(groupShoppingItems([food], 'category', [food, household])[0].label).toBe('Pantry (Food)');
    expect(groupShoppingItems([household], 'category', [food, household])[0].label).toBe('Pantry (Household)');
  });

  it('uses the actual Shopping Store, keeps same-named Store IDs separate, and puts No store last', () => {
    const rows = [row('none'), row('b', { store_id: 'b', store_name: 'Market', catalog_preferred_store_id: 'wrong' }), row('a', { store_id: 'a', store_name: 'Market' }), row('c', { store_id: 'c', store_name: 'Corner shop' })];
    const groups = groupShoppingItems(rows, 'store');
    expect(groups.map((group) => group.key)).toEqual(['store:c', 'store:a', 'store:b', 'store:none']);
    expect(groups.map((group) => group.label)).toEqual(['Corner shop', 'Market', 'Market', 'No store']);
    expect(groups.every((group) => group.emoji === null)).toBe(true);
  });

  it('retains incomplete metadata and unknown item types without grouping by a label alone', () => {
    const rows = [row('legacy', { catalog_item_type: undefined }), row('label-only', { category_name: 'Orphan label' }), row('id-only', { category_id: 'known-id', category_name: null }), row('store-id-only', { store_id: 'old-store', store_name: null })];
    const categories = groupShoppingItems(rows, 'category');
    expect(categories.map((group) => group.label)).toEqual(['Uncategorized', 'Uncategorized food', 'Uncategorized food']);
    expect(categories.flatMap((group) => group.items)).toHaveLength(rows.length);
    expect(new Set(categories.flatMap((group) => group.items.map((item) => item.id))).size).toBe(rows.length);
    const stores = groupShoppingItems(rows, 'store');
    expect(stores.find((group) => group.key === 'store:old-store')?.label).toBe('Unknown store');
    expect(stores.flatMap((group) => group.items)).toHaveLength(rows.length);
  });

  it('creates no empty groups and uses refreshed labels instead of stale or unrelated metadata', () => {
    const item = row('milk', { category_id: 'd', category_name: 'Dairy' });
    const renamed = { ...item, category_name: 'Chilled' };
    expect(groupShoppingItems([], 'category', [item])).toEqual([]);
    expect(groupShoppingItems([renamed], 'category', [renamed])[0].label).toBe('Chilled');
    expect(groupShoppingItems([item], 'category', [row('other')])[0].label).toBe('Dairy');
  });
});
