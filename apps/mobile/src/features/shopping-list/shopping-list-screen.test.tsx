import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import ShoppingListScreen from '@/features/shopping-list/shopping-list-screen';
import * as shoppingListHook from '@/features/shopping-list/use-shopping-list';
import { useHouseholdState } from '@/hooks/use-household-state';
import { Alert, Keyboard } from 'react-native';
import type { ShoppingListItem } from '@/lib/api';

const mockPush = jest.fn();
const mockPresent = jest.fn(() => 'shopping-sheet-1');
const mockMarkChanged = jest.fn();
const mockRefresh = jest.fn();
const mockChoiceSelect = new Map<string, (id: string) => void>();
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
    ChoicePicker: ({ label, value, choices, onSelect, onOpen }: { label: string; value: string; choices: { id: string }[]; onSelect: (id: string) => void; onOpen?: () => void }) => { mockChoiceSelect.set(label, onSelect); return React.createElement(
      Pressable,
      { accessibilityRole: 'button', accessibilityLabel: `${label}: ${value}`, onPress: () => { onOpen?.(); if (choices[1]) onSelect(choices[1].id); } },
      React.createElement(Text, null, `${label}: ${value}`),
    ); },
  };
});
jest.mock('@/lib/api', () => ({ api: { catalogItem: jest.fn() } }));
jest.mock('@/features/shopping-list/use-shopping-list', () => ({ useShoppingList: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({ useThemeMode: () => 'light', useTheme: () => ({ activity: '#000', border: '#ccc', disabled: '#999', error: '#b00', elevatedSurface: '#fff', link: '#05a', primary: '#05a', primaryText: '#fff', screen: '#fff', surface: '#fff', surfaceSelected: '#eee', textSecondary: '#555' }) }));
jest.mock('@/features/shopping-list/shopping-swipe-row', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ShoppingSwipeRow: ({ active, children, itemId, itemName, onClose, onDragEnd, onDragStart, onRemove, onReveal, separatorColor }: {
      active: boolean; children: React.ReactNode; itemId: string; itemName: string; separatorColor: string | null;
      onClose: () => void; onDragEnd: () => void; onDragStart: () => void; onRemove: () => Promise<void>; onReveal: () => void;
    }) => React.createElement(View, { testID: `shopping-swipe-${itemId}`, onClose, onDragEnd, onDragStart, onRemove, onReveal, separatorColor } as unknown as React.ComponentProps<typeof View>,
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

function trackKeyboardSubscriptions() {
  const removals: jest.Mock[] = [];
  jest.spyOn(Keyboard, 'addListener').mockImplementation(() => {
    const remove = jest.fn();
    removals.push(remove);
    return { remove };
  });
  return removals;
}

describe('Shopping list screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChoiceSelect.clear();
    mockScopeValue = '["user-1","session-1","household-1"]';
    mockedHouseholdState.mockReturnValue({ selectedHousehold: { id: 'household-1', name: 'Home', time_zone: 'UTC', role: 'member' } } as unknown as ReturnType<typeof useHouseholdState>);
    mockedShoppingList.mockReturnValue({
      add: jest.fn(), addOrReadd: jest.fn().mockResolvedValue('added'), clear: jest.fn().mockResolvedValue(0), clearPurchased: jest.fn().mockResolvedValue(1), clearing: null, error: null, householdId: 'household-1', items: [item('milk', 'Milk'), item('bread', 'Bread', true)],
      loading: false, pendingItemIds: new Set(), refresh: mockRefresh, remove: jest.fn(), toggle: jest.fn().mockResolvedValue(undefined), update: jest.fn(),
    } as unknown as ReturnType<typeof shoppingListHook.useShoppingList>);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['IL', '  mil  ', 'milk'])('matches a trimmed case-insensitive name substring %j', async (query) => {
    await render(<ShoppingListScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), query);
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Bread' })).toBeNull();
    expect(screen.getByTestId('shopping-to-buy-count').props.children).toBe(1);
    expect(screen.getByTestId('shopping-purchased-count').props.children).toBe(0);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('searches Household item names but excludes category, Store and amount text', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [item('milk', 'Milk'), { ...item('soap', 'Dish Soap'), catalog_item_type: 'household', store_id: 'soap-shop', store_name: 'Milk Market', category_name: 'Milk supplies', amount: '99' }] });
    await render(<ShoppingListScreen />);
    const input = screen.getByLabelText('Search shopping list');
    await fireEvent.changeText(input, 'mil');
    expect(screen.queryByRole('button', { name: 'Edit Dish Soap' })).toBeNull();
    await fireEvent.changeText(input, 'SOA');
    expect(screen.getByRole('button', { name: 'Edit Dish Soap' })).toBeTruthy();
    await fireEvent.changeText(input, '99');
    expect(screen.getByText('No items match your search.')).toBeTruthy();
    expect(screen.queryByText('Nothing to buy yet. Add items from your Catalog.')).toBeNull();
    expect(screen.queryByText('No purchased items yet.')).toBeNull();
  });

  it('reveals purchased-only matches and restores the previous collapsed choice after clearing', async () => {
    await render(<ShoppingListScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^Purchased/ }));
    expect(screen.queryByText('Bread')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'bread');
    expect(screen.getByRole('checkbox', { name: 'Mark Bread not purchased' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Purchased/ })).toBeNull();
    expect(screen.getByTestId('shopping-purchased-count').props.children).toBe(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByLabelText('Search shopping list').props.value).toBe('');
    expect(screen.getByRole('button', { name: /^Purchased/ }).props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByText('Bread')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), '   ');
    expect(screen.getByRole('button', { name: /^Purchased/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeTruthy();
  });

  it('combines Store and No store filters with names and provides a useful no-results state', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...item('milk', 'Milk'), store_id: 'market', store_name: 'Market' }, item('oat', 'Oat milk')] });
    await render(<ShoppingListScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    await act(async () => mockChoiceSelect.get('Store')!('market'));
    expect(screen.queryByRole('button', { name: 'Edit Oat milk' })).toBeNull();
    await act(async () => mockChoiceSelect.get('Store')!('none'));
    expect(screen.getByRole('button', { name: 'Edit Oat milk' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Milk' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'bread');
    expect(screen.getByText('Try another name or change the Store filter.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Store: No store' })).toBeTruthy();
  });

  it.each([
    ['recent', ['Edit Item Beta', 'Edit Item Alpha']],
    ['name-asc', ['Edit Item Alpha', 'Edit Item Beta']],
    ['name-desc', ['Edit Item Beta', 'Edit Item Alpha']],
    ['store', ['Edit Item Beta', 'Edit Item Alpha']],
    ['category', ['Edit Item Alpha', 'Edit Item Beta']],
  ])('retains %s sorting while searching and clearing', async (sort, expected) => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [
      { ...item('a', 'Item Alpha'), created_at: '2026-10-01T11:00:00Z', store_id: 'z-market', store_name: 'Z market', category_id: 'a-category', category_name: 'A category' },
      { ...item('b', 'Item Beta'), created_at: '2026-10-02T11:00:00Z', store_id: 'a-market', store_name: 'A market', category_id: 'z-category', category_name: 'Z category' }, item('c', 'Other'),
    ] });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!(sort as string));
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'item');
    expect(screen.getAllByRole('button', { name: /^Edit / }).map((row) => row.props.accessibilityLabel)).toEqual(expected);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: /^Sort: / }).props.accessibilityLabel).not.toBe('Sort: Not selected');
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'item');
    expect(screen.getAllByRole('button', { name: /^Edit / }).map((row) => row.props.accessibilityLabel)).toEqual(expected);
  });

  it('keeps the query while checked rows move sections, refresh, and removal update the source list', async () => {
    const milk = item('milk', 'Milk');
    const view = await render(<ShoppingListScreen />);
    const input = screen.getByLabelText('Search shopping list');
    await fireEvent.changeText(input, 'milk');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Mark Milk purchased' }));
    expect(mockedShoppingList().toggle).toHaveBeenCalledWith(milk);
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...milk, is_checked: true }] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.getByTestId('shopping-to-buy-count').props.children).toBe(0);
    expect(screen.getByRole('checkbox', { name: 'Mark Milk not purchased' })).toBeTruthy();
    await act(async () => screen.getByTestId('screen').props.refreshControl.props.onRefresh());
    expect(screen.getByLabelText('Search shopping list').props.value).toBe('milk');
    await act(async () => screen.getByTestId('shopping-swipe-milk').props.onRemove());
    expect(mockedShoppingList().remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'milk' }));
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.getByText('No items match your search.')).toBeTruthy();
    expect(screen.getByLabelText('Search shopping list').props.value).toBe('milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Your shared Shopping list is ready for Catalog items.')).toBeTruthy();
  });

  it.each(['household', 'session'])('clears search and keyboard ownership when the %s scope changes', async (kind) => {
    const removals = trackKeyboardSubscriptions();
    const view = await render(<ShoppingListScreen />);
    await fireEvent(screen.getByLabelText('Search shopping list'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    expect(removals.length).toBeGreaterThan(0);
    expect(removals.every((remove) => remove.mock.calls.length === 0)).toBe(true);
    mockScopeValue = kind === 'household' ? '["user-1","session-1","household-2"]' : '["user-1","session-2","household-1"]';
    await view.rerender(<ShoppingListScreen />);
    expect(screen.getByLabelText('Search shopping list').props.value).toBe('');
    expect(removals.every((remove) => remove.mock.calls.length > 0)).toBe(true);
  });

  it('keeps cleanup household-wide with zero visible matches, and preserves the query after success', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.find((button) => button.style === 'destructive')?.onPress?.(); });
    const view = await render(<ShoppingListScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'missing');
    expect(screen.getByText('Applies to all stores, including hidden items.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear purchased items' }));
    expect(mockedShoppingList().clearPurchased).toHaveBeenCalledWith();
    expect(mockedShoppingList().clear).not.toHaveBeenCalled();
    expect(await screen.findByText('1 purchased item removed.')).toBeTruthy();
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [item('milk', 'Milk')] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.getByLabelText('Search shopping list').props.value).toBe('missing');
    expect(screen.getByRole('button', { name: 'Clear entire list' })).toBeTruthy();
    alert.mockRestore();
  });

  it('closes swipes on search focus, typing and clear without swallowing the next checkbox tap', async () => {
    await render(<ShoppingListScreen />);
    for (const action of ['focus', 'type', 'clear']) {
      await act(async () => { const row = screen.getByTestId('shopping-swipe-milk'); row.props.onDragStart(); row.props.onDragEnd(); row.props.onReveal(); });
      if (action === 'focus') await fireEvent(screen.getByLabelText('Search shopping list'), 'focus');
      else if (action === 'type') await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'mi');
      else await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
      expect(screen.queryByRole('button', { name: 'Remove Milk from Shopping' })).toBeNull();
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Mark Milk purchased' }));
    }
    expect(mockedShoppingList().toggle).toHaveBeenCalledTimes(3);
  });

  it.each(['Add from Catalog', 'Edit Milk', 'Store: All stores', 'Sort: Recently added'])('releases the inline keyboard before opening %s', async (action) => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const removals = trackKeyboardSubscriptions();
    await render(<ShoppingListScreen />);
    await fireEvent(screen.getByLabelText('Search shopping list'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'mi');
    await fireEvent.press(screen.getByRole('button', { name: action }));
    expect(dismiss).toHaveBeenCalled();
    expect(removals.every((remove) => remove.mock.calls.length > 0)).toBe(true);
    expect(screen.getByLabelText('Search shopping list').props.value).toBe('mi');
  });

  it('clears text without leaving search, and submits to dismiss the keyboard', async () => {
    const removals = trackKeyboardSubscriptions();
    await render(<ShoppingListScreen />);
    const input = screen.getByLabelText('Search shopping list');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, 'milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(removals.length).toBeGreaterThan(0);
    expect(removals.every((remove) => remove.mock.calls.length === 0)).toBe(true);
    await fireEvent(input, 'submitEditing');
    expect(removals.every((remove) => remove.mock.calls.length > 0)).toBe(true);
    expect(screen.getByTestId('screen').props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByTestId('screen').props.automaticallyAdjustKeyboardInsets).toBe(false);
  });

  it('collapses and expands a group while retaining its label, count and section totals', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...item('milk', 'Milk'), category_id: 'd', category_name: 'Dairy' }] });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    const button = screen.getByRole('button', { name: 'Dairy, 1 item' });
    expect(button.props.accessibilityState.expanded).toBe(true);
    await fireEvent.press(button);
    expect(screen.getByRole('button', { name: 'Dairy, 1 item' }).props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByRole('button', { name: 'Edit Milk' })).toBeNull();
    expect(screen.getByTestId('shopping-to-buy-count').props.children).toBe(1);
    expect(screen.queryByText('Nothing to buy yet. Add items from your Catalog.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    expect(screen.getByRole('checkbox', { name: 'Mark Milk purchased' })).toBeTruthy();
  });

  it('keeps choices independent across sections, modes, flat sorts and missing-value groups', async () => {
    const dairy = { category_id: 'd', category_name: 'Dairy' };
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...item('milk', 'Milk'), ...dairy }, { ...item('eggs', 'Eggs', true), ...dairy }] });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.press(within(screen.getByTestId('shopping-group-needed-category:d')).getByRole('button', { name: 'Dairy, 1 item' }));
    expect(screen.getByRole('button', { name: 'Edit Eggs' })).toBeTruthy();
    await act(async () => mockChoiceSelect.get('Sort')!('store'));
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('shopping-group-needed-store:none')).getByRole('button', { name: 'No store, 1 item' }));
    expect(screen.queryByRole('button', { name: 'Edit Milk' })).toBeNull();
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    expect(within(screen.getByTestId('shopping-group-needed-category:d')).getByRole('button', { name: 'Dairy, 1 item' }).props.accessibilityState.expanded).toBe(false);
    expect(screen.getByRole('button', { name: 'Edit Eggs' })).toBeTruthy();
    await act(async () => mockChoiceSelect.get('Sort')!('recent'));
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeTruthy();
  });

  it('allows collapsing during search, keeps that query’s choices across updates, and restores normal choices', async () => {
    const milk = { ...item('milk', 'Milk'), category_id: 'd', category_name: 'Dairy' };
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [milk] });
    const view = await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'mi');
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    expect(screen.queryByRole('button', { name: 'Edit Milk' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), '  MI  ');
    await act(async () => screen.getByTestId('screen').props.refreshControl.props.onRefresh());
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...milk, category_name: 'Chilled' }] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.getByRole('button', { name: 'Chilled, 1 item' }).props.accessibilityState.expanded).toBe(false);
    await act(async () => mockChoiceSelect.get('Sort')!('name-asc'));
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    expect(screen.queryByRole('button', { name: 'Edit Milk' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: 'Chilled, 1 item' }).props.accessibilityState.expanded).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Chilled, 1 item' }));
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Chilled, 1 item' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: 'Chilled, 1 item' }).props.accessibilityState.expanded).toBe(true);
  });

  it('retains hidden group preferences across filters and removal/reappearance, while new groups open', async () => {
    const milk = { ...item('milk', 'Milk'), category_id: 'd', category_name: 'Dairy', store_id: 'market', store_name: 'Market' };
    const soap = { ...item('soap', 'Soap'), category_id: 'clean', category_name: 'Cleaning', store_id: 'corner', store_name: 'Corner' };
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [milk, soap] });
    const view = await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    await act(async () => mockChoiceSelect.get('Store')!('corner'));
    expect(screen.queryByText('Dairy')).toBeNull();
    await act(async () => mockChoiceSelect.get('Store')!('all'));
    expect(screen.getByRole('button', { name: 'Dairy, 1 item' }).props.accessibilityState.expanded).toBe(false);
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [soap] });
    await view.rerender(<ShoppingListScreen />);
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [milk, soap, { ...item('bread', 'Bread'), category_id: 'pantry', category_name: 'Pantry' }] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.getByRole('button', { name: 'Dairy, 1 item' }).props.accessibilityState.expanded).toBe(false);
    expect(screen.getByRole('button', { name: 'Pantry, 1 item' }).props.accessibilityState.expanded).toBe(true);
  });

  it.each(['household', 'session'])('resets normal and search collapse choices after a %s change', async (change) => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...item('milk', 'Milk'), category_id: 'd', category_name: 'Dairy' }] });
    const view = await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    mockScopeValue = change === 'household' ? '["user-1","session-1","household-2"]' : '["user-1","session-2","household-1"]';
    await view.rerender(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    expect(screen.getByRole('button', { name: 'Dairy, 1 item' }).props.accessibilityState.expanded).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    expect(screen.getByRole('button', { name: 'Dairy, 1 item' }).props.accessibilityState.expanded).toBe(true);
  });

  it.each(['success', 'failure', 'cancel'])('resets both collapse sets only after successful full clear (%s)', async (outcome) => {
    const clear = outcome === 'failure' ? jest.fn().mockRejectedValue(new Error('Clear failed')) : jest.fn().mockResolvedValue(1);
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), clear, items: [{ ...item('milk', 'Milk'), category_id: 'd', category_name: 'Dairy' }] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear entire list' }));
    const buttons = alert.mock.calls.at(-1)![2]!;
    await act(async () => buttons.find((button) => button.style === (outcome === 'cancel' ? 'cancel' : 'destructive'))?.onPress?.());
    if (outcome === 'cancel') expect(clear).not.toHaveBeenCalled(); else expect(clear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Dairy, 1 item' }).props.accessibilityState.expanded).toBe(outcome === 'success');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: 'Dairy, 1 item' }).props.accessibilityState.expanded).toBe(outcome === 'success');
    alert.mockRestore();
  });

  it('keeps a checked item hidden in an explicitly collapsed Purchased destination until its header opens', async () => {
    const dairy = { category_id: 'd', category_name: 'Dairy' };
    const milk = { ...item('milk', 'Milk'), ...dairy };
    const eggs = { ...item('eggs', 'Eggs', true), ...dairy };
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [milk, eggs] });
    const view = await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.press(within(screen.getByTestId('shopping-group-purchased-category:d')).getByRole('button', { name: 'Dairy, 1 item' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Mark Milk purchased' }));
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...milk, is_checked: true }, eggs] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.queryByTestId('shopping-group-needed-category:d')).toBeNull();
    expect(screen.getByRole('button', { name: 'Dairy, 2 items' }).props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByRole('button', { name: 'Edit Milk' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 2 items' }));
    expect(screen.getByRole('checkbox', { name: 'Mark Milk not purchased' })).toBeTruthy();
  });

  it('keeps same-named category choices independent and preserves them during purchased-only cleanup', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [
      { ...item('rice', 'Rice'), category_id: 'food-pantry', category_name: 'Pantry' },
      { ...item('paper', 'Paper'), catalog_item_type: 'household', category_id: 'household-pantry', category_name: 'Pantry' }, item('eggs', 'Eggs', true),
    ] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.find((button) => button.style === 'destructive')?.onPress?.(); });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.press(screen.getByRole('button', { name: 'Pantry (Food), 1 item' }));
    expect(screen.getByRole('button', { name: 'Edit Paper' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Rice' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear purchased items' }));
    expect(await screen.findByText('1 purchased item removed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pantry (Food), 1 item' }).props.accessibilityState.expanded).toBe(false);
    expect(screen.getByRole('button', { name: 'Pantry (Household), 1 item' }).props.accessibilityState.expanded).toBe(true);
    alert.mockRestore();
  });

  it('closes a revealed swipe when a group is collapsed without invoking a row action', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...item('milk', 'Milk'), category_id: 'd', category_name: 'Dairy' }] });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await act(async () => screen.getByTestId('shopping-swipe-milk').props.onReveal());
    await fireEvent.press(screen.getByRole('button', { name: 'Dairy, 1 item' }));
    expect(screen.queryByRole('button', { name: 'Remove Milk from Shopping' })).toBeNull();
    expect(mockedShoppingList().toggle).not.toHaveBeenCalled();
    expect(mockedShoppingList().remove).not.toHaveBeenCalled();
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('adds accessible category toggles and counts in both sections, reusing natural-metric emoji and row borders', async () => {
    const dairy = { category_id: 'dairy', category_name: 'Dairy', category_emoji: '🥛' };
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [
      { ...item('milk', 'Milk'), ...dairy }, { ...item('butter', 'Butter'), ...dairy }, { ...item('eggs', 'Eggs', true), ...dairy },
      { ...item('soap', 'Soap'), catalog_item_type: 'household', category_id: 'cleaning', category_name: 'Cleaning' },
    ] });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    expect(screen.getByRole('button', { name: 'Dairy, 2 items' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dairy, 1 item' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cleaning, 1 item' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dairy, 2 items' }).props.accessibilityState.expanded).toBe(true);
    expect(screen.getAllByText('🥛', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByTestId('shopping-swipe-butter').props.separatorColor).toBe('#ccc');
    expect(screen.getByTestId('shopping-swipe-milk').props.separatorColor).toBeNull();
    expect(screen.getByTestId('shopping-swipe-soap').props.separatorColor).toBeNull();
    expect(screen.getByTestId('shopping-to-buy-count').props.children).toBe(3);
    expect(screen.getByTestId('shopping-purchased-count').props.children).toBe(1);
  });

  it.each(['recent', 'name-asc', 'name-desc'])('keeps %s flat after leaving a grouped sort', async (sort) => {
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    expect(screen.getAllByTestId(/^shopping-group-/)).toHaveLength(2);
    await act(async () => mockChoiceSelect.get('Sort')!(sort));
    expect(screen.queryAllByTestId(/^shopping-group-/)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Bread' })).toBeTruthy();
  });

  it('groups by actual Stores, retains the selected Store heading and puts No store last', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [item('none', 'Apples'), { ...item('milk', 'Milk'), store_id: 'market', store_name: 'Market', catalog_preferred_store_id: 'wrong' }, { ...item('rice', 'Rice'), store_id: 'corner', store_name: 'Corner shop' }] });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('store'));
    expect(screen.getAllByTestId(/^shopping-group-needed-/).map((group) => group.props.testID)).toEqual(['shopping-group-needed-store:corner', 'shopping-group-needed-store:market', 'shopping-group-needed-store:none']);
    await act(async () => mockChoiceSelect.get('Store')!('market'));
    expect(screen.getByRole('button', { name: 'Market, 1 item' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'No store, 1 item' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'rice');
    expect(screen.queryAllByTestId(/^shopping-group-/)).toHaveLength(0);
    expect(screen.getByText('No items match your search.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear entire list' })).toBeTruthy();
  });

  it('keeps Food/Household category identities and labels stable when Purchased is collapsed and search hides a collision', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [
      { ...item('rice', 'Rice', true), category_id: 'food-pantry', category_name: 'Pantry' },
      { ...item('paper', 'Paper'), catalog_item_type: 'household', category_id: 'household-pantry', category_name: 'Pantry' },
    ] });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.press(screen.getByRole('button', { name: /^Purchased/ }));
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'paper');
    expect(screen.getByRole('button', { name: 'Pantry (Household), 1 item' })).toBeTruthy();
    expect(screen.queryByText('Pantry (Food)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'rice');
    expect(screen.getByRole('button', { name: 'Pantry (Food), 1 item' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: /^Purchased/ }).props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByText('Pantry (Food)')).toBeNull();
  });

  it('moves checked rows into the matching Purchased group and refreshes labels without losing query or sort', async () => {
    const milk = { ...item('milk', 'Milk'), category_id: 'dairy', category_name: 'Dairy' };
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [milk] });
    const view = await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Mark Milk purchased' }));
    expect(mockedShoppingList().toggle).toHaveBeenCalledWith(milk);
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...milk, is_checked: true }] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.queryByTestId('shopping-group-needed-category:dairy')).toBeNull();
    expect(within(screen.getByTestId('shopping-group-purchased-category:dairy')).getByRole('checkbox', { name: 'Mark Milk not purchased' })).toBeTruthy();
    await act(async () => screen.getByTestId('screen').props.refreshControl.props.onRefresh());
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...milk, is_checked: true, category_name: 'Chilled' }] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.getByRole('button', { name: 'Chilled, 1 item' })).toBeTruthy();
    expect(screen.queryByText('Dairy')).toBeNull();
    expect(screen.getByLabelText('Search shopping list').props.value).toBe('milk');
    expect(screen.getByRole('button', { name: 'Sort: Category' })).toBeTruthy();
  });

  it('closes revealed swipe actions on group-mode changes and keeps grouped deletion on the actual row', async () => {
    await render(<ShoppingListScreen />);
    await act(async () => screen.getByTestId('shopping-swipe-milk').props.onReveal());
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    expect(screen.queryByRole('button', { name: 'Remove Milk from Shopping' })).toBeNull();
    await act(async () => screen.getByTestId('shopping-swipe-milk').props.onRemove());
    expect(mockedShoppingList().remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'milk' }));
  });

  it('clears hidden purchased entries household-wide while search displays just one category', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.find((button) => button.style === 'destructive')?.onPress?.(); });
    await render(<ShoppingListScreen />);
    await act(async () => mockChoiceSelect.get('Sort')!('category'));
    await fireEvent.changeText(screen.getByLabelText('Search shopping list'), 'milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear purchased items' }));
    expect(mockedShoppingList().clearPurchased).toHaveBeenCalledWith();
    expect(mockedShoppingList().clear).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Search shopping list').props.value).toBe('milk');
    expect(screen.getByRole('button', { name: 'Sort: Category' })).toBeTruthy();
    alert.mockRestore();
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
    fireEvent.press(screen.getByRole('button', { name: 'Clear entire list' }));
    expect(alert).toHaveBeenCalledWith('Clear the whole list?', expect.stringContaining('all stores'), expect.any(Array));
    alert.mockRestore();
  });

  it('keeps cleanup available with Purchased collapsed and closes a revealed swipe before confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ShoppingListScreen />);
    await act(async () => screen.getByTestId('shopping-swipe-milk').props.onReveal());
    await fireEvent.press(screen.getByRole('button', { name: /^Purchased/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear purchased items' }));
    expect(screen.queryByRole('button', { name: 'Remove Milk from Shopping' })).toBeNull();
    expect(alert).toHaveBeenCalledWith('Clear purchased items?', 'This removes purchased items from all stores in this household. Items still needed will stay on the list.', expect.any(Array));
    const buttons = alert.mock.calls.at(-1)![2]!;
    expect(buttons.find((button) => button.text === 'Cancel')?.style).toBe('cancel');
    expect(mockedShoppingList().clearPurchased).not.toHaveBeenCalled();
    await act(async () => buttons.find((button) => button.style === 'destructive')!.onPress!());
    expect(mockedShoppingList().clearPurchased).toHaveBeenCalledTimes(1);
    expect(mockedShoppingList().clear).not.toHaveBeenCalled();
    expect(screen.getByText('1 purchased item removed.')).toBeTruthy();
    alert.mockRestore();
  });

  it('uses all loaded rows for cleanup eligibility even under a Store filter', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [
      { ...item('milk', 'Milk'), store_id: 'market', store_name: 'Market' },
      { ...item('bread', 'Bread', true), store_id: 'other', store_name: 'Other' },
    ] });
    const view = await render(<ShoppingListScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Store: All stores' }));
    expect(screen.queryByText('Bread')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear purchased items' })).toBeTruthy();
    expect(screen.getByText('Applies to all stores, including hidden items.')).toBeTruthy();
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [{ ...item('milk', 'Milk'), store_id: 'market', store_name: 'Market' }] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.getByRole('button', { name: 'Store: Market' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear purchased items' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear entire list' })).toBeTruthy();
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), items: [] });
    await view.rerender(<ShoppingListScreen />);
    expect(screen.queryByRole('button', { name: 'Clear entire list' })).toBeNull();
  });

  it.each(['pending', 'purchased', 'all'] as const)('disables competing clearing while %s is running', async (mode) => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), clearing: mode === 'pending' ? null : mode, pendingItemIds: new Set(mode === 'pending' ? ['milk'] : []) });
    await render(<ShoppingListScreen />);
    expect(screen.getByRole('button', { name: 'Clear purchased items' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear entire list' })).toBeDisabled();
    if (mode !== 'pending') {
      expect(screen.getByRole('button', { name: 'Add from Catalog' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Mark Milk purchased' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeDisabled();
    }
  });

  it.each([false, true])('ignores a confirmation across scope changes, including returning to the original scope (%s)', async (returnToOriginal) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<ShoppingListScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear purchased items' }));
    const confirm = alert.mock.calls.at(-1)![2]!.find((button) => button.style === 'destructive')!.onPress!;
    mockScopeValue = '["user-2","session-2","household-2"]';
    await view.rerender(<ShoppingListScreen />);
    if (returnToOriginal) {
      mockScopeValue = '["user-1","session-1","household-1"]';
      await view.rerender(<ShoppingListScreen />);
    }
    await act(async () => confirm());
    expect(mockedShoppingList().clearPurchased).not.toHaveBeenCalled();
    expect(mockedShoppingList().clear).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it.each([0, 2])('reports the actual server count %s', async (count) => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), clearPurchased: jest.fn().mockResolvedValue(count) });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.find((button) => button.style === 'destructive')?.onPress?.(); });
    await render(<ShoppingListScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear purchased items' }));
    expect(await screen.findByText(count ? '2 purchased items removed.' : 'No purchased items to clear.')).toBeTruthy();
    alert.mockRestore();
  });

  it('shows a purchased-only failure without trying clear-all', async () => {
    mockedShoppingList.mockReturnValue({ ...mockedShoppingList(), clearPurchased: jest.fn().mockRejectedValue(new Error('We couldn’t clear purchased items. Please try again.')) });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.find((button) => button.style === 'destructive')?.onPress?.(); });
    await render(<ShoppingListScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear purchased items' }));
    expect(await screen.findByText('We couldn’t clear purchased items. Please try again.')).toBeTruthy();
    expect(screen.getByText('Bread')).toBeTruthy();
    expect(mockedShoppingList().clear).not.toHaveBeenCalled();
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
      buttons?.find((button) => button.text === 'Clear entire list')?.onPress?.();
    });
    await render(<ShoppingListScreen />);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Clear entire list' })));
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
