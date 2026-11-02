// SDK 58 initializes the full route tree asynchronously; cold imports on Windows
// exceed Jest's unit-test default. This is not an app startup performance check.
import type { PropsWithChildren } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, StyleSheet } from 'react-native';

import { dragGrabFeedback } from '@/lib/haptics';
import { api, type CatalogItem, type CatalogUnits, type Me, type Recipe } from '@/lib/api';

jest.mock('@/lib/haptics', () => ({ dragGrabFeedback: jest.fn().mockResolvedValue(undefined) }));
jest.mock('react-native-sortables', () => jest.requireActual('./testing/sortables-mock'));
jest.setTimeout(30000);

jest.mock('react-native-worklets', () => ({ ...jest.requireActual('react-native-worklets/src/mock'), scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args) }));

const mockGetToken = jest.fn().mockResolvedValue('session-token');
const household = { id: 'household-a', name: 'Home', time_zone: 'UTC', role: 'owner' as const };
const signedInMe: Me = {
  user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
  households: [household],
};
const food: CatalogItem = {
  id: 'food-milk', household_id: 'household-a', item_type: 'food', name: 'Milk', category_id: null,
  category_name: null, shopping_unit_code: null, shopping_unit_label: null, shopping_unit_source: null,
  custom_shopping_unit_id: null, preferred_store_id: null, preferred_store_name: null,
  recipe_measurement_dimension: null, recipe_measurement_unit_code: null, recipe_measurement_unit_label: null,
  created_at: '', updated_at: '',
};
const units: CatalogUnits = {
  shopping_units: { built_in: [], household: [] },
  recipe_measurement_units: [{ code: 'cup', label: 'Cup', dimension: 'volume' }],
};

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-1', household_id: 'household-a', name: 'Tomato Soup', cover_kind: 'initials', cover_emoji: null,
    servings: null, prep_minutes: null, cook_minutes: null, notes: null, source_url: null, edit_revision: 1,
    created_at: '', updated_at: '', archived_at: null, ingredient_count: 1,
    ingredients: [{
      id: 'recipe-ingredient-1', catalog_item_id: food.id, catalog_item_name: food.name,
      category_emoji: null, amount: '1/2', unit_code: null, custom_unit_label: null,
      note: null, position: 0, unit_label: null,
    }],
    steps: [],
    ...overrides,
  };
}

jest.mock('@clerk/expo', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const AuthContext = React.createContext<{
    isLoaded: boolean; isSignedIn: boolean; sessionId: string | null; userId: string | null;
    getToken: typeof mockGetToken;
  }>(null!);
  return {
    ClerkProvider: ({ children }: PropsWithChildren) => React.createElement(AuthContext.Provider, {
      value: { isLoaded: true, isSignedIn: true, sessionId: 'session-a', userId: 'user-a', getToken: mockGetToken },
    }, children),
    useAuth: () => React.useContext(AuthContext),
    useClerk: () => ({ signOut: jest.fn().mockResolvedValue(undefined) }),
    useUser: () => ({ user: { firstName: 'Person', imageUrl: null, update: jest.fn() } }),
  };
});
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), removeItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      me: jest.fn(), shoppingList: jest.fn(), mealPlan: jest.fn(), householdMembers: jest.fn(), household: jest.fn(),
      recipes: jest.fn(), recipe: jest.fn(), createRecipe: jest.fn(), updateRecipe: jest.fn(),
      archiveRecipe: jest.fn(), restoreRecipe: jest.fn(), catalogItems: jest.fn(), catalogUnits: jest.fn(),
      catalogCategories: jest.fn(), catalogStores: jest.fn(), createCatalogCategory: jest.fn(), createCatalogItem: jest.fn(),
      createCatalogStore: jest.fn(), createCatalogShoppingUnit: jest.fn(),
      updateCatalogStore: jest.fn(), updateCatalogShoppingUnit: jest.fn(), updateCatalogCategory: jest.fn(),
    },
  };
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
const originalPlatform = Platform.OS;

