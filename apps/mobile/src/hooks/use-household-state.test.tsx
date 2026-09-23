import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAuth, useClerk } from '@clerk/expo';

import { HouseholdStateProvider, useHouseholdState } from '@/hooks/use-household-state';
import { api } from '@/lib/api';

jest.mock('@clerk/expo', () => ({ useAuth: jest.fn(), useClerk: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), removeItem: jest.fn(), setItem: jest.fn(),
}));
jest.mock('@/lib/api', () => ({ ApiError: class ApiError extends Error {}, api: { me: jest.fn() } }));

const getToken = jest.fn().mockResolvedValue('session-token');
const mockedUseAuth = jest.mocked(useAuth);
const mockedUseClerk = jest.mocked(useClerk);
const mockedStorage = jest.mocked(AsyncStorage);
const mockedMe = jest.mocked(api.me);

describe('household selection state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ getToken, isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>);
    mockedUseClerk.mockReturnValue({ signOut: jest.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof useClerk>);
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.removeItem.mockResolvedValue();
    mockedStorage.setItem.mockResolvedValue();
  });

  it('sends a user with no households to create-or-join onboarding', async () => {
    mockedMe.mockResolvedValue({ user: { id: 'user', email: 'person@example.test', display_name: 'Person' }, households: [] });
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(result.current.destination).toBe('create-or-join'));
    expect(mockedStorage.removeItem).toHaveBeenCalledWith('meal-planner:selected-household-id');
  });

  it('automatically stores the sole API-authorized household', async () => {
    mockedMe.mockResolvedValue({
      user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
      households: [{ id: 'household', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' }],
    });
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(result.current.destination).toBe('app'));
    expect(mockedStorage.setItem).toHaveBeenCalledWith('meal-planner:selected-household-id', 'household');
  });

  it('requires a selection when multiple households have no stored choice', async () => {
    mockedMe.mockResolvedValue({
      user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
      households: [
        { id: 'first', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' },
        { id: 'second', name: 'Cabin', time_zone: 'America/Phoenix', role: 'member' },
      ],
    });
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(result.current.destination).toBe('select-household'));
    expect(mockedStorage.removeItem).toHaveBeenCalledWith('meal-planner:selected-household-id');
  });

  it('clears a stale stored household before requiring a new selection', async () => {
    mockedStorage.getItem.mockResolvedValue('removed-household');
    mockedMe.mockResolvedValue({
      user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
      households: [
        { id: 'first', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' },
        { id: 'second', name: 'Cabin', time_zone: 'America/Phoenix', role: 'member' },
      ],
    });
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(result.current.destination).toBe('select-household'));
    expect(mockedStorage.removeItem).toHaveBeenCalledWith('meal-planner:selected-household-id');
  });

  it('keeps a Clerk-signed-in user in an API-error state and retries', async () => {
    mockedMe
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ user: { id: 'user', email: 'person@example.test', display_name: 'Person' }, households: [] });
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(result.current.destination).toBe('api-error'));
    await act(async () => { await result.current.refresh(); });
    await waitFor(() => expect(result.current.destination).toBe('create-or-join'));
    expect(mockedMe).toHaveBeenCalledTimes(2);
  });

  it('signs out through Clerk and clears the selected household locally', async () => {
    const clerkSignOut = jest.fn().mockResolvedValue(undefined);
    mockedUseClerk.mockReturnValue({ signOut: clerkSignOut } as unknown as ReturnType<typeof useClerk>);
    mockedStorage.getItem.mockResolvedValue('household');
    mockedMe.mockResolvedValue({
      user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
      households: [{ id: 'household', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' }],
    });
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(result.current.destination).toBe('app'));
    await act(async () => { await result.current.signOut(); });

    expect(clerkSignOut).toHaveBeenCalledTimes(1);
    expect(mockedStorage.removeItem).toHaveBeenCalledWith('meal-planner:selected-household-id');
    expect(result.current.selectedHousehold).toBeNull();
    expect(result.current.signOutError).toBeNull();
  });

  it('retains the active state and exposes a safe error when Clerk sign-out fails', async () => {
    const clerkSignOut = jest.fn().mockRejectedValue(new Error('network unavailable'));
    mockedUseClerk.mockReturnValue({ signOut: clerkSignOut } as unknown as ReturnType<typeof useClerk>);
    mockedStorage.getItem.mockResolvedValue('household');
    mockedMe.mockResolvedValue({
      user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
      households: [{ id: 'household', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' }],
    });
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(result.current.destination).toBe('app'));
    await act(async () => { await result.current.signOut(); });

    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
    expect(result.current.selectedHousehold?.id).toBe('household');
    expect(result.current.signOutError).toBe('We couldn’t sign you out. Please try again.');
  });

  it('clears in-memory state when local preference cleanup fails after Clerk sign-out', async () => {
    const clerkSignOut = jest.fn().mockResolvedValue(undefined);
    mockedUseClerk.mockReturnValue({ signOut: clerkSignOut } as unknown as ReturnType<typeof useClerk>);
    mockedStorage.getItem.mockResolvedValue('household');
    mockedStorage.removeItem.mockRejectedValue(new Error('storage unavailable'));
    mockedMe.mockResolvedValue({
      user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
      households: [{ id: 'household', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' }],
    });
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(result.current.destination).toBe('app'));
    await act(async () => { await result.current.signOut(); });

    expect(clerkSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.selectedHousehold).toBeNull();
    expect(result.current.signOutError).toBeNull();
  });

  it('does not restore household state when an in-flight refresh resolves after sign-out', async () => {
    const clerkSignOut = jest.fn().mockResolvedValue(undefined);
    mockedUseClerk.mockReturnValue({ signOut: clerkSignOut } as unknown as ReturnType<typeof useClerk>);
    let resolveMe!: (value: {
      user: { id: string; email: string; display_name: string };
      households: { id: string; name: string; time_zone: string; role: 'owner' }[];
    }) => void;
    mockedMe.mockImplementation(() => new Promise((resolve) => { resolveMe = resolve; }));
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(mockedMe).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.signOut(); });
    await act(async () => {
      resolveMe({
        user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
        households: [{ id: 'household', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' }],
      });
    });

    expect(result.current.households).toEqual([]);
    expect(result.current.selectedHousehold).toBeNull();
    expect(result.current.destination).toBe('signed-out');
  });

  it('retries household loading when sign-out fails while a refresh is in flight', async () => {
    const clerkSignOut = jest.fn().mockRejectedValue(new Error('network unavailable'));
    mockedUseClerk.mockReturnValue({ signOut: clerkSignOut } as unknown as ReturnType<typeof useClerk>);
    type MeResponse = {
      user: { id: string; email: string; display_name: string };
      households: { id: string; name: string; time_zone: string; role: 'owner' }[];
    };
    let resolveFirst!: (value: MeResponse) => void;
    let resolveRetry!: (value: MeResponse) => void;
    mockedMe
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    const { result } = await renderHook(() => useHouseholdState(), { wrapper: HouseholdStateProvider });

    await waitFor(() => expect(mockedMe).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.signOut(); });
    await waitFor(() => expect(mockedMe).toHaveBeenCalledTimes(2));
    expect(result.current.destination).toBe('loading');

    await act(async () => {
      resolveFirst({
        user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
        households: [{ id: 'old-household', name: 'Old Home', time_zone: 'America/Phoenix', role: 'owner' }],
      });
    });
    expect(result.current.destination).toBe('loading');
    expect(result.current.selectedHousehold).toBeNull();

    await act(async () => {
      resolveRetry({
        user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
        households: [{ id: 'household', name: 'Home', time_zone: 'America/Phoenix', role: 'owner' }],
      });
    });

    await waitFor(() => expect(result.current.destination).toBe('app'));
    expect(result.current.selectedHousehold?.id).toBe('household');
    expect(result.current.signOutError).toBe('We couldn’t sign you out. Please try again.');
  });
});
