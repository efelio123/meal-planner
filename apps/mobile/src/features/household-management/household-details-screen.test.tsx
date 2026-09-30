import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import HouseholdDetailsScreen from '@/features/household-management/household-details-screen';
import { householdMembersRevision, markHouseholdMembersChanged } from '@/features/household-management/household-members-revision';
import { api, type Household } from '@/lib/api';

let mockSession = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
let mockRole: 'owner' | 'member' = 'owner';
let mockRouteHouseholdId = 'home-a';
let mockHouseholds: Household[] = [{ id: 'home-a', name: 'Home', role: 'owner', time_zone: 'America/Phoenix' }];
let mockSelectedHouseholdId: string | null = 'home-a';
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockRefresh = jest.fn();
const mockSelect = jest.fn();
const mockReset = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('@clerk/expo', () => ({ useAuth: () => mockSession }));
jest.mock('expo-router', () => ({
  ...jest.requireActual<typeof import('expo-router')>('expo-router'),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
  router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
  useLocalSearchParams: () => ({ householdId: mockRouteHouseholdId }),
}));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({
  getToken: mockGetToken,
  households: mockHouseholds.map((household) => ({ ...household, role: household.id === 'home-a' ? mockRole : household.role })),
  isSigningOut: false,
  isSwitchingHousehold: false,
  refresh: mockRefresh,
  select: mockSelect,
  selectedHousehold: mockHouseholds.find((household) => household.id === mockSelectedHouseholdId) ?? null,
}) }));
jest.mock('@/features/profile/use-reset-to-household-startup', () => ({ useResetToHouseholdStartup: () => mockReset }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, householdMembers: jest.fn(), leaveHousehold: jest.fn(), deleteHousehold: jest.fn() } };
});

