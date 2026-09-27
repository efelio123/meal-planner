import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { OwnerInvitationScreen } from '@/features/household-invitations/owner-invitation-screen';
import { ApiError, api } from '@/lib/api';

let mockAuthState = {
  isLoaded: true,
  isSignedIn: true,
  sessionId: 'session-a',
  userId: 'user-a',
};
let mockHouseholdState = {
  getToken: jest.fn().mockResolvedValue('session-token'),
  isSigningOut: false,
  selectedHousehold: null as null | { id: string; name: string; role: 'owner' | 'member'; time_zone: string },
};

jest.mock('@clerk/expo', () => ({ useAuth: () => mockAuthState }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => mockHouseholdState }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, createInvitation: jest.fn() } };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  ...jest.requireActual<typeof import('expo-router')>('expo-router'),
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const invitationResponse = {
  invitation: {
    id: 'invitation-1',
    expires_at: '2026-10-01T12:00:00.000Z',
    code: 'one-time-test-code',
  },
};

const createInvitation = jest.mocked(api.createInvitation);
const setClipboardString = jest.mocked(Clipboard.setStringAsync);

describe('OwnerInvitationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = { isLoaded: true, isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
    mockHouseholdState = {
      getToken: jest.fn().mockResolvedValue('session-token'),
      isSigningOut: false,
      selectedHousehold: { id: 'household-a', name: 'Home A', role: 'owner', time_zone: 'UTC' },
    };
    createInvitation.mockResolvedValue(invitationResponse);
    setClipboardString.mockResolvedValue(true);
  });

  it('keeps submitted email, code, ID, and expiry paired when the form changes and a later request fails', async () => {
    const laterRequest = deferred<typeof invitationResponse>();
    createInvitation.mockResolvedValueOnce(invitationResponse).mockReturnValueOnce(laterRequest.promise);
    await render(<OwnerInvitationScreen />);

    await fireEvent.changeText(screen.getByLabelText('Recipient email'), '  Friend@Example.com  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByText(/Invitation for friend@example\.com/u);
    expect(createInvitation).toHaveBeenNthCalledWith(1, expect.any(Function), 'household-a', 'friend@example.com');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create invitation' }).props.accessibilityState.disabled).toBe(false));

    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'second@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    laterRequest.reject(new ApiError(409, 'server detail must stay hidden'));

    expect(await screen.findByText(/Invitation for friend@example\.com/u)).toBeTruthy();
    expect(screen.getByLabelText('Invitation code').props.children).toBe('one-time-test-code');
    expect(screen.queryByText(/Invitation for second@example\.com/u)).toBeNull();
    expect(await screen.findByText(/active invitation already exists/u)).toBeTruthy();
  });

  it('shows copy success only when the clipboard reports true', async () => {
    await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByText(/Invitation for friend@example\.com/u);

    setClipboardString.mockResolvedValueOnce(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy invitation code' }));
    expect(await screen.findByText(/Couldn’t copy the code/u)).toBeTruthy();
    expect(screen.queryByText('Invitation code copied.')).toBeNull();

    setClipboardString.mockResolvedValueOnce(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy invitation code' }));
    expect(await screen.findByText('Invitation code copied.')).toBeTruthy();
    expect(setClipboardString).toHaveBeenCalledWith('one-time-test-code');
  });

  it('shows a safe copy failure when the clipboard rejects', async () => {
    await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByText(/Invitation for friend@example\.com/u);

    setClipboardString.mockRejectedValueOnce(new Error('native clipboard error'));
    await fireEvent.press(screen.getByRole('button', { name: 'Copy invitation code' }));

    expect(await screen.findByText(/Couldn’t copy the code/u)).toBeTruthy();
    expect(screen.queryByText('native clipboard error')).toBeNull();
  });

  it('validates the recipient address locally and presents a safe 422 correction', async () => {
    createInvitation.mockRejectedValueOnce(new ApiError(422, 'private response detail'));
    await render(<OwnerInvitationScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    expect(screen.getByText('Enter a valid email address for the person you want to invite.')).toBeTruthy();
    expect(createInvitation).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    expect(await screen.findByText('Enter a valid email address for the person you want to invite.')).toBeTruthy();
    expect(screen.queryByText('private response detail')).toBeNull();
  });

  it('shows a safe retry message for unexpected invitation failures', async () => {
    createInvitation.mockRejectedValueOnce(new Error('network details must stay hidden'));
    await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));

    expect(await screen.findByText('We couldn’t create the invitation. Please try again.')).toBeTruthy();
    expect(screen.queryByText('network details must stay hidden')).toBeNull();
  });

  it('prevents duplicate submissions before the pending state rerenders', async () => {
    const pending = deferred<typeof invitationResponse>();
    createInvitation.mockReturnValueOnce(pending.promise);
    await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');

    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Creating invitation…' }));

    expect(createInvitation).toHaveBeenCalledTimes(1);
    pending.resolve(invitationResponse);
    expect(await screen.findByText(/Invitation for friend@example\.com/u)).toBeTruthy();
  });

  it('ignores an invitation response after the selected household changes', async () => {
    const pending = deferred<typeof invitationResponse>();
    createInvitation.mockReturnValueOnce(pending.promise);
    const view = await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));

    mockHouseholdState = {
      ...mockHouseholdState,
      selectedHousehold: { id: 'household-b', name: 'Home B', role: 'owner', time_zone: 'UTC' },
    };
    await view.rerender(<OwnerInvitationScreen />);
    await waitFor(() => expect(screen.getByLabelText('Recipient email').props.value).toBe(''));
    pending.resolve(invitationResponse);

    await waitFor(() => expect(screen.queryByTestId('invitation-snapshot')).toBeNull());
    expect(screen.queryByText('one-time-test-code')).toBeNull();
    expect(screen.queryByTestId('invitation-error')).toBeNull();
  });

  it('clears invitation state and ignores a late create result when sign-out starts', async () => {
    const pending = deferred<typeof invitationResponse>();
    createInvitation.mockReturnValueOnce(pending.promise);
    const view = await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));

    mockHouseholdState = { ...mockHouseholdState, isSigningOut: true };
    await view.rerender(<OwnerInvitationScreen />);
    pending.resolve(invitationResponse);

    await waitFor(() => expect(screen.queryByTestId('invitation-snapshot')).toBeNull());
    expect(screen.queryByText('one-time-test-code')).toBeNull();
  });

  it('ignores a rejected create result after the authenticated Clerk session changes', async () => {
    const pending = deferred<typeof invitationResponse>();
    createInvitation.mockReturnValueOnce(pending.promise);
    const view = await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));

    mockAuthState = { isLoaded: true, isSignedIn: true, sessionId: 'session-b', userId: 'user-b' };
    await view.rerender(<OwnerInvitationScreen />);
    pending.reject(new ApiError(500, 'private response detail'));

    await waitFor(() => expect(screen.getByLabelText('Recipient email').props.value).toBe(''));
    expect(screen.queryByTestId('invitation-error')).toBeNull();
    expect(screen.queryByTestId('invitation-snapshot')).toBeNull();
  });

  it('clears owner-only invitation state when access is lost', async () => {
    const pending = deferred<typeof invitationResponse>();
    createInvitation.mockReturnValueOnce(pending.promise);
    const view = await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));

    mockHouseholdState = {
      ...mockHouseholdState,
      selectedHousehold: { id: 'household-a', name: 'Home A', role: 'member', time_zone: 'UTC' },
    };
    await view.rerender(<OwnerInvitationScreen />);
    pending.resolve(invitationResponse);

    await waitFor(() => expect(screen.queryByTestId('invitation-snapshot')).toBeNull());
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
  });

  it('does not show stale clipboard feedback after the household changes', async () => {
    const pendingCopy = deferred<boolean>();
    const view = await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByText(/Invitation for friend@example\.com/u);
    setClipboardString.mockReturnValueOnce(pendingCopy.promise);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy invitation code' }));

    mockHouseholdState = {
      ...mockHouseholdState,
      selectedHousehold: { id: 'household-b', name: 'Home B', role: 'owner', time_zone: 'UTC' },
    };
    await view.rerender(<OwnerInvitationScreen />);
    pendingCopy.resolve(true);

    await waitFor(() => expect(screen.queryByText('Invitation code copied.')).toBeNull());
    expect(screen.queryByText(/Couldn’t copy the code/u)).toBeNull();
  });

  it('invalidates a pending copy when a replacement invitation succeeds', async () => {
    const replacement = {
      invitation: {
        id: 'invitation-2',
        expires_at: '2026-10-08T12:00:00.000Z',
        code: 'replacement-code',
      },
    };
    const pendingCopy = deferred<boolean>();
    const pendingReplacement = deferred<typeof replacement>();
    createInvitation.mockResolvedValueOnce(invitationResponse).mockReturnValueOnce(pendingReplacement.promise);
    setClipboardString.mockReturnValueOnce(pendingCopy.promise);
    await render(<OwnerInvitationScreen />);

    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'first@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByText(/Invitation for first@example\.com/u);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy invitation code' }));

    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'second@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    pendingReplacement.resolve(replacement);

    expect(await screen.findByText(/Invitation for second@example\.com/u)).toBeTruthy();
    expect(screen.getByLabelText('Invitation code').props.children).toBe('replacement-code');
    expect(screen.getByText(/Expires .*10\/8\/2026/u)).toBeTruthy();
    pendingCopy.resolve(false);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy invitation code' })).toBeTruthy());
    expect(screen.queryByText('Invitation code copied.')).toBeNull();
    expect(screen.queryByText(/Couldn’t copy the code/u)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Copy invitation code' }));
    expect(await screen.findByText('Invitation code copied.')).toBeTruthy();
    expect(setClipboardString).toHaveBeenNthCalledWith(2, 'replacement-code');
  });

  it('ignores clipboard completion after the invitation route unmounts', async () => {
    const pendingCopy = deferred<boolean>();
    const view = await render(<OwnerInvitationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByText(/Invitation for friend@example\.com/u);
    setClipboardString.mockReturnValueOnce(pendingCopy.promise);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy invitation code' }));

    await view.unmount();
    pendingCopy.resolve(true);
    await Promise.resolve();
    const reopened = await render(<OwnerInvitationScreen />);

    expect(reopened.queryByTestId('invitation-snapshot')).toBeNull();
    expect(reopened.queryByText('Invitation code copied.')).toBeNull();
  });
});
