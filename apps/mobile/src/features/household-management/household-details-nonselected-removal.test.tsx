import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import HouseholdDetailsScreen from '@/features/household-management/household-details-screen';
import { api, type Household, type Me } from '@/lib/api';

const mockHouseholds: Household[] = [
  { id: 'home-a', name: 'Home', role: 'owner', time_zone: 'America/Phoenix' },
  { id: 'home-b', name: 'Cabin', role: 'member', time_zone: 'Europe/London' },
];
const mockRefresh = jest.fn();
const mockReplace = jest.fn();
let mockSetHouseholds: (households: Household[]) => void = () => undefined;
let mockRenderedHouseholds: Household[] = [];

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
jest.mock('@/hooks/use-household-state', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  return { useHouseholdState: () => {
    const [households, setHouseholds] = useState(mockHouseholds);
    mockSetHouseholds = setHouseholds;
    mockRenderedHouseholds = households;
    return {
      getToken: jest.fn().mockResolvedValue('token'),
      households,
      isSigningOut: false,
      isSwitchingHousehold: false,
      refresh: mockRefresh,
      select: jest.fn(),
      selectedHousehold: households.find((household: Household) => household.id === 'home-b') ?? null,
    };
  } };
});
jest.mock('@/features/profile/use-reset-to-household-startup', () => ({ useResetToHouseholdStartup: () => jest.fn() }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, householdMembers: jest.fn(), deleteHousehold: jest.fn() } };
});

const householdMembers = jest.mocked(api.householdMembers);

it('closes a non-selected deleted household route without changing the active household', async () => {
  let resolveRefresh!: (me: Me) => void;
  const pendingRefresh = new Promise<Me>((resolve) => { resolveRefresh = resolve; });
  let markRefreshStarted!: () => void;
  const refreshStarted = new Promise<void>((resolve) => { markRefreshStarted = resolve; });
  mockRefresh.mockImplementationOnce(() => {
    markRefreshStarted();
    return pendingRefresh.then((me) => { mockSetHouseholds(me.households); return me; });
  });
  householdMembers.mockResolvedValue({ members: [] });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const view = await render(<HouseholdDetailsScreen />);
  await waitFor(() => expect(screen.queryByText('Loading members…')).toBeNull());

  await fireEvent.press(view.getByRole('button', { name: 'Delete household' }));
  const confirm = alert.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Delete household' && button.style === 'destructive');
  await act(async () => {
    const action = confirm?.onPress?.() as unknown as Promise<void>;
    await refreshStarted;
    resolveRefresh({ user: { id: 'user-a', email: 'user@example.test', display_name: 'User' }, households: [mockHouseholds[1]] });
    await action;
  });
  expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/profile/my-households');
  expect(mockRenderedHouseholds.map((household) => household.id)).toEqual(['home-b']);
});
