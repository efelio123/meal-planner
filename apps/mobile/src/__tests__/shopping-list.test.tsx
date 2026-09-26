import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import HouseholdHome from '@/app/(app)';
import * as shoppingListHook from '@/hooks/use-shopping-list';
import { useHouseholdState } from '@/hooks/use-household-state';
import { api, type ShoppingList, type ShoppingListItem } from '@/lib/api';

jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: jest.fn() }));
jest.mock('@/lib/api', () => ({
  api: {
    shoppingList: jest.fn(),
    addShoppingListItem: jest.fn(),
    setShoppingListItemChecked: jest.fn(),
    deleteShoppingListItem: jest.fn(),
  },
}));
jest.mock('@/components/sign-out-action', () => ({ SignOutAction: () => null }));
jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    activity: '#000000',
    border: '#cccccc',
    disabled: '#999999',
    error: '#b00020',
    inputBackground: '#ffffff',
    inputPlaceholder: '#555555',
    inputText: '#111111',
    link: '#0055aa',
    primary: '#0055aa',
    primaryText: '#ffffff',
    screen: '#ffffff',
    text: '#111111',
  }),
  useThemeMode: () => 'light',
}));

const mockedHouseholdState = jest.mocked(useHouseholdState);
const mockedApi = jest.mocked(api);
const getToken = jest.fn().mockResolvedValue('session-token');
let selectedHouseholdId: string;

function item(id: string, name = id, checked = false): ShoppingListItem {
  return {
    id,
    name,
    is_checked: checked,
    checked_at: checked ? '2026-09-01T12:00:00Z' : null,
    checked_by_user_id: checked ? 'user-a' : null,
    created_by_user_id: 'user-a',
    created_at: '2026-09-01T11:00:00Z',
  };
}

