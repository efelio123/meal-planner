import { api, ApiError, type GetToken } from '@/lib/api';

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

  it('adds only an anonymous request ID when startup diagnostics are supplied', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: {}, households: [] }), { status: 200 }));
    const diagnostics = { requestId: 'a'.repeat(32), record: jest.fn() };

    await api.me(jest.fn().mockResolvedValue('session-token'), undefined, diagnostics);

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('X-Request-ID')).toBe('a'.repeat(32));
    expect(diagnostics.record).toHaveBeenCalledWith('token_retrieval', expect.any(Number));
    expect(diagnostics.record).toHaveBeenCalledWith('me_fetch', 0);
    expect(diagnostics.record).toHaveBeenCalledWith('me_response', expect.any(Number), 200);
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

  it('maps the display-name completion gate to a typed safe API error', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { code: 'DISPLAY_NAME_REQUIRED' } }), { status: 409 }));

    await expect(api.me(jest.fn().mockResolvedValue('session-token'))).rejects.toEqual(
      new ApiError(409, 'Add a display name to continue.', 'DISPLAY_NAME_REQUIRED'),
    );
  });

  it('creates a household invitation with a fresh token and returns its one-time fields', async () => {
    const getToken = jest.fn().mockResolvedValue('invitation-token');
    const invitation = {
      id: 'invitation-1',
      expires_at: '2026-10-01T12:00:00Z',
      code: 'one-time-code',
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ invitation }), { status: 201 }));

    await expect(api.createInvitation(getToken, 'household-1', 'person@example.com')).resolves.toEqual({ invitation });

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/household-1/invitations');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ email: 'person@example.com' });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer invitation-token');
  });

  it('sends the expected URL, method/body, and fresh Bearer token for all management methods', async () => {
    const requests: [string, (getToken: GetToken) => Promise<unknown>, string, string, unknown, number, unknown][] = [
      ['household', (token) => api.household(token, 'home-1'), '/v1/households/home-1', 'GET', undefined, 200, { household: {} }],
      ['update household', (token) => api.updateHousehold(token, 'home-1', { name: 'Cabin', time_zone: 'Europe/London' }), '/v1/households/home-1', 'PATCH', { name: 'Cabin', time_zone: 'Europe/London' }, 200, { household: {} }],
      ['members', (token) => api.householdMembers(token, 'home-1'), '/v1/households/home-1/members', 'GET', undefined, 200, { members: [] }],
      ['member detail', (token) => api.householdMember(token, 'home-1', 'membership-1'), '/v1/households/home-1/members/membership-1', 'GET', undefined, 200, { member: {} }],
      ['member role', (token) => api.setHouseholdMemberRole(token, 'home-1', 'membership-1', 'owner'), '/v1/households/home-1/members/membership-1', 'PATCH', { role: 'owner' }, 204, null],
      ['remove member', (token) => api.removeHouseholdMember(token, 'home-1', 'membership-1'), '/v1/households/home-1/members/membership-1', 'DELETE', undefined, 204, null],
      ['leave household', (token) => api.leaveHousehold(token, 'home-1'), '/v1/households/home-1/leave', 'DELETE', undefined, 204, null],
      ['delete household', (token) => api.deleteHousehold(token, 'home-1'), '/v1/households/home-1', 'DELETE', undefined, 204, null],
      ['pending invitations', (token) => api.householdInvitations(token, 'home-1'), '/v1/households/home-1/invitations', 'GET', undefined, 200, { invitations: [] }],
      ['revoke invitation', (token) => api.revokeInvitation(token, 'home-1', 'invite-1'), '/v1/households/home-1/invitations/invite-1/revoke', 'POST', undefined, 204, null],
      ['reissue invitation', (token) => api.reissueInvitation(token, 'home-1', 'invite-1'), '/v1/households/home-1/invitations/invite-1/reissue', 'POST', undefined, 201, { invitation: {} }],
    ];

    for (const [, invoke, path, method, body, responseStatus, responseBody] of requests) {
      fetchMock.mockReset();
      const getToken = jest.fn().mockResolvedValue('fresh-management-token');
      fetchMock.mockResolvedValue(new Response(responseBody === null ? null : JSON.stringify(responseBody), { status: responseStatus }));
      await invoke(getToken);
      expect(getToken).toHaveBeenCalledTimes(1);
      expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe(path);
      expect(fetchMock.mock.calls[0][1].method).toBe(method);
      expect(fetchMock.mock.calls[0][1].body).toBe(body === undefined ? undefined : JSON.stringify(body));
      expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer fresh-management-token');
    }
  });

  it('uses household-scoped recipe URLs and obtains a fresh Bearer token for each request', async () => {
    const recipe = { id: 'recipe-1', name: 'Soup' };
    const getToken = jest.fn()
      .mockResolvedValueOnce('recipe-token-1')
      .mockResolvedValueOnce('recipe-token-2')
      .mockResolvedValueOnce('recipe-token-3')
      .mockResolvedValueOnce('recipe-token-4')
      .mockResolvedValueOnce('recipe-token-5')
      .mockResolvedValueOnce('recipe-token-6');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipes: [recipe] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipe }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipe }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipe }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await api.recipes(getToken, 'household-1', false, 'tomato soup');
    await api.recipe(getToken, 'household-1', 'recipe-1');
    await api.createRecipe(getToken, 'household-1', {
      create_request_id: 'request-1', name: 'Soup', cover_kind: 'initials', ingredients: [],
    });
    await api.updateRecipe(getToken, 'household-1', 'recipe-1', { expected_revision: 2, name: 'Tomato soup' });
    await api.archiveRecipe(getToken, 'household-1', 'recipe-1');
    await api.restoreRecipe(getToken, 'household-1', 'recipe-1');

    expect(getToken).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.map(([url, init]) => ({
      url: new URL(url as string),
      method: init?.method,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      authorization: (init?.headers as Headers).get('Authorization'),
    }))).toEqual([
      expect.objectContaining({ url: expect.objectContaining({ pathname: '/v1/households/household-1/recipes', search: '?search=tomato+soup' }), method: 'GET', authorization: 'Bearer recipe-token-1' }),
      expect.objectContaining({ url: expect.objectContaining({ pathname: '/v1/households/household-1/recipes/recipe-1' }), method: 'GET', authorization: 'Bearer recipe-token-2' }),
      expect.objectContaining({ url: expect.objectContaining({ pathname: '/v1/households/household-1/recipes' }), method: 'POST', body: { create_request_id: 'request-1', name: 'Soup', cover_kind: 'initials', ingredients: [] }, authorization: 'Bearer recipe-token-3' }),
      expect.objectContaining({ url: expect.objectContaining({ pathname: '/v1/households/household-1/recipes/recipe-1' }), method: 'PATCH', body: { expected_revision: 2, name: 'Tomato soup' }, authorization: 'Bearer recipe-token-4' }),
      expect.objectContaining({ url: expect.objectContaining({ pathname: '/v1/households/household-1/recipes/recipe-1/archive' }), method: 'POST', authorization: 'Bearer recipe-token-5' }),
      expect.objectContaining({ url: expect.objectContaining({ pathname: '/v1/households/household-1/recipes/recipe-1/restore' }), method: 'POST', authorization: 'Bearer recipe-token-6' }),
    ]);
  });

  it('preserves the typed active-member invitation conflict safely', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { code: 'HOUSEHOLD_MEMBER_ALREADY_EXISTS', message: 'private server message' } }), { status: 409 }));
    await expect(api.createInvitation(jest.fn().mockResolvedValue('session-token'), 'home-1', 'member@example.test')).rejects.toEqual(
      new ApiError(409, 'This person is already a member of this household.', 'HOUSEHOLD_MEMBER_ALREADY_EXISTS'),
    );
  });

  it.each([409, 422])('maps invitation creation HTTP %s to a safe API error', async (status) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'sensitive backend detail' }), { status }));

    await expect(api.createInvitation(jest.fn().mockResolvedValue('invitation-token'), 'household-1', 'person@example.com'))
      .rejects.toEqual(new ApiError(status, 'Something went wrong. Please try again.'));
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

  it('uses one household-scoped unit-options request with a fresh token', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ shopping_units: { built_in: [], household: [] }, recipe_measurement_units: [] }), { status: 200 }));
    const getToken = jest.fn().mockResolvedValue('catalog-options-token');

    await api.catalogUnits(getToken, 'home-1');

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/home-1/catalog/units');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer catalog-options-token');
  });

  it('creates, updates, and archives catalog items using household-scoped URLs and JSON', async () => {
    const getToken = jest.fn().mockResolvedValue('catalog-write-token');
    const item = { name: 'Milk', item_type: 'food' as const, category_id: null, shopping_unit_code: 'gallon' };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { id: 'item-1', ...item } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { id: 'item-1', ...item, name: 'Oat milk' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await api.createCatalogItem(getToken, 'home-1', item);
    await api.updateCatalogItem(getToken, 'home-1', 'item-1', { name: 'Oat milk' });
    await api.deleteCatalogItem(getToken, 'home-1', 'item-1');

    expect(getToken).toHaveBeenCalledTimes(3);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/home-1/catalog/items');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual(item);
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe('/v1/households/home-1/catalog/items/item-1');
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ name: 'Oat milk' });
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
    for (const call of fetchMock.mock.calls) expect(new Headers(call[1].headers).get('Authorization')).toBe('Bearer catalog-write-token');
  });

  it('supports category, store, and household shopping-unit management methods', async () => {
    const getToken = jest.fn().mockResolvedValue('catalog-choice-token');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ category: { id: 'category-1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ store: { id: 'store-1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ unit: { id: 'unit-1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ category: { id: 'category-1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await api.createCatalogCategory(getToken, 'home-1', 'food', 'Produce', '🥬');
    await api.createCatalogStore(getToken, 'home-1', 'Market');
    await api.createCatalogShoppingUnit(getToken, 'home-1', 'Crate');
    await api.updateCatalogCategory(getToken, 'home-1', 'category-1', 'Pantry', '🫙');
    await api.deleteCatalogCategory(getToken, 'home-1', 'category-1', 2);

    expect(getToken).toHaveBeenCalledTimes(5);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/home-1/catalog/categories');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ item_type: 'food', name: 'Produce', emoji: '🥬' });
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe('/v1/households/home-1/catalog/stores');
    expect(new URL(fetchMock.mock.calls[2][0]).pathname).toBe('/v1/households/home-1/catalog/shopping-units');
    expect(fetchMock.mock.calls[3][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string)).toEqual({ name: 'Pantry', emoji: '🫙' });
    expect(new URL(fetchMock.mock.calls[4][0]).searchParams.get('expected_active_item_count')).toBe('2');
    expect(fetchMock.mock.calls[4][1].method).toBe('DELETE');
    for (const call of fetchMock.mock.calls) expect(new Headers(call[1].headers).get('Authorization')).toBe('Bearer catalog-choice-token');
  });

  it('uses typed household-scoped recipe routes with a fresh Bearer token and 204 actions', async () => {
    const getToken = jest.fn()
      .mockResolvedValueOnce('recipe-list-token')
      .mockResolvedValueOnce('recipe-create-token')
      .mockResolvedValueOnce('recipe-update-token')
      .mockResolvedValueOnce('recipe-archive-token')
      .mockResolvedValueOnce('recipe-restore-token');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipes: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipe: { id: 'recipe-1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recipe: { id: 'recipe-1', edit_revision: 2 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await api.recipes(getToken, 'home-1', false, '  soup  ');
    await api.createRecipe(getToken, 'home-1', {
      create_request_id: 'draft-1',
      name: 'Soup',
      cover_kind: 'initials',
      ingredients: [{ catalog_item_id: 'food-1', amount: '1/2', unit_code: 'cup' }],
      steps: ['Simmer'],
    });
    await api.updateRecipe(getToken, 'home-1', 'recipe-1', { expected_revision: 1, name: 'Tomato soup' });
    await api.archiveRecipe(getToken, 'home-1', 'recipe-1');
    await api.restoreRecipe(getToken, 'home-1', 'recipe-1');

    expect(getToken).toHaveBeenCalledTimes(5);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/v1/households/home-1/recipes');
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('search')).toBe('soup');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({ create_request_id: 'draft-1', ingredients: [{ catalog_item_id: 'food-1', amount: '1/2' }] });
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({ expected_revision: 1, name: 'Tomato soup' });
    expect(fetchMock.mock.calls[2][1].method).toBe('PATCH');
    expect(new URL(fetchMock.mock.calls[3][0]).pathname).toBe('/v1/households/home-1/recipes/recipe-1/archive');
    expect(new URL(fetchMock.mock.calls[4][0]).pathname).toBe('/v1/households/home-1/recipes/recipe-1/restore');
    expect(fetchMock.mock.calls[3][1].method).toBe('POST');
    expect(fetchMock.mock.calls[4][1].method).toBe('POST');
    expect(fetchMock.mock.calls[3][1].body).toBeUndefined();
    expect(fetchMock.mock.calls[4][1].body).toBeUndefined();
    for (const [index, token] of ['recipe-list-token', 'recipe-create-token', 'recipe-update-token', 'recipe-archive-token', 'recipe-restore-token'].entries()) {
      expect(new Headers(fetchMock.mock.calls[index][1].headers).get('Authorization')).toBe(`Bearer ${token}`);
    }
  });
});
