import type { PropsWithChildren } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, api, type Me } from '@/lib/api';

const mockGetToken = jest.fn().mockResolvedValue('session-token');
const mockClerkSignOut = jest.fn();
const mockProfileUpdate = jest.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

const home = { id: 'household-a', name: 'Home', time_zone: 'UTC', role: 'owner' as const };
const created = { id: 'household-b', name: 'Guest home', time_zone: 'America/Phoenix', role: 'owner' as const };
const signedInMe: Me = {
  user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
  households: [home],
};

jest.mock('@clerk/expo', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Context = React.createContext<{ isLoaded: boolean; isSignedIn: boolean; sessionId: string | null; userId: string | null; getToken: typeof mockGetToken }>(null!);
  return {
    ClerkProvider: ({ children }: PropsWithChildren) => {
      const [isSignedIn] = React.useState(true);
      return React.createElement(Context.Provider, {
        value: { isLoaded: true, isSignedIn, sessionId: isSignedIn ? 'session-a' : null, userId: isSignedIn ? 'user-a' : null, getToken: mockGetToken },
      }, children);
    },
    useAuth: () => React.useContext(Context),
    useClerk: () => ({ signOut: mockClerkSignOut }),
    useUser: () => ({ user: { firstName: null, imageUrl: null, update: mockProfileUpdate } }),
  };
});
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), removeItem: jest.fn(), setItem: jest.fn(),
}));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      me: jest.fn(),
      shoppingList: jest.fn(),
      householdMembers: jest.fn(),
      createHousehold: jest.fn(),
    },
  };
});
jest.mock('@/components/animated-icon', () => ({ AnimatedSplashOverlay: () => null }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

const mockedApi = jest.mocked(api);
const mockedStorage = jest.mocked(AsyncStorage);

function nodeContainsText(node: unknown, text: string): boolean {
  if (node === text) return true;
  if (Array.isArray(node)) return node.some((child) => nodeContainsText(child, text));
  if (node && typeof node === 'object' && 'children' in node) {
    return nodeContainsText((node as { children: unknown }).children, text);
  }
  return false;
}

describe('household state with the actual Expo Router provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue('session-token');
    mockClerkSignOut.mockResolvedValue(undefined);
    mockProfileUpdate.mockResolvedValue({});
    mockedStorage.getItem.mockResolvedValue('household-a');
    mockedStorage.setItem.mockResolvedValue();
    mockedStorage.removeItem.mockResolvedValue();
    mockedApi.shoppingList.mockResolvedValue({ shopping_list: { id: 'list-a', household_id: 'household-a', items: [] } });
    mockedApi.householdMembers.mockResolvedValue({ members: [] });
  });

  it('keeps the create form mounted after a successful save and failed refresh, then retries only refresh', async () => {
    const retryRefresh = deferred<Me>();
    mockedApi.me.mockResolvedValueOnce(signedInMe).mockRejectedValueOnce(new Error('temporary refresh failure')).mockReturnValueOnce(retryRefresh.promise);
    mockedApi.createHousehold.mockResolvedValue({ household: created });

    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    expect(await screen.findByText('Shopping list')).toBeTruthy();
    await act(async () => { router.navigate('/profile/my-households/create'); });
    expect(await screen.findByRole('button', { name: 'Create household' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'Guest home');
    await fireEvent.press(screen.getByRole('button', { name: 'Create household' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/profile/my-households/create');
    expect(screen.getByRole('button', { name: 'Retry refresh' })).toBeTruthy();
    expect(mockedApi.createHousehold).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Retry refresh' }));
    expect(rendered.getPathname()).toBe('/profile/my-households/create');
    await act(async () => {
      retryRefresh.resolve({ ...signedInMe, households: [...signedInMe.households, created] });
      await retryRefresh.promise;
    });

    expect(await screen.findByText('Guest home')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/profile/my-households/household-b');
    expect(mockedApi.createHousehold).toHaveBeenCalledTimes(1);
    expect(mockedApi.me).toHaveBeenCalledTimes(3);
    expect(mockedStorage.setItem).not.toHaveBeenCalledWith('meal-planner:selected-household-id', 'household-b');
  });

  it('refreshes My households from the real provider and updates the active Profile role', async () => {
    const changedRoleMe: Me = {
      ...signedInMe,
      households: [{ ...home, role: 'member' }],
    };
    mockedApi.me.mockResolvedValueOnce(signedInMe).mockResolvedValueOnce(changedRoleMe);

    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await screen.findByText('Your shopping list is empty.');
    await act(async () => { router.navigate('/profile/my-households'); });
    expect(await screen.findByText('Home')).toBeTruthy();
    const refreshableScreen = screen.getAllByTestId('screen').find((node) => (
      node.props.refreshControl && nodeContainsText(node.children, 'My households')
    ));
    expect(refreshableScreen).toBeTruthy();

    await act(async () => { refreshableScreen?.props.refreshControl.props.onRefresh(); });

    expect(await screen.findByText('member · Active')).toBeTruthy();
    expect(mockedApi.me).toHaveBeenCalledTimes(2);
    await act(async () => { router.back(); });
    await waitFor(() => expect(rendered.getPathname()).toBe('/profile'));
    expect(screen.getByText('Current household')).toBeTruthy();
    expect(screen.getByText('member')).toBeTruthy();
  });

  it('keeps profile completion through refresh failure and retry across real destination changes', async () => {
    const refreshAfterRetry = deferred<Me>();
    mockedApi.me.mockRejectedValueOnce(new ApiError(409, 'Add a display name to continue.', 'DISPLAY_NAME_REQUIRED'))
      .mockRejectedValueOnce(new Error('temporary refresh failure'))
      .mockReturnValueOnce(refreshAfterRetry.promise);

    const rendered = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await rendered;
    await waitFor(() => expect(mockedApi.me).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Choose your display name')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/complete-profile');
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Ada Lovelace');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(mockProfileUpdate).toHaveBeenCalledTimes(1);
    expect(mockProfileUpdate).toHaveBeenCalledWith({ firstName: 'Ada Lovelace' });
    expect(await screen.findByText('Your name was saved, but we couldn’t finish loading your account. Try again.')).toBeTruthy();
    expect(rendered.getPathname()).toBe('/complete-profile');
    expect(screen.getByRole('button', { name: 'Retry loading account' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry loading account' }));
    expect(rendered.getPathname()).toBe('/complete-profile');
    expect(mockProfileUpdate).toHaveBeenCalledTimes(1);
    await act(async () => {
      refreshAfterRetry.resolve({ user: { ...signedInMe.user, display_name: 'Ada Lovelace' }, households: [] });
      await refreshAfterRetry.promise;
    });

    expect(await screen.findByText('Set up your household')).toBeTruthy();
    await waitFor(() => expect(rendered.getPathname()).toBe('/'));
    expect(mockProfileUpdate).toHaveBeenCalledTimes(1);
    expect(mockedApi.me).toHaveBeenCalledTimes(3);
  });
});
