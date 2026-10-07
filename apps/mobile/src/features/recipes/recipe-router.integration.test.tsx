import type { PropsWithChildren } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, StyleSheet } from 'react-native';

import { api, type CatalogItem, type CatalogUnits, type Me, type Recipe } from '@/lib/api';

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
      me: jest.fn(), shoppingList: jest.fn(), householdMembers: jest.fn(), household: jest.fn(),
      recipes: jest.fn(), recipe: jest.fn(), createRecipe: jest.fn(), updateRecipe: jest.fn(),
      archiveRecipe: jest.fn(), restoreRecipe: jest.fn(), catalogItems: jest.fn(), catalogUnits: jest.fn(),
      catalogCategories: jest.fn(), catalogStores: jest.fn(), createCatalogCategory: jest.fn(), createCatalogItem: jest.fn(),
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

  it('creates a recipe from a linked Food Catalog item and opens its detail route', async () => {
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
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
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await waitFor(() => expect(within(screen.getByTestId('recipe-food-results')).getByText('Milk')).toBeTruthy());
    await fireEvent.press(within(screen.getByTestId('recipe-food-results')).getByText('Milk'));
    expect(screen.getByLabelText('Ingredient amount').props.placeholder).toBe('e.g. 2 or 1/2');
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add ingredient' }).length).toBeGreaterThan(1));
    const addIngredientButtons = screen.getAllByRole('button', { name: 'Add ingredient' });
    await fireEvent.press(addIngredientButtons[addIngredientButtons.length - 1]);
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
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByRole('button', { name: 'Add ingredient' });
    await fireEvent.press(screen.getByRole('button', { name: 'Add ingredient' }));
    await screen.findByText('Milk');

    const sheet = screen.getByTestId('recipe-ingredient-search-sheet');
    expect(StyleSheet.flatten(screen.getByTestId('recipe-ingredient-keyboard-area').props.style)).toMatchObject({ flex: 1, justifyContent: 'flex-end' });
    expect(StyleSheet.flatten(sheet.props.style).maxHeight).toBe('86%');
    expect(StyleSheet.flatten(screen.getByTestId('recipe-food-results').props.style)).toMatchObject({ flexGrow: 0, flexShrink: 1, maxHeight: 350 });
    expect(screen.getByTestId('recipe-food-results').props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByTestId('recipe-food-results').props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
    expect(screen.getByLabelText('Search Food Catalog')).toBeTruthy();
    expect(screen.getByText('Milk')).toBeTruthy();
    expect(screen.getByText('Create Food item in Catalog')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByTestId('recipe-ingredient-keyboard-area').props.pointerEvents).toBe('box-none');
    await fireEvent(screen.getByLabelText('Search Food Catalog'), 'focus');
    await fireEvent.press(screen.getByText('Milk'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    const detailsKeyboardArea = screen.getByTestId('recipe-ingredient-details-keyboard-area');
    const detailsScroll = screen.getByTestId('recipe-ingredient-details-keyboard-area-scroll');
    expect(detailsKeyboardArea.props.pointerEvents).toBe('box-none');
    expect(detailsScroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(detailsScroll.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
    expect(detailsScroll.props.bounces).toBe(false);
    expect(detailsScroll.props.alwaysBounceVertical).toBe(false);
    expect(detailsScroll.props.overScrollMode).toBe('never');
    expect(StyleSheet.flatten(screen.getByTestId('recipe-ingredient-grabber-target').props.style).minHeight).toBeGreaterThanOrEqual(34);
    expect(StyleSheet.flatten(screen.getByTestId('recipe-ingredient-grabber').props.style)).toMatchObject({ height: 8, width: 52 });
    expect(StyleSheet.flatten(screen.getByTestId('recipe-ingredient-details-sheet').props.style).transform).toHaveLength(1);
    expect(StyleSheet.flatten(detailsScroll.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 1 });
    expect(StyleSheet.flatten(screen.getByTestId('recipe-ingredient-details-sheet').props.style).maxHeight).toBe('90%');
    expect(screen.getByLabelText('Ingredient amount')).toBeTruthy();
    expect(screen.getByLabelText('Ingredient note')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add ingredient' }).length).toBeGreaterThan(1);
    expect(screen.getByTestId('recipe-ingredient-details-pan')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Back to Food Catalog' }).props.style)).toMatchObject({ minHeight: 44, minWidth: 44 });
    await act(async () => { screen.getByTestId('recipe-ingredient-modal').props.onRequestClose(); });
    expect(await screen.findByLabelText('Search Food Catalog')).toBeTruthy();
    expect(within(screen.getByTestId('recipe-food-results')).getByText('Milk')).toBeTruthy();
    expect(within(screen.getByTestId('recipe-food-results')).getByText('Bread')).toBeTruthy();
    expect(mockedApi.catalogItems).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Milk'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Food Catalog' }));
    expect(await screen.findByLabelText('Search Food Catalog')).toBeTruthy();
    await fireEvent.press(screen.getByText('Milk'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Ingredient amount'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Ingredient amount'), '1/2');
    await fireEvent.press(screen.getByRole('button', { name: 'Unit: No unit' }));
    expect(StyleSheet.flatten(screen.getByTestId('catalog-choice-sheet').props.style).maxHeight).toBeLessThanOrEqual(560);
    await fireEvent.press(screen.getByRole('button', { name: 'Use custom unit' }));
    await fireEvent.changeText(screen.getByLabelText('Custom recipe unit'), 'pinch');
    await fireEvent.press(screen.getByRole('button', { name: 'Use custom unit' }));
    expect(screen.getByRole('button', { name: 'Unit: pinch' })).toBeTruthy();
    await fireEvent(screen.getByLabelText('Ingredient note'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Ingredient note'), 'finely chopped');
    await fireEvent.press(screen.getByRole('button', { name: 'Unit: pinch' }));
    expect(await screen.findByLabelText('Search Unit')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cup'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    expect(screen.getByDisplayValue('1/2')).toBeTruthy();
    expect(screen.getByDisplayValue('finely chopped')).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText('Search Food Catalog')).toBeNull());
    await fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Ingredient details')).toBeNull());
  });

  it('keeps the prototype Food sheet beneath Details and preserves its search on Back', async () => {
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByRole('button', { name: 'Try native sheet prototype' });
    await fireEvent.press(screen.getByRole('button', { name: 'Try native sheet prototype' }));
    expect(await screen.findByTestId('recipe-native-food-prototype')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/recipes/sheet-prototype/food');
    await fireEvent.changeText(screen.getByLabelText('Prototype Food search'), 'Ch');
    await fireEvent.press(screen.getByRole('button', { name: 'Open Chicken prototype details' }));
    expect(await screen.findByTestId('recipe-native-details-prototype')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/recipes/sheet-prototype/details');
    await fireEvent.changeText(screen.getByLabelText('Prototype ingredient note'), 'Keyboard check');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(rendered.getPathname()).toBe('/recipes/sheet-prototype/food');
    expect(screen.getByLabelText('Prototype Food search').props.value).toBe('Ch');
    await fireEvent.press(screen.getByRole('button', { name: 'Open Chicken prototype details' }));
    await screen.findByTestId('recipe-native-details-prototype');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(rendered.getPathname()).toBe('/recipes/create');
    expect(mockedApi.createRecipe).not.toHaveBeenCalled();
  });

  it('clears zero-valued time fields on focus so a user can type directly', async () => {
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByLabelText('Recipe name');
    await fireEvent.press(screen.getByText('More details (optional)'));
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

  it('keeps Done and Create Food item actions responsive in the ingredient search sheet', async () => {
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
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
    await fireEvent.press(screen.getByText('Create Food item in Catalog'));
    expect(rendered.getPathname()).toBe('/recipes/catalog-food');
    expect(await screen.findByLabelText('Item name')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Household' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Typical shopping unit (optional): Not selected' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preferred store (optional): Not selected' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'More details' }));
    expect(screen.getByRole('button', { name: 'Recipe measurement: Not selected' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'QA Celery');
    await fireEvent.press(screen.getByRole('button', { name: 'Category: Not selected' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create category' }));
    expect(rendered.getPathname()).toBe('/recipes/catalog-choices/category/create');
    const category = { id: 'category-celery', name: 'Vegetables', item_type: 'food' as const, emoji: null, active_item_count: 0, created_at: '', updated_at: '' };
    mockedApi.createCatalogCategory.mockResolvedValue({ category });
    mockedApi.catalogCategories.mockResolvedValue({ categories: [category] });
    await fireEvent.changeText(screen.getByLabelText('category name'), 'Vegetables');
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/catalog-food'));
    expect(await screen.findByDisplayValue('QA Celery')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Category: Vegetables' })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Preferred store (optional): Not selected' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Manage stores' }));
    expect(rendered.getPathname()).toBe('/recipes/catalog-choices/store');
    await act(async () => { router.back(); });
    expect(rendered.getPathname()).toBe('/recipes/catalog-food');
    expect(screen.getByDisplayValue('QA Celery')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create & use ingredient' }).props.accessibilityState?.disabled).toBe(false));
    await fireEvent.press(screen.getByRole('button', { name: 'Create & use ingredient' }));
    await waitFor(() => expect(mockedApi.createCatalogItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(rendered.getPathname()).toBe('/recipes/create'));
    expect(await screen.findByText('Ingredient details')).toBeTruthy();
    expect(mockedApi.createCatalogItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({ name: 'QA Celery', item_type: 'food', category_id: category.id }));
    expect(screen.getByText('QA Celery')).toBeTruthy();
    expect(screen.getByDisplayValue('Celery Soup')).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText('Search Food Catalog')).toBeNull());
  });

  it('keeps the emoji-entry fields and actions reachable in its scrollable keyboard-safe sheet', async () => {
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByRole('button', { name: 'Change cover' });
    await fireEvent.press(screen.getByRole('button', { name: 'Change cover' }));
    await fireEvent.press(screen.getByText('Use emoji'));

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
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
    await act(async () => { router.navigate('/recipes/create'); });
    await screen.findByLabelText('Recipe name');

    const editorScroll = screen.getByTestId('recipe-editor-screen');
    expect(editorScroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(editorScroll.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
    expect(editorScroll.props.automaticallyAdjustKeyboardInsets).toBe(Platform.OS === 'ios');
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
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
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
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
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
    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');

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

    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Shopping list');
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
});
