import { choicePermission, permissionActions, permissionSection, permits, sectionChecked, togglePermissionSection, type PermissionAction } from '@/lib/household-permissions';
const shopping: PermissionAction[] = ['shopping.add', 'shopping.edit', 'shopping.check'];
it('owners retain all actions and members use explicit grants with no permissive fallback', () => {
  for (const action of permissionActions) expect(permits({ role: 'owner' }, action)).toBe(true);
  expect(permits({ role: 'member' }, 'shopping.add')).toBe(false);
  expect(permits(null, 'shopping.add')).toBe(false);
  expect(permits({ role: 'member', permissions: shopping }, 'shopping.edit')).toBe(true);
  expect(permits({ role: 'member', permissions: shopping }, 'shopping.remove')).toBe(false);
  expect(permits({ role: 'member', permissions: [] }, 'shopping.check')).toBe(false);
});
it('derives none, mixed and all section states from the individual grants', () => {
  expect(sectionChecked(shopping, [])).toBe(false);
  expect(sectionChecked(shopping, ['shopping.add'])).toBe('mixed');
  expect(sectionChecked(shopping, shopping)).toBe(true);
});
it('selects from mixed/none, clears from all and preserves the other sections', () => {
  const other: PermissionAction[] = ['recipes.create'];
  const initial = [...other, 'shopping.add'] as PermissionAction[];
  const selected = togglePermissionSection(shopping, initial);
  expect(new Set(selected)).toEqual(new Set([...shopping, ...other]));
  expect(togglePermissionSection(shopping, selected)).toEqual(other);
  expect(initial).toEqual([...other, 'shopping.add']);
});
it('Catalog includes all item/category/store/unit descendants, without expanding other sections', () => {
  const catalog = permissionActions.filter((key) => key.startsWith('catalog.'));
  expect(catalog).toHaveLength(12);
  expect(new Set(togglePermissionSection(catalog, ['shopping.add']))).toEqual(new Set([...catalog, 'shopping.add']));
  expect(permissionSection({ key: 'catalog.units.edit', group: 'Shopping units', label: 'Edit units' })).toBe('Catalog');
  expect(choicePermission('category', 'create')).toBe('catalog.categories.create');
  expect(choicePermission('store', 'edit')).toBe('catalog.stores.edit');
  expect(choicePermission('shopping-unit', 'archive')).toBe('catalog.units.archive');
});
