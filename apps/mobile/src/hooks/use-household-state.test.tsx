import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAuth } from '@clerk/expo';

import { HouseholdStateProvider, useHouseholdState } from '@/hooks/use-household-state';
import { api } from '@/lib/api';

jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), removeItem: jest.fn(), setItem: jest.fn(),
}));
jest.mock('@/lib/api', () => ({ api: { me: jest.fn() } }));

const getToken = jest.fn().mockResolvedValue('session-token');
const mockedUseAuth = jest.mocked(useAuth);
const mockedStorage = jest.mocked(AsyncStorage);
const mockedMe = jest.mocked(api.me);

describe('household selection state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ getToken, isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>);
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
});
