import type { PropsWithChildren } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ApiError, api, type CatalogItem, type MealPlanEntry, type MealPlanWeek, type Recipe } from '@/lib/api';

const mockGetToken = jest.fn().mockResolvedValue('session-token');
const household = { id: 'household-a', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' as const };
const user = { id: 'user-a', email: 'owner@example.com', display_name: 'Household Owner' };
const me = { user, households: [household] };
const food: CatalogItem = {
  id: 'food-milk', household_id: household.id, item_type: 'food', name: 'Milk', category_id: null,
  category_name: null, shopping_unit_code: null, shopping_unit_label: null, shopping_unit_source: null,
  custom_shopping_unit_id: null, preferred_store_id: null, preferred_store_name: null,
  recipe_measurement_dimension: null, recipe_measurement_unit_code: null, recipe_measurement_unit_label: null,
  created_at: '', updated_at: '',
};
const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'recipe-soup', household_id: household.id, name: 'Soup', cover_kind: 'initials', cover_emoji: null,
  servings: null, prep_minutes: null, cook_minutes: null, notes: null, source_url: null, edit_revision: 1,
  created_at: '', updated_at: '', archived_at: null, ingredient_count: 1,
  ingredients: [{ id: 'ingredient-1', catalog_item_id: food.id, catalog_item_name: food.name, category_emoji: null,
    amount: '1', unit_code: null, custom_unit_label: null, note: null, position: 0, unit_label: null }],
  steps: [], ...overrides,
});
const emptyWeek = (): MealPlanWeek => ({
  time_zone: household.time_zone, local_today: '2026-10-05', week_start: '2026-10-05', week_end: '2026-10-11', week_offset: 0, entries: [],
});
const originalPlatform = Platform.OS;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

jest.mock('@clerk/expo', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Context = React.createContext<{
    isLoaded: boolean; isSignedIn: boolean; userId: string | null; sessionId: string | null; getToken: typeof mockGetToken;
  }>(null!);
  return {
    ClerkProvider: ({ children }: PropsWithChildren) => React.createElement(Context.Provider, {
      value: { isLoaded: true, isSignedIn: true, userId: 'user-a', sessionId: 'session-a', getToken: mockGetToken },
    }, children),
    useAuth: () => React.useContext(Context),
    useClerk: () => ({ signOut: jest.fn().mockResolvedValue(undefined) }),
    useUser: () => ({ user: { firstName: 'Household Owner', imageUrl: null } }),
  };
});
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: {
    ...actual.api,
    me: jest.fn(), shoppingList: jest.fn(), mealPlan: jest.fn(), createMealPlanEntry: jest.fn(),
    updateMealPlanEntry: jest.fn(), deleteMealPlanEntry: jest.fn(), mealPlanShoppingReview: jest.fn(),
    addMealPlanNeedsToShopping: jest.fn(), recipes: jest.fn(), recipe: jest.fn(), createRecipe: jest.fn(),
    catalogItems: jest.fn(), catalogUnits: jest.fn(),
  } };
});
jest.mock('@/components/animated-icon', () => ({ AnimatedSplashOverlay: () => null }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

const mockedApi = jest.mocked(api);
const mockedStorage = jest.mocked(AsyncStorage);

async function waitForLoadedPlan() {
  await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText('Breakfast')).toBeTruthy());
}

