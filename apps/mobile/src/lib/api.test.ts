import { api, ApiError } from '@/lib/api';

const fetchMock = jest.fn();

describe('mobile API client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  it('obtains a fresh token and sends exactly one Bearer authorization header', async () => {
    const getToken = jest.fn().mockResolvedValue('session-token');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: {}, households: [] }), { status: 200 }));

    await api.me(getToken);

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/me$/u),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer session-token');
    expect([...headers.keys()].filter((key) => key.toLowerCase() === 'authorization')).toHaveLength(1);
  });

  it('does not make a request without a Clerk session token', async () => {
    await expect(api.me(jest.fn().mockResolvedValue(null))).rejects.toEqual(
      new ApiError(401, 'Your session has expired. Please sign in again.'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not allow request options to replace the Clerk authorization header', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: {}, households: [] }), { status: 200 }));

    await api.me(jest.fn().mockResolvedValue('session-token'), {
      headers: { Authorization: 'Bearer attacker-token', 'X-Request-Source': 'future-caller' },
    });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer session-token');
    expect([...headers.keys()].filter((key) => key.toLowerCase() === 'authorization')).toHaveLength(1);
    expect(headers.get('X-Request-Source')).toBe('future-caller');
  });

  it('maps an expired invitation without exposing a server response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 410 }));

    await expect(api.acceptInvitation(jest.fn().mockResolvedValue('session-token'), 'code')).rejects.toEqual(
      new ApiError(410, 'This invitation has expired.'),
    );
  });

  it('loads a shopping list with GET and a fresh Bearer token', async () => {
    const getToken = jest.fn().mockResolvedValue('shopping-list-token');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ shopping_list: { id: 'list-1', household_id: 'home-1', items: [] } }), { status: 200 }));

    await api.shoppingList(getToken, 'home-1');

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/home-1/shopping-list');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer shopping-list-token');
  });

  it('adds a shopping-list item with POST JSON and a fresh Bearer token', async () => {
    const getToken = jest.fn().mockResolvedValue('add-item-token');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ item: { id: 'item-1' } }), { status: 201 }));

    await api.addShoppingListItem(getToken, 'home-1', 'Milk');

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/home-1/shopping-list/items');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ name: 'Milk' });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer add-item-token');
  });

  it('sets checked state with PATCH JSON and a fresh Bearer token', async () => {
    const getToken = jest.fn().mockResolvedValue('toggle-item-token');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ item: { id: 'item-1', is_checked: true } }), { status: 200 }));

    await api.setShoppingListItemChecked(getToken, 'home-1', 'item-1', true);

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/home-1/shopping-list/items/item-1');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ is_checked: true });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer toggle-item-token');
  });

  it('deletes a shopping-list item and handles the 204 response without JSON parsing', async () => {
    const getToken = jest.fn().mockResolvedValue('delete-item-token');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(api.deleteShoppingListItem(getToken, 'home-1', 'item-1')).resolves.toBeUndefined();

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/home-1/shopping-list/items/item-1');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer delete-item-token');
  });
});