function listResponse(householdId: string, items: ShoppingListItem[]) {
  return { shopping_list: { id: `list-${householdId}`, household_id: householdId, items } satisfies ShoppingList };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('shopping-list screen', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getToken.mockResolvedValue('session-token');
    selectedHouseholdId = 'household-a';
    mockedHouseholdState.mockImplementation(() => ({
      getToken,
      selectedHousehold: { id: selectedHouseholdId, name: selectedHouseholdId, time_zone: 'UTC', role: 'member' },
    }) as unknown as ReturnType<typeof useHouseholdState>);
    mockedApi.shoppingList.mockImplementation(async (_token, householdId) => listResponse(householdId, []));
    mockedApi.addShoppingListItem.mockResolvedValue({ item: item('added', 'Added item') });
    mockedApi.setShoppingListItemChecked.mockImplementation(async (_token, _householdId, itemId, isChecked) => ({
      item: item(itemId, itemId, isChecked),
    }));
    mockedApi.deleteShoppingListItem.mockResolvedValue(undefined);
  });

  it('shows the loading state while shopping-list data is being fetched', async () => {
    const hookSpy = jest.spyOn(shoppingListHook, 'useShoppingList').mockReturnValue({
      add: jest.fn(),
      error: null,
      householdId: 'household-a',
      items: [],
      loading: true,
      pendingItemIds: new Set(),
      refresh: jest.fn(),
      remove: jest.fn(),
      toggle: jest.fn(),
    });
    const screen = await render(<HouseholdHome />);

    expect(screen.getByLabelText('Loading shopping list')).toBeTruthy();
    hookSpy.mockRestore();
  });

  it('shows an empty state, retryable errors, and refreshes on request', async () => {
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', []))
      .mockRejectedValueOnce(new Error('private details'))
      .mockResolvedValueOnce(listResponse('household-a', [item('milk', 'Milk')]));
    const screen = await render(<HouseholdHome />);

    expect(await screen.findByText('Your shopping list is empty.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Refresh'));
    expect(await screen.findByText(/couldn.t load the shopping list/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Milk')).toBeTruthy();
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(3);
  });

  it('adds, clears the form after success, toggles optimistically with rollback, and removes', async () => {
    mockedApi.shoppingList
      .mockResolvedValueOnce(listResponse('household-a', []))
      .mockResolvedValueOnce(listResponse('household-a', [item('milk', 'Milk')]))
      .mockResolvedValueOnce(listResponse('household-a', []));
    const screen = await render(<HouseholdHome />);
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    const input = screen.getByLabelText('Shopping-list item');
    await fireEvent.changeText(input, 'Milk');
    await fireEvent.press(screen.getByText('Add item'));
    expect(await screen.findByText('Milk')).toBeTruthy();
    expect(input.props.value).toBe('');
    expect(screen.getByText('○')).toBeTruthy();

    mockedApi.setShoppingListItemChecked.mockRejectedValueOnce(new Error('private details'));
    const checkbox = screen.getByRole('checkbox');
    await fireEvent.press(checkbox);
    await waitFor(() => expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(false));
    expect(screen.getByText('We couldn’t update that item.')).toBeTruthy();

    mockedApi.setShoppingListItemChecked.mockResolvedValueOnce({ item: item('milk', 'Milk', true) });
    await fireEvent.press(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(true));
    expect(screen.queryByText('We couldn’t update that item.')).toBeNull();
    expect(screen.getByText('✓')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Remove Milk'));
    expect(await screen.findByText('Your shopping list is empty.')).toBeTruthy();
  });

  it('preserves text entered after an add is submitted when the request succeeds', async () => {
    const addMutation = deferred<{ item: ShoppingListItem }>();
    mockedApi.addShoppingListItem.mockReturnValue(addMutation.promise);
    const screen = await render(<HouseholdHome />);
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    const input = screen.getByLabelText('Shopping-list item');

    await fireEvent.changeText(input, 'Flour');
    await fireEvent.press(screen.getByText('Add item'));
    await waitFor(() => expect(mockedApi.addShoppingListItem).toHaveBeenCalledTimes(1));
    await fireEvent.changeText(input, 'Coffee');

    await act(async () => addMutation.resolve({ item: item('flour', 'Flour') }));
    await waitFor(() => expect(input.props.value).toBe('Coffee'));
  });

  it('reports remove failure without an unhandled rejection or removing the row', async () => {
    mockedApi.shoppingList.mockResolvedValue(listResponse('household-a', [item('milk', 'Milk')]));
    mockedApi.deleteShoppingListItem.mockRejectedValue(new Error('private details'));
    const screen = await render(<HouseholdHome />);
    await screen.findByText('Milk');

    await fireEvent.press(screen.getByLabelText('Remove Milk'));
    expect(await screen.findByText('We couldn’t remove that item. Please try again.')).toBeTruthy();
    expect(screen.getByText('Milk')).toBeTruthy();
  });

  it.each(['success', 'failure'] as const)(
    'disables only the pending item controls and re-enables them after %s',
    async (outcome) => {
      mockedApi.shoppingList.mockResolvedValue(listResponse('household-a', [
        item('milk', 'Milk'),
        item('bread', 'Bread'),
      ]));
      const mutation = deferred<{ item: ShoppingListItem }>();
      mockedApi.setShoppingListItemChecked.mockReturnValue(mutation.promise);
      const screen = await render(<HouseholdHome />);
      await screen.findByText('Milk');
      const milkCheckbox = screen.getByLabelText('Mark Milk purchased');
      const breadCheckbox = screen.getByLabelText('Mark Bread purchased');

      await fireEvent.press(milkCheckbox);
      await waitFor(() => {
        expect(screen.getByLabelText('Mark Milk not purchased').props.accessibilityState.disabled).toBe(true);
        expect(screen.getByLabelText('Remove Milk').props.accessibilityState.disabled).toBe(true);
      });
      expect(breadCheckbox.props.accessibilityState?.disabled).not.toBe(true);

      await act(async () => {
        if (outcome === 'success') mutation.resolve({ item: item('milk', 'Milk', true) });
        else mutation.reject(new Error('private detail'));
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Remove Milk').props.accessibilityState.disabled).toBe(false);
        expect(screen.getByRole('checkbox', { name: /Mark Milk/ }).props.accessibilityState.disabled).toBe(false);
      });
      expect(screen.getByLabelText('Mark Bread purchased').props.accessibilityState?.disabled).not.toBe(true);
      expect(mockedApi.setShoppingListItemChecked).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['add success', 'add failure', 'toggle success', 'toggle failure', 'remove success', 'remove failure'])(
    'keeps B state unchanged when A %s settles after selection changes', async (scenario) => {
      mockedApi.shoppingList.mockImplementation(async (_token, householdId) =>
        listResponse(householdId, [item(`${householdId}-item`, `${householdId} item`)]),
      );
      const mutation = deferred<unknown>();
      if (scenario.startsWith('add')) mockedApi.addShoppingListItem.mockReturnValue(mutation.promise as Promise<{ item: ShoppingListItem }>);
      if (scenario.startsWith('toggle')) mockedApi.setShoppingListItemChecked.mockReturnValue(mutation.promise as Promise<{ item: ShoppingListItem }>);
      if (scenario.startsWith('remove')) mockedApi.deleteShoppingListItem.mockReturnValue(mutation.promise as Promise<void>);
      const screen = await render(<HouseholdHome />);
      await screen.findByText('household-a item');

      if (scenario.startsWith('add')) {
        await fireEvent.changeText(screen.getByLabelText('Shopping-list item'), 'A pending item');
        await fireEvent.press(screen.getByText('Add item'));
      } else if (scenario.startsWith('toggle')) {
        await fireEvent.press(screen.getByLabelText('Mark household-a item purchased'));
      } else {
        await fireEvent.press(screen.getByLabelText('Remove household-a item'));
      }

      selectedHouseholdId = 'household-b';
      await screen.rerender(<HouseholdHome />);
      await screen.findByText('household-b item');
      await fireEvent.press(screen.getByText('Add item'));
      await screen.findByText('Enter an item to add.');
      await fireEvent.changeText(screen.getByLabelText('Shopping-list item'), 'B draft');

      if (scenario.endsWith('success')) await act(async () => mutation.resolve({ item: item('a-item', 'A item') }));
      else await act(async () => mutation.reject(new Error('old action failed')));

      expect(screen.getByLabelText('Shopping-list item').props.value).toBe('B draft');
      expect(screen.getByText('Enter an item to add.')).toBeTruthy();
      expect(screen.getByText('household-b item')).toBeTruthy();
      expect(screen.queryByText('We couldn’t add that item. Please try again.')).toBeNull();
      expect(screen.queryByText('We couldn’t update that item.')).toBeNull();
      expect(screen.queryByText('We couldn’t remove that item. Please try again.')).toBeNull();
    },
  );
});
