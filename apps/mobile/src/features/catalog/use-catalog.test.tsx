import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useHouseholdState } from '@/hooks/use-household-state';
import { api, type CatalogItem } from '@/lib/api';
import { useCatalog } from './use-catalog';

let mockRevision = 0;

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ sessionId: 'session-1', userId: 'user-1' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: jest.fn() }));
jest.mock('./catalog-context', () => ({
  useCatalogContext: () => ({ changeKind: 'items', markChanged: jest.fn(), revision: mockRevision }),
}));
jest.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: { catalogItems: jest.fn(), catalogUnits: jest.fn(), catalogCategories: jest.fn(), catalogStores: jest.fn() },
}));

const mockedApi = jest.mocked(api);
const mockedHouseholdState = jest.mocked(useHouseholdState);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function item(name: string): CatalogItem {
  return {
    id: 'milk', household_id: 'household-1', item_type: 'food', name,
    category_id: null, category_name: null, shopping_unit_code: null,
    shopping_unit_label: null, shopping_unit_source: null,
    custom_shopping_unit_id: null, preferred_store_id: null,
    preferred_store_name: null, recipe_measurement_dimension: null,
    recipe_measurement_unit_code: null, recipe_measurement_unit_label: null,
    created_at: '2026-10-03T00:00:00Z', updated_at: '2026-10-03T00:00:00Z',
  };
}

describe('useCatalog refresh indicator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRevision = 0;
    mockedHouseholdState.mockReturnValue({
      getToken: jest.fn().mockResolvedValue('token'),
      selectedHousehold: { id: 'household-1', name: 'Household', role: 'member', time_zone: 'UTC' },
    } as unknown as ReturnType<typeof useHouseholdState>);
    mockedApi.catalogItems.mockResolvedValue({ items: [item('Milk')] });
    mockedApi.catalogUnits.mockResolvedValue({ shopping_units: { built_in: [], household: [] }, recipe_measurement_units: [] });
    mockedApi.catalogCategories.mockResolvedValue({ categories: [] });
    mockedApi.catalogStores.mockResolvedValue({ stores: [] });
  });

  it('updates items after an edit without starting pull-to-refresh, but shows it for a manual pull', async () => {
    const view = await renderHook(() => useCatalog());
    await waitFor(() => expect(view.result.current.items[0]?.name).toBe('Milk'));

    const edited = deferred<{ items: CatalogItem[] }>();
    mockedApi.catalogItems.mockReturnValueOnce(edited.promise);
    mockRevision += 1;
    await view.rerender(undefined);
    await waitFor(() => expect(mockedApi.catalogItems).toHaveBeenCalledTimes(2));
    expect(view.result.current.refreshing).toBe(false);

    await act(async () => { edited.resolve({ items: [item('Oat milk')] }); });
    expect(view.result.current.items[0]?.name).toBe('Oat milk');
    expect(view.result.current.refreshing).toBe(false);

    const manual = deferred<{ items: CatalogItem[] }>();
    mockedApi.catalogItems.mockReturnValueOnce(manual.promise);
    await act(async () => { void view.result.current.refresh(); });
    await waitFor(() => expect(mockedApi.catalogItems).toHaveBeenCalledTimes(3));
    expect(view.result.current.refreshing).toBe(true);

    await act(async () => { manual.resolve({ items: [item('Oat milk')] }); });
    expect(view.result.current.refreshing).toBe(false);
  });
});
