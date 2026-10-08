import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ShoppingListScreen from '@/features/shopping-list/shopping-list-screen';
import * as shoppingListHook from '@/features/shopping-list/use-shopping-list';
import { useHouseholdState } from '@/hooks/use-household-state';
import { Alert } from 'react-native';
import type { ShoppingListItem } from '@/lib/api';

const mockPush = jest.fn();
const mockPresent = jest.fn(() => 'shopping-sheet-1');
const mockMarkChanged = jest.fn();
const mockRefresh = jest.fn();
let mockScopeValue = '["user-1","session-1","household-1"]';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => { callback(); },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), dismissAll: jest.fn(), setParams: jest.fn() }),
}));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: 'user-1', sessionId: 'session-1' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: jest.fn() }));
jest.mock('@/features/native-sheets/native-sheet-context', () => ({ useNativeSheetFlow: () => ({ present: mockPresent, remove: jest.fn() }) }));
jest.mock('@/features/shopping-list/shopping-context', () => ({ useShoppingContext: () => ({ scope: mockScopeValue, createdItem: null, setCreatedItem: jest.fn(), markChanged: mockMarkChanged, revisionForHousehold: () => 0 }) }));
jest.mock('@/features/meal-plan/meal-plan-context', () => ({ useMealPlanContextOptional: () => null }));
jest.mock('@/features/catalog/choice-picker', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ChoicePicker: ({ label, value, choices, onSelect }: { label: string; value: string; choices: { id: string }[]; onSelect: (id: string) => void }) => React.createElement(
      Pressable,
      { accessibilityRole: 'button', accessibilityLabel: `${label}: ${value}`, onPress: () => choices[1] && onSelect(choices[1].id) },
      React.createElement(Text, null, `${label}: ${value}`),
    ),
  };
});
jest.mock('@/lib/api', () => ({ api: { catalogItem: jest.fn() } }));
jest.mock('@/features/shopping-list/use-shopping-list', () => ({ useShoppingList: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ activity: '#000', border: '#ccc', disabled: '#999', error: '#b00', elevatedSurface: '#fff', link: '#05a', primary: '#05a', primaryText: '#fff', screen: '#fff', surface: '#fff', surfaceSelected: '#eee', textSecondary: '#555' }) }));

const mockedHouseholdState = jest.mocked(useHouseholdState);
const mockedShoppingList = jest.mocked(shoppingListHook.useShoppingList);

function item(id: string, name: string, checked = false): ShoppingListItem {
  return { id, name, is_checked: checked, checked_at: checked ? '2026-10-01T12:00:00Z' : null, checked_by_user_id: checked ? 'user-1' : null, created_by_user_id: 'user-1', created_at: '2026-10-01T11:00:00Z', catalog_item_id: `catalog-${id}`, catalog_item_type: 'food', store_id: null, store_name: null, amount: null, unit_label: null, category_name: null, catalog_item_archived: false };
}

describe('Shopping list screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScopeValue = '["user-1","session-1","household-1"]';
    mockedHouseholdState.mockReturnValue({ selectedHousehold: { id: 'household-1', name: 'Home', time_zone: 'UTC', role: 'member' } } as unknown as ReturnType<typeof useHouseholdState>);
    mockedShoppingList.mockReturnValue({
      add: jest.fn(), clear: jest.fn().mockResolvedValue(undefined), error: null, householdId: 'household-1', items: [item('milk', 'Milk'), item('bread', 'Bread', true)],
      loading: false, pendingItemIds: new Set(), refresh: mockRefresh, remove: jest.fn(), toggle: jest.fn().mockResolvedValue(undefined), update: jest.fn(),
    } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
  });

  it('shows the shared-list hierarchy, To buy/Purchased groups, and Catalog-only Add action', async () => {
    await render(<ShoppingListScreen />);
    expect(screen.getByText('Shopping')).toBeTruthy();
    expect(screen.getByText('Home · shared list')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add from Catalog' })).toBeTruthy();
    expect(screen.getByText('To buy')).toBeTruthy();
    expect(screen.getByText('Purchased')).toBeTruthy();
    expect(screen.getByText('Milk')).toBeTruthy();
    expect(screen.getByText('Bread')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Add an item')).toBeNull();
  });

  it('keeps an explicit pull-to-refresh path on the native tab root', async () => {
    await render(<ShoppingListScreen />);
    expect(screen.getByTestId('screen').props.refreshControl.props.refreshing).toBe(false);
    expect(screen.getByTestId('screen').props.refreshControl.props.onRefresh).toEqual(expect.any(Function));
  });

  it('opens the native Catalog picker and keeps refresh explicit on web', async () => {
    await render(<ShoppingListScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Add from Catalog' }));
    expect(mockPresent).toHaveBeenCalledWith(expect.anything(), { detents: [0.65, 0.94] });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/native-sheet/[sheetId]', params: { sheetId: 'shopping-sheet-1' } });
  });

  it('toggles only the row checkbox and catches a failed optimistic update visibly', async () => {
    const toggle = jest.fn().mockRejectedValue(new Error('We couldn’t update that item.'));
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), toggle } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
    await render(<ShoppingListScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('checkbox', { name: 'Mark Milk purchased' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole('alert').props.children).toBe('We couldn’t update that item.'));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('shows a retry action for list loading errors', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), error: 'We couldn’t load the shopping list.', items: [] } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
    await render(<ShoppingListScreen />);
    expect(screen.getByRole('alert').props.children).toBe('We couldn’t load the shopping list.');
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows Clear list only while rows exist and asks before destructive clearing', async () => {
    const clear = jest.fn().mockResolvedValue(undefined);
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), clear } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ShoppingListScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Clear list' }));
    expect(alert).toHaveBeenCalledWith('Clear the whole list?', expect.stringContaining('all stores'), expect.any(Array));
    alert.mockRestore();
  });

  it('applies store filtering and sorting locally without another list request', async () => {
    mockedShoppingList.mockReturnValue({
      ...mockedShoppingList(),
      items: [
        { ...item('beta', 'Beta'), store_id: 'store-1', store_name: 'Market' },
        { ...item('alpha', 'Alpha'), store_id: 'store-1', store_name: 'Market' },
        { ...item('other', 'Other'), store_id: 'store-2', store_name: 'Corner shop' },
      ],
    } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
    await render(<ShoppingListScreen />);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Store: All stores' })));
    expect(screen.queryByRole('button', { name: 'Edit Other' })).toBeNull();
    expect(screen.getByText('To buy')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Sort: Recently added' })));
    expect(screen.getAllByRole('button', { name: /^Edit / }).map((button) => button.props.accessibilityLabel)).toEqual([
      'Edit Alpha', 'Edit Beta',
    ]);
  });

  it('resets household-specific filters when the signed-in scope changes', async () => {
    mockedShoppingList.mockReturnValue({
      ...mockedShoppingList(),
      items: [{ ...item('milk', 'Milk'), store_id: 'store-1', store_name: 'Market' }],
    } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
    const view = await render(<ShoppingListScreen />);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Store: All stores' })));
    expect(screen.getByRole('button', { name: 'Store: Market' })).toBeTruthy();
    mockScopeValue = '["user-2","session-2","household-2"]';
    await act(async () => view.rerender(<ShoppingListScreen />));
    expect(screen.getByRole('button', { name: 'Store: All stores' })).toBeTruthy();
  });

  it('clears all rows only after the explicit destructive confirmation', async () => {
    const clear = jest.fn().mockResolvedValue(undefined);
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), clear } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Clear list')?.onPress?.();
    });
    await render(<ShoppingListScreen />);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Clear list' })));
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});
