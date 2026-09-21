import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useAuth } from '@clerk/expo';

import JoinHousehold from '@/app/(onboarding)/join-household';
import { HouseholdStateProvider } from '@/hooks/use-household-state';
import { api } from '@/lib/api';

const mockReplace = jest.fn();

jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), removeItem: jest.fn(), setItem: jest.fn(),
}));
jest.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: { me: jest.fn(), acceptInvitation: jest.fn() },
}));

const mockedUseAuth = jest.mocked(useAuth);
const mockedStorage = jest.mocked(AsyncStorage);
const mockedMe = jest.mocked(api.me);
const mockedAcceptInvitation = jest.mocked(api.acceptInvitation);

describe('joining a household', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      getToken: jest.fn().mockResolvedValue('session-token'), isLoaded: true, isSignedIn: true,
    } as unknown as ReturnType<typeof useAuth>);
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.removeItem.mockResolvedValue();
    mockedStorage.setItem.mockResolvedValue();
  });

  it('refreshes API-authoritative household state after accepting a code', async () => {
    mockedMe
      .mockResolvedValueOnce({ user: { id: 'user', email: 'person@example.test', display_name: 'Person' }, households: [] })
      .mockResolvedValueOnce({
        user: { id: 'user', email: 'person@example.test', display_name: 'Person' },
        households: [{ id: 'home', name: 'Home', time_zone: 'America/Phoenix', role: 'member' }],
      });
    mockedAcceptInvitation.mockResolvedValue();
    const screen = await render(<HouseholdStateProvider><JoinHousehold /></HouseholdStateProvider>);

    await waitFor(() => expect(mockedMe).toHaveBeenCalledTimes(1));
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Invitation code'), 'copyable-code');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Join household' }));
    });

    await waitFor(() => expect(mockedAcceptInvitation).toHaveBeenCalledWith(expect.any(Function), 'copyable-code'));
    await waitFor(() => expect(mockedMe).toHaveBeenCalledTimes(2));
    expect(mockedStorage.setItem).toHaveBeenCalledWith('meal-planner:selected-household-id', 'home');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
