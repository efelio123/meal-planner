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
jest.mock('@/features/shopping-list/shopping-swipe-row', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ShoppingSwipeRow: ({ active, children, itemId, itemName, onClose, onDragEnd, onDragStart, onRemove, onReveal }: {
      active: boolean; children: React.ReactNode; itemId: string; itemName: string;
      onClose: () => void; onDragEnd: () => void; onDragStart: () => void; onRemove: () => Promise<void>; onReveal: () => void;
    }) => React.createElement(View, { testID: `shopping-swipe-${itemId}`, onClose, onDragEnd, onDragStart, onRemove, onReveal } as unknown as React.ComponentProps<typeof View>,
      children,
      active ? React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: `Remove ${itemName} from Shopping`, onPress: () => { void onRemove().catch(() => undefined); } }) : null,
    ),
  };
});

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
    expect(screen.getByTestId('shopping-edit-chevron-milk', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('shopping-edit-chevron-bread', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Add an item')).toBeNull();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Edit Milk' })));
    expect(mockPresent).toHaveBeenCalledWith(expect.anything(), { detents: [0.68, 0.94], initialDetent: 1 });
  });

  it('keeps an explicit pull-to-refresh path on the native tab root', async () => {
    await render(<ShoppingListScreen />);
    expect(screen.getByTestId('screen').props.refreshControl.props.refreshing).toBe(false);
    expect(screen.getByTestId('screen').props.refreshControl.props.onRefresh).toEqual(expect.any(Function));
  });

  it('opens the native Catalog picker and keeps refresh explicit on web', async () => {
    await render(<ShoppingListScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Add from Catalog' }));
    expect(mockPresent).toHaveBeenCalledWith(expect.anything(), { detents: [0.65, 0.94], initialDetent: 1 });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/shopping/sheet/picker', params: { sheetId: 'shopping-sheet-1' } });
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

  it('reveals one Delete action on a short swipe, and removes only the selected row on tap or full swipe', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), remove } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
    await render(<ShoppingListScreen />);
    const milkSwipe = screen.getByTestId('shopping-swipe-milk');
    await act(async () => milkSwipe.props.onReveal());
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Remove Milk from Shopping' })).toHaveLength(1);
    await act(async () => milkSwipe.props.onRemove());
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'milk' }));
    await act(async () => screen.getByTestId('shopping-swipe-bread').props.onRemove());
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'bread', is_checked: true }));
  });

  it('shows an error when swipe removal fails without invoking the Clear list warning', async () => {
    const remove = jest.fn().mockRejectedValue(new Error('We couldn’t remove that item. Please try again.'));
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), remove } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ShoppingListScreen />);
    await act(async () => screen.getByTestId('shopping-swipe-milk').props.onRemove().catch(() => undefined));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
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

  it('does not open Edit when a left swipe is cancelled or its revealed row is tapped', async () => {
    await render(<ShoppingListScreen />);
    const swipe = screen.getByTestId('shopping-swipe-milk');
    await act(async () => swipe.props.onDragStart());
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Edit Milk' })));
    expect(mockPresent).not.toHaveBeenCalled();
    await act(async () => swipe.props.onDragEnd());

    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    await act(async () => swipe.props.onDragStart());
    await act(async () => swipe.props.onDragEnd());
    await act(async () => swipe.props.onReveal());
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Edit Milk' })));
    expect(mockPresent).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove Milk from Shopping' })).toBeTruthy();

    now.mockReturnValue(1600);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Edit Milk' })));
    expect(screen.queryByRole('button', { name: 'Remove Milk from Shopping' })).toBeNull();
    now.mockRestore();
  });

  it('closes a revealed swipe when scrolling, refreshing, or opening Add item', async () => {
    await render(<ShoppingListScreen />);
    const reveal = async () => { await act(async () => screen.getByTestId('shopping-swipe-milk').props.onReveal()); };
    const deleteAction = () => screen.queryByRole('button', { name: 'Remove Milk from Shopping' });

    await reveal();
    expect(deleteAction()).toBeTruthy();
    // Scroll events settling from the revealing swipe must not close it.
    await act(async () => fireEvent.scroll(screen.getByTestId('screen'), { nativeEvent: { contentOffset: { y: 20 } } }));
    expect(deleteAction()).toBeTruthy();
    await act(async () => fireEvent(screen.getByTestId('screen'), 'scrollBeginDrag', { nativeEvent: { contentOffset: { y: 20 } } }));
    expect(deleteAction()).toBeTruthy();
    await act(async () => fireEvent.scroll(screen.getByTestId('screen'), { nativeEvent: { contentOffset: { y: 24 } } }));
    expect(deleteAction()).toBeTruthy();
    await act(async () => fireEvent.scroll(screen.getByTestId('screen'), { nativeEvent: { contentOffset: { y: 40 } } }));
    expect(deleteAction()).toBeNull();

    await reveal();
    await act(async () => screen.getByTestId('screen').props.refreshControl.props.onRefresh());
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(deleteAction()).toBeNull();

    await reveal();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Add from Catalog' })));
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(deleteAction()).toBeNull();
  });

  it('closes a revealed swipe when another item is opened', async () => {
    await render(<ShoppingListScreen />);
    await act(async () => screen.getByTestId('shopping-swipe-milk').props.onReveal());
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Edit Bread' })));
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Remove Milk from Shopping' })).toBeNull();
  });
});
