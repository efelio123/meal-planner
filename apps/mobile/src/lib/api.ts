import { apiOrigin } from '@/auth-config';
import type { StartupDiagnostics } from '@/lib/startup-diagnostics';

export type GetToken = () => Promise<string | null>;

export type Household = { id: string; name: string; time_zone: string; role: 'owner' | 'member' };
export type Me = { user: { id: string; email: string; display_name: string }; households: Household[] };
export type ShoppingListItem = { id: string; name: string; is_checked: boolean; checked_at: string | null; checked_by_user_id: string | null; created_by_user_id: string; created_at: string };
export type ShoppingList = { id: string; household_id: string; items: ShoppingListItem[] };
export type CreatedInvitation = { id: string; expires_at: string; code: string };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(getToken: GetToken, path: string, init?: RequestInit, diagnostics?: StartupDiagnostics): Promise<T> {
  const requestDiagnostics = path === '/v1/me' ? diagnostics : undefined;
  const tokenStartedAt = Date.now();
  let token: string | null = null;
  try {
    token = await getToken();
  } finally {
    requestDiagnostics?.record('token_retrieval', Date.now() - tokenStartedAt);
  }
  if (!token) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  const requestHeaders = new Headers(init?.headers);
  requestHeaders.set('Authorization', `Bearer ${token}`);
  requestHeaders.set('Content-Type', 'application/json');
  if (requestDiagnostics) requestHeaders.set('X-Request-ID', requestDiagnostics.requestId);
  const fetchStartedAt = Date.now();
  requestDiagnostics?.record('me_fetch', 0);
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}${path}`, { ...init, headers: requestHeaders });
  } catch (error) {
    requestDiagnostics?.record('me_response', Date.now() - fetchStartedAt);
    throw error;
  }
  requestDiagnostics?.record('me_response', Date.now() - fetchStartedAt, response.status);
  if (!response.ok) throw new ApiError(response.status, response.status === 410 ? 'This invitation has expired.' : 'Something went wrong. Please try again.');
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const api = {
  me: (getToken: GetToken, init?: RequestInit, diagnostics?: StartupDiagnostics) => request<Me>(getToken, '/v1/me', init, diagnostics),
  createHousehold: (getToken: GetToken, name: string, timeZone: string) =>
    request<{ household: Household }>(getToken, '/v1/households', { method: 'POST', body: JSON.stringify({ name, time_zone: timeZone }) }),
  acceptInvitation: (getToken: GetToken, code: string) =>
    request<void>(getToken, '/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ code }) }),
  createInvitation: (getToken: GetToken, householdId: string, email: string) =>
    request<{ invitation: CreatedInvitation }>(getToken, `/v1/households/${householdId}/invitations`, { method: 'POST', body: JSON.stringify({ email }) }),
  shoppingList: (getToken: GetToken, householdId: string) =>
    request<{ shopping_list: ShoppingList }>(getToken, `/v1/households/${householdId}/shopping-list`, { method: 'GET' }),
  addShoppingListItem: (getToken: GetToken, householdId: string, name: string) =>
    request<{ item: ShoppingListItem }>(getToken, `/v1/households/${householdId}/shopping-list/items`, { method: 'POST', body: JSON.stringify({ name }) }),
  setShoppingListItemChecked: (getToken: GetToken, householdId: string, itemId: string, isChecked: boolean) =>
    request<{ item: ShoppingListItem }>(getToken, `/v1/households/${householdId}/shopping-list/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ is_checked: isChecked }) }),
  deleteShoppingListItem: (getToken: GetToken, householdId: string, itemId: string) =>
    request<void>(getToken, `/v1/households/${householdId}/shopping-list/items/${itemId}`, { method: 'DELETE' }),
};
