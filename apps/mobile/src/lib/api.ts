import { apiOrigin } from '@/auth-config';

export type GetToken = () => Promise<string | null>;

export type Household = { id: string; name: string; time_zone: string; role: 'owner' | 'member' };
export type Me = { user: { id: string; email: string; display_name: string }; households: Household[] };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(getToken: GetToken, path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  const requestHeaders = new Headers(init?.headers);
  requestHeaders.set('Authorization', `Bearer ${token}`);
  requestHeaders.set('Content-Type', 'application/json');
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: requestHeaders,
  });
  if (!response.ok) throw new ApiError(response.status, response.status === 410 ? 'This invitation has expired.' : 'Something went wrong. Please try again.');
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const api = {
  me: (getToken: GetToken, init?: RequestInit) => request<Me>(getToken, '/v1/me', init),
  createHousehold: (getToken: GetToken, name: string, timeZone: string) =>
    request<{ household: Household }>(getToken, '/v1/households', { method: 'POST', body: JSON.stringify({ name, time_zone: timeZone }) }),
  acceptInvitation: (getToken: GetToken, code: string) =>
    request<void>(getToken, '/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ code }) }),
};
