import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import HouseholdDetailsScreen from '@/features/household-management/household-details-screen';
import { api, type Household, type Me } from '@/lib/api';

let mockSession = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
let mockHouseholds: Household[] = [];
let mockRenderedHouseholds: Household[] = [];
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockRefresh = jest.fn();
const mockReset = jest.fn();
let mockSetHouseholds: (households: Household[]) => void = () => undefined;

jest.mock('@clerk/expo', () => ({ useAuth: () => mockSession }));
jest.mock('expo-router', () => ({
  ...jest.requireActual<typeof import('expo-router')>('expo-router'),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ householdId: 'home-a' }),
}));
jest.mock('@/hooks/use-household-state', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  return { useHouseholdState: () => {
    const [households, setHouseholds] = useState(mockHouseholds);
    mockSetHouseholds = setHouseholds;
    mockRenderedHouseholds = households;
    return {
      getToken: mockGetToken,
      households,
      isSigningOut: false,
      isSwitchingHousehold: false,
      refresh: mockRefresh,
      select: jest.fn(),
      selectedHousehold: households.find((household: Household) => household.id === 'home-a') ?? null,
    };
  } };
});
jest.mock('@/features/profile/use-reset-to-household-startup', () => ({ useResetToHouseholdStartup: () => mockReset }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, householdMembers: jest.fn(), leaveHousehold: jest.fn(), deleteHousehold: jest.fn() } };
});

const householdMembers = jest.mocked(api.householdMembers);
const householdA: Household = { id: 'home-a', name: 'Home', role: 'owner', time_zone: 'America/Phoenix' };
const householdB: Household = { id: 'home-b', name: 'Cabin', role: 'member', time_zone: 'Europe/London' };

function meWithHouseholds(households: Household[]): Me {
  return { user: { id: 'user-a', email: 'user@example.test', display_name: 'User' }, households };
}

describe('household detail route cleanup after a successful leave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
    mockHouseholds = [householdA, householdB];
    householdMembers.mockResolvedValue({ members: [] });
  });

  afterEach(() => jest.restoreAllMocks());

  it('resets to startup after deferred refresh removes the selected route household', async () => {
    let resolveRefresh!: (me: Me) => void;
    const refreshPending = new Promise<Me>((resolve) => { resolveRefresh = resolve; });
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => { markRefreshStarted = resolve; });
    mockRefresh.mockImplementationOnce(() => {
      markRefreshStarted();
      return refreshPending.then((me) => { mockSetHouseholds(me.households); return me; });
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<HouseholdDetailsScreen />);
    await waitFor(() => expect(screen.queryByText('Loading members…')).toBeNull());

    await fireEvent.press(view.getByRole('button', { name: 'Leave household' }));
    const confirm = alert.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Leave household' && button.style === 'destructive');
    expect(confirm?.onPress).toBeDefined();
    await act(async () => {
      const action = confirm?.onPress?.() as unknown as Promise<void>;
      await refreshStarted;
      resolveRefresh(meWithHouseholds([householdB]));
      await action;
    });
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockRenderedHouseholds.map((household) => household.id)).toEqual(['home-b']);
  });
});
