// SDK 58 initializes the full route tree asynchronously; cold imports on Windows
// exceed Jest's unit-test default. This is not an app startup performance check.
import type { PropsWithChildren } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform, StyleSheet } from 'react-native';
import { ApiError, api, type CatalogItem, type MealPlanEntry, type MealPlanWeek, type Recipe } from '@/lib/api';

jest.mock('react-native-sortables', () => jest.requireActual('../recipes/testing/sortables-mock'));
jest.setTimeout(30000);

// Route coverage does not exercise Shopping's native swipe animation.
jest.mock('@/components/swipe-to-delete-row', () => jest.requireActual('../../components/testing/swipe-to-delete-mock'));

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
    mockedApi.addMealPlanNeedsToShopping.mockReset();
    mockedApi.addMealPlanNeedsToShopping.mockResolvedValue({ items: [], replayed: false });
    mockedApi.catalogItems.mockResolvedValue({ items: [food] });
    mockedApi.catalogUnits.mockResolvedValue({ shopping_units: { built_in: [], household: [] }, recipe_measurement_units: [] });
    mockedApi.createRecipe.mockResolvedValue({ recipe: recipe({ id: 'recipe-new', name: 'New Household Soup' }) });
  });

  afterEach(() => { Platform.OS = originalPlatform; jest.restoreAllMocks(); });

  const planned = (id: string, slot: MealPlanEntry['meal_slot'], day = '2026-10-05'): MealPlanEntry => ({
    id, planned_for: day, meal_slot: slot, recipe_id: 'recipe-soup', recipe_name: 'Soup', edit_revision: 1,
    cover_kind: 'initials', cover_emoji: null, ingredient_count: 1,
  });
  async function reveal(id: string) {
    const card = await screen.findByTestId(`plan-swipe-${id}`);
    await act(async () => { card.props.onDragStart(); card.props.onDragEnd(); card.props.onReveal(); });
    return screen.getByTestId(`plan-swipe-${id}`);
  }
  it.each(['breakfast', 'lunch', 'dinner'] as const)('swipes %s away without opening Edit or removing another occurrence', async (slot) => {
    let entries = [{ ...planned('target', slot), archived_at: slot === 'dinner' ? '2026-10-01T00:00:00Z' : null }, planned('tomorrow', slot, '2026-10-06')];
    mockedApi.mealPlan.mockImplementation(async () => ({ ...emptyWeek(), entries }));
    mockedApi.deleteMealPlanEntry.mockImplementation(async () => { entries = entries.filter((item) => item.id !== 'target'); });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    await reveal('target');
    const removeLabel = `Remove Soup, ${slot[0].toUpperCase()}${slot.slice(1)}, Monday, October 5 from plan`;
    expect(await screen.findByRole('button', { name: removeLabel })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: `Edit Soup, ${slot[0].toUpperCase()}${slot.slice(1)}` }));
    expect(rendered.getPathname()).toBe('/plan');
    expect(screen.getByRole('button', { name: removeLabel })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: removeLabel }));
    await waitFor(() => expect(mockedApi.deleteMealPlanEntry).toHaveBeenCalledWith(expect.any(Function), household.id, 'target', 1));
    await screen.findByRole('button', { name: `Add ${slot[0].toUpperCase()}${slot.slice(1)}` });
    expect(screen.getByText('0 meals')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/plan');
    await fireEvent.press(within(screen.getByTestId('meal-plan-week-strip')).getAllByRole('button')[1]);
    expect(await screen.findByTestId('plan-swipe-tomorrow')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('meal-plan-day-dot-2026-10-05').props.style).backgroundColor).toBe('transparent');
  });

  it('keeps a confirmed removal and remaining meal visible when refreshing fails', async () => {
    mockedApi.mealPlan.mockResolvedValueOnce({ ...emptyWeek(), entries: [planned('target', 'breakfast'), planned('other', 'dinner')] }).mockRejectedValue(new Error('offline'));
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    await reveal('target');
    await fireEvent.press(screen.getByRole('button', { name: /Remove Soup, Breakfast/ }));
    await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('button', { name: 'Add Breakfast' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Soup, Dinner' })).toBeTruthy();
    expect(screen.getByText('1 meal')).toBeTruthy();
    expect(mockedApi.deleteMealPlanEntry).toHaveBeenCalledTimes(1);
  });

  it('keeps a short reveal open through begin-only scrolling, closes after actual scroll, and switches between rows', async () => {
    mockedApi.mealPlan.mockResolvedValue({ ...emptyWeek(), entries: [planned('first', 'breakfast'), planned('second', 'dinner')] });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    await reveal('first');
    const page = screen.getByTestId('meal-plan-screen');
    await act(async () => { page.props.onScrollBeginDrag({ nativeEvent: { contentOffset: { y: 0 } } }); page.props.onScroll({ nativeEvent: { contentOffset: { y: 2 } } }); });
    expect(screen.getByRole('button', { name: /Remove Soup, Breakfast/ })).toBeTruthy();
    await act(async () => { page.props.onScroll({ nativeEvent: { contentOffset: { y: 20 } } }); });
    expect(screen.queryByRole('button', { name: /Remove Soup, Breakfast/ })).toBeNull();
    await reveal('first');
    const second = screen.getByTestId('plan-swipe-second');
    await act(async () => { second.props.onDragStart(); });
    expect(screen.queryByRole('button', { name: /Remove Soup, Breakfast/ })).toBeNull();
    await act(async () => { second.props.onDragEnd(); second.props.onReveal(); });
    expect(screen.getByRole('button', { name: /Remove Soup, Dinner/ })).toBeTruthy();
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
  });

  it.each(['Today', 'Next week', 'Previous week', 'Add Lunch'] as const)('closes the revealed action when pressing %s', async (action) => {
    mockedApi.mealPlan.mockResolvedValue({ ...emptyWeek(), entries: [planned('first', 'breakfast')] });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    await reveal('first');
    await fireEvent.press(screen.getByRole('button', { name: action }));
    expect(screen.queryByRole('button', { name: /Remove Soup, Breakfast/ })).toBeNull();
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
  });

  it('blocks a late full-swipe callback after changing dates and returning', async () => {
    mockedApi.mealPlan.mockResolvedValue({ ...emptyWeek(), entries: [planned('first', 'breakfast'), planned('other', 'breakfast', '2026-10-06')] });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    const old = await reveal('first');
    const dayButtons = within(screen.getByTestId('meal-plan-week-strip')).getAllByRole('button');
    await fireEvent.press(dayButtons[1]);
    await fireEvent.press(within(screen.getByTestId('meal-plan-week-strip')).getAllByRole('button')[0]);
    await act(async () => { await expect(old.props.onRemove()).rejects.toThrow('selected meal changed'); });
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit Soup, Breakfast' })).toBeTruthy();
  });

  it('reconciles a revision conflict, exposes the changed meal and requires a new gesture', async () => {
    const old = planned('first', 'breakfast');
    mockedApi.mealPlan.mockResolvedValueOnce({ ...emptyWeek(), entries: [old] }).mockResolvedValue({ ...emptyWeek(), entries: [{ ...old, edit_revision: 2, recipe_name: 'Changed Soup' }] });
    mockedApi.deleteMealPlanEntry.mockRejectedValue(new ApiError(409, 'Meal changed on another device.', 'MEAL_PLAN_REVISION_CONFLICT'));
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    await reveal('first');
    await fireEvent.press(screen.getByRole('button', { name: /Remove Soup, Breakfast/ }));
    await screen.findByText('Meal changed on another device.');
    expect(screen.getByRole('button', { name: 'Edit Changed Soup, Breakfast' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remove Changed Soup/ })).toBeNull();
    expect(mockedApi.deleteMealPlanEntry).toHaveBeenCalledTimes(1);
    expect(rendered.getPathname()).toBe('/plan');
  });

  it('closes the action on refresh and background without allowing its old removal callback', async () => {
    const listeners: ((state: 'active' | 'background') => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, callback) => {
      if (type === 'change') listeners.push(callback);
      return { remove: jest.fn() };
    });
    mockedApi.mealPlan.mockResolvedValue({ ...emptyWeek(), entries: [planned('first', 'breakfast')] });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    const old = await reveal('first');
    await act(async () => { screen.getByTestId('meal-plan-screen').props.refreshControl.props.onRefresh(); });
    expect(screen.queryByRole('button', { name: /Remove Soup, Breakfast/ })).toBeNull();
    expect(screen.getByTestId('plan-swipe-first')).not.toBe(old);
    await act(async () => { await expect(old.props.onRemove()).rejects.toThrow(); });
    await reveal('first');
    await act(async () => { listeners.forEach((listener) => listener('background')); });
    expect(screen.queryByRole('button', { name: /Remove Soup, Breakfast/ })).toBeNull();
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
  });

  it('suppresses the release press after a canceled swipe but keeps later ordinary editing usable', async () => {
    mockedApi.mealPlan.mockResolvedValue({ ...emptyWeek(), entries: [planned('first', 'breakfast')] });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    // renderRouter installs its clock; control time only after router setup.
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const card = await screen.findByTestId('plan-swipe-first');
    await act(async () => { card.props.onDragStart(); card.props.onDragEnd(); });
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Soup, Breakfast' }));
    expect(rendered.getPathname()).toBe('/plan');
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
    now += 600;
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Soup, Breakfast' }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/plan/sheet/edit'));
  });
  it('closes a revealed meal action across tab departure/return and rejects the old callback', async () => {
    mockedApi.mealPlan.mockResolvedValue({ ...emptyWeek(), entries: [planned('first', 'breakfast')] });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    const old = await reveal('first');
    await act(async () => { router.navigate('/recipes'); });
    await act(async () => { router.navigate('/plan'); });
    await screen.findByTestId('plan-swipe-first');
    expect(screen.queryByRole('button', { name: /Remove Soup, Breakfast/ })).toBeNull();
    await act(async () => { await expect(old.props.onRemove()).rejects.toThrow(); });
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
  });
  it('keeps the existing Edit and confirmed removal path on web without a swipe-only action', async () => {
    Platform.OS = 'web';
    mockedApi.mealPlan.mockResolvedValue({ ...emptyWeek(), entries: [planned('first', 'breakfast')] });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await waitForLoadedPlan();
    expect(screen.queryByTestId('plan-swipe-first')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Soup, Breakfast' }));
    expect(rendered.getPathname()).toBe('/plan/sheet/edit');
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove from plan' }));
    expect(await screen.findByText('Remove this meal from the plan?')).toBeTruthy();
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
  });

  it('fits all seven days in one week row and lets the last day be selected', async () => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await waitForLoadedPlan();

    const weekStrip = screen.getByTestId('meal-plan-week-strip');
    expect(StyleSheet.flatten(weekStrip.props.style)).toMatchObject({ flexDirection: 'row', width: '100%' });
    const days = within(weekStrip).getAllByRole('button');
    expect(days).toHaveLength(7);
    days.forEach((day) => expect(StyleSheet.flatten(day.props.style)).toMatchObject({ flex: 1, minWidth: 0 }));

    await fireEvent.press(days[6]);
    expect(screen.getByText('Sunday, October 11')).toBeTruthy();
    expect(days[6].props.accessibilityState.selected).toBe(true);
  });

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
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
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

  it('does not open shopping review if a pending week has no week start', async () => {
    const pendingWeek = deferred<MealPlanWeek>();
    mockedApi.mealPlan.mockReturnValueOnce(pendingWeek.promise);
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    expect(rendered.getPathname()).toBe('/plan');
    expect(mockedApi.mealPlanShoppingReview).not.toHaveBeenCalled();

    await act(async () => { pendingWeek.resolve(emptyWeek()); await pendingWeek.promise; });
    await waitForLoadedPlan();
  });

  it('reviews existing matches separately and adds only new selected Catalog needs', async () => {
    mockedApi.addMealPlanNeedsToShopping.mockResolvedValue({ items: [{ id: 'shopping-new-beans', name: 'Beans' }], replayed: false });
    mockedApi.mealPlanShoppingReview.mockResolvedValue({
      week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'a'.repeat(64), needs: [{
        need_key: 'beans-cup', catalog_item_id: 'food-beans', name: 'Beans', amount: '1.5',
        recipe_unit_code: 'cup', recipe_unit_dimension: 'volume', unit_label: 'Cup', custom_unit_label: null,
        sources: [{ planned_for: '2026-10-05', meal_slot: 'dinner', recipe_name: 'Soup', amount: '1', unit_label: 'Cup', note: null }],
        existing_matches: [{ kind: 'exact', item_id: 'shopping-beans', name: 'Beans' }], default_selected: false,
      }, {
        need_key: 'rice-cup', catalog_item_id: 'food-rice', name: 'Rice', amount: '2',
        recipe_unit_code: 'cup', recipe_unit_dimension: 'volume', unit_label: 'Cup', custom_unit_label: null,
        sources: [{ planned_for: '2026-10-06', meal_slot: 'dinner', recipe_name: 'Rice bowl', amount: '2', unit_label: 'Cup', note: null }],
        existing_matches: [], default_selected: true,
      }],
    });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    expect(await screen.findByText('Review what to buy')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('1.5 Cup').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText('Soup · Mon').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByText('Already on Shopping')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Beans on Shopping' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Select Beans' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(mockedApi.addMealPlanNeedsToShopping).toHaveBeenCalledWith(expect.any(Function), household.id, expect.objectContaining({
      week_start: '2026-10-05', selected_need_keys: ['rice-cup'], request_id: expect.any(String),
    })));
    await waitFor(() => expect(rendered.getPathname()).toBe('/shopping'));
    expect(await screen.findByText('1 item added from this week’s meals.')).toBeTruthy();
    await act(async () => { router.navigate('/plan'); });
    expect(rendered.getPathname()).toBe('/plan');
    await act(async () => { router.navigate('/shopping'); });
    expect(screen.queryByText('1 item added from this week’s meals.')).toBeNull();
  });

  it('confirms an adjusted amount and submits only the selected need', async () => {
    mockedApi.mealPlanShoppingReview.mockResolvedValue({
      week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'd'.repeat(64), needs: [{
        need_key: 'chicken-pound', catalog_item_id: 'food-chicken', name: 'Chicken', amount: '3',
        recipe_unit_code: 'pound', recipe_unit_dimension: 'mass', unit_label: 'Pound', custom_unit_label: null,
        sources: [{ planned_for: '2026-10-05', meal_slot: 'dinner', recipe_name: 'Tacos', amount: '3', unit_label: 'Pound', note: null }],
        existing_matches: [], default_selected: true,
      }],
    });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    await screen.findByText('3 Pound to buy · 3 Pound needed');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit amount to buy for Chicken' }));
    await screen.findByRole('header', { name: 'Amount to buy' });
    await fireEvent.changeText(screen.getByLabelText('Amount to buy'), '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Done editing amount' }));
    await screen.findByText('1 Pound to buy · 3 Pound needed');
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(mockedApi.addMealPlanNeedsToShopping).toHaveBeenCalledTimes(1));
    expect(mockedApi.addMealPlanNeedsToShopping.mock.calls[0][2]).toEqual(expect.objectContaining({
      selected_need_keys: ['chicken-pound'], amount_overrides: { 'chicken-pound': '1' },
    }));
  });

  it('adjusts only the amount to buy and keeps the expanded three-meal breakdown', async () => {
    mockedApi.mealPlanShoppingReview.mockResolvedValue({
      week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'e'.repeat(64), needs: [{
        need_key: 'chicken-pound', catalog_item_id: 'food-chicken', name: 'Chicken', amount: '3',
        recipe_unit_code: 'pound', recipe_unit_dimension: 'mass', unit_label: 'Pound', custom_unit_label: null,
        sources: [
          { planned_for: '2026-10-05', meal_slot: 'dinner', recipe_name: 'Chicken tacos', amount: '1', unit_label: 'Pound', note: null },
          { planned_for: '2026-10-07', meal_slot: 'lunch', recipe_name: 'Chicken salad', amount: '1', unit_label: 'Pound', note: null },
          { planned_for: '2026-10-09', meal_slot: 'dinner', recipe_name: 'Chicken stew', amount: '1', unit_label: 'Pound', note: null },
        ],
        existing_matches: [], default_selected: true,
      }],
    });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    expect(await screen.findByText('3 Pound to buy · 3 Pound needed')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Show Chicken meal sources' }));
    expect(await screen.findByText('Fri · Chicken stew')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit amount to buy for Chicken' }));
    expect(await screen.findByRole('header', { name: 'Amount to buy' })).toBeTruthy();
    const amountInput = screen.getByLabelText('Amount to buy');
    expect(amountInput.props.keyboardType).toBe('decimal-pad');
    await fireEvent.changeText(amountInput, '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Done editing amount' }));

    expect(rendered.getPathname()).toBe('/plan/shopping-review');
    expect(await screen.findByText('1 Pound to buy · 3 Pound needed')).toBeTruthy();
    expect(screen.getByText('Used in 3 meals')).toBeTruthy();
    expect(screen.getByText('Mon · Chicken tacos')).toBeTruthy();
    expect(screen.getByText('Wed · Chicken salad')).toBeTruthy();
    expect(screen.getByText('Fri · Chicken stew')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(mockedApi.addMealPlanNeedsToShopping).toHaveBeenCalledWith(expect.any(Function), household.id, expect.objectContaining({
      selected_need_keys: ['chicken-pound'], amount_overrides: { 'chicken-pound': '1' },
    })));
  });

  it('blocks empty amount input, preserves the saved amount on Cancel, and resets to the recipe total', async () => {
    mockedApi.mealPlanShoppingReview.mockResolvedValue({
      week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'f'.repeat(64), needs: [{
        need_key: 'milk-cup', catalog_item_id: 'food-milk', name: 'Milk', amount: '3',
        recipe_unit_code: 'cup', recipe_unit_dimension: 'volume', unit_label: 'Cup', custom_unit_label: null,
        sources: [{ planned_for: '2026-10-05', meal_slot: 'breakfast', recipe_name: 'Pancakes', amount: '3', unit_label: 'Cup', note: null }],
        existing_matches: [], default_selected: true,
      }],
    });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    await screen.findByText('3 Cup to buy · 3 Cup needed');

    await fireEvent.press(screen.getByRole('button', { name: 'Edit amount to buy for Milk' }));
    await screen.findByRole('header', { name: 'Amount to buy' });
    await fireEvent.changeText(screen.getByLabelText('Amount to buy'), '');
    expect(await screen.findByText('Enter a positive amount, or deselect this ingredient to buy none.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done editing amount' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel amount change' }));
    expect(rendered.getPathname()).toBe('/plan/shopping-review');
    expect(await screen.findByText('3 Cup to buy · 3 Cup needed')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit amount to buy for Milk' }));
    await screen.findByRole('header', { name: 'Amount to buy' });
    await fireEvent.changeText(screen.getByLabelText('Amount to buy'), '1.5');
    await fireEvent.press(screen.getByRole('button', { name: 'Done editing amount' }));
    expect(await screen.findByText('1.5 Cup to buy · 3 Cup needed')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit amount to buy for Milk' }));
    await screen.findByRole('header', { name: 'Amount to buy' });
    await fireEvent.press(screen.getByRole('button', { name: 'Reset amount to 3' }));
    expect(screen.getByLabelText('Amount to buy').props.value).toBe('3');
    await fireEvent.press(screen.getByRole('button', { name: 'Done editing amount' }));
    expect(await screen.findByText('3 Cup to buy · 3 Cup needed')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(mockedApi.addMealPlanNeedsToShopping).toHaveBeenCalledTimes(1));
    expect(mockedApi.addMealPlanNeedsToShopping.mock.calls[0][2]).not.toHaveProperty('amount_overrides');
  });

  it('preserves an unsent amount for an unchanged need and resets it when a fresh review changes the total', async () => {
    const need = {
      need_key: 'beans-cup', catalog_item_id: 'food-beans', name: 'Beans', amount: '3',
      recipe_unit_code: 'cup', recipe_unit_dimension: 'volume' as const, unit_label: 'Cup', custom_unit_label: null,
      sources: [{ planned_for: '2026-10-05', meal_slot: 'dinner' as const, recipe_name: 'Soup', amount: '3', unit_label: 'Cup', note: null }],
      existing_matches: [], default_selected: true,
    };
    const review = { week_start: '2026-10-05', week_end: '2026-10-11', review_token: '1'.repeat(64), needs: [need] };
    mockedApi.mealPlanShoppingReview.mockResolvedValueOnce(review)
      .mockResolvedValueOnce({ ...review, review_token: '2'.repeat(64) })
      .mockResolvedValueOnce({ ...review, review_token: '3'.repeat(64), needs: [{ ...need, amount: '4' }] });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    await screen.findByText('3 Cup to buy · 3 Cup needed');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit amount to buy for Beans' }));
    await screen.findByRole('header', { name: 'Amount to buy' });
    await fireEvent.changeText(screen.getByLabelText('Amount to buy'), '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Done editing amount' }));
    expect(await screen.findByText('1 Cup to buy · 3 Cup needed')).toBeTruthy();

    const refreshable = screen.getAllByTestId('screen').find((candidate) => candidate.props.refreshControl);
    await act(async () => { refreshable!.props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(mockedApi.mealPlanShoppingReview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('1 Cup to buy · 3 Cup needed')).toBeTruthy();

    await act(async () => { refreshable!.props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(mockedApi.mealPlanShoppingReview).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('4 Cup to buy · 4 Cup needed')).toBeTruthy();
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
      .mockRejectedValueOnce(new Error('response connection lost again'))
      .mockResolvedValueOnce({ items: [{ id: 'generated-eggs', name: 'Eggs' }], replayed: true });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    await screen.findByText('2 Unit to buy · 2 Unit needed');
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry add safely' })).toBeTruthy());
    const firstRequest = mockedApi.addMealPlanNeedsToShopping.mock.calls[0][2];
    expect(firstRequest.request_id).toMatch(/^[0-9a-f-]{36}$/u);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit amount to buy for Eggs' }));
    await screen.findByRole('header', { name: 'Amount to buy' });
    await fireEvent.changeText(screen.getByLabelText('Amount to buy'), '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Done editing amount' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry add safely' })).toBeTruthy());
    const adjustedRequest = mockedApi.addMealPlanNeedsToShopping.mock.calls[1][2];
    expect(adjustedRequest.request_id).not.toBe(firstRequest.request_id);
    expect(adjustedRequest.amount_overrides).toEqual({ 'eggs-unit': '1' });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry add safely' }));
    await waitFor(() => expect(mockedApi.addMealPlanNeedsToShopping).toHaveBeenCalledTimes(3));
    expect(mockedApi.addMealPlanNeedsToShopping.mock.calls[2][2]).toEqual(adjustedRequest);
    expect(await screen.findByText('1 item added from this week’s meals.')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/shopping');
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
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
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
      created_by_user_id: user.id, created_at: '', meal_plan_source: true, amount: '1', unit_label: 'Unit',
    }] } });
    const previousListRequests = mockedApi.shoppingList.mock.calls.length;
    await act(async () => { addResponse.resolve({ items: [{ id: 'generated-milk', name: 'Milk' }], replayed: false }); await addResponse.promise; });
    expect(await screen.findByText('1 item added from this week’s meals.')).toBeTruthy();
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
        created_by_user_id: user.id, created_at: '', meal_plan_source: true, amount: null, unit_label: null,
      }] } });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await waitForLoadedPlan();
    await act(async () => { router.navigate('/shopping'); });
    await screen.findByText('Your shared Shopping list is ready for Catalog items.');
    await act(async () => { router.navigate('/plan'); });
    await fireEvent.press(screen.getByRole('button', { name: 'Review shopping needs' }));
    await screen.findByText('Amount not specified');
    await fireEvent.press(screen.getByRole('button', { name: 'Add 1 selected to Shopping' }));
    await waitFor(() => expect(screen.getByText('1 item added from this week’s meals.')).toBeTruthy());
    expect(rendered.getPathname()).toBe('/shopping');
    expect((await screen.findAllByText('Milk')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Amount not specified')).toBeNull();
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable safe error when the household week cannot load', async () => {
    mockedApi.mealPlan.mockRejectedValueOnce(new Error('private database detail')).mockResolvedValueOnce(emptyWeek());
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    expect(await screen.findByText('We couldn’t load this week. Please try again.')).toBeTruthy();
    expect(screen.queryByText('private database detail')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2));
    expect(rendered.getPathname()).toBe('/plan');
  });

  it('keeps Add meal open with its selected recipe when saving fails', async () => {
    mockedApi.createMealPlanEntry.mockRejectedValueOnce(new ApiError(409, 'That day and meal already has a planned recipe.', 'MEAL_PLAN_SLOT_OCCUPIED'));
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
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
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
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
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
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
    expect(screen.getByText('Remove this meal from the plan?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep meal' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep meal' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change recipe' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from plan' }));
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
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
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
