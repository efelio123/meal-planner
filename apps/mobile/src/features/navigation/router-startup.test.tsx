import type { PropsWithChildren } from 'react';
import { createElement } from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Button, Text } from 'react-native';
import { api, type ShoppingList } from '@/lib/api';
import { useResetToHouseholdStartup } from '@/features/profile/use-reset-to-household-startup';

let mockInitialDestination = 'app';
let mockInitialSignedIn = true;
let mockInitialRole = 'owner';
let mockInitialHouseholdId = 'household-a';
let mockHouseholds = [
  { id: 'household-a', name: 'Home', role: 'owner', time_zone: 'UTC' },
  { id: 'household-b', name: 'Cabin', role: 'member', time_zone: 'America/Phoenix' },
];
let mockSetSignedIn: ((value: boolean) => void) | undefined;
let mockSetDestination: ((destination: string) => void) | undefined;
let mockSetSelectedHouseholdId: ((value: string) => void) | undefined;
let mockSelectionOverride: { status: string; reason?: string } | null = null;
let mockSelectCalls: string[] = [];
type MockMe = { user: { id: string; email: string; display_name: string }; households: typeof mockHouseholds };
let mockRefreshResults: (MockMe | null | Promise<MockMe | null>)[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

jest.mock('@clerk/expo', () => ({
  ...(() => {
    const React = jest.requireActual<typeof import('react')>('react');
    const AuthContext = React.createContext<{
      isLoaded: boolean;
      isSignedIn: boolean;
      sessionId: string | null;
      userId: string | null;
      getToken: () => Promise<string | null>;
    }>({
      isLoaded: true,
      isSignedIn: mockInitialSignedIn,
      sessionId: mockInitialSignedIn ? 'session-a' : null,
      userId: mockInitialSignedIn ? 'user-a' : null,
      getToken: async () => 'session-token',
    });
    return {
      ClerkProvider: ({ children }: PropsWithChildren) => {
        const [isSignedIn, setIsSignedIn] = React.useState(mockInitialSignedIn);
        mockSetSignedIn = setIsSignedIn;
        return React.createElement(AuthContext.Provider, {
          value: {
            isLoaded: true,
            isSignedIn,
            sessionId: isSignedIn ? 'session-a' : null,
            userId: isSignedIn ? 'user-a' : null,
            getToken: async () => 'session-token',
          },
        }, children);
      },
      useAuth: () => React.useContext(AuthContext),
      useUser: () => ({ user: { imageUrl: null } }),
    };
  })(),
}));
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: {} }));
jest.mock('@/hooks/use-household-state', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const HouseholdContext = React.createContext<unknown>(null);

  return {
    HouseholdStateProvider: ({ children }: PropsWithChildren) => {
      const [destination, setDestination] = React.useState(mockInitialDestination);
      const [selectedHouseholdId, setSelectedHouseholdId] = React.useState(mockInitialHouseholdId);
      const [, setHouseholdRevision] = React.useState(0);
      mockSetDestination = setDestination;
      mockSetSelectedHouseholdId = setSelectedHouseholdId;
      const households = mockHouseholds.map((item) => ({
        ...item,
        role: item.id === 'household-a' ? mockInitialRole : item.role,
      }));
      const selectedHousehold = households.find((item) => item.id === selectedHouseholdId) ?? null;
      const state = {
        destination,
        getToken: jest.fn().mockResolvedValue('session-token'),
        households,
        isSigningOut: false,
        isSwitchingHousehold: false,
        me: { user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' }, households },
        refresh: jest.fn(async () => {
          const next = mockRefreshResults.shift() ?? null;
          const refreshed = await next;
          if (refreshed) {
            mockHouseholds = refreshed.households;
            setHouseholdRevision((revision) => revision + 1);
          }
          return refreshed;
        }),
        selectedHousehold,
        select: async (id: string) => {
          mockSelectCalls.push(id);
          if (mockSelectionOverride) return mockSelectionOverride;
          const target = households.find((item) => item.id === id);
          if (!target) return { status: 'cancelled', reason: 'not-a-member' };
          setSelectedHouseholdId(id);
          return { status: 'selected', household: target };
        },
        signOut: async () => {
          mockSetSignedIn?.(false);
          setDestination('signed-out');
        },
        signOutError: null,
      };
      return React.createElement(HouseholdContext.Provider, { value: state }, children);
    },
    useHouseholdState: () => React.useContext(HouseholdContext),
  };
});
jest.mock('@/components/animated-icon', () => ({ AnimatedSplashOverlay: () => null }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('@/lib/api', () => ({
  api: {
    shoppingList: jest.fn(),
    createInvitation: jest.fn(),
    householdInvitations: jest.fn(),
    householdMember: jest.fn(),
    revokeInvitation: jest.fn(),
    reissueInvitation: jest.fn(),
    householdMembers: jest.fn(),
    createHousehold: jest.fn(),
    updateHousehold: jest.fn(),
    setHouseholdMemberRole: jest.fn(),
    removeHouseholdMember: jest.fn(),
    leaveHousehold: jest.fn(),
    deleteHousehold: jest.fn(),
    addShoppingListItem: jest.fn(),
    setShoppingListItemChecked: jest.fn(),
    deleteShoppingListItem: jest.fn(),
  },
}));
jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  createURL: () => 'mealplanner:///',
}));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

