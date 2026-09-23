import { acceptInvitationAndRefresh } from '@/app/(onboarding)/join-household';

jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('@/lib/api', () => ({ ApiError: class ApiError extends Error {}, api: { acceptInvitation: jest.fn() } }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: jest.fn() }));

describe('joining a household', () => {
  it('refreshes API-authoritative household state after accepting a code', async () => {
    const acceptInvitation = jest.fn().mockResolvedValue(undefined);
    const getToken = jest.fn().mockResolvedValue('session-token');
    const refresh = jest.fn().mockResolvedValue(undefined);
    const navigateHome = jest.fn();

    await acceptInvitationAndRefresh(
      acceptInvitation,
      getToken,
      'copyable-code',
      refresh,
      navigateHome,
    );

    expect(acceptInvitation).toHaveBeenCalledWith(getToken, 'copyable-code');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigateHome).toHaveBeenCalledTimes(1);
    expect(acceptInvitation.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]);
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(navigateHome.mock.invocationCallOrder[0]);
  });
});
