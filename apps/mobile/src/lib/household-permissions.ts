/** Stable API action identifiers; presentation metadata comes from the owner endpoint. */
export const permissionActions = [
  "shopping.add",
  "shopping.check",
  "shopping.edit",
  "shopping.remove",
  "shopping.clear_purchased",
  "shopping.clear_all",
  "recipes.create",
  "recipes.edit",
  "recipes.archive",
  "recipes.restore",
  "plan.add",
  "plan.edit",
  "plan.remove",
  "catalog.items.create",
  "catalog.items.edit",
  "catalog.items.archive",
  "catalog.categories.create",
  "catalog.categories.edit",
  "catalog.categories.archive",
  "catalog.stores.create",
  "catalog.stores.edit",
  "catalog.stores.archive",
  "catalog.units.create",
  "catalog.units.edit",
  "catalog.units.archive"
] as const;
export type PermissionAction = typeof permissionActions[number];
export type HouseholdAccess = { role: 'owner' | 'member'; permissions?: readonly string[]; permissions_revision?: number; membership_id?: string };
export function permits(access: HouseholdAccess | null | undefined, action: PermissionAction): boolean {
  return Boolean(access && (access.role === 'owner' || access.permissions?.includes(action)));
}
export type PermissionDefinition = { key: PermissionAction; group: string; label: string };
export type MemberPermissions = HouseholdAccess & { membership_id: string; permissions: PermissionAction[]; permissions_revision: number; actions: PermissionDefinition[] };
export const permissionSections = ['Shopping', 'Recipes', 'Meal planning', 'Catalog'] as const;
export function permissionSection(action: PermissionDefinition): typeof permissionSections[number] {
  return action.key.startsWith('catalog.') ? 'Catalog' : action.group as typeof permissionSections[number];
}
export function sectionChecked(keys: readonly PermissionAction[], grants: readonly PermissionAction[]): boolean | 'mixed' {
  const count = keys.filter((key) => grants.includes(key)).length;
  return count === 0 ? false : count === keys.length ? true : 'mixed';
}
export function togglePermissionSection(keys: readonly PermissionAction[], grants: readonly PermissionAction[]): PermissionAction[] {
  return sectionChecked(keys, grants) === true ? grants.filter((key) => !keys.includes(key)) : [...new Set([...grants, ...keys])];
}

export function choicePermission(kind: 'category' | 'store' | 'shopping-unit' | null, operation: 'create' | 'edit' | 'archive'): PermissionAction {
  const group = kind === 'category' ? 'categories' : kind === 'store' ? 'stores' : 'units';
  return `catalog.${group}.${operation}`;
}
