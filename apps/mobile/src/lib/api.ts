import { apiOrigin } from '@/auth-config';
import type { StartupDiagnostics } from '@/lib/startup-diagnostics';

export type GetToken = () => Promise<string | null>;

export type Household = { id: string; name: string; time_zone: string; role: 'owner' | 'member' };
export type Me = { user: { id: string; email: string; display_name: string }; households: Household[] };
export type ShoppingListItem = { id: string; name: string; is_checked: boolean; checked_at: string | null; checked_by_user_id: string | null; created_by_user_id: string; created_at: string; catalog_item_id?: string | null; amount?: string | null; recipe_unit_code?: string | null; recipe_unit_dimension?: 'volume' | 'mass' | 'count' | null; recipe_unit_label?: string | null; custom_unit_label?: string | null; meal_plan_source?: boolean };
export type ShoppingList = { id: string; household_id: string; items: ShoppingListItem[] };
export type CreatedInvitation = { id: string; expires_at: string; code: string };
export type HouseholdMember = { membership_id: string; display_name: string; avatar_url: string | null; role: 'owner' | 'member'; joined_at: string; is_self: boolean; email?: string };
export type PendingInvitation = { id: string; normalized_email: string; expires_at: string };
export type ApiErrorCode = 'DISPLAY_NAME_REQUIRED' | 'HOUSEHOLD_MEMBER_ALREADY_EXISTS' | 'INVITATION_ALREADY_PENDING' | 'LAST_OWNER' | 'CATALOG_ITEM_ALREADY_EXISTS' | 'CATALOG_CHOICE_ALREADY_EXISTS' | 'CATALOG_CHOICE_IN_USE' | 'CATALOG_REFERENCE_ARCHIVED' | 'CATALOG_CATEGORY_COUNT_CHANGED' | 'RECIPE_REVISION_CONFLICT' | 'RECIPE_CATALOG_ITEM_ARCHIVED' | 'RECIPE_CREATE_REQUEST_ALREADY_USED' | 'MEAL_PLAN_SLOT_OCCUPIED' | 'MEAL_PLAN_REVISION_CONFLICT' | 'MEAL_PLAN_RECIPE_ARCHIVED' | 'MEAL_PLAN_REVIEW_STALE' | 'MEAL_PLAN_REQUEST_REUSED';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';
export type MealPlanEntry = {
  id: string; planned_for: string; meal_slot: MealSlot; recipe_id: string; edit_revision: number;
  recipe_name?: string; cover_kind?: Recipe['cover_kind']; cover_emoji?: string | null;
  archived_at?: string | null; ingredient_count?: number;
};
export type MealPlanWeek = { time_zone: string; local_today: string; week_start: string; week_end: string; week_offset: number; entries: MealPlanEntry[] };
export type MealPlanNeed = {
  need_key: string; catalog_item_id: string; name: string; amount: string | null;
  recipe_unit_code: string | null; recipe_unit_dimension: 'volume' | 'mass' | 'count' | null;
  unit_label: string | null; custom_unit_label: string | null;
  sources: { planned_for: string; meal_slot: MealSlot; recipe_name: string; amount: string | null; unit_label: string | null; note: string | null }[];
  existing_matches: { kind: 'exact' | 'possible'; item_id: string; name: string }[]; default_selected: boolean;
};
export type MealPlanShoppingReview = { week_start: string; week_end: string; review_token: string; needs: MealPlanNeed[] };
export type AddReviewedMealPlanNeedsInput = {
  week_start: string;
  review_token: string;
  request_id: string;
  selected_need_keys: string[];
  amount_overrides?: Record<string, string>;
};

export type CatalogItemType = 'food' | 'household';
export type CatalogChoice = { id: string; name: string; created_at: string; updated_at: string };
export type CatalogCategory = CatalogChoice & { item_type: CatalogItemType; emoji: string | null; active_item_count: number };
export type CatalogShoppingUnit = { code?: string; id?: string; label: string; unit_group?: 'package_count' | 'measured' };
export type RecipeMeasurementUnit = { code: string; label: string; dimension: 'volume' | 'mass' | 'count' };
export type CatalogUnits = {
  shopping_units: { built_in: CatalogShoppingUnit[]; household: CatalogShoppingUnit[] };
  recipe_measurement_units: RecipeMeasurementUnit[];
};
export type CatalogItem = {
  id: string;
  household_id: string;
  item_type: CatalogItemType;
  name: string;
  category_id: string | null;
  category_name: string | null;
  shopping_unit_code: string | null;
  shopping_unit_label: string | null;
  shopping_unit_source: 'built_in' | 'household' | null;
  custom_shopping_unit_id: string | null;
  preferred_store_id: string | null;
  preferred_store_name: string | null;
  recipe_measurement_dimension: RecipeMeasurementUnit['dimension'] | null;
  recipe_measurement_unit_code: string | null;
  recipe_measurement_unit_label: string | null;
  created_at: string;
  updated_at: string;
};
export type CatalogItemInput = {
  name: string;
  item_type: CatalogItemType;
  category_id?: string | null;
  shopping_unit_code?: string | null;
  custom_shopping_unit_id?: string | null;
  preferred_store_id?: string | null;
  recipe_measurement_dimension?: RecipeMeasurementUnit['dimension'] | null;
  recipe_measurement_unit_code?: string | null;
};