describe('meal planning through the Expo Router', () => {
  beforeEach(() => {
    Platform.OS = 'android';
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue('session-token');
    mockedStorage.getItem.mockResolvedValue(household.id);
    mockedStorage.setItem.mockResolvedValue();
    mockedStorage.removeItem.mockResolvedValue();
    mockedApi.me.mockResolvedValue(me);
    mockedApi.shoppingList.mockResolvedValue({ shopping_list: { id: 'list-1', household_id: household.id, items: [] } });
    mockedApi.mealPlan.mockImplementation(async (_token, _householdId, weekOffset = 0) => ({ ...emptyWeek(), week_offset: weekOffset }));
    mockedApi.recipes.mockResolvedValue({ recipes: [recipe()] });
    mockedApi.createMealPlanEntry.mockResolvedValue({ entry: { id: 'entry-1', planned_for: '2026-10-05', meal_slot: 'breakfast', recipe_id: 'recipe-soup', edit_revision: 1 } });
    mockedApi.updateMealPlanEntry.mockResolvedValue({ entry: { id: 'entry-1', planned_for: '2026-10-05', meal_slot: 'breakfast', recipe_id: 'recipe-soup', edit_revision: 2 } });
    mockedApi.deleteMealPlanEntry.mockResolvedValue(undefined);
    mockedApi.catalogItems.mockResolvedValue({ items: [food] });
    mockedApi.catalogUnits.mockResolvedValue({ shopping_units: { built_in: [], household: [] }, recipe_measurement_units: [] });
    mockedApi.createRecipe.mockResolvedValue({ recipe: recipe({ id: 'recipe-new', name: 'New Household Soup' }) });
  });

  afterEach(() => { Platform.OS = originalPlatform; });

  it('starts at Plan, stacks a day picker, preserves the add draft, and returns from recipe creation to the same sheet', async () => {
    const withNewEntry: MealPlanWeek = { ...emptyWeek(), entries: [{
      id: 'entry-new', planned_for: '2026-10-06', meal_slot: 'dinner', recipe_id: 'recipe-new', edit_revision: 1,
      recipe_name: 'New Household Soup', cover_kind: 'initials', cover_emoji: null, ingredient_count: 1,
    }] };
    let entryCreated = false;
    mockedApi.mealPlan.mockImplementation(async (_token, _householdId, weekOffset = 0) => ({
      ...(entryCreated ? withNewEntry : emptyWeek()), week_offset: weekOffset,
    }));
    mockedApi.createMealPlanEntry.mockImplementation(async () => {
      entryCreated = true;
      return { entry: { id: 'entry-new', planned_for: '2026-10-06', meal_slot: 'dinner', recipe_id: 'recipe-new', edit_revision: 1 } };
    });
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    expect(await screen.findByText('Plan')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/plan');
    await waitForLoadedPlan();
    expect(mockedApi.mealPlan).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Add Dinner' }));
    await screen.findByRole('radio', { name: /Soup/u });
    expect(rendered.getPathname()).toBe('/plan/sheet/add');
    await fireEvent.press(screen.getByRole('button', { name: 'Monday, October 5' }));
    expect(await screen.findByText('Choose a day')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: /Tuesday, October 6/u }));
    expect(rendered.getPathname()).toBe('/plan/sheet/add');
    expect(screen.getByText('Tuesday, October 6')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dinner' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create a new recipe' }));
    expect(await screen.findByLabelText('Recipe name')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/plan/recipe-create');
    await fireEvent.changeText(screen.getByLabelText('Recipe name'), 'New Household Soup');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Add ingredient' })[0]);
    expect(await screen.findByText('Milk')).toBeTruthy();
    await fireEvent.press(screen.getByText('Milk'));
    await fireEvent.changeText(await screen.findByLabelText('Ingredient amount'), '1');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Add ingredient' })[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('radio', { name: /New Household Soup/u })).toBeTruthy();
    expect(rendered.getPathname()).toBe('/plan/sheet/add');
    expect(screen.getByText('Tuesday, October 6')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Dinner' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('radio', { name: /New Household Soup/u }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Add meal' }));
    await waitFor(() => expect(mockedApi.createMealPlanEntry).toHaveBeenCalledWith(expect.any(Function), household.id, {
      planned_for: '2026-10-06', meal_slot: 'dinner', recipe_id: 'recipe-new',
    }));
    expect(await screen.findByText('New Household Soup')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/plan');
  });

  it('reviews the whole week and adds only confirmed selected needs', async () => {
    mockedApi.mealPlanShoppingReview.mockResolvedValue({
      week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'a'.repeat(64), needs: [{
        need_key: 'beans-cup', catalog_item_id: 'food-beans', name: 'Beans', amount: '1.5',
        recipe_unit_code: 'cup', recipe_unit_dimension: 'volume', unit_label: 'Cup', custom_unit_label: null,
        sources: [{ planned_for: '2026-10-05', meal_slot: 'dinner', recipe_name: 'Soup', amount: '1', unit_label: 'Cup', note: null }],
        existing_matches: [{ kind: 'exact', item_id: 'shopping-beans', name: 'Beans' }], default_selected: false,
      }],
    });
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    expect(await screen.findByText('Review what to buy')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('1.5 Cup').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText('Soup · Mon').length).toBeGreaterThan(0));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Select Beans' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    expect(screen.getByText(/already appear on Shopping/u)).toBeTruthy();
    expect(mockedApi.addMealPlanNeedsToShopping).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected anyway' }));
    await waitFor(() => expect(mockedApi.addMealPlanNeedsToShopping).toHaveBeenCalledWith(expect.any(Function), household.id, expect.objectContaining({
      week_start: '2026-10-05', selected_need_keys: ['beans-cup'], request_id: expect.any(String),
    })));
    expect(rendered.getPathname()).toBe('/plan/shopping-review');
  });

  it('retries an uncertain shopping response with the same idempotency request ID', async () => {
    mockedApi.mealPlanShoppingReview.mockResolvedValue({
      week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'c'.repeat(64), needs: [{
        need_key: 'eggs-unit', catalog_item_id: 'food-eggs', name: 'Eggs', amount: '2',
        recipe_unit_code: 'unit', recipe_unit_dimension: 'count', unit_label: 'Unit', custom_unit_label: null,
        sources: [{ planned_for: '2026-10-05', meal_slot: 'breakfast', recipe_name: 'Omelette', amount: '2', unit_label: 'Unit', note: null }],
        existing_matches: [], default_selected: true,
      }],
    });
    mockedApi.addMealPlanNeedsToShopping.mockRejectedValueOnce(new Error('response connection lost'))
      .mockResolvedValueOnce({ items: [{ id: 'generated-eggs', name: 'Eggs' }], replayed: true });
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    await screen.findByText('2 Unit');
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry add safely' })).toBeTruthy());
    const firstRequest = mockedApi.addMealPlanNeedsToShopping.mock.calls[0][2];
    expect(firstRequest.request_id).toMatch(/^[0-9a-f-]{36}$/u);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry add safely' }));
    await waitFor(() => expect(mockedApi.addMealPlanNeedsToShopping).toHaveBeenCalledTimes(2));
    expect(mockedApi.addMealPlanNeedsToShopping.mock.calls[1][2]).toEqual(firstRequest);
    expect(await screen.findByText('1 item added to Shopping.')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/plan/shopping-review');
  });

  it('refreshing the review while an add is pending does not hide a confirmed Shopping update', async () => {
    const review = {
      week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'd'.repeat(64), needs: [{
        need_key: 'milk-unit', catalog_item_id: food.id, name: 'Milk', amount: '1',
        recipe_unit_code: 'unit', recipe_unit_dimension: 'count' as const, unit_label: 'Unit', custom_unit_label: null,
        sources: [{ planned_for: '2026-10-05', meal_slot: 'breakfast' as const, recipe_name: 'Soup', amount: '1', unit_label: 'Unit', note: null }],
        existing_matches: [], default_selected: true,
      }],
    };
    mockedApi.mealPlanShoppingReview.mockResolvedValue(review);
    const addResponse = deferred<{ items: { id: string; name: string }[]; replayed: boolean }>();
    mockedApi.addMealPlanNeedsToShopping.mockReturnValueOnce(addResponse.promise);
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    expect((await screen.findAllByText('Soup · Mon')).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(mockedApi.addMealPlanNeedsToShopping).toHaveBeenCalledTimes(1));

    const refreshableScreen = screen.getAllByTestId('screen').find((candidate) => candidate.props.refreshControl);
    expect(refreshableScreen).toBeTruthy();
    await act(async () => { refreshableScreen!.props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(mockedApi.mealPlanShoppingReview).toHaveBeenCalledTimes(2));

    mockedApi.shoppingList.mockResolvedValue({ shopping_list: { id: 'list-1', household_id: household.id, items: [{
      id: 'generated-milk', name: 'Milk', is_checked: false, checked_at: null, checked_by_user_id: null,
      created_by_user_id: user.id, created_at: '', meal_plan_source: true, amount: '1', recipe_unit_label: 'Unit',
    }] } });
    const previousListRequests = mockedApi.shoppingList.mock.calls.length;
    await act(async () => { addResponse.resolve({ items: [{ id: 'generated-milk', name: 'Milk' }], replayed: false }); await addResponse.promise; });
    expect(await screen.findByText('1 item added to Shopping.')).toBeTruthy();
    await act(async () => { router.navigate('/shopping'); });
    expect((await screen.findAllByText('Milk')).length).toBeGreaterThan(0);
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(previousListRequests + 1));
    expect(screen.getAllByText('1 Unit').length).toBeGreaterThan(0);
    expect(rendered.getPathname()).toBe('/shopping');
  });

  it('refreshes only the relevant Shopping list after confirmed plan-generated lines', async () => {
    mockedApi.mealPlanShoppingReview.mockResolvedValue({
      week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'b'.repeat(64), needs: [{
        need_key: 'milk', catalog_item_id: food.id, name: 'Milk', amount: null,
        recipe_unit_code: null, recipe_unit_dimension: null, unit_label: null, custom_unit_label: null,
        sources: [{ planned_for: '2026-10-05', meal_slot: 'breakfast', recipe_name: 'Soup', amount: null, unit_label: null, note: null }],
        existing_matches: [], default_selected: true,
      }],
    });
    mockedApi.addMealPlanNeedsToShopping.mockResolvedValue({ items: [{ id: 'plan-item-1', name: 'Milk' }], replayed: false });
    mockedApi.shoppingList
      .mockResolvedValueOnce({ shopping_list: { id: 'list-1', household_id: household.id, items: [] } })
      .mockResolvedValueOnce({ shopping_list: { id: 'list-1', household_id: household.id, items: [{
        id: 'plan-item-1', name: 'Milk', is_checked: false, checked_at: null, checked_by_user_id: null,
        created_by_user_id: user.id, created_at: '', meal_plan_source: true, amount: null,
      }] } });
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await act(async () => { router.navigate('/shopping'); });
    await screen.findByText('Your shopping list is empty.');
    await act(async () => { router.navigate('/plan'); });
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    await screen.findByText('Amount not specified');
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(screen.getByText('1 item added to Shopping.')).toBeTruthy());
    await act(async () => { router.navigate('/shopping'); });
    expect((await screen.findAllByText('Milk')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Amount not specified').length).toBeGreaterThan(0);
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable safe error when the household week cannot load', async () => {
    mockedApi.mealPlan.mockRejectedValueOnce(new Error('private database detail')).mockResolvedValueOnce(emptyWeek());
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    expect(await screen.findByText('We couldn’t load this week. Please try again.')).toBeTruthy();
    expect(screen.queryByText('private database detail')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2));
    expect(rendered.getPathname()).toBe('/plan');
  });

  it('keeps Add meal open with its selected recipe when saving fails', async () => {
    mockedApi.createMealPlanEntry.mockRejectedValueOnce(new ApiError(409, 'That day and meal already has a planned recipe.', 'MEAL_PLAN_SLOT_OCCUPIED'));
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Add Dinner' }));
    await screen.findByRole('radio', { name: /Soup/u });
    await fireEvent.press(screen.getByRole('radio', { name: /Soup/u }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add meal' }));

    expect(await screen.findByText('That day and meal already has a planned recipe.')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/plan/sheet/add');
    expect(screen.getByRole('radio', { name: /Soup/u }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'Add meal' }).props.accessibilityState?.disabled).not.toBe(true);
  });

  it('keeps Edit meal open with a safe error when saving fails', async () => {
    const plannedEntry: MealPlanEntry = {
      id: 'entry-save-error', planned_for: '2026-10-05', meal_slot: 'dinner', recipe_id: 'recipe-soup', edit_revision: 1,
      recipe_name: 'Soup', cover_kind: 'initials', cover_emoji: null, ingredient_count: 1,
    };
    mockedApi.mealPlan.mockResolvedValueOnce({ ...emptyWeek(), entries: [plannedEntry] });
    mockedApi.updateMealPlanEntry.mockRejectedValueOnce(new Error('private database detail'));
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Soup, Dinner' }));
    await screen.findByText('Edit meal');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('We couldn’t save this meal. Please try again.')).toBeTruthy();
    expect(screen.queryByText('private database detail')).toBeNull();
    expect(rendered.getPathname()).toBe('/plan/sheet/edit');
  });

  it('edits a planned occurrence and confirms removal without touching the recipe', async () => {
    const plannedEntry: MealPlanEntry = {
      id: 'entry-existing', planned_for: '2026-10-05', meal_slot: 'dinner', recipe_id: 'recipe-soup', edit_revision: 1,
      recipe_name: 'Soup', cover_kind: 'initials', cover_emoji: null, ingredient_count: 1,
    };
    mockedApi.recipes.mockResolvedValue({ recipes: [recipe(), recipe({ id: 'recipe-stew', name: 'Stew' })] });
    mockedApi.mealPlan.mockResolvedValueOnce({ ...emptyWeek(), entries: [plannedEntry] })
      .mockResolvedValueOnce({ ...emptyWeek(), entries: [{ ...plannedEntry, recipe_id: 'recipe-stew', recipe_name: 'Stew', meal_slot: 'breakfast', edit_revision: 2 }] })
      .mockResolvedValueOnce({ ...emptyWeek(), entries: [{ ...plannedEntry, recipe_id: 'recipe-stew', recipe_name: 'Stew', meal_slot: 'breakfast', edit_revision: 2 }] })
      .mockResolvedValueOnce(emptyWeek())
      .mockResolvedValueOnce(emptyWeek());
    mockedApi.updateMealPlanEntry.mockResolvedValue({ entry: { ...plannedEntry, recipe_id: 'recipe-stew', recipe_name: 'Stew', meal_slot: 'breakfast', edit_revision: 2 } });
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Soup, Dinner' }));
    expect(await screen.findByText('Edit meal')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Breakfast' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Change recipe' }));
    await fireEvent.press(screen.getByRole('radio', { name: /Stew/u }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockedApi.updateMealPlanEntry).toHaveBeenCalledWith(expect.any(Function), household.id, 'entry-existing', expect.objectContaining({
      planned_for: '2026-10-05', meal_slot: 'breakfast', recipe_id: 'recipe-stew', expected_revision: 1,
    })));
    expect(await screen.findByRole('button', { name: 'Edit Stew, Breakfast' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit Stew, Breakfast' }));
    await screen.findByText('Edit meal');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from plan' }));
    expect(screen.getByText('Remove only this occurrence from the plan?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep meal' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from plan' }));
    await waitFor(() => expect(mockedApi.deleteMealPlanEntry).toHaveBeenCalledWith(expect.any(Function), household.id, 'entry-existing', 2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit Stew, Breakfast' })).toBeNull());
  });

  it('offers a fresh-plan retry after another member changes the planned occurrence', async () => {
    const plannedEntry: MealPlanEntry = {
      id: 'entry-conflict', planned_for: '2026-10-05', meal_slot: 'dinner', recipe_id: 'recipe-soup', edit_revision: 1,
      recipe_name: 'Soup', cover_kind: 'initials', cover_emoji: null, ingredient_count: 1,
    };
    const refreshedEntry: MealPlanEntry = { ...plannedEntry, recipe_id: 'recipe-stew', recipe_name: 'Stew', edit_revision: 2 };
    mockedApi.recipes.mockResolvedValue({ recipes: [recipe(), recipe({ id: 'recipe-stew', name: 'Stew' })] });
    mockedApi.mealPlan.mockResolvedValueOnce({ ...emptyWeek(), entries: [plannedEntry] })
      .mockResolvedValueOnce({ ...emptyWeek(), entries: [refreshedEntry] })
      .mockResolvedValueOnce({ ...emptyWeek(), entries: [refreshedEntry] });
    mockedApi.updateMealPlanEntry.mockRejectedValueOnce(new ApiError(409, 'This planned meal changed on another device. Refresh before saving.', 'MEAL_PLAN_REVISION_CONFLICT'));
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Soup, Dinner' }));
    await screen.findByText('Edit meal');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('This planned meal changed on another device. Refresh before saving.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Refresh plan' }));
    expect(await screen.findByRole('button', { name: 'Edit Stew, Dinner' })).toBeTruthy();
    expect(rendered.getPathname()).toBe('/plan');
    expect(mockedApi.mealPlan).toHaveBeenCalledTimes(3);
  });
});
