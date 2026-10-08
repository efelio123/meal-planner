import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ShoppingCatalogPickerSheet } from '@/features/shopping-list/shopping-sheets';
import { api, type CatalogItem, type ShoppingListItem } from '@/lib/api';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPresent = jest.fn((_content: unknown, _options?: unknown) => 'details-sheet');
let mockUserId = 'user-1';
let mockSessionId = 'session-1';
let mockHouseholdId = 'household-1';
let mockShoppingScope = '["user-1","session-1","household-1"]';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: mockUserId, sessionId: mockSessionId }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ getToken: jest.fn().mockResolvedValue('token'), selectedHousehold: { id: mockHouseholdId } }) }));
jest.mock('@/features/shopping-list/shopping-context', () => ({ useShoppingContext: () => ({ scope: mockShoppingScope }) }));
jest.mock('@/features/native-sheets/native-sheet-context', () => ({ useNativeSheetFlow: () => ({ present: mockPresent }) }));
jest.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    catalogItems: jest.fn(),
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

function catalogItem(id: string, name: string): CatalogItem {
  return {
    id, household_id: 'household-1', item_type: 'food', name,
    category_id: null, category_name: 'Produce', shopping_unit_code: null,
    shopping_unit_label: null, shopping_unit_source: null, custom_shopping_unit_id: null,
    preferred_store_id: null, preferred_store_name: null, recipe_measurement_dimension: null,
    recipe_measurement_unit_code: null, recipe_measurement_unit_label: null,
    created_at: '', updated_at: '',
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
  beforeEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockUserId = 'user-1'; mockSessionId = 'session-1'; mockHouseholdId = 'household-1';
    mockShoppingScope = '["user-1","session-1","household-1"]';
    mockedApi.catalogItems.mockResolvedValue({ items: [catalogItem('apples', 'Apples'), catalogItem('bread', 'Bread')] });
  });

  it('searches Catalog and opens Edit for an item already on the shared list', async () => {
    const existing = shoppingItem('apples');
    const view = await render(<ShoppingCatalogPickerSheet items={[existing]} onError={jest.fn()} />);

    const apples = await view.findByRole('button', { name: 'Edit Apples on Shopping' });
    await act(async () => fireEvent.changeText(view.getByLabelText('Search Catalog'), 'apple'));
    expect(view.queryByRole('button', { name: 'Add Bread from Catalog' })).toBeNull();
    fireEvent.press(apples);

    expect(mockPresent).toHaveBeenCalledWith(expect.objectContaining({ props: expect.objectContaining({ existingItem: existing }) }), { detents: [0.68, 0.94] });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/native-sheet/[sheetId]', params: { sheetId: 'details-sheet' } });

    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  it('opens the Shopping-scoped Catalog create route after dismissing the picker', async () => {
    const view = await render(<ShoppingCatalogPickerSheet items={[]} onError={jest.fn()} />);
    fireEvent.press(await view.findByRole('button', { name: 'Create Catalog item' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/shopping/catalog-item',
      params: { shoppingOriginScope: '["user-1","session-1","household-1"]' },
    }));
  });

  it('clears the picker draft on scope change and rejects a late previous-household load', async () => {
    let resolveOld!: (value: { items: CatalogItem[] }) => void;
    const oldLoad = new Promise<{ items: CatalogItem[] }>((resolve) => { resolveOld = resolve; });
    mockedApi.catalogItems
      .mockReturnValueOnce(oldLoad)
      .mockResolvedValueOnce({ items: [catalogItem('new-item', 'New household item')] });
    const view = await render(<ShoppingCatalogPickerSheet items={[]} onError={jest.fn()} />);
    await act(async () => fireEvent.changeText(await view.findByLabelText('Search Catalog'), 'old search'));
    await waitFor(() => expect(mockedApi.catalogItems).toHaveBeenCalledTimes(1));

    mockUserId = 'user-2'; mockSessionId = 'session-2'; mockHouseholdId = 'household-2';
    mockShoppingScope = '["user-2","session-2","household-2"]';
    await act(async () => view.rerender(<ShoppingCatalogPickerSheet items={[]} onError={jest.fn()} />));
    await waitFor(() => expect(view.getByLabelText('Search Catalog').props.value).toBe(''));
    expect(await view.findByRole('button', { name: 'Add New household item from Catalog' })).toBeTruthy();

    await act(async () => { resolveOld({ items: [catalogItem('old-item', 'Old household item')] }); });
    await waitFor(() => expect(view.queryByRole('button', { name: 'Add Old household item from Catalog' })).toBeNull());
  });
});