const householdMembers = jest.mocked(api.householdMembers);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe('household details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
    mockRole = 'owner';
    mockRouteHouseholdId = 'home-a';
    mockHouseholds = [{ id: 'home-a', name: 'Home', role: 'owner', time_zone: 'America/Phoenix' }];
    mockSelectedHouseholdId = 'home-a';
    householdMembers.mockResolvedValue({ members: [{
      membership_id: 'membership-a', display_name: 'Name not set yet', avatar_url: null,
      role: 'owner', joined_at: '2026-09-01T00:00:00Z', is_self: true, email: 'owner@example.test',
    }] });
    mockRefresh.mockResolvedValue(null);
    mockSelect.mockResolvedValue({ status: 'selected' });
  });

  it('shows member rows with role and date, and exposes owner management destinations', async () => {
    await render(<HouseholdDetailsScreen />);
    expect(await screen.findByLabelText(/Name not set yet, owner, Joined/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit household' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invitations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete household' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave household' })).toBeTruthy();
    expect(screen.queryByText('owner@example.test')).toBeNull();
  });

  it('shows members read-only information and no owner-management controls', async () => {
    mockRole = 'member';
    await render(<HouseholdDetailsScreen />);
    expect(await screen.findByLabelText(/Name not set yet, owner, Joined/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit household' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invitations' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete household' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave household' })).toBeTruthy();
  });

  it('confirms Delete household with access consequences and no promise of erasure', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<HouseholdDetailsScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete household' })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Delete household' }));
    fireEvent.press(screen.getByRole('button', { name: 'Delete household' }));
    expect(alert).toHaveBeenCalledWith(
      'Delete household',
      expect.stringContaining('Everyone will lose access to Home and its shared content. This cannot be undone in the app.'),
      expect.arrayContaining([expect.objectContaining({ text: 'Delete household', style: 'destructive' })]),
    );
    expect(alert.mock.calls[0][1]).not.toMatch(/permanent(?:ly)? eras|restore|archive/iu);
    alert.mockRestore();
  });

  it('refreshes /v1/me before the People list and coalesces a role revision during that refresh', async () => {
    const pendingMe = deferred<{ user: { id: string; email: string; display_name: string }; households: Household[] }>();
    mockRefresh.mockReturnValueOnce(pendingMe.promise);
    await render(<HouseholdDetailsScreen />);
    await screen.findByLabelText(/Name not set yet, owner, Joined/u);
    const refreshControl = screen.getByTestId('screen').props.refreshControl;

    await act(async () => { refreshControl.props.onRefresh(); });
    expect(await screen.findByText('Refreshing household…')).toBeTruthy();
    markHouseholdMembersChanged({ householdId: 'home-a', sessionId: 'session-a', userId: 'user-a' });
    await act(async () => {
      pendingMe.resolve({
        user: { id: 'user-a', email: 'owner@example.test', display_name: 'Owner' },
        households: mockHouseholds,
      });
      await pendingMe.promise;
    });

    await waitFor(() => expect(householdMembers).toHaveBeenCalledTimes(2));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Showing the last confirmed information.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('applies revisions independently when the mounted details scope changes', async () => {
    const householdA = { householdId: 'home-a', sessionId: 'session-a', userId: 'user-a' };
    const householdB = { householdId: 'home-b', sessionId: 'session-b', userId: 'user-b' };
    for (let index = 0; index < 20; index += 1) markHouseholdMembersChanged(householdA);
    mockHouseholds = [
      { id: 'home-a', name: 'Home A', role: 'owner', time_zone: 'America/Phoenix' },
      { id: 'home-b', name: 'Home B', role: 'member', time_zone: 'Europe/London' },
    ];
    mockSelectedHouseholdId = 'home-a';
    const pendingRefresh = deferred<{ user: { id: string; email: string; display_name: string }; households: Household[] }>();
    mockRefresh.mockReturnValueOnce(pendingRefresh.promise);
    let bPeopleRequest = 0;
    householdMembers.mockImplementation(async (_getToken, householdId) => {
      if (householdId === 'home-a') return { members: [{
        membership_id: 'membership-a', display_name: 'Name not set yet', avatar_url: null,
        role: 'owner', joined_at: '2026-09-01T00:00:00Z', is_self: true,
      }] };
      expect(householdId).toBe('home-b');
      bPeopleRequest += 1;
      return { members: [{
        membership_id: 'membership-b', display_name: 'Sam B', avatar_url: null,
        role: bPeopleRequest === 1 ? 'member' : 'owner', joined_at: '2026-09-01T00:00:00Z', is_self: false,
      }] };
    });
    const rendered = await render(<HouseholdDetailsScreen />);
    await screen.findByLabelText(/Name not set yet, owner, Joined/u);

    mockSession = { isSignedIn: true, sessionId: 'session-b', userId: 'user-b' };
    mockRouteHouseholdId = 'home-b';
    mockSelectedHouseholdId = 'home-b';
    await act(async () => { await rendered.rerender(<HouseholdDetailsScreen />); });
    expect(await screen.findByLabelText(/Sam B, member, Joined/u)).toBeTruthy();
    expect(householdMembersRevision(householdA)).toBeGreaterThan(householdMembersRevision(householdB) + 1);

    await act(async () => {
      markHouseholdMembersChanged(householdB);
      await Promise.resolve();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Refreshing household…')).toBeTruthy();
    await act(async () => {
      pendingRefresh.resolve({
        user: { id: 'user-b', email: 'member@example.test', display_name: 'Member' },
        households: [mockHouseholds[1]],
      });
      await pendingRefresh.promise;
    });

    expect(await screen.findByLabelText(/Sam B, owner, Joined/u)).toBeTruthy();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(bPeopleRequest).toBe(2);
  });

  it('keeps confirmed data marked stale and hides owner controls when refresh fails', async () => {
    mockRefresh.mockRejectedValueOnce(new Error('offline'));
    await render(<HouseholdDetailsScreen />);
    await screen.findByLabelText(/Name not set yet, owner, Joined/u);
    const refreshControl = screen.getByTestId('screen').props.refreshControl;

    await act(async () => { refreshControl.props.onRefresh(); });

    expect(await screen.findByText('Showing the last confirmed information.')).toBeTruthy();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry refresh' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit household' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invitations' })).toBeNull();
  });

  it('does not request People when /v1/me fails after a role revision arrives', async () => {
    const pendingMe = deferred<{ user: { id: string; email: string; display_name: string }; households: Household[] }>();
    mockRefresh.mockReturnValueOnce(pendingMe.promise);
    await render(<HouseholdDetailsScreen />);
    await screen.findByLabelText(/Name not set yet, owner, Joined/u);
    const refreshControl = screen.getByTestId('screen').props.refreshControl;

    await act(async () => { refreshControl.props.onRefresh(); });
    expect(await screen.findByText('Refreshing household…')).toBeTruthy();
    markHouseholdMembersChanged({ householdId: 'home-a', sessionId: 'session-a', userId: 'user-a' });
    await act(async () => {
      pendingMe.reject(new Error('offline'));
      await pendingMe.promise.catch(() => undefined);
    });

    expect(await screen.findByText('Showing the last confirmed information.')).toBeTruthy();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry refresh' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit household' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invitations' })).toBeNull();
    expect(householdMembers).toHaveBeenCalledTimes(1);
  });

  it('uses the refreshed membership role before rendering owner-only household actions', async () => {
    mockRefresh.mockImplementation(async () => {
      mockRole = 'member';
      return {
        user: { id: 'user-a', email: 'owner@example.test', display_name: 'Owner' },
        households: [{ id: 'home-a', name: 'Home', role: 'member', time_zone: 'America/Phoenix' }],
      };
    });
    await render(<HouseholdDetailsScreen />);
    await screen.findByLabelText(/Name not set yet, owner, Joined/u);
    const refreshControl = screen.getByTestId('screen').props.refreshControl;

    await act(async () => { refreshControl.props.onRefresh(); });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit household' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Invitations' })).toBeNull();
    expect(screen.getByText('member')).toBeTruthy();
  });

  it('repeats one People request when a confirmed role change lands during an older People response', async () => {
    const oldPeopleResponse = deferred<{ members: { membership_id: string; display_name: string; avatar_url: null; role: 'member'; joined_at: string; is_self: false }[] }>();
    let peopleRequest = 0;
    householdMembers.mockImplementation(async () => {
      peopleRequest += 1;
      if (peopleRequest === 2) return oldPeopleResponse.promise;
      return { members: [{
        membership_id: 'membership-a', display_name: 'Name not set yet', avatar_url: null,
        role: peopleRequest >= 3 ? 'owner' : 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false,
      }] };
    });
    mockRefresh.mockResolvedValue({
      user: { id: 'user-a', email: 'owner@example.test', display_name: 'Owner' },
      households: mockHouseholds,
    });
    await render(<HouseholdDetailsScreen />);
    await screen.findByLabelText(/Name not set yet, member, Joined/u);
    const refreshControl = screen.getByTestId('screen').props.refreshControl;

    await act(async () => { refreshControl.props.onRefresh(); });
    await waitFor(() => expect(peopleRequest).toBe(2));
    markHouseholdMembersChanged({ householdId: 'home-a', sessionId: 'session-a', userId: 'user-a' });
    await act(async () => {
      oldPeopleResponse.resolve({ members: [{
        membership_id: 'membership-a', display_name: 'Name not set yet', avatar_url: null,
        role: 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false,
      }] });
      await oldPeopleResponse.promise;
    });

    await waitFor(() => expect(peopleRequest).toBe(3));
    expect(await screen.findByLabelText(/Name not set yet, owner, Joined/u)).toBeTruthy();
    expect(householdMembers).toHaveBeenCalledTimes(3);
  });

});
