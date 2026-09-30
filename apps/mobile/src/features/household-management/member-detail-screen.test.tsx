import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { MemberDetailScreen } from '@/features/household-management/member-detail-screen';
import { householdMembersRevision } from '@/features/household-management/household-members-revision';
import { ApiError, api } from '@/lib/api';

let mockSession = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
let mockRole: 'owner' | 'member' = 'member';
let mockMember: Record<string, unknown> = {
  membership_id: 'membership-b',
  display_name: 'Name not set yet',
  avatar_url: null,
  role: 'member',
  joined_at: '2026-09-01T00:00:00Z',
  is_self: false,
};
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockRefresh = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@clerk/expo', () => ({ useAuth: () => mockSession }));
jest.mock('expo-router', () => ({
  ...jest.requireActual<typeof import('expo-router')>('expo-router'),
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({ householdId: 'home-a', membershipId: 'membership-b' }),
}));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({
  getToken: mockGetToken,
  households: [{ id: 'home-a', name: 'Home', role: mockRole, time_zone: 'UTC' }],
  isSigningOut: false,
  refresh: mockRefresh,
}) }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, householdMember: jest.fn(), setHouseholdMemberRole: jest.fn(), removeHouseholdMember: jest.fn() } };
});

const householdMember = jest.mocked(api.householdMember);
const setRole = jest.mocked(api.setHouseholdMemberRole);
const removeMember = jest.mocked(api.removeHouseholdMember);

describe('household member detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
    mockRole = 'member';
    mockMember = {
      membership_id: 'membership-b', display_name: 'Name not set yet', avatar_url: null,
      role: 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false,
    };
    householdMember.mockImplementation(async () => ({ member: mockMember as never }));
    setRole.mockResolvedValue(undefined);
    removeMember.mockResolvedValue(undefined);
    mockRefresh.mockResolvedValue(null);
  });

  it('shows privacy-safe name, role, and join date to a member without owner controls', async () => {
    await render(<MemberDetailScreen />);
    expect(await screen.findByText('Name not set yet')).toBeTruthy();
    expect(screen.getByText('Member')).toBeTruthy();
    expect(screen.getByText(/Joined/u)).toBeTruthy();
    expect(screen.queryByText('secret@example.test')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make owner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove member' })).toBeNull();
  });

  it('shows owner-scoped email and promotes a member through the API', async () => {
    mockRole = 'owner';
    mockMember = { ...mockMember, display_name: 'Sam Member', email: 'secret@example.test' };
    const revisionBefore = householdMembersRevision({ householdId: 'home-a', sessionId: 'session-a', userId: 'user-a' });
    setRole.mockImplementation(async (_getToken, _householdId, _membershipId, role) => {
      mockMember = { ...mockMember, role };
    });
    await render(<MemberDetailScreen />);
    expect(await screen.findByText('secret@example.test')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Make owner' }));
    await waitFor(() => expect(setRole).toHaveBeenCalledWith(mockGetToken, 'home-a', 'membership-b', 'owner'));
    expect(await screen.findByText('Owner')).toBeTruthy();
    expect(householdMembersRevision({ householdId: 'home-a', sessionId: 'session-a', userId: 'user-a' })).toBe(revisionBefore + 1);
  });

  it('shows a safe last-owner conflict', async () => {
    mockRole = 'owner';
    mockMember = { ...mockMember, role: 'owner' };
    setRole.mockRejectedValue(new ApiError(409, 'At least one active owner must remain.', 'LAST_OWNER'));
    await render(<MemberDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Make member' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('At least one active owner must remain.')).toBeTruthy();
  });

  it('does not invalidate the People list when removal fails', async () => {
    mockRole = 'owner';
    const revisionBefore = householdMembersRevision({ householdId: 'home-a', sessionId: 'session-a', userId: 'user-a' });
    removeMember.mockRejectedValue(new ApiError(409, 'At least one active owner must remain.', 'LAST_OWNER'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Remove member')?.onPress?.();
    });
    await render(<MemberDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove member' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(removeMember).toHaveBeenCalledTimes(1);
    expect(householdMembersRevision({ householdId: 'home-a', sessionId: 'session-a', userId: 'user-a' })).toBe(revisionBefore);
    alert.mockRestore();
  });
});
