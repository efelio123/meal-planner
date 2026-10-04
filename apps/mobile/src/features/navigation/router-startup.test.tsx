import type { PropsWithChildren } from 'react';
import { createElement } from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Button, Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { ApiError, api, type CatalogItem, type ShoppingList } from '@/lib/api';
import { catalogEmojiSheetKeyboardBehavior } from '@/features/catalog/catalog-emoji-input-sheet';
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
let mockSetClerkIdentity: ((userId: string, sessionId: string) => void) | undefined;
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

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'item-1', household_id: 'household-a', item_type: 'food', name: 'Milk',
    category_id: null, category_name: null, shopping_unit_code: null, shopping_unit_label: null,
    shopping_unit_source: null, custom_shopping_unit_id: null, preferred_store_id: null,
    preferred_store_name: null, recipe_measurement_dimension: null, recipe_measurement_unit_code: null,
    recipe_measurement_unit_label: null, created_at: '', updated_at: '', ...overrides,
  };
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
        const [identity, setIdentity] = React.useState({ userId: 'user-a', sessionId: 'session-a' });
        mockSetSignedIn = setIsSignedIn;
        mockSetClerkIdentity = (userId, sessionId) => setIdentity({ userId, sessionId });
        return React.createElement(AuthContext.Provider, {
          value: {
            isLoaded: true,
            isSignedIn,
            sessionId: isSignedIn ? identity.sessionId : null,
            userId: isSignedIn ? identity.userId : null,
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
  ApiError: jest.requireActual<typeof import('@/lib/api')>('@/lib/api').ApiError,
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
    catalogUnits: jest.fn(),
    catalogCategories: jest.fn(),
    catalogStores: jest.fn(),
    catalogItems: jest.fn(),
    catalogItem: jest.fn(),
    createCatalogItem: jest.fn(),
    updateCatalogItem: jest.fn(),
    deleteCatalogItem: jest.fn(),
    createCatalogCategory: jest.fn(),
    updateCatalogCategory: jest.fn(),
    deleteCatalogCategory: jest.fn(),
    createCatalogStore: jest.fn(),
    updateCatalogStore: jest.fn(),
    deleteCatalogStore: jest.fn(),
    createCatalogShoppingUnit: jest.fn(),
    updateCatalogShoppingUnit: jest.fn(),
    deleteCatalogShoppingUnit: jest.fn(),
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
    mockSetClerkIdentity = undefined;
    mockSetDestination = undefined;
    mockSetSelectedHouseholdId = undefined;
    mockSelectionOverride = null;
    mockSelectCalls = [];
    mockRefreshResults = [];
    jest.mocked(api.shoppingList).mockResolvedValue(shoppingListResponse());
    jest.mocked(api.catalogItems).mockResolvedValue({ items: [] });
    jest.mocked(api.catalogUnits).mockResolvedValue({ shopping_units: { built_in: [], household: [] }, recipe_measurement_units: [] });
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [] });
    jest.mocked(api.catalogStores).mockResolvedValue({ stores: [] });
    jest.mocked(api.householdMembers).mockResolvedValue({ members: [] });
    jest.mocked(api.householdInvitations).mockResolvedValue({ invitations: [] });
    jest.mocked(api.householdMember).mockResolvedValue({ member: {
      membership_id: 'membership-b', display_name: 'Sam Member', avatar_url: null,
      role: 'member', joined_at: '2026-09-01T00:00:00Z', is_self: false,
    } });
  });
  afterEach(() => { jest.restoreAllMocks(); });

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
    expect(tabs?.routeNames).toEqual(['plan', 'recipes', 'shopping', 'catalog', 'profile']);
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
    for (const tab of ['plan', 'recipes', 'catalog', 'profile', 'shopping']) {
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

  it('keeps Catalog mounted across tab switches and loads only when explicitly visited', async () => {
    jest.mocked(api.catalogItems).mockResolvedValue({ items: [catalogItem({ name: 'Apple', category_id: 'produce', category_name: 'Produce' })] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog');
    expect(await screen.findByText('Apple')).toBeTruthy();
    expect(api.catalogItems).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText('Search household items'), 'Apple');
    await fireEvent.press(screen.getByRole('button', { name: 'Food' }));

    await navigateTo(renderResult, '/shopping');
    await navigateTo(renderResult, '/catalog');
    expect(api.catalogItems).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Search household items').props.value).toBe('Apple');
    expect(screen.getByRole('button', { name: 'Food' }).props.accessibilityState.selected).toBe(true);
  });

  it('rejects a delayed Catalog response from the previous household', async () => {
    const householdA = deferred<{ items: { id: string; household_id: string; item_type: 'food'; name: string; category_id: null; category_name: null; shopping_unit_code: null; shopping_unit_label: null; shopping_unit_source: null; custom_shopping_unit_id: null; preferred_store_id: null; preferred_store_name: null; recipe_measurement_dimension: null; recipe_measurement_unit_code: null; recipe_measurement_unit_label: null; created_at: string; updated_at: string }[] }>();
    const row = (id: string, householdId: string, name: string) => ({
      id, household_id: householdId, item_type: 'food' as const, name, category_id: null, category_name: null,
      shopping_unit_code: null, shopping_unit_label: null, shopping_unit_source: null, custom_shopping_unit_id: null,
      preferred_store_id: null, preferred_store_name: null, recipe_measurement_dimension: null,
      recipe_measurement_unit_code: null, recipe_measurement_unit_label: null, created_at: '', updated_at: '',
    });
    jest.mocked(api.catalogItems)
      .mockReturnValueOnce(householdA.promise)
      .mockResolvedValueOnce({ items: [row('item-b', 'household-b', 'Cabin item')] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog');
    await waitFor(() => expect(api.catalogItems).toHaveBeenCalledTimes(1));

    await act(async () => { mockSetSelectedHouseholdId?.('household-b'); });
    expect(await screen.findByText('Cabin item')).toBeTruthy();
    await act(async () => { householdA.resolve({ items: [row('item-a', 'household-a', 'Old home item')] }); });
    expect(screen.getByText('Cabin item')).toBeTruthy();
    expect(screen.queryByText('Old home item')).toBeNull();
    expect(api.catalogItems).toHaveBeenCalledTimes(2);
  });

  it('preserves an Add Item draft and selects a choice created from its picker', async () => {
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [{
      id: 'produce-category', item_type: 'food', name: 'Produce', emoji: null, active_item_count: 0, created_at: '', updated_at: '',
    }] });
    jest.mocked(api.createCatalogCategory).mockResolvedValue({ category: {
      id: 'produce-category', item_type: 'food', name: 'Produce', emoji: null, active_item_count: 0, created_at: '', updated_at: '',
    } });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await screen.findByLabelText('Item name');
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'Draft apple');
    await fireEvent.press(screen.getByLabelText('Category: Not selected'));
    await fireEvent.press(screen.getByRole('button', { name: 'Create category' }));
    expect(renderResult.getPathname()).toBe('/catalog/choices/category/create');
    await screen.findByLabelText('category name');
    await fireEvent.changeText(screen.getByLabelText('category name'), 'Produce');
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(renderResult.getPathname()).toBe('/catalog/add'));
    expect(screen.getByLabelText('Item name').props.value).toBe('Draft apple');
    expect(await screen.findByLabelText('Category: Produce')).toBeTruthy();
    expect(api.createCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'food', 'Produce', null);
  });

  it('keeps optional shopping units unselected and makes household-created units searchable', async () => {
    jest.mocked(api.catalogUnits).mockResolvedValue({
      shopping_units: {
        built_in: [{ code: 'unit', label: 'Unit', unit_group: 'package_count' }],
        household: [{ id: 'crate-id', label: 'Crate' }],
      },
      recipe_measurement_units: [],
    });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await screen.findByLabelText('Item name');
    expect(screen.getByLabelText('Typical shopping unit (optional): Not selected')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Typical shopping unit (optional): Not selected'));
    await fireEvent.changeText(screen.getByLabelText('Search Typical shopping unit (optional)'), 'crate');
    expect(await screen.findByText('Household · Crate')).toBeTruthy();
    await fireEvent.press(screen.getByText('Household · Crate'));
    expect(screen.getByLabelText('Typical shopping unit (optional): Household · Crate')).toBeTruthy();
  });

  it('uses searchable category sheets and compact unsearchable short-store sheets', async () => {
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [
      { id: 'food-1', item_type: 'food', name: 'Produce', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
      { id: 'food-2', item_type: 'food', name: 'Dairy & Eggs', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
      { id: 'food-3', item_type: 'food', name: 'Meat & Seafood', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
      { id: 'food-4', item_type: 'food', name: 'Bakery', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
      { id: 'food-5', item_type: 'food', name: 'Pantry', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
      { id: 'food-6', item_type: 'food', name: 'Frozen', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
      { id: 'food-7', item_type: 'food', name: 'Beverages', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
    ] });
    jest.mocked(api.catalogStores).mockResolvedValue({ stores: [{ id: 'market', name: 'Market', created_at: '', updated_at: '' }] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');

    const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    await fireEvent.press(await screen.findByLabelText('Category: Not selected'));
    expect(dismissKeyboard).toHaveBeenCalled();
    expect(await screen.findByLabelText('Search Category')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create category' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manage categories' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search Category'), 'Produce');
    expect(screen.getByLabelText('Search Category')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Produce' }));

    await fireEvent.press(screen.getByLabelText('Preferred store (optional): Not selected'));
    expect(screen.queryByLabelText('Search Preferred store (optional)')).toBeNull();
    expect(screen.getByRole('button', { name: 'No preferred store' })).toBeTruthy();
    expect(screen.getByText('Market')).toBeTruthy();
  });

  it('clears the empty-name error as soon as the item name is corrected', async () => {
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await screen.findByLabelText('Category: Not selected');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to catalog' }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add to catalog' }));
    expect(await screen.findByText('Enter an item name.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'Apples');
    expect(screen.queryByText('Enter an item name.')).toBeNull();
  });

  it('preserves an Add Item draft when a preferred store is created from its visible field', async () => {
    jest.mocked(api.createCatalogStore).mockResolvedValue({ store: { id: 'store-1', name: 'Market', created_at: '', updated_at: '' } });
    jest.mocked(api.catalogStores).mockResolvedValue({ stores: [{ id: 'store-1', name: 'Market', created_at: '', updated_at: '' }] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await fireEvent.changeText(await screen.findByLabelText('Item name'), 'Draft oats');
    await fireEvent.press(screen.getByLabelText('Preferred store (optional): Not selected'));
    await fireEvent.press(screen.getByRole('button', { name: 'Create store' }));
    await screen.findByLabelText('store name');
    await fireEvent.changeText(screen.getByLabelText('store name'), 'Market');
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(renderResult.getPathname()).toBe('/catalog/add'));
    expect(screen.getByLabelText('Item name').props.value).toBe('Draft oats');
    expect(await screen.findByLabelText('Preferred store (optional): Market')).toBeTruthy();
  });

  it('preserves an Add Item draft when a household shopping unit is created', async () => {
    jest.mocked(api.createCatalogShoppingUnit).mockResolvedValue({ unit: { id: 'crate-id', name: 'Crate', created_at: '', updated_at: '' } });
    jest.mocked(api.catalogUnits).mockResolvedValue({ shopping_units: { built_in: [], household: [{ id: 'crate-id', label: 'Crate' }] }, recipe_measurement_units: [] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await fireEvent.changeText(await screen.findByLabelText('Item name'), 'Draft flour');
    await fireEvent.press(screen.getByLabelText('Typical shopping unit (optional): Not selected'));
    await fireEvent.press(screen.getByRole('button', { name: 'Create shopping unit' }));
    await screen.findByLabelText('shopping unit name');
    await fireEvent.changeText(screen.getByLabelText('shopping unit name'), 'Crate');
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(renderResult.getPathname()).toBe('/catalog/add'));
    expect(screen.getByLabelText('Item name').props.value).toBe('Draft flour');
    expect(await screen.findByLabelText('Typical shopping unit (optional): Household · Crate')).toBeTruthy();
  });

  it('refreshes archived picker choices after a rejected save without losing valid draft selections', async () => {
    let categoryArchived = false;
    jest.mocked(api.catalogCategories).mockImplementation(async () => ({ categories: categoryArchived ? [] : [{
      id: 'produce-category', item_type: 'food', name: 'Produce', emoji: null, active_item_count: 0, created_at: '', updated_at: '',
    }] }));
    jest.mocked(api.catalogStores).mockResolvedValue({ stores: [{ id: 'store-1', name: 'Market', created_at: '', updated_at: '' }] });
    jest.mocked(api.catalogUnits).mockResolvedValue({
      shopping_units: { built_in: [{ code: 'unit', label: 'Unit', unit_group: 'package_count' }], household: [] },
      recipe_measurement_units: [],
    });
    jest.mocked(api.createCatalogItem).mockImplementation(async () => {
      categoryArchived = true;
      throw new ApiError(409, 'A choice is no longer available.', 'CATALOG_REFERENCE_ARCHIVED');
    });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await fireEvent.changeText(await screen.findByLabelText('Item name'), 'Draft strawberries');
    await fireEvent.press(screen.getByLabelText('Category: Not selected'));
    await fireEvent.press(await screen.findByText('Produce'));
    await fireEvent.press(screen.getByLabelText('Typical shopping unit (optional): Not selected'));
    await fireEvent.press(await screen.findByText('Unit'));
    await fireEvent.press(screen.getByLabelText('Preferred store (optional): Not selected'));
    await fireEvent.press(await screen.findByText('Market'));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to catalog' }));

    expect(await screen.findByText(/A selected choice was removed/u)).toBeTruthy();
    expect(screen.getByLabelText('Item name').props.value).toBe('Draft strawberries');
    expect(screen.getByLabelText('Category: Not selected')).toBeTruthy();
    expect(screen.getByLabelText('Typical shopping unit (optional): Unit')).toBeTruthy();
    expect(screen.getByLabelText('Preferred store (optional): Market')).toBeTruthy();
  });

  it('does not allow an Edit item update until the original item load succeeds', async () => {
    jest.mocked(api.catalogItem)
      .mockRejectedValueOnce(new Error('temporary item load failure'))
      .mockResolvedValueOnce({ item: catalogItem({ name: 'Original milk', category_id: 'dairy', category_name: 'Dairy' }) });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/item/item-1/edit');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry loading item' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'Unhydrated replacement');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(api.updateCatalogItem).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry loading item' }));
    expect(await screen.findByLabelText('Item name')).toHaveProperty('props.value', 'Original milk');
    expect(api.catalogItem).toHaveBeenCalledTimes(2);
    expect(api.updateCatalogItem).not.toHaveBeenCalled();
  });

  it('carries the Household category type from Add item through Manage to Create', async () => {
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [{
      id: 'household-category', item_type: 'household', name: 'Cleaning', emoji: null, active_item_count: 0, created_at: '', updated_at: '',
    }] });
    jest.mocked(api.createCatalogCategory).mockResolvedValue({ category: {
      id: 'household-category-new', item_type: 'household', name: 'Laundry', emoji: null, active_item_count: 0, created_at: '', updated_at: '',
    } });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await fireEvent.press(screen.getByRole('radio', { name: 'Household' }));
    await fireEvent.press(screen.getByLabelText('Category: Not selected'));
    await fireEvent.press(screen.getByRole('button', { name: 'Manage categories' }));
    await waitFor(() => expect(renderResult.getPathname()).toBe('/catalog/choices/category'));
    await screen.findByText('Manage categories for this household.');
    await waitFor(() => expect(api.catalogCategories).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'household'));
    await fireEvent.press(screen.getByRole('button', { name: 'Create category' }));
    await screen.findByLabelText('category name');
    await fireEvent.changeText(screen.getByLabelText('category name'), 'Laundry');
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.createCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'household', 'Laundry', null));
    expect(renderResult.getPathname()).toBe('/catalog/choices/category');
  });

  it('requires an explicit type when creating a category from the global Categories manager', async () => {
    jest.mocked(api.createCatalogCategory).mockResolvedValue({ category: {
      id: 'new-household-category', item_type: 'household', name: 'Laundry', emoji: null, active_item_count: 0, created_at: '', updated_at: '',
    } });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/manage');
    await fireEvent.press(await screen.findByText('Categories'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Create category' }));
    await fireEvent.changeText(await screen.findByLabelText('category name'), 'Laundry');
    expect(screen.getByRole('button', { name: 'Create' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: 'Household' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.createCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'household', 'Laundry', null));
  });

  it('preserves the category name and type while entering an emoji in the text sheet', async () => {
    jest.mocked(api.createCatalogCategory).mockResolvedValue({ category: {
      id: 'pantry-category', item_type: 'food', name: 'Pantry', emoji: '🫙', active_item_count: 0, created_at: '', updated_at: '',
    } });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/manage');
    await fireEvent.press(await screen.findByText('Categories'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Create category' }));
    await fireEvent.changeText(await screen.findByLabelText('category name'), 'Pantry');
    await fireEvent.press(screen.getByRole('radio', { name: 'Food' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Emoji: Not set' }));
    const emojiInput = await screen.findByLabelText('Category emoji value');
    await fireEvent.changeText(emojiInput, '🫙');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByLabelText('category name').props.value).toBe('Pantry');
    expect(screen.getByRole('radio', { name: 'Food' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Emoji: 🫙' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.createCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'food', 'Pantry', '🫙'));
  });

  it('preserves an existing emoji when the text sheet is opened and left unchanged', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const category = { id: 'wave-category', item_type: 'food' as const, name: 'Greetings', emoji: '👋🏻', active_item_count: 0, created_at: '', updated_at: '' };
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [category] });
    jest.mocked(api.updateCatalogCategory).mockResolvedValue({ category });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/choices/category/wave-category');
    await waitFor(() => expect(screen.getByLabelText('category name').props.value).toBe('Greetings'));
    expect(screen.getByRole('button', { name: 'Emoji: 👋🏻' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Emoji: 👋🏻' }));
    expect((await screen.findByLabelText('Category emoji value')).props.value).toBe('👋🏻');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Emoji: 👋🏻' })).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Save category'));

    await waitFor(() => expect(api.updateCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'wave-category', 'Greetings', '👋🏻'));
  });

  it('clears an existing emoji only after Clear is explicitly confirmed with Done', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const category = { id: 'wave-category', item_type: 'food' as const, name: 'Greetings', emoji: '👋🏻', active_item_count: 0, created_at: '', updated_at: '' };
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [category] });
    jest.mocked(api.updateCatalogCategory).mockResolvedValue({ category: { ...category, emoji: null } });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/choices/category/wave-category');
    await waitFor(() => expect(screen.getByLabelText('category name').props.value).toBe('Greetings'));

    await fireEvent.press(screen.getByRole('button', { name: 'Emoji: 👋🏻' }));
    expect((await screen.findByLabelText('Category emoji value')).props.value).toBe('👋🏻');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Category emoji value').props.value).toBe('');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Emoji: Not set' })).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Save category'));

    await waitFor(() => expect(api.updateCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'wave-category', 'Greetings', null));
  });

  it('discards an open emoji draft when the household scope changes', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const categoryA = { id: 'shared-id', item_type: 'food' as const, name: 'Home Produce', emoji: '🥬', active_item_count: 0, created_at: '', updated_at: '' };
    const categoryB = { ...categoryA, name: 'Cabin Produce', emoji: '🍎' };
    jest.mocked(api.catalogCategories).mockImplementation(async (_getToken, householdId) => ({
      categories: [householdId === 'household-a' ? categoryA : categoryB],
    }));
    jest.mocked(api.updateCatalogCategory).mockResolvedValue({ category: categoryB });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/choices/category/shared-id');
    await waitFor(() => expect(screen.getByLabelText('category name').props.value).toBe('Home Produce'));
    await fireEvent.press(screen.getByRole('button', { name: 'Emoji: 🥬' }));
    await fireEvent.changeText(await screen.findByLabelText('Category emoji value'), '🫙');

    await act(async () => { mockSetSelectedHouseholdId?.('household-b'); });

    await waitFor(() => expect(screen.queryByTestId('catalog-emoji-input-sheet')).toBeNull());
    await waitFor(() => expect(screen.getByLabelText('category name').props.value).toBe('Cabin Produce'));
    expect(screen.getByRole('button', { name: 'Emoji: 🍎' })).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Save category'));
    await waitFor(() => expect(api.updateCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-b', 'shared-id', 'Cabin Produce', '🍎'));
  });

  it('keeps invalid emoji text in the sheet, shows inline feedback, and rejects multiple emoji', async () => {
    jest.mocked(api.createCatalogCategory).mockResolvedValue({ category: {
      id: 'test-category', item_type: 'food', name: 'Testing', emoji: '👩‍🍳', active_item_count: 0, created_at: '', updated_at: '',
    } });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/manage');
    await fireEvent.press(await screen.findByText('Categories'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Create category' }));
    await fireEvent.changeText(await screen.findByLabelText('category name'), 'Testing');
    await fireEvent.press(screen.getByRole('radio', { name: 'Food' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Emoji: Not set' }));
    const emojiInput = await screen.findByLabelText('Category emoji value');
    expect(emojiInput.props.keyboardType).toBe('default');
    expect(emojiInput.props.inputMode).toBe('text');
    await fireEvent.changeText(emojiInput, 'hello');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter one emoji, or leave the field empty.');
    expect(screen.getByRole('button', { name: 'Create' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    expect(api.createCatalogCategory).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByLabelText('Category emoji value').props.value).toBe('hello');
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(api.createCatalogCategory).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Category emoji value'), '😀😀');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter one emoji, or leave the field empty.');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByLabelText('Category emoji value').props.value).toBe('😀😀');
    expect(api.createCatalogCategory).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Category emoji value'), '👩‍🍳');
    expect(screen.queryByRole('alert')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Emoji: 👩‍🍳' })).toBeTruthy();
    expect(screen.getByLabelText('category name').props.value).toBe('Testing');
    expect(screen.getByRole('radio', { name: 'Food' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.createCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'food', 'Testing', '👩‍🍳'));
  });

  it('shows an active-item count and confirms category removal with that count', async () => {
    const category = { id: 'dairy', item_type: 'food' as const, name: 'Dairy', emoji: '🧀', active_item_count: 3, created_at: '', updated_at: '' };
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [category] });
    jest.mocked(api.deleteCatalogCategory).mockResolvedValue(undefined);
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/manage');
    await fireEvent.press(await screen.findByText('Categories'));
    await fireEvent.press(await screen.findByText('Dairy'));
    expect(await screen.findByText('3 items')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete category' }));
    expect(await screen.findByText(/move 3 active items to Uncategorized/u)).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete category' })[1]);
    await waitFor(() => expect(api.deleteCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'dairy', 3));
  });

  it('aligns the category name, type, and active-item count to a shared trailing inset', async () => {
    const category = { id: 'dairy', item_type: 'food' as const, name: 'Dairy', emoji: '🧀', active_item_count: 3, created_at: '', updated_at: '' };
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [category] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/manage');
    await fireEvent.press(await screen.findByText('Categories'));
    await fireEvent.press(await screen.findByText('Dairy'));

    const nameStyle = StyleSheet.flatten((await screen.findByLabelText('category name')).props.style);
    const typeStyle = StyleSheet.flatten(screen.getByTestId('category-type-value').props.style);
    const countStyle = StyleSheet.flatten(screen.getByTestId('category-item-count').props.style);
    expect(nameStyle).toEqual(expect.objectContaining({ flex: 1, paddingHorizontal: 0, textAlign: 'right' }));
    expect(typeStyle).toEqual(expect.objectContaining({ alignItems: 'flex-end', flex: 1 }));
    expect(countStyle).toEqual(expect.objectContaining({ textAlign: 'right' }));
    expect(screen.getByRole('button', { name: 'Emoji: 🧀' })).toBeTruthy();
  });

  it('keeps the emoji sheet keyboard-safe on Android without carrying the iPhone safe-area gap', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const category = { id: 'dairy', item_type: 'food' as const, name: 'Dairy', emoji: '🧀', active_item_count: 3, created_at: '', updated_at: '' };
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [category] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/manage');
    await fireEvent.press(await screen.findByText('Categories'));
    await fireEvent.press(await screen.findByText('Dairy'));
    await screen.findByText('3 items');
    await fireEvent.press(screen.getByRole('button', { name: 'Emoji: 🧀' }));

    const sheet = screen.getByTestId('catalog-emoji-input-sheet');
    expect(catalogEmojiSheetKeyboardBehavior).toBe('padding');
    expect(StyleSheet.flatten(sheet.props.style).paddingBottom).toBe(18);
    const emojiInput = screen.getByLabelText('Category emoji value');
    await fireEvent(emojiInput, 'focus');
    expect(StyleSheet.flatten(screen.getByTestId('catalog-emoji-input-sheet').props.style).paddingBottom).toBe(12);
    await fireEvent(emojiInput, 'blur');
    expect(StyleSheet.flatten(screen.getByTestId('catalog-emoji-input-sheet').props.style).paddingBottom).toBe(18);
  });

  it('filters Manage Stores without losing the management route', async () => {
    jest.mocked(api.catalogStores).mockResolvedValue({ stores: [
      { id: 'market', name: 'Market', created_at: '', updated_at: '' },
      { id: 'corner', name: 'Corner Shop', created_at: '', updated_at: '' },
    ] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/manage');
    await fireEvent.press(await screen.findByText('Stores'));
    expect(await screen.findByText('Market')).toBeTruthy();
    expect(screen.getByText('Corner Shop')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search stores'), 'corner');
    expect(screen.getByText('Corner Shop')).toBeTruthy();
    expect(screen.queryByText('Market')).toBeNull();
    expect(renderResult.getPathname()).toBe('/catalog/choices/store');
  });

  it('retains Household category type through Manage to Edit', async () => {
    const category = { id: 'household-category', item_type: 'household' as const, name: 'Cleaning', emoji: null, active_item_count: 0, created_at: '', updated_at: '' };
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [category] });
    jest.mocked(api.updateCatalogCategory).mockResolvedValue({ category: { ...category, name: 'Laundry' } });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await fireEvent.press(screen.getByRole('radio', { name: 'Household' }));
    await fireEvent.press(screen.getByLabelText('Category: Not selected'));
    await fireEvent.press(screen.getByRole('button', { name: 'Manage categories' }));
    await screen.findByText('Manage categories for this household.');
    await waitFor(() => expect(api.catalogCategories).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'household'));
    await fireEvent.press(await screen.findByText('Cleaning'));
    await waitFor(() => expect(api.catalogCategories).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'household'));
    await waitFor(() => expect(screen.getByLabelText('category name').props.value).toBe('Cleaning'));
    expect(screen.getByText('Household')).toBeTruthy();
    expect(api.updateCatalogCategory).not.toHaveBeenCalled();
  });

  it('clears search and filters on household or Clerk identity changes but preserves them on tab switches', async () => {
    jest.mocked(api.catalogItems)
      .mockResolvedValueOnce({ items: [catalogItem({ name: 'Apple', category_id: 'produce', category_name: 'Produce' })] })
      .mockResolvedValueOnce({ items: [catalogItem({ id: 'item-b', household_id: 'household-b', item_type: 'household', name: 'Cabin soap' })] })
      .mockResolvedValueOnce({ items: [catalogItem({ id: 'item-c', household_id: 'household-b', name: 'Identity bread' })] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog');
    await screen.findByText('Apple');
    await fireEvent.changeText(screen.getByLabelText('Search household items'), 'Apple');
    await fireEvent.press(screen.getByRole('button', { name: 'Food' }));
    await navigateTo(renderResult, '/shopping');
    await navigateTo(renderResult, '/catalog');
    expect(screen.getByLabelText('Search household items').props.value).toBe('Apple');
    expect(screen.getByRole('button', { name: 'Food' }).props.accessibilityState.selected).toBe(true);

    await act(async () => { mockSetSelectedHouseholdId?.('household-b'); });
    expect(await screen.findByText('Cabin soap')).toBeTruthy();
    expect(screen.getByLabelText('Search household items').props.value).toBe('');
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Search household items'), 'Cabin');
    await fireEvent.press(screen.getByRole('button', { name: 'Household' }));

    await act(async () => { mockSetClerkIdentity?.('user-b', 'session-b'); });
    expect(await screen.findByText('Identity bread')).toBeTruthy();
    expect(screen.getByLabelText('Search household items').props.value).toBe('');
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
    expect(api.catalogItems).toHaveBeenCalledTimes(3);
  });

  it('keeps same-named Food and Household categories as distinct All-view groups', async () => {
    jest.mocked(api.catalogItems).mockResolvedValue({ items: [
      catalogItem({ id: 'food-apple', name: 'Apple', category_id: 'food-produce', category_name: 'Produce' }),
      catalogItem({ id: 'household-soap', item_type: 'household', name: 'Soap', category_id: 'household-produce', category_name: 'Produce' }),
    ] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog');
    const sectionHeadings = screen.getAllByRole('header').map((heading) => heading.props.children);
    expect(sectionHeadings).toContain('Food');
    expect(sectionHeadings).toContain('Household');
    expect(screen.getAllByText('Produce')).toHaveLength(2);
    expect(screen.queryByRole('header', { name: 'Produce' })).toBeNull();
    expect(screen.queryByText('Food ·')).toBeNull();
    expect(screen.queryByText('Household ·')).toBeNull();
    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('Soap')).toBeTruthy();
  });

  it('shows a Retry action when item detail loading fails', async () => {
    jest.mocked(api.catalogItem).mockRejectedValueOnce(new Error('temporary detail failure')).mockResolvedValueOnce({ item: catalogItem() });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/item/item-1');
    expect(await screen.findByRole('alert')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry loading item' }));
    expect(await screen.findByText('Milk')).toBeTruthy();
    expect(api.catalogItem).toHaveBeenCalledTimes(2);
  });

  it('shows the category emoji beside the category on Item Details', async () => {
    const item = catalogItem({ category_id: 'dairy', category_name: 'Dairy' });
    jest.mocked(api.catalogItem).mockResolvedValue({ item });
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [
      { id: 'dairy', item_type: 'food', name: 'Dairy', emoji: '🥛', active_item_count: 1, created_at: '', updated_at: '' },
    ] });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/item/item-1');
    expect(await screen.findByText('🥛 Dairy')).toBeTruthy();
  });

  it('refreshes the mounted item detail after editing its name and category', async () => {
    const originalItem = catalogItem({ category_id: 'dairy', category_name: 'Dairy' });
    const updatedItem = catalogItem({ name: 'Oat milk', category_id: 'chilled', category_name: 'Chilled' });
    jest.mocked(api.catalogItems).mockResolvedValue({ items: [originalItem] });
    jest.mocked(api.catalogItem)
      .mockResolvedValueOnce({ item: originalItem })
      .mockResolvedValueOnce({ item: originalItem })
      .mockResolvedValueOnce({ item: updatedItem });
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [
      { id: 'dairy', item_type: 'food', name: 'Dairy', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
      { id: 'chilled', item_type: 'food', name: 'Chilled', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
    ] });
    jest.mocked(api.updateCatalogItem).mockResolvedValue({ item: updatedItem });

    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog');
    await fireEvent.press(await screen.findByText('Milk'));
    expect(await screen.findByText('Dairy')).toBeTruthy();
    expect(screen.getByText('Shopping preferences')).toBeTruthy();
    expect(screen.getByText('Recipe measurement')).toBeTruthy();
    expect(screen.queryByText('Catalog details')).toBeNull();
    expect(renderResult.getPathname()).toBe('/catalog/item/item-1');

    await navigateTo(renderResult, '/catalog/item/item-1/edit');
    await waitFor(() => expect(screen.getByLabelText('Item name').props.value).toBe('Milk'));
    await fireEvent.press(screen.getByLabelText('Category: Dairy'));
    await fireEvent.press(await screen.findByText('Chilled'));
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'Oat milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Oat milk')).toBeTruthy();
    expect(await screen.findByText('Chilled')).toBeTruthy();
    expect(renderResult.getPathname()).toBe('/catalog/item/item-1');
    expect(api.updateCatalogItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'item-1', expect.objectContaining({
      name: 'Oat milk', category_id: 'chilled',
    }));
    expect(api.catalogItem).toHaveBeenCalledTimes(3);
  });

  it('ignores a delayed item-detail refresh after the household changes', async () => {
    const originalItem = catalogItem({ category_id: 'dairy', category_name: 'Dairy' });
    const staleUpdatedItem = catalogItem({ name: 'Stale household result', category_id: 'chilled', category_name: 'Chilled' });
    const householdItem = catalogItem({ household_id: 'household-b', name: 'Cabin soap', item_type: 'household' });
    const delayedRefresh = deferred<{ item: CatalogItem }>();
    jest.mocked(api.catalogItems).mockResolvedValue({ items: [originalItem] });
    jest.mocked(api.catalogItem)
      .mockResolvedValueOnce({ item: originalItem })
      .mockResolvedValueOnce({ item: originalItem })
      .mockReturnValueOnce(delayedRefresh.promise)
      .mockResolvedValueOnce({ item: householdItem });
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [
      { id: 'dairy', item_type: 'food', name: 'Dairy', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
      { id: 'chilled', item_type: 'food', name: 'Chilled', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
    ] });
    jest.mocked(api.updateCatalogItem).mockResolvedValue({ item: staleUpdatedItem });

    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog');
    await fireEvent.press(await screen.findByText('Milk'));
    expect(await screen.findByText('Dairy')).toBeTruthy();
    await navigateTo(renderResult, '/catalog/item/item-1/edit');
    await waitFor(() => expect(screen.getByLabelText('Item name').props.value).toBe('Milk'));
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'Updated in household A');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(renderResult.getPathname()).toBe('/catalog/item/item-1'));
    await waitFor(() => expect(api.catalogItem).toHaveBeenCalledTimes(3));

    await act(async () => { mockSetSelectedHouseholdId?.('household-b'); });
    expect(await screen.findByText('Cabin soap')).toBeTruthy();
    expect(api.catalogItem).toHaveBeenCalledTimes(4);

    await act(async () => {
      delayedRefresh.resolve({ item: staleUpdatedItem });
      await delayedRefresh.promise;
    });

    expect(screen.getByText('Cabin soap')).toBeTruthy();
    expect(screen.queryByText('Stale household result')).toBeNull();
  });

  it('offers Retry when the post-edit detail refresh fails', async () => {
    const originalItem = catalogItem({ category_id: 'dairy', category_name: 'Dairy' });
    const updatedItem = catalogItem({ name: 'Oat milk', category_id: 'dairy', category_name: 'Dairy' });
    jest.mocked(api.catalogItems).mockResolvedValue({ items: [originalItem] });
    jest.mocked(api.catalogItem)
      .mockResolvedValueOnce({ item: originalItem })
      .mockResolvedValueOnce({ item: originalItem })
      .mockRejectedValueOnce(new Error('temporary detail refresh failure'))
      .mockResolvedValueOnce({ item: updatedItem });
    jest.mocked(api.catalogCategories).mockResolvedValue({ categories: [
      { id: 'dairy', item_type: 'food', name: 'Dairy', emoji: null, active_item_count: 0, created_at: '', updated_at: '' },
    ] });
    jest.mocked(api.updateCatalogItem).mockResolvedValue({ item: updatedItem });

    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog');
    await fireEvent.press(await screen.findByText('Milk'));
    await screen.findByText('Dairy');
    await navigateTo(renderResult, '/catalog/item/item-1/edit');
    await waitFor(() => expect(screen.getByLabelText('Item name').props.value).toBe('Milk'));
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'Oat milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry loading item' })).toBeTruthy();
    expect(screen.getByText('Milk')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry loading item' }));

    expect(await screen.findByText('Oat milk')).toBeTruthy();
    expect(screen.getByText('Dairy')).toBeTruthy();
    expect(api.catalogItem).toHaveBeenCalledTimes(4);
  });

  it('shows a Retry action when choice-management loading fails', async () => {
    let foodManagerLoads = 0;
    jest.mocked(api.catalogCategories).mockImplementation(async (_getToken, _householdId, itemType) => {
      if (itemType === 'food' && foodManagerLoads++ === 0) throw new Error('temporary categories failure');
      return { categories: [{ id: 'food-category', item_type: 'food', name: 'Produce', emoji: null, active_item_count: 0, created_at: '', updated_at: '' }] };
    });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await fireEvent.press(screen.getByLabelText('Category: Not selected'));
    await fireEvent.press(screen.getByRole('button', { name: 'Manage categories' }));
    expect(await screen.findByText('Manage categories for this household.')).toBeTruthy();
    expect(await screen.findByRole('alert')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Retry loading choices' }));
    expect(await screen.findByText('Produce')).toBeTruthy();
    expect(api.catalogCategories).toHaveBeenCalledWith(expect.any(Function), 'household-a', 'food');
  });

  it('clears a draft-only category removed from Manage and explains the cleared selection', async () => {
    let categoryArchived = false;
    const category = { id: 'food-category', item_type: 'food' as const, name: 'Produce', emoji: null, active_item_count: 0, created_at: '', updated_at: '' };
    jest.mocked(api.catalogCategories).mockImplementation(async (_getToken, _householdId, itemType) => ({
      categories: !categoryArchived && (!itemType || itemType === 'food') ? [category] : [],
    }));
    jest.mocked(api.deleteCatalogCategory).mockImplementation(async () => { categoryArchived = true; });
    const renderResult = renderRouter(`${process.cwd()}/src/app`, { initialUrl: '/' });
    await renderResult;
    await screen.findByText('Your shopping list is empty.');
    await navigateTo(renderResult, '/catalog/add');
    await fireEvent.changeText(await screen.findByLabelText('Item name'), 'Strawberries');
    await fireEvent.press(screen.getByLabelText('Category: Not selected'));
    await fireEvent.press(await screen.findByText('Produce'));
    await fireEvent.press(screen.getByLabelText('Category: Produce'));
    await fireEvent.press(screen.getByRole('button', { name: 'Manage categories' }));
    await fireEvent.press(await screen.findByText('Produce'));
    await screen.findByText('Items in this category');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete category' })[0]);
    expect(await screen.findByText(/Delete “Produce”\?/u)).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete category' })[1]);
    await waitFor(() => expect(renderResult.getPathname()).toBe('/catalog/choices/category'));
    await act(async () => { router.back(); });
    await waitFor(() => expect(renderResult.getPathname()).toBe('/catalog/add'));

    expect(await screen.findByLabelText('Category: Not selected')).toBeTruthy();
    expect(await screen.findByText(/selected category, store, or shopping unit is no longer active/u)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add to catalog' }));
    await waitFor(() => expect(api.createCatalogItem).toHaveBeenCalled());
    expect(api.createCatalogItem).toHaveBeenCalledWith(expect.any(Function), 'household-a', expect.objectContaining({ category_id: null }));
  });
});