type NavigationState = {
  type?: string;
  index?: number;
  routeNames?: string[];
  routes?: { name: string; state?: NavigationState }[];
};

function findTabState(state?: NavigationState): NavigationState | undefined {
  if (state?.type === 'tab') return state;
  for (const route of state?.routes ?? []) {
    const found = findTabState(route.state);
    if (found) return found;
  }
  return undefined;
}

async function navigateTo(renderResult: { getPathname: () => string }, path: string) {
  await act(async () => {
    router.navigate(path as Href);
    await jest.runOnlyPendingTimersAsync();
  });
  expect(renderResult.getPathname()).toBe(path);
}

function CompleteOnboarding() {
  return createElement(Button, {
    title: 'Finish onboarding',
    onPress: () => {
      mockSetDestination?.('app');
      // Return through the real root dispatcher after onboarding state changes.
      const expoRouter = jest.requireActual<typeof import('expo-router')>('expo-router');
      expoRouter.router.replace('/');
    },
  });
}

function SignInAgainFixture() {
  return createElement(Button, {
    title: 'Sign in again',
    onPress: () => {
      mockSetSignedIn?.(true);
      mockSetDestination?.('app');
      const expoRouter = jest.requireActual<typeof import('expo-router')>('expo-router');
      expoRouter.router.replace('/');
    },
  });
}

function ShoppingDetailsFixture() {
  return createElement(Text, null, 'Shopping details fixture');
}

function ResetTabsFixture() {
  const resetToStartup = useResetToHouseholdStartup();
  return createElement(Button, {
    title: 'Reset to Shopping',
    onPress: resetToStartup,
  });
}

function shoppingListResponse(): { shopping_list: ShoppingList } {
  return { shopping_list: { id: 'list-a', household_id: 'household-a', items: [] } };
}

