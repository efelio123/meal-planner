import type { ShoppingListItem } from '@/lib/api';

export type ShoppingGroupMode = 'category' | 'store';
type GroupLabel = { key: string; label: string; emoji: string | null; missing: boolean; kind?: ShoppingListItem['catalog_item_type'] };
export type ShoppingItemGroup = GroupLabel & { items: ShoppingListItem[] };
const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

function describe(item: ShoppingListItem, mode: ShoppingGroupMode): GroupLabel {
  if (mode === 'store') return item.store_id
    ? { key: `store:${item.store_id}`, label: item.store_name?.trim() || 'Unknown store', emoji: null, missing: false }
    : { key: 'store:none', label: 'No store', emoji: null, missing: true };
  const kind = item.catalog_item_type;
  const fallback = kind === 'food' ? 'Uncategorized food' : kind === 'household' ? 'Uncategorized household' : 'Uncategorized';
  const named = Boolean(item.category_id && item.category_name?.trim());
  return {
    key: item.category_id ? `category:${item.category_id}` : `category:none:${kind ?? 'unknown'}`,
    label: named ? item.category_name!.trim() : fallback,
    emoji: named ? item.category_emoji ?? null : null,
    missing: !named, kind,
  };
}

/** Use the full loaded list for labels so filtering/checking cannot rename a group. */
export function groupShoppingItems(visibleItems: ShoppingListItem[], mode: ShoppingGroupMode, allItems = visibleItems): ShoppingItemGroup[] {
  const labels = new Map<string, GroupLabel>();
  for (const item of allItems) {
    const label = describe(item, mode);
    const prior = labels.get(label.key);
    if (!prior || (prior.missing && !label.missing)) labels.set(label.key, label);
  }
  const names = new Map<string, Set<string>>();
  if (mode === 'category') for (const label of labels.values()) {
    if (label.missing) continue;
    const name = label.label.toLocaleLowerCase();
    const keys = names.get(name) ?? new Set<string>();
    keys.add(label.key); names.set(name, keys);
  }
  const groups = new Map<string, ShoppingItemGroup>();
  for (const item of visibleItems) {
    const ownLabel = describe(item, mode);
    const label = labels.get(ownLabel.key) ?? ownLabel;
    let group = groups.get(label.key);
    if (!group) { group = { ...label, items: [] }; groups.set(label.key, group); }
    group.items.push(item);
  }
  return [...groups.values()]
    .map((group) => {
      const ambiguous = !group.missing && (names.get(group.label.toLocaleLowerCase())?.size ?? 0) > 1;
      const qualifier = group.kind === 'food' ? 'Food' : group.kind === 'household' ? 'Household' : 'Other';
      return {
        ...group,
        label: ambiguous ? `${group.label} (${qualifier})` : group.label,
        items: [...group.items].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id)),
      };
    })
    .sort((a, b) => Number(a.missing) - Number(b.missing) || compare(a.label, b.label) || compare(a.key, b.key));
}
