import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useShoppingList } from '@/features/shopping-list/use-shopping-list';
import { ApiError, api, type ShoppingList, type ShoppingListItem } from '@/lib/api';

jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: jest.fn() }));
let mockSessionId = 'session-1';
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: 'user-1', sessionId: mockSessionId }) }));
jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual<typeof import('@/lib/api')>('@/lib/api').ApiError,
  api: {
    shoppingList: jest.fn(),
    addShoppingListItem: jest.fn(),
    updateShoppingListItem: jest.fn(),
    deleteShoppingListItem: jest.fn(),
    clearShoppingList: jest.fn(),
    clearPurchasedShoppingItems: jest.fn(),
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
    mockSessionId = 'session-1';
    mockedHouseholdState.mockImplementation(() => ({
      getToken,
      selectedHousehold: selectedHouseholdId
        ? { id: selectedHouseholdId, name: selectedHouseholdId, time_zone: 'UTC', role: 'member' }
        : null,
    }) as unknown as ReturnType<typeof useHouseholdState>);
    mockedApi.shoppingList.mockImplementation(async (_token, householdId) => listResponse(householdId, []));
    mockedApi.addShoppingListItem.mockResolvedValue({ item: item('added') });
    mockedApi.updateShoppingListItem.mockImplementation(async (_token, _householdId, itemId, values) => ({
      item: item(itemId, itemId, values.is_checked ?? false),
    }));
    mockedApi.deleteShoppingListItem.mockResolvedValue(undefined);
    mockedApi.clearShoppingList.mockResolvedValue({ removed_count: 0 });
    mockedApi.clearPurchasedShoppingItems.mockResolvedValue({ removed_count: 0, removed_item_ids: [] });
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

  it('adds the authoritative response row without reloading the whole list, then removes it', async () => {
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', []));
    mockedApi.addShoppingListItem.mockResolvedValueOnce({ item: item('milk', 'Milk') });
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.add('catalog-milk'));
    expect(mockedApi.addShoppingListItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'catalog-milk', {});
    expect(result.current.items.map(({ name }) => name)).toEqual(['Milk']);
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1);
    await act(async () => result.current.remove(result.current.items[0]));
    expect(result.current.items).toEqual([]);
    expect(mockedApi.deleteShoppingListItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'milk');
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1);
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

    let addPromise!: ReturnType<ReturnType<typeof useShoppingList>['add']>;
    await act(async () => { addPromise = result.current.add('catalog-bread'); });
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
    expect(result.current.items).toEqual([]);
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

  it('keeps a pending removal out of a concurrent refresh, then restores only that row if deletion fails', async () => {
    const milk = item('milk', 'Milk');
    const bread = item('bread', 'Bread');
    mockedApi.shoppingList
      .mockResolvedValueOnce(listResponse('household-a', [milk, bread]))
      .mockResolvedValueOnce(listResponse('household-a', [milk, bread]));
    const deletion = deferred<void>();
    mockedApi.deleteShoppingListItem.mockReturnValue(deletion.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    let removal!: Promise<void>;
    await act(async () => { removal = result.current.remove(milk); });
    expect(result.current.items.map(({ id }) => id)).toEqual(['bread']);
    expect(result.current.loading).toBe(false);
    await act(async () => result.current.refresh());
    expect(result.current.items.map(({ id }) => id)).toEqual(['bread']);

    const outcome = removal.then(() => null, (error: Error) => error);
    await act(async () => deletion.reject(new Error('private server details')));
    await expect(outcome).resolves.toMatchObject({ message: 'We couldn’t remove that item. Please try again.' });
    expect(result.current.items.map(({ id }) => id)).toEqual(['bread', 'milk']);
  });

  it('updates a checked item optimistically and retains it after the server confirms', async () => {
    const milk = item('milk', 'Milk');
    const bread = item('bread', 'Bread', true);
    mockedApi.shoppingList.mockResolvedValue(listResponse('household-a', [milk, bread]));
    const mutation = deferred<{ item: ShoppingListItem }>();
    mockedApi.updateShoppingListItem.mockReturnValue(mutation.promise);
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

  it('does not let an older same-household refresh undo a confirmed checkbox change', async () => {
    const milk = item('milk', 'Milk');
    const staleRefresh = deferred<{ shopping_list: ShoppingList }>();
    const toggleRequest = deferred<{ item: ShoppingListItem }>();
    mockedApi.shoppingList
      .mockResolvedValueOnce(listResponse('household-a', [milk]))
      .mockReturnValueOnce(staleRefresh.promise);
    mockedApi.updateShoppingListItem.mockReturnValue(toggleRequest.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let refreshPromise!: Promise<void>;
    await act(async () => { refreshPromise = result.current.refresh(); });
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2));
    let togglePromise!: Promise<void>;
    await act(async () => { togglePromise = result.current.toggle(milk); });
    await act(async () => toggleRequest.resolve({ item: item('milk', 'Milk', true) }));
    await act(async () => togglePromise);
    expect(result.current.items[0].is_checked).toBe(true);

    await act(async () => staleRefresh.resolve(listResponse('household-a', [milk])));
    await act(async () => refreshPromise);
    expect(result.current.items[0].is_checked).toBe(true);
  });

  it('rolls an optimistic toggle back and propagates a safe error on failure', async () => {
    const milk = item('milk', 'Milk');
    const bread = item('bread', 'Bread', true);
    mockedApi.shoppingList.mockResolvedValue(listResponse('household-a', [milk, bread]));
    const mutation = deferred<{ item: ShoppingListItem }>();
    mockedApi.updateShoppingListItem.mockReturnValue(mutation.promise);
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
    mockedApi.updateShoppingListItem
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

    expect(mockedApi.updateShoppingListItem).toHaveBeenCalledTimes(2);
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
      mockedApi.updateShoppingListItem
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
      expect(mockedApi.updateShoppingListItem).toHaveBeenCalledTimes(2);
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
      mockedApi.updateShoppingListItem
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
      if (scenario.startsWith('toggle')) mockedApi.updateShoppingListItem.mockReturnValue(mutation.promise as Promise<{ item: ShoppingListItem }>);
      if (scenario.startsWith('remove')) mockedApi.deleteShoppingListItem.mockReturnValue(mutation.promise as Promise<void>);
      const { result, rerender } = await renderHook(() => useShoppingList());
      await waitFor(() => expect(result.current.items).toHaveLength(1));

      let action!: Promise<unknown>;
      await act(async () => {
        if (scenario.startsWith('add')) action = result.current.add('catalog-a-item');
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

  it('clears only returned IDs, then reconciles other-phone unchecks and re-added identities', async () => {
    const bought = { ...item('bought', 'Bought', true), catalog_item_id: 'catalog-a' };
    const needed = { ...item('needed'), amount: '2.5', unit_kind: 'recipe' as const, recipe_unit_code: 'tablespoon', store_id: 'market' };
    const stale = item('other-phone-unchecked', 'Keep', true);
    const fresh = deferred<{ shopping_list: ShoppingList }>();
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [bought, needed, stale])).mockReturnValueOnce(fresh.promise);
    mockedApi.clearPurchasedShoppingItems.mockResolvedValueOnce({ removed_count: 1, removed_item_ids: ['bought'] });
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    let action!: Promise<number>;
    await act(async () => { action = result.current.clearPurchased(); });
    expect(result.current.items).toEqual(expect.arrayContaining([needed, stale]));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.clearing).toBe('purchased');
    const readded = { ...bought, id: 'new-id', is_checked: false };
    await act(async () => { fresh.resolve(listResponse('household-a', [needed, { ...stale, is_checked: false }, readded])); expect(await action).toBe(1); });
    expect(result.current.items).toEqual(expect.arrayContaining([needed, readded, expect.objectContaining({ id: stale.id, is_checked: false })]));
    expect(result.current.clearing).toBeNull();
    expect(mockedApi.clearPurchasedShoppingItems).toHaveBeenCalledWith(expect.any(Function), 'household-a');
    expect(mockedApi.clearShoppingList).not.toHaveBeenCalled();
  });

  it.each([
    { removed_count: 1 },
    { removed_count: 2, removed_item_ids: ['bought'] },
    { removed_count: 2, removed_item_ids: ['bought', 'bought'] },
    { removed_count: -1, removed_item_ids: [] },
  ])('does not clear locally or fall back to clear-all for malformed response %j', async (response) => {
    const bought = item('bought', 'Bought', true);
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [bought]));
    mockedApi.clearPurchasedShoppingItems.mockResolvedValueOnce(response as Awaited<ReturnType<typeof api.clearPurchasedShoppingItems>>);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => { await expect(result.current.clearPurchased()).rejects.toThrow('We couldn’t clear purchased items'); });
    expect(result.current.items).toEqual([bought]);
    expect(result.current.clearing).toBeNull();
    expect(mockedApi.clearShoppingList).not.toHaveBeenCalled();
  });

  it('keeps rows on delete failure and retries safely when another phone already cleared them', async () => {
    const bought = item('bought', 'Bought', true);
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [bought]));
    mockedApi.clearPurchasedShoppingItems.mockRejectedValueOnce(new ApiError(404, 'Unavailable'));
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => { await expect(result.current.clearPurchased()).rejects.toThrow('We couldn’t clear purchased items'); });
    expect(result.current.items).toEqual([bought]);
    await act(async () => expect(await result.current.clearPurchased()).toBe(0));
    expect(result.current.items).toEqual([]);
    expect(mockedApi.clearShoppingList).not.toHaveBeenCalled();
  });

  it('releases an invalidated refresh spinner after DELETE fails', async () => {
    const bought = item('bought', 'Bought', true);
    const oldLoad = deferred<{ shopping_list: ShoppingList }>();
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [bought])).mockReturnValueOnce(oldLoad.promise);
    mockedApi.clearPurchasedShoppingItems.mockRejectedValueOnce(new Error('Offline'));
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    let read!: Promise<void>;
    await act(async () => { read = result.current.refresh(); });
    expect(result.current.loading).toBe(true);
    await act(async () => { await expect(result.current.clearPurchased()).rejects.toThrow('We couldn’t clear purchased items'); });
    expect(result.current.loading).toBe(false);
    expect(result.current.clearing).toBeNull();
    expect(result.current.items).toEqual([bought]);
    await act(async () => { oldLoad.resolve(listResponse('household-a', [])); await read; });
    expect(result.current.items).toEqual([bought]);
  });

  it('does not resurrect confirmed deletions when reconciliation fails, and supports refresh retry', async () => {
    const needed = item('needed');
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [needed, item('bought', 'Bought', true)]))
      .mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(listResponse('household-a', [needed]));
    mockedApi.clearPurchasedShoppingItems.mockResolvedValueOnce({ removed_count: 1, removed_item_ids: ['bought'] });
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(async () => expect(await result.current.clearPurchased()).toBe(1));
    expect(result.current.items).toEqual([needed]);
    expect(result.current.error).toContain('Items were cleared');
    await act(async () => result.current.refresh());
    expect(result.current.error).toBeNull();
  });

  it('invalidates a pre-clear refresh and blocks conflicting writes and duplicate bulk calls until reconciliation ends', async () => {
    const needed = item('needed');
    const bought = item('bought', 'Bought', true);
    const oldLoad = deferred<{ shopping_list: ShoppingList }>();
    const deletion = deferred<Awaited<ReturnType<typeof api.clearPurchasedShoppingItems>>>();
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [needed, bought])).mockReturnValueOnce(oldLoad.promise)
      .mockResolvedValueOnce(listResponse('household-a', [needed]));
    mockedApi.clearPurchasedShoppingItems.mockReturnValueOnce(deletion.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    let read!: Promise<void>; let action!: Promise<number>;
    await act(async () => { read = result.current.refresh(); });
    await act(async () => { action = result.current.clearPurchased(); });
    await act(async () => {
      await expect(result.current.clear()).rejects.toThrow('still updating');
      await expect(result.current.clearPurchased()).rejects.toThrow('still updating');
      await expect(result.current.addOrReadd('catalog-needed')).rejects.toThrow();
      await expect(result.current.add('catalog-needed')).rejects.toThrow();
      await result.current.toggle(needed); await result.current.update(needed, { amount: '3' }); await result.current.remove(needed);
      await result.current.refresh();
    });
    expect(mockedApi.updateShoppingListItem).not.toHaveBeenCalled();
    expect(mockedApi.deleteShoppingListItem).not.toHaveBeenCalled();
    expect(mockedApi.addShoppingListItem).not.toHaveBeenCalled();
    expect(mockedApi.clearShoppingList).not.toHaveBeenCalled();
    await act(async () => { deletion.resolve({ removed_count: 1, removed_item_ids: ['bought'] }); await action; });
    await act(async () => { oldLoad.resolve(listResponse('household-a', [needed, bought])); await read; });
    expect(result.current.items).toEqual([needed]);
    expect(result.current.loading).toBe(false);
    await act(async () => result.current.toggle(needed));
    expect(mockedApi.updateShoppingListItem).toHaveBeenCalledTimes(1);
  });

  it('waits for local checkoffs before allowing either bulk operation', async () => {
    const needed = item('needed');
    const pending = deferred<{ item: ShoppingListItem }>();
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [needed]));
    mockedApi.updateShoppingListItem.mockReturnValueOnce(pending.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    let toggle!: Promise<void>;
    await act(async () => { toggle = result.current.toggle(needed); });
    await act(async () => {
      await expect(result.current.clearPurchased()).rejects.toThrow('still updating');
      await expect(result.current.clear()).rejects.toThrow('still updating');
    });
    expect(mockedApi.clearPurchasedShoppingItems).not.toHaveBeenCalled();
    expect(mockedApi.clearShoppingList).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ item: { ...needed, is_checked: true } }); await toggle; });
    await act(async () => expect(await result.current.clear()).toBe(0));
    expect(result.current.items).toEqual([]);
  });

  it.each(['household', 'session'])('ignores a purchased-clear response after a %s switch', async (change) => {
    const deletion = deferred<Awaited<ReturnType<typeof api.clearPurchasedShoppingItems>>>();
    mockedApi.clearPurchasedShoppingItems.mockReturnValueOnce(deletion.promise);
    const { result, rerender } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    let outcome!: Promise<unknown>;
    await act(async () => { outcome = result.current.clearPurchased().catch((reason: Error) => reason); });
    if (change === 'household') selectHousehold('household-b'); else mockSessionId = 'session-2';
    await rerender(undefined);
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2));
    expect(result.current.clearing).toBeNull();
    await act(async () => { deletion.resolve({ removed_count: 0, removed_item_ids: [] }); await outcome; });
    expect(await outcome).toEqual(expect.objectContaining({ message: expect.stringContaining('household or sign-in changed') }));
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([]);
  });

  it('rejects an old token before sending the clear and preserves a newer household bulk guard', async () => {
    const token = deferred<string>();
    const nextDelete = deferred<Awaited<ReturnType<typeof api.clearPurchasedShoppingItems>>>();
    const write = jest.fn();
    mockedApi.clearPurchasedShoppingItems.mockImplementationOnce(async (getRequestToken) => { await getRequestToken(); write(); return { removed_count: 0, removed_item_ids: [] }; })
      .mockReturnValueOnce(nextDelete.promise);
    const { result, rerender } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    getToken.mockReturnValueOnce(token.promise);
    let old!: Promise<unknown>; let current!: Promise<number>;
    await act(async () => { old = result.current.clearPurchased().catch((reason: Error) => reason); });
    selectHousehold('household-b');
    await rerender(undefined);
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2));
    await act(async () => { current = result.current.clearPurchased(); });
    await act(async () => { token.resolve('old-token'); await old; });
    expect(write).not.toHaveBeenCalled();
    expect(result.current.clearing).toBe('purchased');
    await act(async () => { nextDelete.resolve({ removed_count: 0, removed_item_ids: [] }); await current; });
    expect(result.current.clearing).toBeNull();
  });

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

  it.each<Partial<ShoppingListItem>>([
    { amount: '2', unit_kind: 'built_in', shopping_unit_code: 'pound', unit_label: 'Pound' },
    { amount: '0.5', unit_kind: 'household', custom_shopping_unit_id: 'crate', unit_label: 'Crate' },
    { amount: '2.666667', unit_kind: 'recipe', recipe_unit_code: 'tablespoon', recipe_unit_dimension: 'volume', unit_label: 'Tablespoon' },
    { amount: null, unit_kind: null, unit_label: null },
  ])('re-adds the same purchased row with a state-only PATCH preserving %j', async (details) => {
    const purchased = { ...item('milk', 'Milk', true), catalog_item_id: 'catalog-milk', store_id: 'market', store_name: 'Market', ...details };
    // Canonical details may have changed on another phone since the picker opened.
    const canonical = { ...purchased, is_checked: false, checked_at: null, checked_by_user_id: null, store_name: 'Updated Market' };
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [purchased]));
    mockedApi.updateShoppingListItem.mockResolvedValueOnce({ item: canonical });
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => expect(await result.current.addOrReadd('catalog-milk')).toBe('added'));
    expect(mockedApi.updateShoppingListItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'milk', { is_checked: false });
    expect(mockedApi.addShoppingListItem).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([canonical]);
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1);
  });

  it('explicitly unchecks an already-needed row without toggling or increasing its amount', async () => {
    const needed = { ...item('milk'), catalog_item_id: 'catalog-milk', amount: '2' };
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [needed]));
    mockedApi.updateShoppingListItem.mockResolvedValueOnce({ item: needed });
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => expect(await result.current.addOrReadd('catalog-milk')).toBe('already-needed'));
    expect(mockedApi.updateShoppingListItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'milk', { is_checked: false });
    expect(result.current.items).toEqual([needed]);
  });

  it('creates an absent item with amount 1 and leaves preferences to the server', async () => {
    const created = { ...item('milk'), catalog_item_id: 'catalog-milk', amount: '1', store_id: 'market' };
    mockedApi.addShoppingListItem.mockResolvedValueOnce({ item: created });
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    await act(async () => expect(await result.current.addOrReadd('catalog-milk')).toBe('added'));
    expect(mockedApi.addShoppingListItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'catalog-milk', { amount: '1' });
    expect(mockedApi.updateShoppingListItem).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([created]);
  });

  it('recovers one concurrent duplicate by Catalog identity and unchecks the existing row', async () => {
    const purchased = { ...item('other-phone-row', 'Milk', true), catalog_item_id: 'catalog-milk', amount: '3' };
    const canonical = { ...purchased, is_checked: false, checked_at: null, checked_by_user_id: null };
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', []))
      .mockResolvedValueOnce(listResponse('household-a', [purchased]));
    mockedApi.addShoppingListItem.mockRejectedValueOnce(new ApiError(409, 'Already exists', 'SHOPPING_ITEM_ALREADY_EXISTS'));
    mockedApi.updateShoppingListItem.mockResolvedValueOnce({ item: canonical });
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    await act(async () => expect(await result.current.addOrReadd('catalog-milk')).toBe('added'));
    expect(mockedApi.addShoppingListItem).toHaveBeenCalledTimes(1);
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2);
    expect(mockedApi.updateShoppingListItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', purchased.id, { is_checked: false });
    expect(result.current.items).toEqual([canonical]);
  });

  it.each(['removed', 'duplicate-then-removed', 'network'])('rejects a failed re-add without false completion and allows retry (%s)', async (scenario) => {
    const purchased = { ...item('milk', 'Milk', true), catalog_item_id: 'catalog-milk' };
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', scenario === 'duplicate-then-removed' ? [] : [purchased]));
    if (scenario === 'duplicate-then-removed') mockedApi.addShoppingListItem.mockRejectedValueOnce(new ApiError(409, 'Already exists', 'SHOPPING_ITEM_ALREADY_EXISTS'));
    else mockedApi.updateShoppingListItem.mockRejectedValueOnce(scenario === 'removed' ? new ApiError(404, 'Missing') : new Error('private network details'));
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    await act(async () => { await expect(result.current.addOrReadd('catalog-milk')).rejects.toThrow(scenario === 'network' ? 'We couldn’t add' : 'changed or was removed'); });
    expect(result.current.pendingItemIds.size).toBe(0);
    if (scenario !== 'network') expect(result.current.items).toEqual([]);
    else expect(result.current.items).toEqual([purchased]);
    expect(mockedApi.addShoppingListItem.mock.calls.length).toBeLessThanOrEqual(1);
    mockedApi.addShoppingListItem.mockResolvedValueOnce({ item: { ...purchased, is_checked: false } });
    await act(async () => { await result.current.addOrReadd('catalog-milk'); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].is_checked).toBe(false);
  });

  it('blocks repeated re-adds and same-row toggles while keeping other checkoffs independent', async () => {
    const purchased = { ...item('milk', 'Milk', true), catalog_item_id: 'catalog-milk' };
    const bread = item('bread', 'Bread');
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [purchased, bread]));
    const pending = deferred<{ item: ShoppingListItem }>();
    mockedApi.updateShoppingListItem.mockReturnValueOnce(pending.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    let action!: Promise<unknown>;
    await act(async () => { action = result.current.addOrReadd('catalog-milk'); });
    await act(async () => { await expect(result.current.addOrReadd('catalog-milk')).rejects.toThrow(); });
    await act(async () => result.current.toggle(purchased));
    expect(mockedApi.updateShoppingListItem).toHaveBeenCalledTimes(1);
    await act(async () => result.current.toggle(bread));
    expect(mockedApi.updateShoppingListItem).toHaveBeenCalledTimes(2);
    await act(async () => { pending.resolve({ item: { ...purchased, is_checked: false } }); await action; });
    expect(result.current.items.find((row) => row.id === 'bread')?.is_checked).toBe(true);
    expect(result.current.pendingItemIds.size).toBe(0);
  });

  it('does not report success when the same row already has a checkoff pending', async () => {
    const needed = { ...item('milk'), catalog_item_id: 'catalog-milk' };
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [needed]));
    const pending = deferred<{ item: ShoppingListItem }>();
    mockedApi.updateShoppingListItem.mockReturnValueOnce(pending.promise);
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    let toggle!: Promise<void>;
    await act(async () => { toggle = result.current.toggle(needed); });
    await act(async () => { await expect(result.current.addOrReadd('catalog-milk')).rejects.toThrow(); });
    expect(mockedApi.updateShoppingListItem).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ item: { ...needed, is_checked: true } }); await toggle; });
  });

  it('ignores an older refresh that resolves after re-add is confirmed', async () => {
    const purchased = { ...item('milk', 'Milk', true), catalog_item_id: 'catalog-milk' };
    const stale = deferred<{ shopping_list: ShoppingList }>();
    mockedApi.shoppingList.mockResolvedValueOnce(listResponse('household-a', [purchased])).mockReturnValueOnce(stale.promise);
    const canonical = { ...purchased, is_checked: false };
    mockedApi.updateShoppingListItem.mockResolvedValueOnce({ item: canonical });
    const { result } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    let refresh!: Promise<void>;
    await act(async () => { refresh = result.current.refresh(); });
    await act(async () => { await result.current.addOrReadd('catalog-milk'); });
    await act(async () => { stale.resolve(listResponse('household-a', [purchased])); await refresh; });
    expect(result.current.items).toEqual([canonical]);
    expect(result.current.loading).toBe(false);
  });

  it.each(['household-success', 'session-success', 'household-conflict', 'session-conflict'])('rejects stale re-add responses and recovery writes after %s', async (change) => {
    const pending = deferred<{ item: ShoppingListItem }>();
    mockedApi.addShoppingListItem.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    let outcome!: Promise<unknown>;
    await act(async () => { outcome = result.current.addOrReadd('catalog-milk').catch((error: Error) => error); });
    if (change.startsWith('household')) selectHousehold('household-b');
    else mockSessionId = 'session-2';
    await rerender(undefined);
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2));
    await act(async () => {
      if (change.endsWith('success')) pending.resolve({ item: item('old-row') });
      else pending.reject(new ApiError(409, 'Duplicate', 'SHOPPING_ITEM_ALREADY_EXISTS'));
      await outcome;
    });
    expect(await outcome).toEqual(expect.objectContaining({ message: expect.stringContaining('household or sign-in changed') }));
    expect(mockedApi.shoppingList).toHaveBeenCalledTimes(2);
    expect(mockedApi.updateShoppingListItem).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it('refuses a stale request token after the household changes during authentication', async () => {
    const token = deferred<string>();
    getToken.mockReturnValueOnce(token.promise);
    mockedApi.addShoppingListItem.mockImplementationOnce(async (getRequestToken) => {
      await getRequestToken();
      throw new Error('A stale token must never reach a write');
    });
    const { result, rerender } = await renderHook(() => useShoppingList());
    await waitFor(() => expect(mockedApi.shoppingList).toHaveBeenCalledTimes(1));
    let outcome!: Promise<unknown>;
    await act(async () => { outcome = result.current.addOrReadd('catalog-milk').catch((error: Error) => error); });
    selectHousehold('household-b');
    await rerender(undefined);
    await act(async () => { token.resolve('old-token'); await outcome; });
    expect(await outcome).toEqual(expect.objectContaining({ message: expect.stringContaining('household or sign-in changed') }));
    expect(result.current.items).toEqual([]);
    expect(mockedApi.updateShoppingListItem).not.toHaveBeenCalled();
  });
});
