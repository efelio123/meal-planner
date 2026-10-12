import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { ShoppingCatalogPickerSheet, shoppingPickerKeyboardInset } from '@/features/shopping-list/shopping-sheets';
import { ApiError, api, type CatalogItem, type ShoppingListItem } from '@/lib/api';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPresent = jest.fn((_content: unknown, _options?: unknown) => 'details-sheet');
const mockAdd = jest.fn((_item: CatalogItem): Promise<void> => Promise.resolve());
const mockRemove = jest.fn((_item: ShoppingListItem): Promise<void> => Promise.resolve());
let mockUserId = 'user-1';
let mockSessionId = 'session-1';
let mockHouseholdId = 'household-1';
let mockShoppingScope = '["user-1","session-1","household-1"]';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: mockUserId, sessionId: mockSessionId }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ getToken: jest.fn().mockResolvedValue('token'), selectedHousehold: { id: mockHouseholdId } }) }));
jest.mock('@/features/shopping-list/shopping-context', () => ({ useShoppingContext: () => ({ scope: mockShoppingScope, markChanged: jest.fn() }) }));
jest.mock('@/features/catalog/catalog-context', () => ({ useCatalogContext: () => ({ revision: 0 }) }));
jest.mock('@/features/native-sheets/native-sheet-context', () => ({ useNativeSheetFlow: () => ({ present: mockPresent }) }));
jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual<typeof import('@/lib/api')>('@/lib/api').ApiError,
  api: {
    shoppingList: jest.fn(),
    catalogItems: jest.fn(),
    catalogItem: jest.fn(),
    catalogUnits: jest.fn(),
    catalogStores: jest.fn(),
    shoppingListItem: jest.fn(),
    addShoppingListItem: jest.fn(),
    updateShoppingListItem: jest.fn(),
    deleteShoppingListItem: jest.fn(),
  },
}));
jest.mock('@/hooks/use-theme', () => ({ useThemeMode: () => 'light', useTheme: () => ({ activity: '#000', border: '#ccc', disabled: '#999', error: '#b00', elevatedSurface: '#fff', inputBackground: '#fff', inputPlaceholder: '#777', inputText: '#111', link: '#05a', primary: '#05a', primaryText: '#fff', screen: '#fff', surface: '#fff', surfaceSelected: '#eee', textSecondary: '#555' }) }));

const mockedApi = jest.mocked(api);

function catalogItem(id: string, name: string, overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id, household_id: 'household-1', item_type: 'food', name,
    category_id: null, category_name: 'Produce', shopping_unit_code: null,
    shopping_unit_label: null, shopping_unit_source: null, custom_shopping_unit_id: null,
    preferred_store_id: null, preferred_store_name: null, recipe_measurement_dimension: null,
    recipe_measurement_unit_code: null, recipe_measurement_unit_label: null,
    created_at: '', updated_at: '', ...overrides,
  };
}

function shoppingItem(catalogId: string): ShoppingListItem {
  return {
    id: 'list-row', catalog_item_id: catalogId,
    name: 'Apples', is_checked: false, checked_at: null, checked_by_user_id: null,
    created_by_user_id: 'user-1', created_at: '2026-10-01T00:00:00Z',
  };
}

