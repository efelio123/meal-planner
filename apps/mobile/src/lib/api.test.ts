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
});
