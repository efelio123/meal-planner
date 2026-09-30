import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DisplayNameCompletionScreen } from '@/features/identity/display-name-completion-screen';
import { validateDisplayName } from '@/features/identity/display-name';

const mockUpdate = jest.fn();
const mockRefresh = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
let mockAuth = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
let mockIsSigningOut = false;
let mockSignOutError: string | null = null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

jest.mock('@clerk/expo', () => ({
  useAuth: () => mockAuth,
  useUser: () => ({ user: { firstName: null, update: mockUpdate } }),
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual<typeof import('expo-router')>('expo-router'),
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ isSigningOut: mockIsSigningOut, refresh: mockRefresh, signOut: mockSignOut, signOutError: mockSignOutError }) }));

describe('display-name completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { isSignedIn: true, sessionId: 'session-a', userId: 'user-a' };
    mockIsSigningOut = false;
    mockSignOutError = null;
    mockUpdate.mockResolvedValue({});
    mockSignOut.mockResolvedValue(undefined);
    mockRefresh.mockResolvedValue({ user: { id: 'user-a', email: 'person@example.test', display_name: 'Ada' }, households: [] });
  });

  it('updates the signed-in Clerk profile and refreshes before returning to the app', async () => {
    await render(<DisplayNameCompletionScreen />);
    await fireEvent.changeText(screen.getByLabelText('Display name'), '  Ada Lovelace  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(mockUpdate).toHaveBeenCalledWith({ firstName: 'Ada Lovelace' });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('retries a failed refresh without resubmitting the Clerk profile update', async () => {
    mockRefresh.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: 'user-a', email: 'person@example.test', display_name: 'Ada' }, households: [] });
    await render(<DisplayNameCompletionScreen />);
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Ada');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Your name was saved, but we couldn’t finish loading your account. Try again.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry loading account' }));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('does not submit an invalid name to Clerk', async () => {
    await render(<DisplayNameCompletionScreen />);
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Invalid\u007fname');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Display names can’t contain control characters.')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(validateDisplayName(' A ')).toEqual({ value: 'A', error: null });
  });

  it('exposes the established sign-out action on completion and reports sign-out failures safely', async () => {
    const view = await render(<DisplayNameCompletionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    mockSignOutError = 'We couldn’t sign you out. Please try again.';
    await act(async () => { view.rerender(<DisplayNameCompletionScreen />); });
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t sign you out. Please try again.');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('ignores a late profile update after the authenticated identity changes', async () => {
    const pendingUpdate = deferred<object>();
    mockUpdate.mockReturnValue(pendingUpdate.promise);
    const view = await render(<DisplayNameCompletionScreen />);
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Account A');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: 'Account A' });

    mockAuth = { isSignedIn: true, sessionId: 'session-b', userId: 'user-b' };
    await act(async () => { view.rerender(<DisplayNameCompletionScreen />); });
    await act(async () => { pendingUpdate.resolve({}); await pendingUpdate.promise; });

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