export type RecipeIngredientInput = {
  catalog_item_id: string;
  amount?: string | null;
  unit_code?: string | null;
  custom_unit_label?: string | null;
  note?: string | null;
};
export type RecipeStep = { id: string; position: number; instruction: string };
export type RecipeIngredient = RecipeIngredientInput & {
  id: string;
  catalog_item_name: string;
  category_emoji: string | null;
  position: number;
  unit_label: string | null;
};
export type Recipe = {
  id: string;
  household_id: string;
  name: string;
  cover_kind: 'initials' | 'emoji';
  cover_emoji: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  notes: string | null;
  source_url: string | null;
  edit_revision: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  ingredient_count: number;
  ingredients?: RecipeIngredient[];
  steps?: RecipeStep[];
};
export type RecipeInput = {
  create_request_id: string;
  name: string;
  cover_kind: 'initials' | 'emoji';
  cover_emoji?: string | null;
  servings?: number | null;
  prep_hours?: number | null;
  prep_minutes?: number | null;
  cook_hours?: number | null;
  cook_minutes?: number | null;
  notes?: string | null;
  source_url?: string | null;
  ingredients: RecipeIngredientInput[];
  steps?: string[];
};
export type RecipeUpdateInput = Partial<Omit<RecipeInput, 'create_request_id' | 'ingredients'>> & {
  expected_revision: number;
  ingredients?: RecipeIngredientInput[];
};

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: ApiErrorCode) {
    super(message);
  }
}

const apiErrorMessages: Partial<Record<ApiErrorCode, string>> = {
  DISPLAY_NAME_REQUIRED: 'Add a display name to continue.',
  HOUSEHOLD_MEMBER_ALREADY_EXISTS: 'This person is already a member of this household.',
  INVITATION_ALREADY_PENDING: 'An active invitation already exists for that email.',
  LAST_OWNER: 'At least one active owner must remain.',
  CATALOG_ITEM_ALREADY_EXISTS: 'An item with this name already exists in your household.',
  CATALOG_CHOICE_ALREADY_EXISTS: 'A choice with this name already exists.',
  CATALOG_CHOICE_IN_USE: 'This choice is used by an active item.',
  CATALOG_REFERENCE_ARCHIVED: 'That choice is no longer available. Refresh choices and select another.',
  CATALOG_CATEGORY_COUNT_CHANGED: 'The number of active items changed. Review the updated count before deleting this category.',
  RECIPE_REVISION_CONFLICT: 'This recipe changed on another device. Reload it before saving.',
  RECIPE_CATALOG_ITEM_ARCHIVED: 'That Food Catalog item is archived. Refresh and choose an active item.',
  RECIPE_CREATE_REQUEST_ALREADY_USED: 'This recipe draft was already used. Start a new recipe to continue.',
  MEAL_PLAN_SLOT_OCCUPIED: 'That day and meal already has a planned recipe.',
  MEAL_PLAN_REVISION_CONFLICT: 'This planned meal changed on another device. Refresh before saving.',
  MEAL_PLAN_RECIPE_ARCHIVED: 'That recipe is archived. Choose an active recipe.',
  MEAL_PLAN_REVIEW_STALE: 'The plan or Shopping list changed. Refresh this review before adding items.',
  MEAL_PLAN_REQUEST_REUSED: 'This review request was already used. Refresh and try again.',
};

