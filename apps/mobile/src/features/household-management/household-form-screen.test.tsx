import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { HouseholdFormScreen } from '@/features/household-management/household-form-screen';
import { api } from '@/lib/api';
import { deviceTimeZone } from '@/lib/time-zones';

let mockSession = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
const mockHousehold = { id: 'home-a', name: 'Home A', time_zone: 'America/Phoenix', role: 'owner' as const };
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockRefresh = jest.fn();
const mockRouterReplace = jest.fn();
let mockHouseholds = [mockHousehold];

jest.mock('@clerk/expo', () => ({ useAuth: () => mockSession }));
jest.mock('expo-router', () => ({
  ...jest.requireActual<typeof import('expo-router')>('expo-router'),
  router: { replace: (...args: unknown[]) => mockRouterReplace(...args) },
  useLocalSearchParams: () => ({ householdId: 'home-a' }),
}));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({
  getToken: mockGetToken,
  households: mockHouseholds,
  isSigningOut: false,
  refresh: mockRefresh,
}) }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, createHousehold: jest.fn(), updateHousehold: jest.fn() } };
});
jest.mock('@/components/time-zone-picker', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Button, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { TimeZonePicker: ({ onChange, value }: { onChange: (timeZone: string) => void; value: string }) => React.createElement(
    View,
    null,
    React.createElement(Button, { title: `Selected zone ${value}`, onPress: () => onChange('Europe/London') }),
  ) };
});

const createHousehold = jest.mocked(api.createHousehold);
const updateHousehold = jest.mocked(api.updateHousehold);

describe('household form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
    mockHouseholds = [mockHousehold];
    mockRefresh.mockResolvedValue({ user: { id: 'user-a', email: 'user@example.test', display_name: 'User' }, households: [mockHousehold, { id: 'home-b', name: 'New home', time_zone: 'Europe/London', role: 'owner' }] });
    createHousehold.mockResolvedValue({ household: { id: 'home-b', name: 'New home', time_zone: 'Europe/London', role: 'owner' } });
    updateHousehold.mockResolvedValue({ household: { ...mockHousehold, name: 'Updated home' } });
  });

  it('defaults a new household to the device IANA zone and preserves active selection', async () => {
    await render(<HouseholdFormScreen mode="create" />);
    expect(screen.getByRole('button', { name: `Selected zone ${deviceTimeZone()}` })).toBeTruthy();
    expect(mockHouseholds).toEqual([mockHousehold]);
    expect(screen.getByText('The IANA time-zone name is saved for this household.')).toBeTruthy();
  });

  it('submits a changed IANA zone and opens new details without selecting the new household', async () => {
    await render(<HouseholdFormScreen mode="create" />);
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'New home');
    await fireEvent.press(screen.getByRole('button', { name: `Selected zone ${deviceTimeZone()}` }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create household' }));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/(tabs)/profile/my-households/home-b'));
    expect(createHousehold).toHaveBeenCalledWith(mockGetToken, 'New home', 'Europe/London');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/(tabs)/profile/my-households/home-b');
    expect(mockHouseholds).toEqual([mockHousehold]);
  });

  it('does not navigate if refresh does not authorize the newly created household', async () => {
    mockRefresh.mockResolvedValue({ user: { id: 'user-a', email: 'user@example.test', display_name: 'User' }, households: [mockHousehold] });
    await render(<HouseholdFormScreen mode="create" />);
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'New home');
    await fireEvent.press(screen.getByRole('button', { name: 'Create household' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