describe('signed-in startup routing', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockInitialDestination = 'app';
    mockInitialSignedIn = true;
    mockInitialRole = 'owner';
    mockInitialHouseholdId = 'household-a';
    mockHouseholds = [
      { id: 'household-a', name: 'Home', role: 'owner', time_zone: 'UTC' },
      { id: 'household-b', name: 'Cabin', role: 'member', time_zone: 'America/Phoenix' },
    ];
    mockSetSignedIn = undefined;
    mockSetDestination = undefined;
    mockSetSelectedHouseholdId = undefined;
    mockSelectionOverride = null;
    mockSelectCalls = [];
    mockRefreshResults = [];
    jest.mocked(api.shoppingList).mockResolvedValue(shoppingListResponse());
    jest.mocked(api.householdMembers).mockResolvedValue({ members: [] });
    jest.mocked(api.householdInvitations).mockResolvedValue({ invitations: [] });
    jest.mocked(api.householdMember).mockResolvedValue({ member: {
      membership_id: 'membership-b', display_name: 'Sam Member', avatar_url: null,
      role: 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false,
    } });
  });

  it('redirects a cold signed-in launch to the temporary Shopping tab', async () => {
    const renderResult = renderRouter(
      `${process.cwd()}/src/app`,
      { initialUrl: '/' },
    );
    await renderResult;

    expect(await screen.findByText('Shopping list')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/shopping');
    expect(screen.getByText('Your shopping list is empty.')).toBeTruthy();
    const tabs = findTabState(renderResult.getRouterState() as NavigationState);
    expect(tabs?.routeNames).toEqual(['plan', 'recipes', 'shopping', 'pantry', 'profile']);
    expect(tabs?.index).toBe(2);
    expect(tabs?.routes?.[tabs.index ?? -1]?.name).toBe('shopping');
    expect(tabs?.routes?.map((route) => route.state?.type)).toEqual([
      'stack', 'stack', 'stack', 'stack', 'stack',
    ]);
  });

  it('returns from household onboarding to the centralized Shopping destination', async () => {
    mockInitialDestination = 'create-or-join';
    const renderResult = renderRouter(
      {
        appDir: `${process.cwd()}/src/app`,
        overrides: { '(onboarding)/index': CompleteOnboarding },
      },
      { initialUrl: '/' },
    );
    await renderResult;

    await fireEvent.press(screen.getByText('Finish onboarding'));
    expect(await screen.findByText('Shopping list')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/shopping');
  });

  it('keeps signed-out routing outside the signed-in tab navigator', async () => {
    mockInitialSignedIn = false;
    mockInitialDestination = 'signed-out';
    const renderResult = renderRouter(
      {
        appDir: `${process.cwd()}/src/app`,
        overrides: { '(auth)/sign-in': () => createElement(Button, { title: 'Sign in' }) },
      },
      { initialUrl: '/' },
    );
    await renderResult;
    expect(await screen.findByText('Sign in')).toBeTruthy();
    expect(screen.queryByText('Shopping list')).toBeNull();
    const state = renderResult.getRouterState() as NavigationState;
    expect(state.routeNames).not.toContain('(app)');
  });

  it('routes an already-signed-in nameless account to profile completion without sign-out', async () => {
    mockInitialDestination = 'complete-profile';
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;

    expect(await screen.findByText('Choose your display name')).toBeTruthy();
    expect(screen.getByLabelText('Display name')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/complete-profile');
    expect(screen.queryByText('Sign in')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('removes signed-in screens after Profile sign-out and starts fresh after sign-in', async () => {
    const renderResult = renderRouter(
      {
        appDir: `${process.cwd()}/src/app`,
        overrides: { '(auth)/sign-in': SignInAgainFixture },
      },
      { initialUrl: '/' },
    );
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/my-account');
    await screen.findByText('Account information');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Sign in again')).toBeTruthy();
    expect(screen.queryByText('Account information')).toBeNull();
    if (renderResult.getPathname() !== '/sign-in') {
      // The groups are protected even if the auth route's canonical path omits its group name.
      expect(renderResult.getPathname()).toMatch(/sign-in/);
    }
    if (router.canGoBack()) {
      await act(async () => {
        router.back();
        await jest.runOnlyPendingTimersAsync();
      });
      expect(screen.queryByText('Shopping list')).toBeNull();
      expect(screen.queryByText('Account information')).toBeNull();
    }

    await fireEvent.press(screen.getByText('Sign in again'));
    expect(await screen.findByText('Shopping list')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/shopping');
  });

  it('preserves Shopping draft and avoids a tab-switch reload', async () => {
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    expect(api.shoppingList).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(screen.getByLabelText('Shopping-list item'), 'Draft for later');
    for (const tab of ['plan', 'recipes', 'pantry', 'profile', 'shopping']) {
      await navigateTo(renderResult, `/${tab}`);
    }

    expect(screen.getByLabelText('Shopping-list item').props.value).toBe('Draft for later');
    expect(api.shoppingList).toHaveBeenCalledTimes(1);
  });

  it('applies a valid same-household add that completes while Shopping is blurred', async () => {
    const item = {
      id: 'item-1',
      name: 'Apples',
      is_checked: false,
      checked_at: null,
      checked_by_user_id: null,
      created_by_user_id: 'user-1',
      created_at: '2026-09-01T00:00:00Z',
    };
    let resolveAdd!: (value: { item: typeof item }) => void;
    const pendingAdd = new Promise<{ item: typeof item }>((resolve) => { resolveAdd = resolve; });
    jest.mocked(api.addShoppingListItem).mockReturnValue(pendingAdd);
    jest.mocked(api.shoppingList)
      .mockResolvedValueOnce(shoppingListResponse())
      .mockResolvedValueOnce({ shopping_list: { id: 'list-a', household_id: 'household-a', items: [item] } });

    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await fireEvent.changeText(screen.getByLabelText('Shopping-list item'), 'Apples');
    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));

    await navigateTo(renderResult, '/plan');
    await act(async () => {
      resolveAdd({ item });
      await Promise.resolve();
      await jest.runOnlyPendingTimersAsync();
    });
    expect(renderResult.getPathname()).toBe('/plan');
    expect(api.shoppingList).toHaveBeenCalledTimes(2);

    await navigateTo(renderResult, '/shopping');
    expect(await screen.findByText('Apples')).toBeTruthy();
    expect(screen.getByLabelText('Shopping-list item').props.value).toBe('');
    expect(api.shoppingList).toHaveBeenCalledTimes(2);
  });

  it('keeps a pending toggle across tabs and rolls it back when its same-household request fails', async () => {
    const item = {
      id: 'item-1',
      name: 'Eggs',
      is_checked: false,
      checked_at: null,
      checked_by_user_id: null,
      created_by_user_id: 'user-1',
      created_at: '2026-09-01T00:00:00Z',
    };
    let rejectToggle!: (reason: Error) => void;
    const pendingToggle = new Promise<{ item: typeof item }>((_resolve, reject) => { rejectToggle = reject; });
    jest.mocked(api.shoppingList).mockResolvedValue({
      shopping_list: { id: 'list-a', household_id: 'household-a', items: [item] },
    });
    jest.mocked(api.setShoppingListItemChecked).mockReturnValue(pendingToggle);

    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    const checkedControl = await screen.findByRole('checkbox', { name: 'Mark Eggs purchased' });
    await fireEvent.press(checkedControl);
    expect(screen.getByRole('checkbox', { name: 'Mark Eggs not purchased' })).toBeTruthy();

    await navigateTo(renderResult, '/plan');
    await act(async () => {
      rejectToggle(new Error('We couldn’t update that item.'));
      await Promise.resolve();
      await jest.runOnlyPendingTimersAsync();
    });
    expect(renderResult.getPathname()).toBe('/plan');
    expect(api.shoppingList).toHaveBeenCalledTimes(1);

    await navigateTo(renderResult, '/shopping');
    expect(await screen.findByText('We couldn’t update that item.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Mark Eggs purchased' }).props.accessibilityState)
      .toMatchObject({ checked: false, disabled: false });
    expect(api.shoppingList).toHaveBeenCalledTimes(1);
  });

  it('follows Android tab history through several tabs using the real router', async () => {
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');

    await navigateTo(renderResult, '/plan');
    await navigateTo(renderResult, '/profile');
    await navigateTo(renderResult, '/recipes');

    for (const expectedPath of ['/profile', '/plan', '/shopping']) {
      await act(async () => {
        router.back();
        await jest.runOnlyPendingTimersAsync();
      });
      expect(renderResult.getPathname()).toBe(expectedPath);
    }
    expect(api.shoppingList).toHaveBeenCalledTimes(1);
  });

  it('pushes and pops a fixture screen in the Shopping nested stack', async () => {
    const renderResult = renderRouter(
      {
        appDir: `${process.cwd()}/src/app`,
        overrides: { '(app)/(tabs)/shopping/details': ShoppingDetailsFixture },
      },
      { initialUrl: '/' },
    );
    await renderResult;
    await screen.findByText('Shopping list');

    await act(async () => {
      router.push('/shopping/details' as Href);
      await jest.runOnlyPendingTimersAsync();
    });
    expect(renderResult.getPathname()).toBe('/shopping/details');
    expect(screen.getByText('Shopping details fixture')).toBeTruthy();

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    expect(renderResult.getPathname()).toBe('/shopping');
    expect(screen.getByText('Shopping list')).toBeTruthy();
  });

  it('resets nested Profile household history before returning to the startup tab', async () => {
    const renderResult = renderRouter(
      {
        appDir: `${process.cwd()}/src/app`,
        overrides: {
          '(app)/(tabs)/profile/reset-fixture': ResetTabsFixture,
          '(app)/(tabs)/profile/secret-fixture': () => createElement(Text, null, 'Old household secret'),
        },
      },
      { initialUrl: '/' },
    );
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/secret-fixture');
    expect(screen.getByText('Old household secret')).toBeTruthy();
    await navigateTo(renderResult, '/profile/reset-fixture');

    await fireEvent.press(screen.getByText('Reset to Shopping'));
    await waitFor(() => expect(renderResult.getPathname()).toBe('/shopping'));
    await navigateTo(renderResult, '/profile');
    expect(screen.getByText('Current household')).toBeTruthy();
    expect(screen.queryByText('Old household secret')).toBeNull();

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    expect(renderResult.getPathname()).toBe('/shopping');
    expect(screen.queryByText('Old household secret')).toBeNull();
  });

  it('explicitly switches from a household detail and clears its prior Invitations history', async () => {
    mockInitialHouseholdId = 'household-b';
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile');
    await fireEvent.press(screen.getByRole('button', { name: 'My households' }));
    await screen.findByText('My households');
    await fireEvent.press(screen.getByRole('button', { name: 'Home' }));
    await screen.findByText('UTC');
    expect(screen.getByText('owner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch to this household' })).toBeTruthy();
    expect(mockSelectCalls).toEqual([]);

    jest.mocked(api.createInvitation).mockResolvedValue({
      invitation: { id: 'invitation-1', expires_at: '2026-10-01T12:00:00Z', code: 'profile-route-code' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Invitations' }));
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a/invitations');
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.test');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByText(/Invitation for friend@example\.test/u);
    expect(api.createInvitation).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'friend@example.test');

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    await waitFor(() => expect(renderResult.getPathname()).toBe('/profile/my-households/household-a'));
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to this household' }));
    expect(mockSelectCalls).toEqual(['household-a']);
    await screen.findByText('Shopping list');
    expect(renderResult.getPathname()).toBe('/shopping');
    expect(mockSetSelectedHouseholdId).toBeDefined();

    await navigateTo(renderResult, '/profile');
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.queryByText('profile-route-code')).toBeNull();
    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    expect(renderResult.getPathname()).toBe('/shopping');
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
  });

  it('marks the active household and keeps opening other household details read-only', async () => {
    mockInitialHouseholdId = 'household-b';
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/my-households');

    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cabin, active household' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Home' }));
    expect(await screen.findByText('Switch to this household')).toBeTruthy();
    expect(mockSelectCalls).toEqual([]);
  });

  it('creates a household through the actual router without activating it', async () => {
    const created = { id: 'household-c', name: 'Guest home', role: 'owner' as const, time_zone: 'America/Phoenix' };
    jest.mocked(api.createHousehold).mockResolvedValue({ household: created });
    mockRefreshResults = [{
      user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
      households: [...mockHouseholds, created],
    }];
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/my-households/create');
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'Guest home');
    await fireEvent.press(screen.getByRole('button', { name: 'Create household' }));

    expect(await screen.findByRole('button', { name: 'Switch to this household' })).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-c');
    expect(screen.getByText('Guest home')).toBeTruthy();
    expect(mockSelectCalls).toEqual([]);
    expect(mockSetSelectedHouseholdId).toBeDefined();
  });

  it('keeps the create route mounted until its deferred refresh validates the new household', async () => {
    const created = { id: 'household-c', name: 'Guest home', role: 'owner' as const, time_zone: 'America/Phoenix' };
    const pendingRefresh = deferred<MockMe | null>();
    jest.mocked(api.createHousehold).mockResolvedValue({ household: created });
    mockRefreshResults = [pendingRefresh.promise];
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/my-households/create');
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'Guest home');
    await fireEvent.press(screen.getByRole('button', { name: 'Create household' }));
    expect(await screen.findByRole('button', { name: 'Refreshing…' })).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/profile/my-households/create');

    await act(async () => {
      pendingRefresh.resolve({
        user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
        households: [...mockHouseholds, created],
      });
      await Promise.resolve();
    });

    expect(await screen.findByText('Guest home')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-c');
    expect(mockSelectCalls).toEqual([]);
  });

  it('edits a household and returns to that household’s updated details route', async () => {
    const updated = { ...mockHouseholds[0], name: 'Renamed home', role: 'owner' as const };
    jest.mocked(api.updateHousehold).mockResolvedValue({ household: updated });
    mockRefreshResults = [{
      user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
      households: [updated, mockHouseholds[1]],
    }];
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/my-households/household-a/edit');
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'Renamed home');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Renamed home')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a');
    expect(api.updateHousehold).toHaveBeenCalledWith(expect.any(Function), 'household-a', {
      name: 'Renamed home', time_zone: 'UTC',
    });
  });

  it('keeps the edit route mounted until its deferred refresh returns updated details', async () => {
    const updated = { ...mockHouseholds[0], name: 'Renamed home', role: 'owner' as const };
    const pendingRefresh = deferred<MockMe | null>();
    jest.mocked(api.updateHousehold).mockResolvedValue({ household: updated });
    mockRefreshResults = [pendingRefresh.promise];
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/my-households/household-a/edit');
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'Renamed home');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('button', { name: 'Refreshing…' })).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a/edit');

    await act(async () => {
      pendingRefresh.resolve({
        user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
        households: [updated, mockHouseholds[1]],
      });
      await Promise.resolve();
    });

    expect(await screen.findByText('Renamed home')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a');
  });

  it('retries a household refresh after a successful create without resubmitting the create', async () => {
    const created = { id: 'household-c', name: 'Guest home', role: 'owner' as const, time_zone: 'America/Phoenix' };
    jest.mocked(api.createHousehold).mockResolvedValue({ household: created });
    mockRefreshResults = [null, {
      user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
      households: [...mockHouseholds, created],
    }];
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/my-households/create');
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'Guest home');
    await fireEvent.press(screen.getByRole('button', { name: 'Create household' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Retry refresh' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry refresh' }));

    expect(await screen.findByText('Guest home')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-c');
    expect(api.createHousehold).toHaveBeenCalledTimes(1);
    expect(mockSelectCalls).toEqual([]);
  });

  it('keeps Profile, My households, household details, and Invitations in one working Back history', async () => {
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');

    await navigateTo(renderResult, '/profile');
    await fireEvent.press(screen.getByRole('button', { name: 'My households' }));
    expect(renderResult.getPathname()).toBe('/profile/my-households');
    expect(await screen.findByRole('button', { name: 'Home, active household' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Home, active household' }));
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a');
    expect(await screen.findByText('Time zone')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Invitations' }));
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a/invitations');
    expect(await screen.findByLabelText('Recipient email')).toBeTruthy();

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    await waitFor(() => expect(renderResult.getPathname()).toBe('/profile/my-households/household-a'));
    expect(screen.getByText('Time zone')).toBeTruthy();

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    await waitFor(() => expect(renderResult.getPathname()).toBe('/profile/my-households'));
    expect(screen.getByRole('button', { name: 'Home, active household' })).toBeTruthy();

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    await waitFor(() => expect(renderResult.getPathname()).toBe('/profile'));
    expect(screen.getByText('Current household')).toBeTruthy();
  });

  it('opens a member detail route and follows native Back to household details', async () => {
    jest.mocked(api.householdMembers).mockResolvedValue({ members: [{
      membership_id: 'membership-b', display_name: 'Sam Member', avatar_url: null,
      role: 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false, email: 'sam@example.test',
    }] });
    jest.mocked(api.householdMember).mockResolvedValue({ member: {
      membership_id: 'membership-b', display_name: 'Sam Member', avatar_url: null,
      role: 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false, email: 'sam@example.test',
    } });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/profile/my-households/household-a');
    const memberRow = await screen.findByRole('button', { name: /Sam Member, member/u });
    await fireEvent.press(memberRow);

    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a/members/membership-b');
    expect(await screen.findByText('Sam Member')).toBeTruthy();

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    await waitFor(() => expect(renderResult.getPathname()).toBe('/profile/my-households/household-a'));
    expect(screen.getByText('Time zone')).toBeTruthy();
  });

  it('refreshes the People list when a role mutation succeeds after Back returns to household details', async () => {
    let currentMemberRole: 'member' | 'owner' = 'member';
    const pendingRoleChange = deferred<void>();
    jest.mocked(api.householdMembers).mockImplementation(async () => ({ members: [
      {
        membership_id: 'self-membership', display_name: 'Person Example', avatar_url: null,
        role: 'owner', joined_at: '2026-08-01T00:00:00Z', is_self: true, email: 'person@example.test',
      },
      {
        membership_id: 'membership-b', display_name: 'Sam Member', avatar_url: null,
        role: currentMemberRole, joined_at: '2026-09-01T00:00:00Z', is_self: false, email: 'sam@example.test',
      },
    ] }));
    jest.mocked(api.householdMember).mockResolvedValue({ member: {
      membership_id: 'membership-b', display_name: 'Sam Member', avatar_url: null,
      role: 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false, email: 'sam@example.test',
    } });
    jest.mocked(api.setHouseholdMemberRole).mockImplementation(async (_getToken, _householdId, _membershipId, role) => {
      await pendingRoleChange.promise;
      currentMemberRole = role;
    });
    mockRefreshResults = [{
      user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
      households: mockHouseholds,
    }];

    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/profile/my-households/household-a');
    await fireEvent.press(await screen.findByRole('button', { name: /Sam Member, member/u }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Make owner' }));
    await waitFor(() => expect(api.setHouseholdMemberRole).toHaveBeenCalledTimes(1));

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    await waitFor(() => expect(renderResult.getPathname()).toBe('/profile/my-households/household-a'));
    expect(await screen.findByRole('button', { name: /Sam Member, member/u })).toBeTruthy();

    await act(async () => {
      pendingRoleChange.resolve();
      await pendingRoleChange.promise;
    });

    expect(await screen.findByRole('button', { name: /Sam Member, owner/u })).toBeTruthy();
    expect(api.householdMembers).toHaveBeenCalledTimes(2);
    expect(mockRefreshResults).toHaveLength(0);
  });

  it('removes a member from the People list when removal succeeds after Back', async () => {
    let memberIsActive = true;
    const pendingRemoval = deferred<void>();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(api.householdMembers).mockImplementation(async () => ({ members: [
      {
        membership_id: 'self-membership', display_name: 'Person Example', avatar_url: null,
        role: 'owner', joined_at: '2026-08-01T00:00:00Z', is_self: true, email: 'person@example.test',
      },
      ...(memberIsActive ? [{
        membership_id: 'membership-b', display_name: 'Sam Member', avatar_url: null,
        role: 'member' as const, joined_at: '2026-09-01T00:00:00Z', is_self: false, email: 'sam@example.test',
      }] : []),
    ] }));
    jest.mocked(api.householdMember).mockResolvedValue({ member: {
      membership_id: 'membership-b', display_name: 'Sam Member', avatar_url: null,
      role: 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false, email: 'sam@example.test',
    } });
    jest.mocked(api.removeHouseholdMember).mockImplementation(async () => {
      await pendingRemoval.promise;
      memberIsActive = false;
    });
    mockRefreshResults = [{
      user: { id: 'user-a', email: 'person@example.test', display_name: 'Person Example' },
      households: mockHouseholds,
    }];

    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/profile/my-households/household-a');
    await fireEvent.press(await screen.findByRole('button', { name: /Sam Member, member/u }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove member' }));

    const confirmRemoval = alert.mock.calls[0]?.[2]?.find((button) => button.text === 'Remove member');
    expect(confirmRemoval?.onPress).toBeDefined();
    await act(async () => { confirmRemoval?.onPress?.(); });
    await waitFor(() => expect(api.removeHouseholdMember).toHaveBeenCalledTimes(1));

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    await waitFor(() => expect(renderResult.getPathname()).toBe('/profile/my-households/household-a'));
    expect(await screen.findByRole('button', { name: /Sam Member, member/u })).toBeTruthy();

    await act(async () => {
      pendingRemoval.resolve();
      await pendingRemoval.promise;
    });

    expect(await screen.findByRole('button', { name: /Person Example, owner/u })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Sam Member, member/u })).toBeNull());
    expect(api.householdMembers).toHaveBeenCalledTimes(2);
    expect(mockRefreshResults).toHaveLength(0);
    alert.mockRestore();
  });

  it('does not navigate when explicit household switching fails', async () => {
    mockInitialHouseholdId = 'household-b';
    mockSelectionOverride = { status: 'failed', reason: 'storage' };
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/profile/my-households');
    await fireEvent.press(screen.getByRole('button', { name: 'Home' }));
    await screen.findByText('UTC');

    await fireEvent.press(screen.getByRole('button', { name: 'Switch to this household' }));

    expect(await screen.findByText('We couldn’t switch households. Your current household is unchanged. Please try again.')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a');
    expect(mockSelectCalls).toEqual(['household-a']);
  });

  it('preserves a household-targeted invitation across tab switches and clears it when its route closes', async () => {
    let resolveInvitation!: (value: { invitation: { id: string; expires_at: string; code: string } }) => void;
    jest.mocked(api.createInvitation).mockReturnValue(new Promise((resolve) => { resolveInvitation = resolve; }));
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/profile/my-households/household-a/invitations');
    expect(renderResult.getPathname()).toBe('/profile/my-households/household-a/invitations');
    await screen.findByLabelText('Recipient email');
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'Friend@Example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await waitFor(() => expect(api.createInvitation).toHaveBeenCalledTimes(1));

    await navigateTo(renderResult, '/shopping');
    expect(renderResult.getPathname()).toBe('/shopping');
    expect(api.createInvitation).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInvitation({ invitation: { id: 'invitation-1', expires_at: '2026-10-01T12:00:00Z', code: 'router-only-code' } });
      await Promise.resolve();
    });

    expect(renderResult.getPathname()).toBe('/shopping');
    expect(api.createInvitation).toHaveBeenCalledTimes(1);
    await navigateTo(renderResult, '/profile/my-households/household-a/invitations');
    expect(await screen.findByText(/Invitation for friend@example\.com/u)).toBeTruthy();
    expect(screen.getByText('router-only-code')).toBeTruthy();
    expect(screen.getByLabelText('Recipient email').props.value).toBe('Friend@Example.com');
    expect(api.createInvitation).toHaveBeenCalledTimes(1);

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    expect(renderResult.getPathname()).toBe('/profile');
    await navigateTo(renderResult, '/profile/my-households/household-a/invitations');
    expect(screen.getByLabelText('Recipient email').props.value).toBe('');
    expect(screen.queryByText('router-only-code')).toBeNull();
  });

  it('hides owner invitation controls from a member household detail', async () => {
    mockInitialRole = 'member';
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/profile/my-households/household-a');

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Invitations' })).toBeNull();
  });

  it('does not substitute the active household for an unknown invitation route target', async () => {
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Shopping list');

    await act(async () => {
      router.navigate('/profile/my-households/not-a-member/invitations' as Href);
      await jest.runOnlyPendingTimersAsync();
    });

    await screen.findByText('My households');
    expect(renderResult.getPathname()).toBe('/profile/my-households');
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
    expect(api.createInvitation).not.toHaveBeenCalled();
  });

  it('does not restore a deferred invitation after its household route is popped', async () => {
    let resolveInvitation!: (value: { invitation: { id: string; expires_at: string; code: string } }) => void;
    jest.mocked(api.createInvitation).mockReturnValue(new Promise((resolve) => { resolveInvitation = resolve; }));
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/profile/my-households/household-a/invitations');
    await screen.findByLabelText('Recipient email');
    await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'friend@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create invitation' }));
    await waitFor(() => expect(api.createInvitation).toHaveBeenCalledTimes(1));

    await act(async () => {
      router.back();
      await jest.runOnlyPendingTimersAsync();
    });
    expect(renderResult.getPathname()).toBe('/profile');
    await act(async () => {
      resolveInvitation({ invitation: { id: 'invitation-1', expires_at: '2026-10-01T12:00:00Z', code: 'closed-route-code' } });
      await Promise.resolve();
    });

    await navigateTo(renderResult, '/profile/my-households/household-a/invitations');
    await screen.findByLabelText('Recipient email');
    expect(screen.getByLabelText('Recipient email').props.value).toBe('');
    expect(screen.queryByText('closed-route-code')).toBeNull();
  });
});