async function request<T>(getToken: GetToken, path: string, init?: RequestInit, diagnostics?: StartupDiagnostics): Promise<T> {
  const requestDiagnostics = path === '/v1/me' ? diagnostics : undefined;
  const tokenStartedAt = Date.now();
  let token: string | null = null;
  try {
    token = await getToken();
  } finally {
    requestDiagnostics?.record('token_retrieval', Date.now() - tokenStartedAt);
  }
  if (!token) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  const requestHeaders = new Headers(init?.headers);
  requestHeaders.set('Authorization', `Bearer ${token}`);
  requestHeaders.set('Content-Type', 'application/json');
  if (requestDiagnostics) requestHeaders.set('X-Request-ID', requestDiagnostics.requestId);
  const fetchStartedAt = Date.now();
  requestDiagnostics?.record('me_fetch', 0);
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}${path}`, { ...init, headers: requestHeaders });
  } catch (error) {
    requestDiagnostics?.record('me_response', Date.now() - fetchStartedAt);
    throw error;
  }
  requestDiagnostics?.record('me_response', Date.now() - fetchStartedAt, response.status);
  if (!response.ok) {
    let code: ApiErrorCode | undefined;
    try {
      const body = await response.json() as { detail?: { code?: unknown } };
      const candidate = body.detail?.code;
      if (candidate === 'DISPLAY_NAME_REQUIRED' || candidate === 'HOUSEHOLD_MEMBER_ALREADY_EXISTS' || candidate === 'INVITATION_ALREADY_PENDING' || candidate === 'LAST_OWNER' || candidate === 'CATALOG_ITEM_ALREADY_EXISTS' || candidate === 'CATALOG_CHOICE_ALREADY_EXISTS' || candidate === 'CATALOG_CHOICE_IN_USE' || candidate === 'CATALOG_REFERENCE_ARCHIVED' || candidate === 'CATALOG_CATEGORY_COUNT_CHANGED' || candidate === 'RECIPE_REVISION_CONFLICT' || candidate === 'RECIPE_CATALOG_ITEM_ARCHIVED' || candidate === 'RECIPE_CREATE_REQUEST_ALREADY_USED' || candidate === 'MEAL_PLAN_SLOT_OCCUPIED' || candidate === 'MEAL_PLAN_REVISION_CONFLICT' || candidate === 'MEAL_PLAN_RECIPE_ARCHIVED' || candidate === 'MEAL_PLAN_REVIEW_STALE' || candidate === 'MEAL_PLAN_REQUEST_REUSED') code = candidate;
    } catch { /* Keep error responses safe and generic when their body is not JSON. */ }
    const message = code === 'DISPLAY_NAME_REQUIRED'
      ? (apiErrorMessages[code] ?? 'Add a display name to continue.')
      : response.status === 410
        ? 'This invitation has expired.'
        : (code && apiErrorMessages[code]) || 'Something went wrong. Please try again.';
    throw new ApiError(response.status, message, code);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const api = {
  me: (getToken: GetToken, init?: RequestInit, diagnostics?: StartupDiagnostics) => request<Me>(getToken, '/v1/me', init, diagnostics),
  createHousehold: (getToken: GetToken, name: string, timeZone: string) =>
    request<{ household: Household }>(getToken, '/v1/households', { method: 'POST', body: JSON.stringify({ name, time_zone: timeZone }) }),
  household: (getToken: GetToken, householdId: string) =>
    request<{ household: Household }>(getToken, `/v1/households/${householdId}`, { method: 'GET' }),
  updateHousehold: (getToken: GetToken, householdId: string, values: { name?: string; time_zone?: string }) =>
    request<{ household: Household }>(getToken, `/v1/households/${householdId}`, { method: 'PATCH', body: JSON.stringify(values) }),
  householdMembers: (getToken: GetToken, householdId: string) =>
    request<{ members: HouseholdMember[] }>(getToken, `/v1/households/${householdId}/members`, { method: 'GET' }),
  householdMember: (getToken: GetToken, householdId: string, membershipId: string) =>
    request<{ member: HouseholdMember }>(getToken, `/v1/households/${householdId}/members/${membershipId}`, { method: 'GET' }),
  setHouseholdMemberRole: (getToken: GetToken, householdId: string, membershipId: string, role: HouseholdMember['role']) =>
    request<void>(getToken, `/v1/households/${householdId}/members/${membershipId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeHouseholdMember: (getToken: GetToken, householdId: string, membershipId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/members/${membershipId}`, { method: 'DELETE' }),
  leaveHousehold: (getToken: GetToken, householdId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/leave`, { method: 'DELETE' }),
  deleteHousehold: (getToken: GetToken, householdId: string) =>
    request<void>(getToken, `/v1/households/${householdId}`, { method: 'DELETE' }),
  acceptInvitation: (getToken: GetToken, code: string) =>
    request<void>(getToken, '/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ code }) }),
  createInvitation: (getToken: GetToken, householdId: string, email: string) =>
    request<{ invitation: CreatedInvitation }>(getToken, `/v1/households/${householdId}/invitations`, { method: 'POST', body: JSON.stringify({ email }) }),
  householdInvitations: (getToken: GetToken, householdId: string) =>
    request<{ invitations: PendingInvitation[] }>(getToken, `/v1/households/${householdId}/invitations`, { method: 'GET' }),
  revokeInvitation: (getToken: GetToken, householdId: string, invitationId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/invitations/${invitationId}/revoke`, { method: 'POST' }),
  reissueInvitation: (getToken: GetToken, householdId: string, invitationId: string) =>
    request<{ invitation: CreatedInvitation }>(getToken, `/v1/households/${householdId}/invitations/${invitationId}/reissue`, { method: 'POST' }),
  shoppingList: (getToken: GetToken, householdId: string) =>
    request<{ shopping_list: ShoppingList }>(getToken, `/v1/households/${householdId}/shopping-list`, { method: 'GET' }),
  addShoppingListItem: (getToken: GetToken, householdId: string, name: string) =>
    request<{ item: ShoppingListItem }>(getToken, `/v1/households/${householdId}/shopping-list/items`, { method: 'POST', body: JSON.stringify({ name }) }),
  setShoppingListItemChecked: (getToken: GetToken, householdId: string, itemId: string, isChecked: boolean) =>
    request<{ item: ShoppingListItem }>(getToken, `/v1/households/${householdId}/shopping-list/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ is_checked: isChecked }) }),
  deleteShoppingListItem: (getToken: GetToken, householdId: string, itemId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/shopping-list/items/${itemId}`, { method: 'DELETE' }),
  mealPlan: (getToken: GetToken, householdId: string, weekOffset = 0) =>
    request<MealPlanWeek>(getToken, `/v1/households/${householdId}/meal-plan?week_offset=${weekOffset}`, { method: 'GET' }),
  createMealPlanEntry: (getToken: GetToken, householdId: string, values: Pick<MealPlanEntry, 'planned_for' | 'meal_slot' | 'recipe_id'>) =>
    request<{ entry: MealPlanEntry }>(getToken, `/v1/households/${householdId}/meal-plan/entries`, { method: 'POST', body: JSON.stringify(values) }),
  updateMealPlanEntry: (getToken: GetToken, householdId: string, entryId: string, values: Pick<MealPlanEntry, 'planned_for' | 'meal_slot' | 'recipe_id'> & { expected_revision: number }) =>
    request<{ entry: MealPlanEntry }>(getToken, `/v1/households/${householdId}/meal-plan/entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(values) }),
  deleteMealPlanEntry: (getToken: GetToken, householdId: string, entryId: string, revision: number) =>
    request<void>(getToken, `/v1/households/${householdId}/meal-plan/entries/${entryId}?expected_revision=${revision}`, { method: 'DELETE' }),
  mealPlanShoppingReview: (getToken: GetToken, householdId: string, weekStart: string) =>
    request<MealPlanShoppingReview>(getToken, `/v1/households/${householdId}/meal-plan/shopping-review?week_start=${weekStart}`, { method: 'GET' }),
  addMealPlanNeedsToShopping: (getToken: GetToken, householdId: string, values: AddReviewedMealPlanNeedsInput) =>
    request<{ items: { id: string; name: string }[]; replayed: boolean }>(getToken, `/v1/households/${householdId}/meal-plan/shopping`, { method: 'POST', body: JSON.stringify(values) }),
  catalogUnits: (getToken: GetToken, householdId: string) =>
    request<CatalogUnits>(getToken, `/v1/households/${householdId}/catalog/units`, { method: 'GET' }),
  catalogCategories: (getToken: GetToken, householdId: string, itemType?: CatalogItemType) =>
    request<{ categories: CatalogCategory[] }>(getToken, `/v1/households/${householdId}/catalog/categories${itemType ? `?item_type=${itemType}` : ''}`, { method: 'GET' }),
  createCatalogCategory: (getToken: GetToken, householdId: string, itemType: CatalogItemType, name: string, emoji: string | null) =>
    request<{ category: CatalogCategory }>(getToken, `/v1/households/${householdId}/catalog/categories`, { method: 'POST', body: JSON.stringify({ item_type: itemType, name, emoji }) }),
  updateCatalogCategory: (getToken: GetToken, householdId: string, categoryId: string, name: string, emoji: string | null) =>
    request<{ category: CatalogCategory }>(getToken, `/v1/households/${householdId}/catalog/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify({ name, emoji }) }),
  deleteCatalogCategory: (getToken: GetToken, householdId: string, categoryId: string, expectedActiveItemCount: number) =>
    request<void>(getToken, `/v1/households/${householdId}/catalog/categories/${categoryId}?expected_active_item_count=${expectedActiveItemCount}`, { method: 'DELETE' }),
  catalogStores: (getToken: GetToken, householdId: string) =>
    request<{ stores: CatalogChoice[] }>(getToken, `/v1/households/${householdId}/catalog/stores`, { method: 'GET' }),
  createCatalogStore: (getToken: GetToken, householdId: string, name: string) =>
    request<{ store: CatalogChoice }>(getToken, `/v1/households/${householdId}/catalog/stores`, { method: 'POST', body: JSON.stringify({ name }) }),
  updateCatalogStore: (getToken: GetToken, householdId: string, storeId: string, name: string) =>
    request<{ store: CatalogChoice }>(getToken, `/v1/households/${householdId}/catalog/stores/${storeId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteCatalogStore: (getToken: GetToken, householdId: string, storeId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/catalog/stores/${storeId}`, { method: 'DELETE' }),
  createCatalogShoppingUnit: (getToken: GetToken, householdId: string, name: string) =>
    request<{ unit: CatalogChoice }>(getToken, `/v1/households/${householdId}/catalog/shopping-units`, { method: 'POST', body: JSON.stringify({ name }) }),
  updateCatalogShoppingUnit: (getToken: GetToken, householdId: string, unitId: string, name: string) =>
    request<{ unit: CatalogChoice }>(getToken, `/v1/households/${householdId}/catalog/shopping-units/${unitId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteCatalogShoppingUnit: (getToken: GetToken, householdId: string, unitId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/catalog/shopping-units/${unitId}`, { method: 'DELETE' }),
  catalogItems: (getToken: GetToken, householdId: string) =>
    request<{ items: CatalogItem[] }>(getToken, `/v1/households/${householdId}/catalog/items`, { method: 'GET' }),
  createCatalogItem: (getToken: GetToken, householdId: string, item: CatalogItemInput) =>
    request<{ item: CatalogItem }>(getToken, `/v1/households/${householdId}/catalog/items`, { method: 'POST', body: JSON.stringify(item) }),
  catalogItem: (getToken: GetToken, householdId: string, itemId: string) =>
    request<{ item: CatalogItem }>(getToken, `/v1/households/${householdId}/catalog/items/${itemId}`, { method: 'GET' }),
  updateCatalogItem: (getToken: GetToken, householdId: string, itemId: string, item: Partial<CatalogItemInput>) =>
    request<{ item: CatalogItem }>(getToken, `/v1/households/${householdId}/catalog/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(item) }),
  deleteCatalogItem: (getToken: GetToken, householdId: string, itemId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/catalog/items/${itemId}`, { method: 'DELETE' }),
  recipes: (getToken: GetToken, householdId: string, archived = false, search?: string) => {
    const params = new URLSearchParams();
    if (archived) params.set('archived', 'true');
    if (search?.trim()) params.set('search', search.trim());
    const query = params.toString();
    return request<{ recipes: Recipe[] }>(getToken, `/v1/households/${householdId}/recipes${query ? `?${query}` : ''}`, { method: 'GET' });
  },
  recipe: (getToken: GetToken, householdId: string, recipeId: string) =>
    request<{ recipe: Recipe }>(getToken, `/v1/households/${householdId}/recipes/${recipeId}`, { method: 'GET' }),
  createRecipe: (getToken: GetToken, householdId: string, recipe: RecipeInput) =>
    request<{ recipe: Recipe }>(getToken, `/v1/households/${householdId}/recipes`, { method: 'POST', body: JSON.stringify(recipe) }),
  updateRecipe: (getToken: GetToken, householdId: string, recipeId: string, values: RecipeUpdateInput) =>
    request<{ recipe: Recipe }>(getToken, `/v1/households/${householdId}/recipes/${recipeId}`, { method: 'PATCH', body: JSON.stringify(values) }),
  archiveRecipe: (getToken: GetToken, householdId: string, recipeId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/recipes/${recipeId}/archive`, { method: 'POST' }),
  restoreRecipe: (getToken: GetToken, householdId: string, recipeId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/recipes/${recipeId}/restore`, { method: 'POST' }),
};