describe('Shopping Catalog picker sheet', () => {
  beforeEach(async () => {
    await cleanup();
    jest.clearAllMocks();
    mockedApi.catalogItems.mockReset();
    mockedApi.catalogItem.mockReset();
    mockAdd.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
    mockUserId = 'user-1'; mockSessionId = 'session-1'; mockHouseholdId = 'household-1';
    mockShoppingScope = '["user-1","session-1","household-1"]';
    mockedApi.catalogItems.mockResolvedValue({ items: [catalogItem('apples', 'Apples'), catalogItem('bread', 'Bread')] });
    mockedApi.catalogItem.mockResolvedValue({ item: catalogItem('apples', 'Apples') });
    mockedApi.catalogUnits.mockResolvedValue({ shopping_units: { built_in: [], household: [] }, recipe_measurement_units: [] });
    mockedApi.catalogStores.mockResolvedValue({ stores: [] });
  });

  it('clears the picker draft on scope change and rejects a late previous-household load', async () => {
    let resolveOld!: (value: { items: CatalogItem[] }) => void;
    const oldLoad = new Promise<{ items: CatalogItem[] }>((resolve) => { resolveOld = resolve; });
    const view = await render(<ShoppingCatalogPickerSheet items={[]} onAdd={mockAdd} onRemove={mockRemove} />);
    expect(await view.findByRole('button', { name: 'Add Apples from Catalog' })).toBeTruthy();
    await act(async () => fireEvent.changeText(view.getByLabelText('Search Catalog'), 'old search'));
    expect(view.getByLabelText('Search Catalog').props.value).toBe('old search');

    // Start a delayed refresh for household A by changing the Clerk session
    // while its route remains open; then leave for household B before it lands.
    mockedApi.catalogItems.mockReturnValueOnce(oldLoad).mockResolvedValueOnce({
      items: [catalogItem('new-item', 'New household item', { household_id: 'household-2' })],
    });
    mockSessionId = 'session-2';
    mockShoppingScope = '["user-1","session-2","household-1"]';
    await view.rerender(<ShoppingCatalogPickerSheet items={[]} onAdd={mockAdd} onRemove={mockRemove} />);
    await waitFor(() => expect(mockedApi.catalogItems).toHaveBeenCalledTimes(2));
    const searchInput = view.getByLabelText('Search Catalog');
    expect(searchInput.props.value).toBe('');
    expect(view.getByLabelText('Loading Catalog items')).toBeTruthy();
    await act(async () => fireEvent.changeText(searchInput, 'stale A search'));
    expect(searchInput.props.value).toBe('stale A search');

    mockUserId = 'user-2'; mockSessionId = 'session-2'; mockHouseholdId = 'household-2';
    mockShoppingScope = '["user-2","session-2","household-2"]';
    await view.rerender(<ShoppingCatalogPickerSheet items={[]} onAdd={mockAdd} onRemove={mockRemove} />);
    await waitFor(() => expect(mockedApi.catalogItems).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(view.getByLabelText('Search Catalog').props.value).toBe(''));
    expect(await view.findByRole('button', { name: 'Add New household item from Catalog' })).toBeTruthy();

    await act(async () => { resolveOld({ items: [catalogItem('old-item', 'Old household item')] }); });
    await waitFor(() => expect(view.queryByRole('button', { name: 'Add Old household item from Catalog' })).toBeNull());
    expect(view.getByRole('button', { name: 'Add New household item from Catalog' })).toBeTruthy();
  });

  it('searches Catalog and opens Edit for an item already on the shared list', async () => {
    const existing = shoppingItem('apples');
    const view = await render(<ShoppingCatalogPickerSheet items={[existing]} onAdd={mockAdd} onRemove={mockRemove} />);

    const apples = await view.findByRole('button', { name: 'Edit Apples on Shopping' });
    await act(async () => fireEvent.changeText(view.getByLabelText('Search Catalog'), 'apple'));
    expect(view.queryByRole('button', { name: 'Add Bread from Catalog' })).toBeNull();
    fireEvent.press(apples);

    expect(mockPresent).toHaveBeenCalledWith(expect.objectContaining({ props: expect.objectContaining({ existingItem: existing }) }), { detents: [0.68, 0.94], initialDetent: 1 });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/shopping/sheet/details', params: { sheetId: 'details-sheet' } });

    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  it('opens the Shopping-scoped Catalog create route after dismissing the picker', async () => {
    const view = await render(<ShoppingCatalogPickerSheet items={[]} onAdd={mockAdd} onRemove={mockRemove} />);
    fireEvent.press(within(view.getByTestId('shopping-catalog-footer')).getByRole('button', { name: 'Create item in Catalog' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/shopping/catalog-item',
      params: { shoppingOriginScope: '["user-1","session-1","household-1"]' },
    }));
  });

  it('turns a concurrent duplicate into an Edit action without trying to add twice', async () => {
    mockAdd.mockRejectedValueOnce(new ApiError(409, 'Already on the list.', 'SHOPPING_ITEM_ALREADY_EXISTS'));
    mockedApi.shoppingList.mockResolvedValue({ shopping_list: {
      id: 'shopping-list', household_id: 'household-1', items: [shoppingItem('apples')],
    } });
    const picker = await render(<ShoppingCatalogPickerSheet items={[]} onAdd={mockAdd} onRemove={mockRemove} />);
    fireEvent.press(await picker.findByRole('button', { name: 'Add Apples from Catalog' }));
    const edit = await picker.findByRole('button', { name: 'Edit Apples on Shopping' });
    fireEvent.press(edit);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockPresent).toHaveBeenCalledWith(expect.objectContaining({ props: expect.objectContaining({ existingItem: expect.objectContaining({ id: 'list-row' }) }) }), { detents: [0.68, 0.94], initialDetent: 1 });
  });

  it('keeps filtered results in the scrolling list while Create remains outside it', async () => {
    const picker = await render(<ShoppingCatalogPickerSheet items={[]} onAdd={mockAdd} onRemove={mockRemove} />);
    await picker.findByRole('button', { name: 'Add Apples from Catalog' });
    fireEvent.changeText(picker.getByLabelText('Search Catalog'), 'b');
    const results = picker.getByTestId('shopping-catalog-results');
    await waitFor(() => expect(within(results).queryByRole('button', { name: 'Add Apples from Catalog' })).toBeNull());
    expect(within(results).getByRole('button', { name: 'Add Bread from Catalog' })).toBeTruthy();
    expect(within(picker.getByTestId('shopping-catalog-footer')).getByRole('button', { name: 'Create item in Catalog' })).toBeTruthy();
  });

  it('keeps search fixed above results and a single independently positioned Create action', async () => {
    const picker = await render(<ShoppingCatalogPickerSheet items={[]} onAdd={mockAdd} onRemove={mockRemove} />);
    expect(picker.getByTestId('shopping-catalog-picker-sheet').props.collapsable).toBe(false);
    const header = picker.getByTestId('shopping-catalog-sticky-header');
    expect(within(header).getByLabelText('Search Catalog')).toBeTruthy();
    expect(picker.queryByTestId('shopping-catalog-keyboard-area')).toBeNull();
    expect(picker.getAllByRole('button', { name: 'Create item in Catalog' })).toHaveLength(1);
    expect(picker.getByTestId('shopping-catalog-footer')).toBeTruthy();
    expect(picker.queryByTestId('shopping-catalog-keyboard-footer')).toBeNull();
  });

  it('moves the footer by keyboard screen position without changing the header layout', () => {
    expect(shoppingPickerKeyboardInset(844, 520)).toBe(324);
    expect(shoppingPickerKeyboardInset(844, 844)).toBe(0);
    expect(shoppingPickerKeyboardInset(844, 900)).toBe(0);
  });

  it('retries failures, then adds multiple items in place until Done', async () => {
    mockAdd.mockRejectedValueOnce(new Error('Network unavailable'));
    const picker = await render(<ShoppingCatalogPickerSheet items={[]} onAdd={mockAdd} onRemove={mockRemove} />);
    const apples = await picker.findByRole('button', { name: 'Add Apples from Catalog' });
    const sheet = picker.getByTestId('shopping-catalog-picker-sheet');
    const results = picker.getByTestId('shopping-catalog-results');
    const footer = picker.getByTestId('shopping-catalog-footer');
    const header = picker.getByTestId('shopping-catalog-sticky-header');
    expect(sheet.children.slice(0, 3)).toEqual([header, results, footer]);
    expect(results.props.keyboardShouldPersistTaps).toBe('handled');
    expect(within(footer).getByRole('button', { name: 'Create item in Catalog' })).toBeTruthy();
    expect(picker.getByRole('button', { name: 'Done' })).toBeTruthy();

    fireEvent.press(apples);
    expect(await picker.findByRole('alert')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(apples); });
    expect(picker.queryByRole('alert')).toBeNull();
    expect(picker.getByRole('button', { name: 'Apples on Shopping' }).props.accessibilityState.disabled).toBe(true);
    expect(picker.getByTestId('shopping-add-confirmation')).toHaveTextContent('Apples added to Shopping');
    fireEvent.press(picker.getByRole('button', { name: 'Apples on Shopping' }));
    expect(mockAdd).toHaveBeenCalledTimes(2);

    fireEvent.changeText(picker.getByLabelText('Search Catalog'), 'br');
    await act(async () => { fireEvent.press(picker.getByRole('button', { name: 'Add Bread from Catalog' })); });
    expect(picker.getByRole('button', { name: 'Bread on Shopping' }).props.accessibilityState.disabled).toBe(true);
    expect(picker.getByLabelText('Search Catalog').props.value).toBe('br');
    expect(picker.getByTestId('shopping-add-confirmation')).toHaveTextContent('Bread added to Shopping');
    expect(mockAdd).toHaveBeenCalledTimes(3);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPresent).not.toHaveBeenCalled();
    fireEvent.press(picker.getByRole('button', { name: 'Done' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

});
