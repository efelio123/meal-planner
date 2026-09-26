import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useShoppingList } from '@/hooks/use-shopping-list';
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

const mockedHouseholdState = jest.mocked(useHouseholdState);
const mockedApi = jest.mocked(api);
const getToken = jest.fn().mockResolvedValue('session-token');
let selectedHouseholdId: string | null;

function listResponse(householdId: string, items: ShoppingListItem[]): { shopping_list: ShoppingList } {
  return { shopping_list: { id: `list-${householdId}`, household_id: householdId, items } };
}

function item(id: string, name = id, isChecked = false): ShoppingListItem {
  return {
    id,
    name,
    is_checked: isChecked,
    checked_at: isChecked ? '2026-09-01T12:00:00Z' : null,
    checked_by_user_id: isChecked ? 'user-1' : null,
    created_by_user_id: 'user-1',
    created_at: '2026-09-01T11:00:00Z',
  };
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

function selectHousehold(id: string | null) {
  selectedHouseholdId = id;
}

describe('useShoppingList', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getToken.mockResolvedValue('session-token');
    selectedHouseholdId = 'household-a';
    mockedHouseholdState.mockImplementation(() => ({
      getToken,
      selectedHousehold: selectedHouseholdId
        ? { id: selectedHouseholdId, name: selectedHouseholdId, time_zone: 'UTC', role: 'member' }
        : null,
    }) as unknown as ReturnType<typeof useHouseholdState>);
    mockedApi.shoppingList.mockImplementation(async (_token, householdId) => listResponse(householdId, []));
    mockedApi.addShoppingListItem.mockResolvedValue({ item: item('added') });
    mockedApi.setShoppingListItemChecked.mockImplementation(async (_token, _householdId, itemId, isChecked) => ({
      item: item(itemId, itemId, isChecked),
    }));
    mockedApi.deleteShoppingListItem.mockResolvedValue(undefined);
  });

  it('shows loading while a list request is pending, then shows the empty response', async () => {
    const response = deferred<{ shopping_list: ShoppingList }>();
    mockedApi.shoppingList.mockReturnValue(response.promise);
    const { result } = await renderHook(() => useShoppingList());

    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledWith(expect.any(Function), 'household-a'));
    expect(result.current.loading).toBe(true);
    await act(async () => response.resolve(listResponse('household-a', [])));

    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('shows a safe load error and supports explicit retry and refresh', async () => {
    mockedApi.shoppingList
      .mockRejectedValueOnce(new Error('private transport details'))
      .mockResolvedValueOnce(listResponse('household-a', [item('milk', 'Milk')]))
      .mockResolvedValueOnce(listResponse('household-a', [item('milk', 'Milk'), item('eggs', 'Eggs')]));
    const { result } = await renderHook(() => useShoppingList());

    await waitFor(() => expect(result.current.error).toBe('We couldn’t load the shopping list.'));
    expect(result.current.error).not.toContain('private transport details');
    await act(async () => result.current.refresh());
    expect(result.current.items.map(({ name }) => name)).toEqual(['Milk']);
    await act(async () => result.current.refresh());
    expect(result.current.items.map(({ name }) => name)).toEqual(['Eggs', 'Milk']);
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(3);
  });

  it('adds and reloads authoritative list data, then removes an item', async () => {
    mockedApi.shoppingList
      .mockResolvedValueOnce(listResponse('household-a', []))
      .mockResolvedValueOnce(listResponse('household-a', [item('milk', 'Milk')]))
      .mockResolvedValueOnce(listResponse('household-a', []));
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.add(' Milk '));
    expect(mockedApi.addShoppingListItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', ' Milk ');
    expect(result.current.items.map(({ name }) => name)).toEqual(['Milk']);
    await act(async () => result.current.remove(result.current.items[0]));
    expect(result.current.items).toEqual([]);
    expect(mockedApi.deleteShoppingListItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'milk');
  });

  it('keeps a successful add when an older same-household refresh resolves afterward', async () => {
    const staleRefresh = deferred<{ shopping_list: ShoppingList }>();
    const addedItem = item('added', 'Bread');
    mockedApi.shoppingList
      .mockResolvedValueOnce(listResponse('household-a', []))
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce(listResponse('household-a', [addedItem]));
    const addMutation = deferred<{ item: ShoppingListItem }>();
    mockedApi.addShoppingListItem.mockReturnValue(addMutation.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let addPromise!: Promise<void>;
    await act(async () => { addPromise = result.current.add('Bread'); });
    let refreshPromise!: Promise<void>;
    await act(async () => { refreshPromise = result.current.refresh(); });
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2));

    await act(async () => addMutation.resolve({ item: addedItem }));
    await act(async () => addPromise);
    expect(result.current.items.map(({ id }) => id)).toEqual(['added']);
    expect(result.current.loading).toBe(false);

    await act(async () => staleRefresh.resolve(listResponse('household-a', [])));
    await act(async () => refreshPromise);
    expect(result.current.items.map(({ id }) => id)).toEqual(['added']);
  });

  it('does not restore a removed item when an older same-household refresh resolves afterward', async () => {
    const milk = item('milk', 'Milk');
    const staleRefresh = deferred<{ shopping_list: ShoppingList }>();
    mockedApi.shoppingList
      .mockResolvedValueOnce(listResponse('household-a', [milk]))
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce(listResponse('household-a', []));
    const removeMutation = deferred<void>();
    mockedApi.deleteShoppingListItem.mockReturnValue(removeMutation.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let removePromise!: Promise<void>;
    await act(async () => { removePromise = result.current.remove(milk); });
    let refreshPromise!: Promise<void>;
    await act(async () => { refreshPromise = result.current.refresh(); });
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2));

    await act(async () => removeMutation.resolve());
    await act(async () => removePromise);
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);

    await act(async () => staleRefresh.resolve(listResponse('household-a', [milk])));
    await act(async () => refreshPromise);
    expect(result.current.items).toEqual([]);
  });

  it('updates a checked item optimistically and retains it after the server confirms', async () => {
    const milk = item('milk', 'Milk');
    const bread = item('bread', 'Bread', true);
    mockedApi.shoppingList.mockResolvedValue(listResponse('household-a', [milk, bread]));
    const mutation = deferred<{ item: ShoppingListItem }>();
    mockedApi.setShoppingListItemChecked.mockReturnValue(mutation.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map(({ name }) => name)).toEqual(['Milk', 'Bread']);

    let togglePromise!: Promise<void>;
    await act(async () => { togglePromise = result.current.toggle(result.current.items[0]); });
    expect(result.current.items[0].is_checked).toBe(true);
    expect(result.current.items.map(({ name }) => name)).toEqual(['Bread', 'Milk']);
    await act(async () => mutation.resolve({ item: item('milk', 'Milk', true) }));
    await act(async () => togglePromise);
    expect(result.current.items[0].is_checked).toBe(true);
  });

  it('rolls an optimistic toggle back and propagates a safe error on failure', async () => {
    const milk = item('milk', 'Milk');
    const bread = item('bread', 'Bread', true);
    mockedApi.shoppingList.mockResolvedValue(listResponse('household-a', [milk, bread]));
    const mutation = deferred<{ item: ShoppingListItem }>();
    mockedApi.setShoppingListItemChecked.mockReturnValue(mutation.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map(({ name }) => name)).toEqual(['Milk', 'Bread']);

    let togglePromise!: Promise<void>;
    await act(async () => { togglePromise = result.current.toggle(result.current.items[0]); });
    expect(result.current.items[0].is_checked).toBe(true);
    expect(result.current.items.map(({ name }) => name)).toEqual(['Bread', 'Milk']);
    const toggleOutcome = togglePromise.then(() => null, (error: Error) => error);
    await act(async () => mutation.reject(new Error('private server details')));
    await expect(toggleOutcome).resolves.toMatchObject({ message: 'We couldn’t update that item.' });
    expect(result.current.items[0].is_checked).toBe(false);
    expect(result.current.items.map(({ name }) => name)).toEqual(['Milk', 'Bread']);
  });

  it('synchronously blocks overlapping mutations for one item while allowing another item', async () => {
    const milk = item('milk', 'Milk');
    const bread = item('bread', 'Bread');
    mockedApi.shoppingList.mockResolvedValue(listResponse('household-a', [milk, bread]));
    const milkMutation = deferred<{ item: ShoppingListItem }>();
    const breadMutation = deferred<{ item: ShoppingListItem }>();
    mockedApi.setShoppingListItemChecked
      .mockReturnValueOnce(milkMutation.promise)
      .mockReturnValueOnce(breadMutation.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    let firstMilkToggle!: Promise<void>;
    let duplicateMilkToggle!: Promise<void>;
    let duplicateMilkRemove!: Promise<void>;
    let breadToggle!: Promise<void>;
    await act(async () => {
      firstMilkToggle = result.current.toggle(milk);
      duplicateMilkToggle = result.current.toggle(milk);
      duplicateMilkRemove = result.current.remove(milk);
      breadToggle = result.current.toggle(bread);
    });

    expect(mockedApi.setShoppingListItemChecked).toHaveBeenCalledTimes(2);
    expect(mockedApi.deleteShoppingListItem).not.toHaveBeenCalled();
    expect(result.current.pendingItemIds).toEqual(new Set(['milk', 'bread']));
    await act(async () => {
      milkMutation.resolve({ item: item('milk', 'Milk', true) });
      breadMutation.resolve({ item: item('bread', 'Bread', true) });
      await Promise.all([firstMilkToggle, duplicateMilkToggle, duplicateMilkRemove, breadToggle]);
    });
    expect(result.current.pendingItemIds.size).toBe(0);
  });

  it.each(['success', 'failure'] as const)(
    'allows the same item to be mutated again after the first mutation %s',
    async (outcome) => {
      const milk = item('milk', 'Milk');
      mockedApi.shoppingList.mockResolvedValue(listResponse('household-a', [milk]));
      const firstMutation = deferred<{ item: ShoppingListItem }>();
      const secondMutation = deferred<{ item: ShoppingListItem }>();
      mockedApi.setShoppingListItemChecked
        .mockReturnValueOnce(firstMutation.promise)
        .mockReturnValueOnce(secondMutation.promise);
      const { result } = await renderHook(() => useShoppingList());
      await waitFor(() => expect(result.current.items).toHaveLength(1));

      let firstToggle!: Promise<void>;
      await act(async () => { firstToggle = result.current.toggle(milk); });
      expect(result.current.pendingItemIds.has('milk')).toBe(true);
      const firstOutcome = firstToggle.then(() => null, (error: Error) => error);
      await act(async () => {
        if (outcome === 'success') firstMutation.resolve({ item: item('milk', 'Milk', true) });
        else firstMutation.reject(new Error('failed'));
        await firstOutcome;
      });
      expect(result.current.pendingItemIds.has('milk')).toBe(false);

      let secondToggle!: Promise<void>;
      await act(async () => { secondToggle = result.current.toggle(result.current.items[0]); });
      expect(mockedApi.setShoppingListItemChecked).toHaveBeenCalledTimes(2);
      expect(result.current.pendingItemIds.has('milk')).toBe(true);
      await act(async () => secondMutation.resolve({ item: item('milk', 'Milk', !result.current.items[0].is_checked) }));
      await act(async () => secondToggle);
      expect(result.current.pendingItemIds.has('milk')).toBe(false);
    },
  );

  it.each(['success', 'failure'] as const)(
    'does not let household A completion clear household B pending state (%s)',
    async (outcome) => {
      const sharedIdItem = item('shared-id', 'Shared item');
      mockedApi.shoppingList
        .mockResolvedValueOnce(listResponse('household-a', [sharedIdItem]))
        .mockResolvedValueOnce(listResponse('household-b', [sharedIdItem]));
      const aMutation = deferred<{ item: ShoppingListItem }>();
      const bMutation = deferred<{ item: ShoppingListItem }>();
      mockedApi.setShoppingListItemChecked
        .mockReturnValueOnce(aMutation.promise)
        .mockReturnValueOnce(bMutation.promise);
      const { result, rerender } = await renderHook(() => useShoppingList());
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      let aToggle!: Promise<void>;
      await act(async () => { aToggle = result.current.toggle(sharedIdItem); });
      const aOutcome = aToggle.then(() => null, (error: Error) => error);

      selectHousehold('household-b');
      await rerender(undefined);
      await waitFor(() => expect(result.current.householdId).toBe('household-b'));
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      let bToggle!: Promise<void>;
      await act(async () => { bToggle = result.current.toggle(sharedIdItem); });
      expect(result.current.pendingItemIds.has('shared-id')).toBe(true);

      await act(async () => {
        if (outcome === 'success') aMutation.resolve({ item: item('shared-id', 'Shared item', true) });
        else aMutation.reject(new Error('old household failure'));
        await aOutcome;
      });
      expect(result.current.pendingItemIds.has('shared-id')).toBe(true);
      expect(result.current.items[0].is_checked).toBe(true);

      await act(async () => bMutation.resolve({ item: item('shared-id', 'Shared item', true) }));
      await act(async () => bToggle);
      expect(result.current.pendingItemIds.has('shared-id')).toBe(false);
    },
  );

  it('ignores household A load success and failure after switching to household B', async () => {
    const firstLoad = deferred<{ shopping_list: ShoppingList }>();
    const secondLoad = deferred<{ shopping_list: ShoppingList }>();
    mockedApi.shoppingList
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise);
    const { result, rerender } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));

    selectHousehold('household-b');
    await rerender(undefined);
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2));
    await act(async () => secondLoad.resolve(listResponse('household-b', [item('b-item', 'B item')])));
    await waitFor(() => expect(result.current.items.map(({ name }) => name)).toEqual(['B item']));
    await act(async () => firstLoad.reject(new Error('old household failure')));

    expect(result.current.items.map(({ name }) => name)).toEqual(['B item']);
    expect(result.current.error).toBeNull();
    expect(result.current.householdId).toBe('household-b');
  });

  it.each(['add success', 'add failure', 'toggle failure', 'remove success', 'remove failure'])(
    'ignores an old household mutation completion after switching to B (%s)',
    async (scenario) => {
      const aItem = item('a-item', 'A item');
      const bItem = item('b-item', 'B item');
      mockedApi.shoppingList
        .mockResolvedValueOnce(listResponse('household-a', [aItem]))
        .mockResolvedValueOnce(listResponse('household-b', [bItem]));
      const mutation = deferred<unknown>();
      if (scenario.startsWith('add')) mockedApi.addShoppingListItem.mockReturnValue(mutation.promise as Promise<{ item: ShoppingListItem }>);
      if (scenario.startsWith('toggle')) mockedApi.setShoppingListItemChecked.mockReturnValue(mutation.promise as Promise<{ item: ShoppingListItem }>);
      if (scenario.startsWith('remove')) mockedApi.deleteShoppingListItem.mockReturnValue(mutation.promise as Promise<void>);
      const { result, rerender } = await renderHook(() => useShoppingList());
      await waitFor(() => expect(result.current.items).toHaveLength(1));

      let action!: Promise<unknown>;
      await act(async () => {
        if (scenario.startsWith('add')) action = result.current.add('A pending item');
        if (scenario.startsWith('toggle')) action = result.current.toggle(result.current.items[0]);
        if (scenario.startsWith('remove')) action = result.current.remove(result.current.items[0]);
      });
      const actionOutcome = action.then(() => null, (error: Error) => error);
      if (scenario === 'toggle failure') expect(result.current.items[0].is_checked).toBe(true);

      selectHousehold('household-b');
      await rerender(undefined);
      await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2));
      await act(async () => mockedApi.shoppingList.mock.results[1].value);
      await waitFor(() => expect(result.current.items.map(({ id }) => id)).toEqual(['b-item']));

      if (scenario.endsWith('success')) {
        await act(async () => mutation.resolve({ item: item('a-item', 'A item') }));
        await act(async () => action);
      } else {
        await act(async () => mutation.reject(new Error('old mutation failed')));
        await expect(actionOutcome).resolves.toBeInstanceOf(Error);
      }
      expect(result.current.householdId).toBe('household-b');
      expect(result.current.items.map(({ id, is_checked }) => ({ id, is_checked }))).toEqual([
        { id: 'b-item', is_checked: false },
      ]);
      expect(result.current.error).toBeNull();
    },
  );

  it('does not reload when the token getter identity changes', async () => {
    const { rerender } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    mockedHouseholdState.mockImplementationOnce(() => ({
      getToken: jest.fn().mockResolvedValue('refreshed-token'),
      selectedHousehold: { id: 'household-a', name: 'household-a', time_zone: 'UTC', role: 'member' },
    }) as unknown as ReturnType<typeof useHouseholdState>);
    await rerender(undefined);
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1);
  });
});
