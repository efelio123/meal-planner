import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import HouseholdDetailsScreen from '@/features/household-management/household-details-screen';
import { api, type Household, type Me } from '@/lib/api';

const mockHouseholds: Household[] = [{ id: 'home-a', name: 'Home', role: 'owner', time_zone: 'America/Phoenix' }];
const mockRefresh = jest.fn();
const mockReset = jest.fn();
const mockReplace = jest.fn();

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true, sessionId: 'session-a', userId: 'user-a' }) }));
jest.mock('expo-router', () => ({
  ...jest.requireActual<typeof import('expo-router')>('expo-router'),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
  router: { push: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
  useLocalSearchParams: () => ({ householdId: 'home-a' }),
}));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({
  getToken: jest.fn().mockResolvedValue('token'),
  households: mockHouseholds,
  isSigningOut: false,
  isSwitchingHousehold: false,
  refresh: mockRefresh,
  select: jest.fn(),
  selectedHousehold: mockHouseholds[0],
}) }));
jest.mock('@/features/profile/use-reset-to-household-startup', () => ({ useResetToHouseholdStartup: () => mockReset }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, householdMembers: jest.fn(), leaveHousehold: jest.fn() } };
});

const householdMembers = jest.mocked(api.householdMembers);
const currentMembership: Me = {
  user: { id: 'user-a', email: 'user@example.test', display_name: 'User' },
  households: mockHouseholds,
};

it('keeps details open when a stale same-session refresh still lists the household', async () => {
  mockRefresh.mockResolvedValueOnce(currentMembership);
  householdMembers.mockResolvedValue({ members: [] });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const view = await render(<HouseholdDetailsScreen />);
  await waitFor(() => expect(screen.queryByText('Loading members…')).toBeNull());

  await fireEvent.press(view.getByRole('button', { name: 'Leave household' }));
  const confirm = alert.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Leave household' && button.style === 'destructive');
  await act(async () => { await (confirm?.onPress?.() as unknown as Promise<void>); });

  expect(screen.getByText('We couldn’t confirm your household access changed. Refresh and try again.')).toBeTruthy();
  expect(mockReset).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