describe('Recipes through the actual Expo Router', () => {
  beforeEach(() => {
    // Native stack toolbars do not render their buttons in Jest; exercise the
    // equivalent Android header action here and inspect iOS on a device.
    Platform.OS = 'android';
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue('session-token');
    mockedStorage.getItem.mockResolvedValue('household-a');
    mockedStorage.setItem.mockResolvedValue();
    mockedStorage.removeItem.mockResolvedValue();
    mockedApi.me.mockResolvedValue(signedInMe);
    mockedApi.shoppingList.mockResolvedValue({ shopping_list: { id: 'list-a', household_id: 'household-a', items: [] } });
    mockedApi.mealPlan.mockResolvedValue({ time_zone: 'UTC', local_today: '2026-10-05', week_start: '2026-10-05', week_end: '2026-10-11', week_offset: 0, entries: [] });
    mockedApi.householdMembers.mockResolvedValue({ members: [] });
    mockedApi.household.mockResolvedValue({ household });
    mockedApi.recipes.mockResolvedValue({ recipes: [] });
    mockedApi.recipe.mockResolvedValue({ recipe: recipe() });
    mockedApi.createRecipe.mockResolvedValue({ recipe: recipe({ id: 'recipe-created' }) });
    mockedApi.updateRecipe.mockResolvedValue({ recipe: recipe({ name: 'Updated Tomato Soup', edit_revision: 2 }) });
    mockedApi.archiveRecipe.mockResolvedValue(undefined);
    mockedApi.restoreRecipe.mockResolvedValue(undefined);
    mockedApi.catalogItems.mockResolvedValue({ items: [food] });
    mockedApi.catalogUnits.mockResolvedValue(units);
    mockedApi.catalogCategories.mockResolvedValue({ categories: [] });
    mockedApi.catalogStores.mockResolvedValue({ stores: [] });
    mockedApi.createCatalogItem.mockResolvedValue({ item: { ...food, id: 'food-celery', name: 'QA Celery' } });
  });

  afterEach(() => { Platform.OS = originalPlatform; });

  it.each(['/recipes/create', '/plan/recipe-create'])('reorders duplicate occurrences, edits the moved row and submits draft order from %s', async (path) => {
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate(path as never); });
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Two milks');
    for (const amount of ['1', '2 2/3']) {
      await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
      await fireEvent.press(await screen.findByText('Milk'));
      await fireEvent.changeText(await screen.findByLabelText('Ingredient amount'), amount);
      await fireEvent.changeText(screen.getByLabelText('Ingredient note'), `Note ${amount}`);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add ingredient' }).props.disabled).not.toBe(true));
      await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
      await screen.findByText(`Note: Note ${amount}`);
    }
    const original = screen.getByTestId('recipe-sortable-grid').props.data;
    await fireEvent(screen.getByLabelText('Reorder Milk, position 1 of 2'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('recipe-sortable-grid').props.data.map((row: { key: string }) => row.key)).toEqual([original[1].key, original[0].key]);
    expect(dragGrabFeedback).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Edit Milk' })[1]);
    expect(await screen.findByDisplayValue('1')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Ingredient amount'), '4');
    await fireEvent.press(screen.getByRole('button', { name: 'Save ingredient' }));
    await screen.findByLabelText('Reorder Milk, position 2 of 2');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.createRecipe).toHaveBeenCalled());
    const submitted = mockedApi.createRecipe.mock.calls[0][2].ingredients;
    expect(submitted.map((row) => [row.amount, row.note])).toEqual([['2 2/3', 'Note 2 2/3'], ['4', 'Note 1']]);
    expect(submitted.every((row) => !('key' in row))).toBe(true);
  });

  it('marks an order-only edit dirty, preserves it on a revision conflict, then reloads saved order', async () => {
    const original = recipe();
    const rows = [original.ingredients![0], { ...original.ingredients![0], id: 'second', amount: '3', note: 'second occurrence', position: 1 }];
    const saved = recipe({ ingredients: rows });
    mockedApi.recipe.mockResolvedValue({ recipe: saved });
    const { ApiError } = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
    mockedApi.updateRecipe.mockRejectedValueOnce(new ApiError(409, 'Changed elsewhere.', 'RECIPE_REVISION_CONFLICT'));
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/recipe-1/edit'); });
    await screen.findByLabelText('Reorder Milk, position 1 of 2');
    await fireEvent(screen.getByLabelText('Reorder Milk, position 1 of 2'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'recipe-1', expect.objectContaining({ expected_revision: 1, ingredients: [expect.objectContaining({ amount: '3', note: 'second occurrence' }), expect.objectContaining({ amount: '1/2' })] })));
    expect(await screen.findByRole('button', { name: 'Reload latest recipe' })).toBeTruthy();
    expect(screen.getByTestId('recipe-sortable-grid').props.data[0].note).toBe('second occurrence');
    await fireEvent.press(screen.getByRole('button', { name: 'Reload latest recipe' }));
    await waitFor(() => expect(screen.getByTestId('recipe-sortable-grid').props.data[0].amount).toBe('1/2'));
  });

  it('guards Save/Edit/Remove while dragging and restores an unconfirmed drop without dirtying order', async () => {
    const saved = recipe({ ingredients: [recipe().ingredients![0], { ...recipe().ingredients![0], id: 'second', amount: '3', position: 1 }] });
    mockedApi.recipe.mockResolvedValue({ recipe: saved });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/recipe-1/edit'); });
    const grid = await screen.findByTestId('recipe-sortable-grid');
    const keys = grid.props.data.map((row: { key: string }) => row.key);
    await act(async () => { grid.props.onDragStart({ key: keys[0] }); });
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);
    expect(dragGrabFeedback).toHaveBeenCalledTimes(1);
    await act(async () => { grid.props.onDragStart({ key: keys[0] }); });
    expect(dragGrabFeedback).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Edit Milk' })[0]);
    expect(screen.queryByText('Ingredient details')).toBeNull();
    await act(async () => { grid.props.onActiveItemDropped({ key: keys[0], indexToKey: [...keys].reverse() }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(false));
    expect(screen.getByTestId('recipe-sortable-grid').props.data.map((row: { key: string }) => row.key)).toEqual(keys);
    expect(dragGrabFeedback).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalled());
    expect(mockedApi.updateRecipe.mock.calls[0][3]).not.toHaveProperty('ingredients');
  });

  it('ignores a delayed drop from a recipe that has been left and keeps the next draft editable', async () => {
    const saved = recipe({ ingredients: [recipe().ingredients![0], { ...recipe().ingredients![0], id: 'second', amount: '3', position: 1 }] });
    mockedApi.recipe.mockResolvedValue({ recipe: saved });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/recipe-1/edit'); });
    const oldGrid = await screen.findByTestId('recipe-sortable-grid');
    const oldDrop = oldGrid.props.onActiveItemDropped;
    const keys = oldGrid.props.data.map((row: { key: string }) => row.key);
    await act(async () => { oldGrid.props.onDragStart({ key: keys[0] }); });
    await act(async () => { router.back(); });
    mockedApi.recipe.mockResolvedValue({ recipe: { ...saved, id: 'recipe-2', name: 'Second recipe' } });
    await act(async () => { router.navigate('/recipes/recipe-2/edit'); });
    await screen.findByDisplayValue('Second recipe');
    const currentKeys = screen.getByTestId('recipe-sortable-grid').props.data.map((row: { key: string }) => row.key);
    expect(currentKeys).not.toEqual(keys);
    await act(async () => { oldDrop({ key: keys[0], indexToKey: [...keys].reverse() }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(false));
    expect(screen.getByTestId('recipe-sortable-grid').props.data.map((row: { key: string }) => row.key)).toEqual(currentKeys);
    expect(mockedApi.updateRecipe).not.toHaveBeenCalled();
  });

  it('keeps an order-only draft after an unknown save and does not mistake the old server order for success', async () => {
    const saved = recipe({ ingredients: [recipe().ingredients![0], { ...recipe().ingredients![0], id: 'second', amount: '3', position: 1 }] });
    mockedApi.recipe.mockResolvedValue({ recipe: saved });
    mockedApi.updateRecipe.mockRejectedValueOnce(new Error('connection lost'));
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/recipe-1/edit'); });
    await screen.findByLabelText('Reorder Milk, position 1 of 2');
    await fireEvent(screen.getByLabelText('Reorder Milk, position 1 of 2'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await screen.findAllByRole('button', { name: 'Check saved version' });
    expect(screen.getByTestId('recipe-sortable-grid').props.sortEnabled).toBe(false);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Check saved version' })[0]);
    expect(await screen.findByText('The latest recipe is unchanged. You can safely try saving again.')).toBeTruthy();
    expect(screen.getByTestId('recipe-sortable-grid').props.data[0].amount).toBe('3');
    expect(mockedApi.updateRecipe).toHaveBeenCalledTimes(1);
  });

  it('saves blank amounts as To taste while retaining the default unit through create and edit', async () => {
    const saved = recipe({ id: 'recipe-created', ingredients: [{ ...recipe().ingredients![0], amount: null, unit_code: 'cup', unit_label: 'Cup' }] });
    mockedApi.catalogItems.mockResolvedValue({ items: [{ ...food, recipe_measurement_dimension: 'volume', recipe_measurement_unit_code: 'cup', recipe_measurement_unit_label: 'Cup' }] });
    mockedApi.createRecipe.mockResolvedValue({ recipe: saved });
    mockedApi.recipe.mockResolvedValue({ recipe: saved });
    mockedApi.updateRecipe.mockResolvedValue({ recipe: { ...saved, edit_revision: 2 } });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/create'); });
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Tomato Soup');
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await fireEvent.press(await screen.findByText('Milk'));
    expect(await screen.findByRole('button', { name: 'Unit: Cup' })).toBeTruthy();
    expect(screen.getByLabelText('Ingredient amount').props.value).toBe('');
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(await screen.findByText('To taste')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.createRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({
      ingredients: [expect.objectContaining({ amount: null, unit_code: 'cup' })],
    })));
    expect(await screen.findByText('Ingredients')).toBeTruthy();
    expect(screen.getByText('To taste')).toBeTruthy();
    await act(async () => { router.push('/recipes/recipe-created/edit'); });
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Milk' }));
    expect(await screen.findByRole('button', { name: 'Unit: Cup' })).toBeTruthy();
    expect(screen.getByLabelText('Ingredient amount').props.value).toBe('');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save ingredient' }).props.accessibilityState?.disabled).toBe(false));
    await fireEvent.press(screen.getByRole('button', { name: 'Save ingredient' }));
    expect(await screen.findByText('To taste')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', saved.id, expect.objectContaining({
      ingredients: [expect.objectContaining({ amount: null, unit_code: 'cup' })],
    })));
  });

  it.each(['grid', 'list'] as const)('refreshes an empty/short %s library and retains search and view through success and retry', async (mode) => {
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes'); });
    await screen.findByText('No recipes yet. Add a family favorite to get started.');
    if (mode === 'list') await fireEvent.press(screen.getByRole('button', { name: 'List view' }));
    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'Soup');
    let resolveRefresh!: (value: { recipes: Recipe[] }) => void;
    const pending = new Promise<{ recipes: Recipe[] }>((resolve) => { resolveRefresh = resolve; });
    mockedApi.recipes.mockReturnValueOnce(pending);
    await act(async () => { screen.getByTestId('recipe-library').props.refreshControl.props.onRefresh(); });
    expect(screen.getByTestId('recipe-library').props.refreshControl.props.refreshing).toBe(true);
    await act(async () => { resolveRefresh({ recipes: [recipe({ name: 'Shared Soup' }), recipe({ id: 'bread', name: 'Bread' })] }); });
    expect(await screen.findByText('Shared Soup')).toBeTruthy();
    expect(screen.queryByText('Bread')).toBeNull();
    expect(screen.getByLabelText('Search recipes').props.value).toBe('Soup');
    expect(screen.getByRole('button', { name: mode === 'list' ? 'List view' : 'Grid view' }).props.accessibilityState.selected).toBe(true);
    expect(mockedApi.recipes).toHaveBeenLastCalledWith(expect.any(Function), 'household-a', false, undefined);
    await waitFor(() => expect(screen.getByTestId('recipe-library').props.refreshControl.props.refreshing).toBe(false));
    mockedApi.recipes.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { screen.getByTestId('recipe-library').props.refreshControl.props.onRefresh(); });
    expect(await screen.findByText(/Recipes may be out of date/)).toBeTruthy();
    expect(screen.getByTestId('recipe-library').props.refreshControl.props.refreshing).toBe(false);
    mockedApi.recipes.mockResolvedValueOnce({ recipes: [recipe({ name: 'New Shared Soup' })] });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry loading recipes' }));
    expect(await screen.findByText('New Shared Soup')).toBeTruthy();
    expect(screen.getByLabelText('Search recipes').props.value).toBe('Soup');
    expect(screen.getByRole('button', { name: mode === 'list' ? 'List view' : 'Grid view' }).props.accessibilityState.selected).toBe(true);
  });

  it.each([
    { code: 'tbsp', label: 'Tablespoon' },
    { code: null, label: null },
  ])('starts new ingredients with the saved recipe unit $code and preserves an explicit override', async ({ code, label }) => {
    mockedApi.catalogItems.mockResolvedValue({ items: [{ ...food, recipe_measurement_dimension: code ? 'volume' : null, recipe_measurement_unit_code: code, recipe_measurement_unit_label: label, shopping_unit_code: 'package', shopping_unit_label: 'Package' }] });
    mockedApi.catalogUnits.mockResolvedValue({ ...units, recipe_measurement_units: [...units.recipe_measurement_units, { code: 'tbsp', label: 'Tablespoon', dimension: 'volume' }] });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/create'); });
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Family dinner');
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await fireEvent.press(await screen.findByText('Milk'));
    expect(await screen.findByRole('button', { name: `Unit: ${label ?? 'No unit'}` })).toBeTruthy();
    expect(screen.getByLabelText('Ingredient amount').props.keyboardType).toBe('default');
    await fireEvent.changeText(screen.getByLabelText('Ingredient amount'), '1/0');
    expect(screen.getByRole('button', { name: 'Add ingredient' }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Add' }).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Ingredient amount'), '2 2/3');
    await fireEvent.press(screen.getByRole('button', { name: `Unit: ${label ?? 'No unit'}` }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cup' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Milk' }));
    expect(await screen.findByRole('button', { name: 'Unit: Cup' })).toBeTruthy();
    expect(screen.getByLabelText('Ingredient amount').props.value).toBe('2 2/3');
    // Clearing a unit is intentional too; reopening must not restore Catalog defaults.
    await fireEvent.press(screen.getByRole('button', { name: 'Unit: Cup' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'No unit' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save ingredient' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Milk' }));
    expect(await screen.findByRole('button', { name: 'Unit: No unit' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save ingredient' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.createRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({
      ingredients: [expect.objectContaining({ catalog_item_id: food.id, amount: '2 2/3', unit_code: null, custom_unit_label: null })],
    })));
  });

  it.each([
    { unitCode: 'cup', unitLabel: 'Cup', customUnitLabel: null, displayed: 'Cup' },
    { unitCode: null, unitLabel: null, customUnitLabel: 'pinch', displayed: 'pinch' },
    { unitCode: null, unitLabel: null, customUnitLabel: null, displayed: 'No unit' },
  ])('keeps an existing recipe ingredient unit ($displayed) instead of the Catalog default', async ({ unitCode, unitLabel, customUnitLabel, displayed }) => {
    const saved = recipe();
    mockedApi.recipe.mockResolvedValue({ recipe: recipe({ ingredients: [{ ...saved.ingredients![0], unit_code: unitCode, unit_label: unitLabel, custom_unit_label: customUnitLabel }] }) });
    mockedApi.catalogItems.mockResolvedValue({ items: [{ ...food, recipe_measurement_dimension: 'volume', recipe_measurement_unit_code: 'tbsp', recipe_measurement_unit_label: 'Tablespoon' }] });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/recipe-1/edit'); });
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Milk' }));
    expect(await screen.findByRole('button', { name: `Unit: ${displayed}` })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save ingredient' }).props.accessibilityState?.disabled).toBe(false));
    expect(screen.getByLabelText('Ingredient amount').props.value).toBe('1/2');
  });

  it('creates a recipe from a linked Food Catalog item and opens its detail route', async () => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    expect(mockedApi.recipes).not.toHaveBeenCalled();
    await act(async () => { router.navigate('/recipes'); });
    expect(await screen.findByText('No recipes yet. Add a family favorite to get started.')).toBeTruthy();
    expect(mockedApi.recipes).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Create recipe' }));
    expect(screen.getByText('Recipe name is required.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getAllByText('Enter a recipe name.').length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByLabelText('Recipe name'), 'Tomato Soup');
    expect(screen.getByText('Add at least one Food Catalog item to save this recipe.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Add at least one Food Catalog ingredient.')).toBeTruthy();
    const addIngredient = screen.getByRole('button', { name: 'Add ingredient' });
    expect(addIngredient.props.disabled).not.toBe(true);
    await fireEvent.press(addIngredient);
    await waitFor(() => expect(within(screen.getByTestId('recipe-food-results')).getByText('Milk')).toBeTruthy());
    await fireEvent.press(within(screen.getByTestId('recipe-food-results')).getByText('Milk'));
    expect(screen.getByLabelText('Ingredient amount').props.placeholder).toBe('e.g. 2 or 1/2');
    await screen.findByRole('button', { name: 'Add ingredient' });
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Tomato Soup')).toBeTruthy();
    expect(screen.getByText('Ingredients')).toBeTruthy();
    expect(mockedApi.createRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({
      name: 'Tomato Soup', ingredients: [expect.objectContaining({ catalog_item_id: 'food-milk' })],
    }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/recipe-created'));
    await act(async () => { router.back(); });
    expect(rendered.getPathname()).toBe('/recipes');
  });

  it('keeps Food Catalog results selectable from the keyboard-aware sheet', async () => {
    Platform.OS = 'ios';
    mockedApi.catalogItems.mockResolvedValue({ items: [food, { ...food, id: 'food-bread', name: 'Bread' }] });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByRole('button', { name: 'Add ingredient' });
    const addIngredient = screen.getByRole('button', { name: 'Add ingredient' });
    expect(addIngredient.props.disabled).not.toBe(true);
    await fireEvent.press(addIngredient);
    expect(await screen.findByTestId('recipe-ingredient-search-sheet')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/recipes/sheet/food');
    await screen.findByText('Milk');

    const sheet = screen.getByTestId('recipe-ingredient-search-sheet');
    expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({ flex: 1 });
    const resultsScroll = screen.getByTestId('recipe-food-scroll');
    expect(within(resultsScroll).queryByLabelText('Search Food Catalog')).toBeNull();
    expect(within(resultsScroll).queryByText('Create Food item in Catalog')).toBeNull();
    expect(within(screen.getByTestId('recipe-food-footer')).getByText('Create Food item in Catalog')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('recipe-food-header').props.style)).toMatchObject({ paddingTop: 28, gap: 16 });
    expect(screen.getByTestId('recipe-food-results')).toBeTruthy();
    expect(resultsScroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(resultsScroll.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
    expect(screen.getByLabelText('Search Food Catalog')).toBeTruthy();
    expect(screen.getByText('Milk')).toBeTruthy();
    expect(screen.getByText('Create Food item in Catalog')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Search Food Catalog'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Search Food Catalog'), 'Mil');
    await fireEvent.press(screen.getByText('Milk'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/recipes/sheet/details');
    const detailsScroll = screen.getByTestId('recipe-ingredient-details-scroll');
    let nativeDetails = detailsScroll.parent;
    while (nativeDetails && !['RNSScreen', 'RNSModalScreen'].includes(nativeDetails.type)) nativeDetails = nativeDetails.parent;
    expect(nativeDetails?.props.sheetInitialDetentIndex).toBe(0);
    expect(screen.queryByTestId('native-sheet-content')).toBeNull();
    expect(detailsScroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(detailsScroll.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
    expect(StyleSheet.flatten(detailsScroll.props.style)).toMatchObject({ flex: 1 });
    expect(StyleSheet.flatten(detailsScroll.props.contentContainerStyle)).toMatchObject({ paddingTop: 28, gap: 16 });
    expect(screen.getByLabelText('Ingredient amount')).toBeTruthy();
    expect(screen.getByLabelText('Ingredient note')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Back to Food Catalog' }).props.style)).toMatchObject({ minHeight: 44, minWidth: 44 });
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Food Catalog' }));
    expect(await screen.findByLabelText('Search Food Catalog')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/recipes/sheet/food');
    expect(screen.getByLabelText('Search Food Catalog').props.value).toBe('Mil');
    expect(within(screen.getByTestId('recipe-food-results')).getByText('Milk')).toBeTruthy();
    expect(within(screen.getByTestId('recipe-food-results')).queryByText('Bread')).toBeNull();
    const catalogRequestCount = mockedApi.catalogItems.mock.calls.length;
    await fireEvent.press(screen.getByText('Milk'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Food Catalog' }));
    expect(await screen.findByLabelText('Search Food Catalog')).toBeTruthy();
    expect(mockedApi.catalogItems).toHaveBeenCalledTimes(catalogRequestCount);
    await fireEvent.press(screen.getByText('Milk'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Ingredient amount'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Ingredient amount'), '1/2');
    await fireEvent.press(screen.getByRole('button', { name: 'Unit: No unit' }));
    expect(screen.getByTestId('catalog-choice-sheet')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/recipes/sheet/unit');
    await fireEvent.press(screen.getByRole('button', { name: 'Use custom unit' }));
    await fireEvent.changeText(screen.getByLabelText('Custom recipe unit'), 'pinch');
    await fireEvent.press(screen.getByRole('button', { name: 'Use custom unit' }));
    expect(screen.getByRole('button', { name: 'Unit: pinch' })).toBeTruthy();
    await fireEvent(screen.getByLabelText('Ingredient note'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Ingredient note'), 'finely chopped');
    await fireEvent.press(screen.getByRole('button', { name: 'Unit: pinch' }));
    expect(await screen.findByLabelText('Search Unit')).toBeTruthy();
    expect(await screen.findByTestId('catalog-choice-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cup'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    expect(screen.getByDisplayValue('1/2')).toBeTruthy();
    expect(screen.getByDisplayValue('finely chopped')).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText('Search Food Catalog')).toBeNull());
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Food Catalog' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText('Ingredient details')).toBeNull());
  });

  it('clears zero-valued time fields on focus so a user can type directly', async () => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByLabelText('Recipe name');
    expect(screen.getByTestId('more-details-chevron', { includeHiddenElements: true }).props.name.ios).toBe('chevron.down');
    await fireEvent.press(screen.getByText('More details (optional)'));
    expect(screen.getByTestId('more-details-chevron', { includeHiddenElements: true }).props.name.ios).toBe('chevron.up');
    const prepHours = screen.getByLabelText('Prep time hours');
    const cookMinutes = screen.getByLabelText('Cook time minutes');
    expect(prepHours.props.value).toBe('0');
    expect(cookMinutes.props.value).toBe('0');
    await fireEvent(prepHours, 'focus');
    expect(screen.getByLabelText('Prep time hours').props.value).toBe('');
    await fireEvent.changeText(screen.getByLabelText('Prep time hours'), '5');
    await fireEvent(cookMinutes, 'focus');
    expect(screen.getByLabelText('Cook time minutes').props.value).toBe('');
    expect(screen.getByLabelText('Prep time hours').props.value).toBe('5');
  });

  it.each(['recipes', 'plan'] as const)('prefills Food from the %s editor and cancels back to its unchanged recipe draft', async (origin) => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    const editor = origin === 'plan' ? '/plan/recipe-create' : '/recipes/create';
    await act(async () => router.navigate(editor));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'My family recipe');
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await fireEvent.changeText(await screen.findByLabelText('Search Food Catalog'), '  Mi  ');
    expect(screen.getByText('Milk')).toBeTruthy();
    await fireEvent.press(screen.getByText('Create Food item in Catalog'));
    expect((await screen.findByLabelText('Item name')).props.value).toBe('Mi');
    expect(rendered.getPathname()).toBe(`/${origin}/catalog-food`);
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'Changed ingredient');
    await act(async () => router.back());
    expect(rendered.getPathname()).toBe(editor);
    expect(screen.getByLabelText('Recipe name').props.value).toBe('My family recipe');
    expect(mockedApi.createCatalogItem).not.toHaveBeenCalled();
    expect(mockedApi.createRecipe).not.toHaveBeenCalled();
  });

  it.each([
    { origin: 'recipes', editor: '/recipes/create', code: 'pound', label: 'Pound', dimension: 'mass' },
    { origin: 'plan', editor: '/plan/recipe-create', code: 'dozen', label: 'Dozen', dimension: 'count' },
  ] as const)('creates Food in $origin with a direct $label default and inherits it without changing To taste', async ({ origin, editor, code, label, dimension }) => {
    const savedFood = { ...food, id: 'new-food', name: 'New Food', recipe_measurement_dimension: dimension, recipe_measurement_unit_code: code, recipe_measurement_unit_label: label };
    mockedApi.catalogUnits.mockResolvedValue({ ...units, recipe_measurement_units: [...units.recipe_measurement_units, { code: 'pound', label: 'Pound', dimension: 'mass' }, { code: 'dozen', label: 'Dozen', dimension: 'count' }] });
    mockedApi.createCatalogItem.mockResolvedValue({ item: savedFood });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => router.navigate(editor));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Family recipe draft');
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await fireEvent.press(await screen.findByText('Create Food item in Catalog'));
    await fireEvent.changeText(await screen.findByLabelText('Item name'), 'New Food');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create & use ingredient' }).props.accessibilityState?.disabled).toBe(false));
    await fireEvent.press(screen.getByRole('button', { name: 'More details' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Default unit for recipes (optional): Not selected' }));
    expect(rendered.getPathname()).toBe(origin === 'plan' ? '/plan/sheet/unit' : '/recipes/sheet/choice');
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(rendered.getPathname()).toBe(`/${origin}/catalog-food`);
    expect(screen.getByLabelText('Item name').props.value).toBe('New Food');
    await fireEvent.press(screen.getByRole('button', { name: 'Create & use ingredient' }));
    await waitFor(() => expect(mockedApi.createCatalogItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({ recipe_measurement_dimension: dimension, recipe_measurement_unit_code: code })));
    expect(await screen.findByRole('button', { name: `Unit: ${label}` })).toBeTruthy();
    expect(screen.getByLabelText('Ingredient amount').props.value).toBe('');
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(await screen.findByText('To taste')).toBeTruthy();
    expect(screen.getByLabelText('Recipe name').props.value).toBe('Family recipe draft');
    expect(mockedApi.createRecipe).not.toHaveBeenCalled();
  });

  it('keeps Done and Create Food item actions responsive in the ingredient search sheet', async () => {
    mockedApi.catalogStores.mockResolvedValue({ stores: Array.from({ length: 7 }, (_, index) => ({ id: `store-${index}`, name: `Store ${index}`, created_at: '', updated_at: '' })) });
    mockedApi.catalogCategories.mockResolvedValue({ categories: Array.from({ length: 7 }, (_, index) => ({ id: `category-${index}`, name: `Category ${index}`, item_type: 'food' as const, emoji: null, active_item_count: 0, created_at: '', updated_at: '' })) });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByRole('button', { name: 'Add ingredient' });
    await fireEvent.changeText(screen.getByLabelText('Recipe name'), 'Celery Soup');

    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await screen.findByLabelText('Search Food Catalog');
    await fireEvent(screen.getByLabelText('Search Food Catalog'), 'focus');
    await fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(screen.queryByLabelText('Search Food Catalog')).toBeNull());

    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await screen.findByLabelText('Search Food Catalog');
    await fireEvent(screen.getByLabelText('Search Food Catalog'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Search Food Catalog'), '  Celery & 🥬 + stems?  ');
    await fireEvent.press(screen.getByText('Create Food item in Catalog'));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/catalog-food'));
    expect((await screen.findByLabelText('Item name')).props.value).toBe('Celery & 🥬 + stems?');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create & use ingredient' }).props.accessibilityState?.disabled).toBe(false));
    expect(screen.queryByRole('radio', { name: 'Household' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Typical shopping unit (optional): Not selected' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preferred store (optional): Not selected' })).toBeTruthy();
    const catalogMoreDetails = screen.getByRole('button', { name: 'More details' });
    expect(within(catalogMoreDetails).getByTestId('more-details-chevron', { includeHiddenElements: true }).props.name.ios).toBe('chevron.down');
    await fireEvent.press(catalogMoreDetails);
    expect(within(screen.getByRole('button', { name: 'More details' })).getByTestId('more-details-chevron', { includeHiddenElements: true }).props.name.ios).toBe('chevron.up');
    expect(screen.queryByRole('button', { name: 'Recipe measurement: Not selected' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Default unit for recipes (optional): Not selected' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cup' }));
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'QA Celery');
    await fireEvent.press(screen.getByRole('button', { name: 'Category: Not selected' }));
    expect(rendered.getPathname()).toBe('/recipes/sheet/choice');
    await fireEvent.changeText(screen.getByLabelText('Search Category'), '  Vegetables  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Create category' }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/catalog-choices/category/create'));
    const category = { id: 'category-celery', name: 'Vegetables', item_type: 'food' as const, emoji: null, active_item_count: 0, created_at: '', updated_at: '' };
    mockedApi.createCatalogCategory.mockResolvedValue({ category });
    mockedApi.catalogCategories.mockResolvedValue({ categories: [category] });
    expect(screen.getByLabelText('category name').props.value).toBe('Vegetables');
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/catalog-food'));
    expect(await screen.findByDisplayValue('QA Celery')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Category: Vegetables' })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Preferred store (optional): Not selected' }));
    expect(rendered.getPathname()).toBe('/recipes/sheet/choice');
    await fireEvent.press(screen.getByRole('button', { name: 'Manage stores' }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/catalog-choices/store'));
    await act(async () => { router.back(); });
    expect(rendered.getPathname()).toBe('/recipes/catalog-food');
    expect(screen.getByDisplayValue('QA Celery')).toBeTruthy();
    const store = { id: 'store-new', name: 'Test store', created_at: '', updated_at: '' };
    mockedApi.createCatalogStore.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ store });
    await fireEvent.press(screen.getByRole('button', { name: 'Preferred store (optional): Not selected' }));
    await fireEvent.changeText(screen.getByLabelText('Search Preferred store (optional)'), `  ${store.name}  `);
    await fireEvent.press(screen.getByRole('button', { name: 'Create store' }));
    expect(rendered.getPathname()).toBe('/recipes/catalog-choices/store/create');
    expect((await screen.findByLabelText('store name')).props.value).toBe(store.name);
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('We couldn’t save this choice. Please try again.')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/recipes/catalog-choices/store/create');
    expect(screen.getByDisplayValue(store.name)).toBeTruthy();
    mockedApi.catalogStores.mockResolvedValue({ stores: [store] });
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/catalog-food'));
    expect(await screen.findByRole('button', { name: `Preferred store (optional): ${store.name}` })).toBeTruthy();

    const unit = { id: 'unit-new', name: 'Test package', created_at: '', updated_at: '' };
    mockedApi.createCatalogShoppingUnit.mockResolvedValueOnce({ unit });
    await fireEvent.press(screen.getByRole('button', { name: 'Typical shopping unit (optional): Not selected' }));
    expect(rendered.getPathname()).toBe('/recipes/sheet/choice');
    await fireEvent.press(screen.getByRole('button', { name: 'Manage shopping units' }));
    expect(rendered.getPathname()).toBe('/recipes/catalog-choices/shopping-unit');
    await act(async () => { router.back(); });
    expect(rendered.getPathname()).toBe('/recipes/catalog-food');
    await fireEvent.press(screen.getByRole('button', { name: 'Typical shopping unit (optional): Not selected' }));
    await fireEvent.changeText(screen.getByLabelText('Search Typical shopping unit (optional)'), `  ${unit.name}  `);
    await fireEvent.press(screen.getByRole('button', { name: 'Create shopping unit' }));
    expect(rendered.getPathname()).toBe('/recipes/catalog-choices/shopping-unit/create');
    expect((await screen.findByLabelText('shopping unit name')).props.value).toBe(unit.name);
    mockedApi.catalogUnits.mockResolvedValue({ ...units, shopping_units: { built_in: [], household: [{ id: unit.id, label: unit.name }] } });
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/catalog-food'));
    expect(await screen.findByRole('button', { name: `Typical shopping unit (optional): Household · ${unit.name}` })).toBeTruthy();
    expect(screen.getByDisplayValue('QA Celery')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create & use ingredient' }).props.accessibilityState?.disabled).toBe(false));
    mockedApi.createCatalogItem.mockResolvedValueOnce({ item: { ...food, id: 'food-celery', name: 'QA Celery', recipe_measurement_dimension: 'volume', recipe_measurement_unit_code: 'cup', recipe_measurement_unit_label: 'Cup' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Create & use ingredient' }));
    await waitFor(() => expect(mockedApi.createCatalogItem).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    expect(await screen.findByTestId('recipe-ingredient-details-scroll')).toBeTruthy();
    expect(mockedApi.createCatalogItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({ name: 'QA Celery', item_type: 'food', category_id: category.id, preferred_store_id: store.id, custom_shopping_unit_id: unit.id }));
    expect(screen.getByText('QA Celery')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unit: Cup' })).toBeTruthy();
    expect(mockedApi.createCatalogItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({ recipe_measurement_dimension: 'volume', recipe_measurement_unit_code: 'cup' }));
    await waitFor(() => expect(screen.queryByLabelText('Search Food Catalog')).toBeNull());
    await fireEvent.press(screen.getByRole('button', { name: 'Back to recipe' }));
    await waitFor(() => expect(screen.queryByText('Ingredient details')).toBeNull());
    expect(screen.getByDisplayValue('Celery Soup')).toBeTruthy();
  });

  it.each([
    { kind: 'store', field: 'Preferred store (optional): Not selected', manage: 'Manage stores', input: 'store name', original: 'Corner Market' },
    { kind: 'shopping-unit', field: 'Typical shopping unit (optional): Not selected', manage: 'Manage shopping units', input: 'shopping unit name', original: 'Family pack' },
    { kind: 'category', field: 'Category: Not selected', manage: 'Manage categories', input: 'category name', original: 'Vegetables' },
  ])('loads and updates an existing $kind through the recipe ingredient manager', async ({ kind, field, manage, input, original }) => {
    const choice = { id: 'choice-existing', name: original, created_at: '', updated_at: '' };
    const category = { ...choice, item_type: 'food' as const, emoji: null, active_item_count: 0 };
    const renamed = `${original} updated`;
    if (kind === 'store') {
      mockedApi.catalogStores.mockResolvedValue({ stores: [choice] });
      mockedApi.updateCatalogStore.mockImplementationOnce(async () => {
        mockedApi.catalogStores.mockResolvedValue({ stores: [{ ...choice, name: renamed }] });
        return { store: { ...choice, name: renamed } };
      });
    } else if (kind === 'shopping-unit') {
      mockedApi.catalogUnits.mockResolvedValue({ ...units, shopping_units: { built_in: [], household: [{ id: choice.id, label: original }] } });
      mockedApi.updateCatalogShoppingUnit.mockImplementationOnce(async () => {
        mockedApi.catalogUnits.mockResolvedValue({ ...units, shopping_units: { built_in: [], household: [{ id: choice.id, label: renamed }] } });
        return { unit: { ...choice, name: renamed } };
      });
    } else {
      mockedApi.catalogCategories.mockResolvedValue({ categories: [category] });
      mockedApi.updateCatalogCategory.mockImplementationOnce(async () => {
        mockedApi.catalogCategories.mockResolvedValue({ categories: [{ ...category, name: renamed }] });
        return { category: { ...category, name: renamed } };
      });
    }
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/create'); });
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Unsaved family recipe');
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await fireEvent.press(await screen.findByText('Create Food item in Catalog'));
    await fireEvent.changeText(await screen.findByLabelText('Item name'), 'Unsaved Food item');
    await fireEvent.press(screen.getByRole('button', { name: field }));
    await fireEvent.press(screen.getByRole('button', { name: manage }));
    await fireEvent.press(await screen.findByText(original));
    expect(rendered.getPathname()).toBe(`/recipes/catalog-choices/${kind}/${choice.id}`);
    await waitFor(() => expect(screen.getByLabelText(input).props.value).toBe(original));
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(input), renamed);
    await fireEvent.press(screen.getByRole('button', { name: kind === 'category' ? 'Save category' : 'Save changes' }));
    await waitFor(() => expect(rendered.getPathname()).toBe(`/recipes/catalog-choices/${kind}`));
    expect(await screen.findByText(renamed)).toBeTruthy();
    const update = kind === 'store' ? mockedApi.updateCatalogStore
      : kind === 'shopping-unit' ? mockedApi.updateCatalogShoppingUnit : mockedApi.updateCatalogCategory;
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0].slice(1, 4)).toEqual(['household-a', choice.id, renamed]);
    expect(mockedApi.createCatalogStore).not.toHaveBeenCalled();
    expect(mockedApi.createCatalogShoppingUnit).not.toHaveBeenCalled();
    expect(mockedApi.createCatalogCategory).not.toHaveBeenCalled();
    await act(async () => { router.back(); });
    expect(rendered.getPathname()).toBe('/recipes/catalog-food');
    expect(screen.getByDisplayValue('Unsaved Food item')).toBeTruthy();
    await act(async () => { router.back(); });
    expect(rendered.getPathname()).toBe('/recipes/create');
    expect(screen.getByDisplayValue('Unsaved family recipe')).toBeTruthy();
    expect(mockedApi.createRecipe).not.toHaveBeenCalled();
  });

  it.each([
    { origin: 'catalog', formRoute: '/catalog/add', choiceBase: '/catalog/choices' },
    { origin: 'shopping', formRoute: '/shopping/catalog-item', choiceBase: '/shopping/choices' },
  ])('keeps the $origin Catalog draft beneath its own selector and manager', async ({ origin, formRoute, choiceBase }) => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate(formRoute as never); });
    await fireEvent.changeText(await screen.findByLabelText('Item name'), 'Unsaved Food');
    await screen.findByRole('button', { name: 'Preferred store (optional): Not selected' });
    await fireEvent.press(screen.getByRole('button', { name: 'Preferred store (optional): Not selected' }));
    expect(rendered.getPathname()).toBe(`/${origin}/sheet/choice`);
    // The root navigator must not own this selector above the tab stack.
    expect(rendered.getRouterState()?.routes.some((route) => route.name === 'native-sheet/[sheetId]')).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Manage stores' }));
    expect(rendered.getPathname()).toBe(`${choiceBase}/store`);
    await act(async () => { router.back(); });
    if (origin === 'shopping') {
      expect(rendered.getPathname()).toBe('/shopping/sheet/choice');
      await fireEvent.press(screen.getByRole('button', { name: 'Close Preferred store (optional) choices' }));
    }
    expect(rendered.getPathname()).toBe(formRoute);
    expect(screen.getByDisplayValue('Unsaved Food')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Typical shopping unit (optional): Not selected' }));
    expect(rendered.getPathname()).toBe(`/${origin}/sheet/choice`);
    await fireEvent.press(screen.getByRole('button', { name: 'Create shopping unit' }));
    expect(rendered.getPathname()).toBe(`${choiceBase}/shopping-unit/create`);
    await act(async () => { router.back(); });
    if (origin === 'shopping') {
      expect(rendered.getPathname()).toBe('/shopping/sheet/choice');
      await fireEvent.press(screen.getByRole('button', { name: 'Close Typical shopping unit (optional) choices' }));
    }
    expect(rendered.getPathname()).toBe(formRoute);
    expect(screen.getByDisplayValue('Unsaved Food')).toBeTruthy();
    expect(mockedApi.createCatalogItem).not.toHaveBeenCalled();
  });

  it('keeps the emoji-entry fields and actions reachable in its scrollable keyboard-safe sheet', async () => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByRole('button', { name: 'Change cover' });
    await fireEvent.press(screen.getByRole('button', { name: 'Change cover' }));
    expect(rendered.getPathname()).toBe('/recipes/sheet/cover');
    await fireEvent.press(screen.getByText('Use emoji'));
    expect(rendered.getPathname()).toBe('/recipes/sheet/emoji');

    const keyboardArea = screen.getByTestId('recipe-emoji-keyboard-area');
    const sheetScroll = screen.getByTestId('recipe-emoji-keyboard-area-scroll');
    expect(keyboardArea.props.pointerEvents).toBe('box-none');
    expect(sheetScroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(sheetScroll.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
    expect(StyleSheet.flatten(sheetScroll.props.style).flexGrow).toBe(0);
    await fireEvent(screen.getByLabelText('Recipe emoji'), 'focus');
    expect(screen.getByRole('button', { name: 'Use emoji' })).toBeTruthy();
    expect(screen.getAllByText('Cancel').length).toBeGreaterThan(0);
  });

  it('keeps the main recipe form in the shared scrollable screen while editing fields', async () => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByLabelText('Recipe name');

    const editorScroll = screen.getByTestId('recipe-editor-screen');
    expect(editorScroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(editorScroll.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
    expect(editorScroll.props.automaticallyAdjustKeyboardInsets).toBe(Platform.OS === 'ios');
    if (Platform.OS === 'ios') {
      expect(editorScroll.parent?.props.edges).toEqual({ top: false, right: true, bottom: true, left: true });
    }
    await fireEvent(screen.getByLabelText('Recipe name'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Recipe name'), 'Keyboard-safe draft');
    expect(screen.getByDisplayValue('Keyboard-safe draft')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('does not save an edit until its original recipe loads, then saves and returns to refreshed detail', async () => {
    mockedApi.recipes.mockResolvedValue({ recipes: [recipe()] });
    mockedApi.recipe.mockResolvedValueOnce({ recipe: recipe() })
      .mockRejectedValueOnce(new Error('temporary offline'))
      .mockResolvedValueOnce({ recipe: recipe() })
      .mockResolvedValueOnce({ recipe: recipe({ name: 'Updated Tomato Soup', edit_revision: 2 }) });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes'); });
    await screen.findByText('Tomato Soup');
    await fireEvent.press(screen.getByText('Tomato Soup'));
    await screen.findByText('Tomato Soup');
    await act(async () => { router.push('/recipes/recipe-1/edit'); });
    await screen.findByRole('button', { name: 'Retry loading recipe' });
    expect(rendered.getPathname()).toBe('/recipes/recipe-1/edit');
    expect(mockedApi.updateRecipe).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry loading recipe' }));
    await screen.findByDisplayValue('Tomato Soup');
    await fireEvent.changeText(screen.getByLabelText('Recipe name'), 'Updated Tomato Soup');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'recipe-1', expect.objectContaining({
      expected_revision: 1, name: 'Updated Tomato Soup',
    })));
    expect(await screen.findByText('Updated Tomato Soup')).toBeTruthy();
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/recipe-1'));
    expect(mockedApi.recipe).toHaveBeenCalledTimes(4);
  });

  it('backs from edit to recipe detail and from detail to the Recipes library', async () => {
    mockedApi.recipes.mockResolvedValue({ recipes: [recipe()] });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes'); });
    await screen.findByText('Tomato Soup');
    await fireEvent.press(screen.getByText('Tomato Soup'));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/recipe-1'));
    await act(async () => { router.push('/recipes/recipe-1/edit'); });
    await screen.findByLabelText('Recipe name');
    await act(async () => { router.back(); });
    expect(rendered.getPathname()).toBe('/recipes/recipe-1');
    await act(async () => { router.back(); });
    expect(rendered.getPathname()).toBe('/recipes');
    expect(await screen.findByText('Tomato Soup')).toBeTruthy();
  });

  it('opens the archived library from that household’s Profile details route', async () => {
    const archivedRecipe = recipe({ id: 'archived-1', name: 'Grandma Pie', archived_at: '2026-01-01T00:00:00Z' });
    mockedApi.recipes.mockImplementation(async (_getToken, householdId, archived = false) => ({
      recipes: archived && householdId === 'household-a' ? [archivedRecipe] : [],
    }));
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');

    await act(async () => { router.navigate('/profile/my-households/household-a'); });
    expect(await screen.findByText('Home')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Archived recipes' }));

    expect(await screen.findByText('Grandma Pie')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/profile/my-households/household-a/archived-recipes');
    expect(mockedApi.recipes).toHaveBeenCalledWith(expect.any(Function), 'household-a', true, undefined);
  });

  it('keeps long ingredient rows readable and formats loaded amounts on edit', async () => {
    const longName = 'A very long household Food Catalog ingredient name that must remain readable';
    const longIngredient = {
      id: 'long-ingredient', catalog_item_id: food.id, catalog_item_name: longName,
      category_emoji: null, amount: '1.500000', unit_code: 'cup', custom_unit_label: null,
      note: 'Finely chopped and prepared ahead of time', position: 0, unit_label: 'Cup',
    };
    const fullRecipe = recipe({ servings: 4, prep_minutes: 20, cook_minutes: 75, ingredients: [longIngredient] });
    mockedApi.recipes.mockResolvedValue({ recipes: [fullRecipe] });
    mockedApi.recipe.mockResolvedValue({ recipe: fullRecipe });

    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Plan');
    await act(async () => { router.navigate('/recipes'); });
    await screen.findByText('Tomato Soup');
    await fireEvent.press(screen.getByText('Tomato Soup'));

    await screen.findByText('Servings');
    expect(screen.getAllByTestId('recipe-metric-divider', { includeHiddenElements: true })).toHaveLength(2);
    await act(async () => { router.push('/recipes/recipe-1/edit'); });

    expect(await screen.findByText(longName)).toBeTruthy();
    expect(screen.getByText('1.5 Cup')).toBeTruthy();
    expect(screen.getByText('Note: Finely chopped and prepared ahead of time')).toBeTruthy();
    const editAction = screen.getByRole('button', { name: `Edit ${longName}` });
    const removeAction = screen.getByRole('button', { name: `Remove ${longName} from recipe` });
    expect(editAction.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(removeAction.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.getByText(longName).props.numberOfLines).toBe(3);

    await fireEvent.press(editAction);
    expect(await screen.findByDisplayValue('1.5')).toBeTruthy();
    expect(screen.getByLabelText('Ingredient amount').props.placeholder).toBe('e.g. 2 or 1/2');
  });
  it.each(['/recipes/create', '/plan/recipe-create'])('creates a section and keeps its assignment across nested sheets from %s', async (path) => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => router.navigate(path as never));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Family dinner');
    await fireEvent.press(screen.getByRole('button', { name: 'Add section' }));
    await screen.findByLabelText('Section name');
    expect(rendered.getPathname()).toBe(`${path.startsWith('/plan') ? '/plan' : '/recipes'}/sheet/sections`);
    expect(screen.getByTestId('recipe-section-name-scroll')).toBeTruthy();
    expect(screen.queryByTestId('native-sheet-content')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Section name'), ' Chicken ');
    await fireEvent.press(screen.getByRole('button', { name: 'Add section' }));
    const sectionAdd = await screen.findByRole('button', { name: 'Add ingredient to Chicken' });
    expect(within(sectionAdd).queryByText('Add ingredient')).toBeNull();
    expect(screen.getAllByText('Add ingredient')).toHaveLength(1);
    await fireEvent.press(sectionAdd);
    await fireEvent.press(await screen.findByText('Milk'));
    expect(await screen.findByRole('button', { name: 'Section: Chicken' })).toBeTruthy();
    let nativeDetails = screen.getByTestId('recipe-ingredient-details-scroll').parent;
    while (nativeDetails && !['RNSScreen', 'RNSModalScreen'].includes(nativeDetails.type)) nativeDetails = nativeDetails.parent;
    expect(nativeDetails?.props.sheetInitialDetentIndex).toBe(1);
    expect(nativeDetails?.props.sheetAllowedDetents).toEqual([0.52, 0.92]);
    await fireEvent.changeText(screen.getByLabelText('Ingredient amount'), '2 2/3');
    await fireEvent.changeText(screen.getByLabelText('Ingredient note'), 'for sauce');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Note: for sauce');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.createRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({ ingredient_sections: [{ name: 'Chicken' }], ingredients: [expect.objectContaining({ amount: '2 2/3', note: 'for sauce', section_position: 0 })] })));
    // A server that omits grouping must never dismiss the retained draft as saved.
    expect(await screen.findByText('The server did not confirm the ingredient sections. Your draft is kept; check the saved recipe before retrying.')).toBeTruthy();
    expect(screen.getByDisplayValue('Family dinner')).toBeTruthy();
    const sent = mockedApi.createRecipe.mock.calls[0][2];
    const confirmed = recipe({ id: 'recipe-created', name: 'Family dinner', ingredient_sections: [{ id: 'section-a', name: 'Chicken', position: 0 }], ingredients: [{ ...recipe().ingredients![0], amount: '2.666667', note: 'for sauce', section_position: 0 }] });
    mockedApi.createRecipe.mockResolvedValue({ recipe: confirmed });
    mockedApi.recipe.mockResolvedValue({ recipe: confirmed });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(mockedApi.createRecipe).toHaveBeenCalledTimes(2));
    expect(mockedApi.createRecipe.mock.calls[1][2]).toEqual(sent);
    expect(await screen.findByText('Family dinner')).toBeTruthy();
    expect((await screen.findAllByText('Chicken')).length).toBeGreaterThan(0);
  });

  it('renames, reorders and removes sections without losing duplicate ingredient occurrences', async () => {
    const base = recipe().ingredients![0];
    mockedApi.recipe.mockResolvedValue({ recipe: recipe({ ingredient_sections: [{ id: 'a', position: 0, name: 'Chicken' }, { id: 'b', position: 1, name: 'Mash' }], ingredients: [{ ...base, section_position: 0, note: 'sauce' }, { ...base, id: 'second', position: 1, section_position: 1, amount: '3', note: 'potatoes' }] }) });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Manage sections' }));
    await fireEvent(screen.getByLabelText('Reorder Mash, position 2 of 2'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    const manager = screen.getByTestId('recipe-sections-root');
    const header = screen.getByTestId('recipe-sections-header');
    const body = screen.getByTestId('recipe-sections-scroll');
    const footer = screen.getByTestId('recipe-sections-footer');
    // Native Screens needs these frames; Jest itself cannot reproduce flattening.
    expect(manager.props.collapsable).toBe(false);
    expect(header.props.collapsable).toBe(false);
    expect(footer.props.collapsable).toBe(false);
    expect(manager.children.slice(0, 3)).toEqual([header, body, footer]);
    expect(within(header).getByText('Manage sections')).toBeTruthy();
    expect(within(body).getByText('Hold a handle to reorder sections. Changes save with the recipe.')).toBeTruthy();
    expect(within(footer).getByRole('button', { name: 'Add section' })).toBeTruthy();
    expect(StyleSheet.flatten(body.props.style).flex).toBe(1);
    expect(screen.queryByTestId('native-sheet-content')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit section Chicken' }));
    await fireEvent.changeText(await screen.findByLabelText('Section name'), 'Sauce');
    await fireEvent.press(screen.getByRole('button', { name: 'Save section' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove section Mash' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove section' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await screen.findByText('Other ingredients');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'recipe-1', expect.objectContaining({ ingredient_sections: [{ name: 'Sauce' }], ingredients: [expect.objectContaining({ amount: '3', note: 'potatoes', section_position: null }), expect.objectContaining({ amount: '1/2', note: 'sauce', section_position: 0 })] })));
  });

  it('moves an occurrence through Ingredient Details and saves its measurement and note with its new section', async () => {
    const base = recipe().ingredients![0];
    mockedApi.recipe.mockResolvedValue({ recipe: recipe({ ingredient_sections: [{ id: 'a', position: 0, name: 'Chicken' }, { id: 'b', position: 1, name: 'Mash' }], ingredients: [{ ...base, section_position: 0, note: 'sauce' }, { ...base, id: 'second', position: 1, section_position: 1, amount: '3', note: 'potatoes' }] }) });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Edit Milk' }))[0]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Section: Chicken' }));
    await fireEvent.press(await screen.findByText('Mash'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Save ingredient' }));
    await screen.findByText('Note: sauce');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'recipe-1', expect.objectContaining({ ingredient_sections: [{ name: 'Chicken' }, { name: 'Mash' }], ingredients: [expect.objectContaining({ amount: '3', note: 'potatoes', section_position: 1 }), expect.objectContaining({ amount: '1/2', note: 'sauce', section_position: 1 })] })));
  });

  it('removes the final section, keeps every ingredient and sends an explicit empty section list', async () => {
    mockedApi.recipe.mockResolvedValue({ recipe: recipe({ ingredient_sections: [{ id: 'a', position: 0, name: 'Sauce' }], ingredients: [{ ...recipe().ingredients![0], section_position: 0, note: 'keep me' }] }) });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan');
    await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Manage sections' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove section Sauce' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove section' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await screen.findByText('Note: keep me');
    expect(screen.queryByText('Other ingredients')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'recipe-1', expect.objectContaining({ ingredient_sections: [], ingredients: [expect.objectContaining({ amount: '1/2', note: 'keep me' })] })));
  });

  it.each(['/recipes/create', '/plan/recipe-create'])('keeps a new draft on Back until Discard is chosen from %s', async (path) => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan'); await act(async () => router.navigate(path as never));
    await screen.findByLabelText('Recipe name');
    await act(async () => router.back());
    expect(screen.queryByText('Discard recipe changes?')).toBeNull();
    expect(rendered.getPathname()).not.toBe(path);
    await act(async () => router.navigate(path as never));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Do not lose dinner');
    await act(async () => router.back());
    await screen.findByText('Discard recipe changes?');
    expect(rendered.getPathname()).toBe(path);
    await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('Do not lose dinner')).toBeTruthy();
    await act(async () => router.back());
    await fireEvent.press(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(rendered.getPathname()).not.toBe(path));
  });
  it('guards an edited recipe against the native pop-to-root path and keeps the same draft when canceled', async () => {
    mockedApi.recipes.mockResolvedValue({ recipes: [recipe()] });
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan'); await act(async () => router.navigate('/recipes'));
    await fireEvent.press(await screen.findByText('Tomato Soup'));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/recipe-1'));
    await act(async () => router.push('/recipes/recipe-1/edit'));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Updated family dinner');
    // Native tabs pop the stack on reselect. SDK 58 retries a prevented native
    // dismissal as the same POP action through usePreventRemove.
    const protectedScreen = screen.root!.queryAll((node) => node.type === 'RNSScreen' && node.props.preventNativeDismiss === true).at(-1)!;
    expect(protectedScreen).toBeTruthy();
    await fireEvent(protectedScreen, 'nativeDismissCancelled', { nativeEvent: { dismissCount: 2 } });
    await screen.findByText('Discard recipe changes?');
    await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('Updated family dinner')).toBeTruthy();
    await fireEvent(protectedScreen, 'nativeDismissCancelled', { nativeEvent: { dismissCount: 2 } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes'));
  });
  it('leaves unchanged and reverted edits without a warning and retains a changed draft across tab switches', async () => {
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan'); await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await screen.findByDisplayValue('Tomato Soup');
    await act(async () => router.back());
    expect(screen.queryByText('Discard recipe changes?')).toBeNull();
    expect(rendered.getPathname()).not.toBe('/recipes/recipe-1/edit');
    await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Temporary');
    await fireEvent.changeText(screen.getByLabelText('Recipe name'), 'Tomato Soup');
    await act(async () => router.back());
    expect(screen.queryByText('Discard recipe changes?')).toBeNull();
    await act(async () => router.navigate('/recipes/create'));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Retained across tabs');
    await act(async () => router.navigate('/shopping'));
    expect(screen.queryByText('Discard recipe changes?')).toBeNull();
    await act(async () => router.back());
    expect(await screen.findByDisplayValue('Retained across tabs')).toBeTruthy();
  });
  it('blocks leaving during an unresolved save and exits without a discard warning after success', async () => {
    let resolveSave!: (value: { recipe: Recipe }) => void;
    mockedApi.updateRecipe.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan'); await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Saved dinner');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalled());
    await act(async () => router.back());
    expect(await screen.findByText('Recipe is saving')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull();
    await act(async () => resolveSave({ recipe: recipe({ name: 'Saved dinner', edit_revision: 2 }) }));
    await waitFor(() => expect(rendered.getPathname()).not.toBe('/recipes/recipe-1/edit'));
    expect(screen.queryByText('Discard recipe changes?')).toBeNull();
  });
  it('protects section-only changes without warning on nested Back and retains failed-save drafts', async () => {
    const { ApiError } = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
    mockedApi.updateRecipe.mockRejectedValueOnce(new ApiError(409, 'Changed elsewhere.', 'RECIPE_REVISION_CONFLICT'));
    const rendered = await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan'); await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add section' }));
    await fireEvent.changeText(await screen.findByLabelText('Section name'), 'Sauce');
    await fireEvent.press(screen.getByRole('button', { name: 'Add section' }));
    expect(screen.queryByText('Discard recipe changes?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Changed elsewhere.');
    await act(async () => router.back());
    await screen.findByText('Discard recipe changes?');
    await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    expect(rendered.getPathname()).toBe('/recipes/recipe-1/edit');
    expect(screen.getByText('Sauce')).toBeTruthy();
  });

  it('shows named ingredient sections before Other ingredients in saved and edited recipes, without changing persistence order', async () => {
    const base = recipe().ingredients![0];
    const saved = recipe({ ingredient_sections: [{ id: 'a', position: 0, name: 'Chicken' }, { id: 'b', position: 1, name: 'Mash' }], ingredients: [
      { ...base, section_position: null, note: 'unassigned' },
      { ...base, id: 'chicken', position: 1, section_position: 0, note: 'sauce' },
      { ...base, id: 'mash', position: 2, section_position: 1, note: 'potatoes' },
    ] });
    mockedApi.recipe.mockResolvedValue({ recipe: saved });
    mockedApi.updateRecipe.mockResolvedValue({ recipe: { ...saved, edit_revision: 2 } });
    const sectionHeadings = () => screen.getAllByRole('header').map((heading) => heading.props.children).filter((text) => ['Chicken', 'Mash', 'Other ingredients'].includes(text));
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await screen.findByText('Plan'); await act(async () => router.navigate('/recipes/recipe-1'));
    await screen.findByRole('header', { name: 'Chicken' });
    expect(sectionHeadings()).toEqual(['Chicken', 'Mash', 'Other ingredients']);
    await act(async () => router.push('/recipes/recipe-1/edit'));
    await screen.findByLabelText('Recipe name');
    expect(sectionHeadings()).toEqual(['Chicken', 'Mash', 'Other ingredients']);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalled());
    // Merely displaying groups differently must not mark ingredients dirty.
    expect(mockedApi.updateRecipe.mock.calls[0][3]).not.toHaveProperty('ingredients');
    expect(mockedApi.updateRecipe.mock.calls[0][3]).not.toHaveProperty('ingredient_sections');
  });

  it.each(['/recipes/create', '/plan/recipe-create'])('imports a whole recipe and saves independent ingredients/directions from %s', async (path) => {
    const source = recipe({ id: 'source', name: 'Saved soup', ingredient_section_count: 0, source_url: 'https://example.test/soup', steps: [{ id: 's', position: 0, instruction: 'Stir slowly.' }] });
    const saved = recipe({ id: 'recipe-created', name: 'Our dinner', ingredient_sections: [{ id: 'saved-section', name: 'Saved soup', position: 0 }], ingredients: [{ ...source.ingredients![0], section_position: 0 }], steps: source.steps, notes: 'From Saved soup: https://example.test/soup' });
    mockedApi.createRecipe.mockResolvedValue({ recipe: saved });
    mockedApi.recipes.mockResolvedValue({ recipes: [source] }); mockedApi.recipe.mockImplementation(async (_token, _home, id) => ({ recipe: id === 'source' ? source : saved }));
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' }); await screen.findByText('Plan');
    await act(async () => router.navigate(path as never));
    await fireEvent.changeText(await screen.findByLabelText('Recipe name'), 'Our dinner');
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    const footer = await screen.findByTestId('recipe-food-footer');
    expect(within(footer).getAllByRole('button').map((r) => r.props.accessibilityLabel ?? r.props.children)).toHaveLength(2);
    expect(within(footer).getAllByText(/Create Food item in Catalog|Import from recipe/).map((r) => r.props.children)).toEqual(['Create Food item in Catalog', 'Import from recipe']);
    await fireEvent.press(screen.getByRole('button', { name: 'Import from recipe' }));
    await screen.findByRole('button', { name: 'Import whole recipe Saved soup' });
    let native = screen.getByTestId('recipe-import-sheet').parent;
    while (native && !['RNSScreen', 'RNSModalScreen'].includes(native.type as string)) native = native.parent;
    expect(native?.props.sheetInitialDetentIndex).toBe(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Import whole recipe Saved soup' }));
    await screen.findByText('1 ingredient and 1 direction imported from Saved soup.');
    expect(screen.queryByTestId('recipe-food-footer')).toBeNull();
    expect(screen.queryByTestId('recipe-import-sheet')).toBeNull();
    expect(mockedApi.createRecipe).not.toHaveBeenCalled(); expect(mockedApi.updateRecipe).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.createRecipe).toHaveBeenCalled());
    expect(mockedApi.createRecipe.mock.calls[0][2]).toMatchObject({ name: 'Our dinner', ingredient_sections: [{ name: 'Saved soup' }], ingredients: [{ catalog_item_id: food.id, amount: '1/2', section_position: 0 }], steps: ['Stir slowly.'], notes: 'From Saved soup: https://example.test/soup' });
    expect(mockedApi.updateRecipe).not.toHaveBeenCalled();
    await screen.findByRole('header', { name: 'Our dinner' });
    await fireEvent.press(screen.getByRole('button', { name: 'Edit recipe' }));
    expect(await screen.findByDisplayValue('Our dinner')).toBeTruthy();
    expect(screen.getByDisplayValue('Stir slowly.')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Saved soup' })).toBeTruthy();
    expect(screen.queryByText('Discard recipe changes?')).toBeNull();
  });

  it('keeps the Food search on Back and allows reopening Import without a stranded latch', async () => {
    const source = recipe({ id: 'source', name: 'Saved soup', ingredient_section_count: 0 });
    mockedApi.recipes.mockResolvedValue({ recipes: [source] }); mockedApi.recipe.mockResolvedValue({ recipe: source });
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' }); await screen.findByText('Plan');
    await act(async () => router.navigate('/recipes/create'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add ingredient' }));
    await fireEvent.changeText(await screen.findByPlaceholderText('Search Food Catalog'), 'Milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Import from recipe' }));
    await fireEvent.changeText(await screen.findByLabelText('Search recipes to import'), 'Saved');
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Food Catalog' }));
    expect(await screen.findByDisplayValue('Milk')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Import from recipe' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Import whole recipe Saved soup' }));
    await screen.findByText('1 ingredient imported from Saved soup.');
    await act(async () => router.back());
    expect(await screen.findByText('Discard recipe changes?')).toBeTruthy();
  });

  it('imports only a selected section into an edited recipe and preserves its existing directions', async () => {
    const source = recipe({ id: 'source', name: 'Chicken and mash', ingredient_section_count: 2, ingredient_sections: [{ id: 'a', position: 0, name: 'Chicken' }, { id: 'b', position: 1, name: 'Mash' }], ingredients: [{ ...recipe().ingredients![0], section_position: 1 }], steps: [{ id: 's', position: 0, instruction: 'Do not import me' }] });
    const destination = recipe({ notes: 'Keep notes', steps: [{ id: 'ours', position: 0, instruction: 'Our step' }] });
    mockedApi.recipes.mockResolvedValue({ recipes: [destination, source] }); mockedApi.recipe.mockImplementation(async (_token, _home, id) => ({ recipe: id === 'source' ? source : destination }));
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' }); await screen.findByText('Plan');
    await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add ingredient' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Import from recipe' }));
    expect(screen.queryByRole('button', { name: 'Expand Tomato Soup' })).toBeNull();
    await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
    expect(await screen.findByRole('button', { name: 'Import Chicken ingredients from Chicken and mash' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Import Mash ingredients from Chicken and mash' }));
    await screen.findByText('1 ingredient imported from Mash.');
    expect(screen.getByDisplayValue('Our step')).toBeTruthy(); expect(screen.queryByDisplayValue('Do not import me')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalled());
    const [,, id, payload] = mockedApi.updateRecipe.mock.calls[0];
    expect(id).toBe('recipe-1'); expect(payload).not.toHaveProperty('steps'); expect(payload.notes).toBe('Keep notes');
    expect(payload.ingredient_sections).toEqual([{ name: 'Mash' }]); expect(payload.ingredients).toHaveLength(2);
  });

  it('imports through a named section plus and flattens source groups into that destination', async () => {
    const destination = recipe({ ingredient_sections: [{ id: 'd', position: 0, name: 'Dinner' }], ingredients: [{ ...recipe().ingredients![0], section_position: 0 }] });
    const source = recipe({ id: 'source', name: 'Soup', ingredient_section_count: 1, ingredient_sections: [{ id: 'a', position: 0, name: 'Soup part' }], ingredients: [{ ...recipe().ingredients![0], section_position: 0 }] });
    mockedApi.recipes.mockResolvedValue({ recipes: [source] }); mockedApi.recipe.mockImplementation(async (_token, _home, id) => ({ recipe: id === 'source' ? source : destination }));
    await renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' }); await screen.findByText('Plan');
    await act(async () => router.navigate('/recipes/recipe-1/edit'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add ingredient to Dinner' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Import from recipe' }));
    await screen.findByText('Import into Dinner. Amounts stay as written.');
    await fireEvent.press(await screen.findByRole('button', { name: 'Expand Soup' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Import whole recipe Soup' }));
    await screen.findByText('1 ingredient imported from Soup.');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedApi.updateRecipe).toHaveBeenCalled());
    expect(mockedApi.updateRecipe.mock.calls[0][3]).toMatchObject({ ingredient_sections: [{ name: 'Dinner' }], ingredients: [{ section_position: 0 }, { section_position: 0 }] });
  });

});
