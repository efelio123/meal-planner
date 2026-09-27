import type { PropsWithChildren } from 'react';
import { createElement } from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Button, Text } from 'react-native';
import { api, type ShoppingList } from '@/lib/api';

let mockInitialDestination = 'app';
let mockInitialSignedIn = true;
let mockSetSignedIn: ((value: boolean) => void) | undefined;
let mockSetDestination: ((destination: string) => void) | undefined;

jest.mock('@clerk/expo', () => ({
  ...(() => {
    const React = jest.requireActual<typeof import('react')>('react');
    const AuthContext = React.createContext({ isLoaded: true, isSignedIn: mockInitialSignedIn });
    return {
      ClerkProvider: ({ children }: PropsWithChildren) => {
        const [isSignedIn, setIsSignedIn] = React.useState(mockInitialSignedIn);
        mockSetSignedIn = setIsSignedIn;
        return React.createElement(AuthContext.Provider, { value: { isLoaded: true, isSignedIn } }, children);
      },
      useAuth: () => React.useContext(AuthContext),
    };
  })(),
}));
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: {} }));
jest.mock('@/hooks/use-household-state', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const HouseholdContext = React.createContext<unknown>(null);
  const household = { id: 'household-a', name: 'Home', role: 'owner', time_zone: 'UTC' };

  return {
    HouseholdStateProvider: ({ children }: PropsWithChildren) => {
      const [destination, setDestination] = React.useState(mockInitialDestination);
      mockSetDestination = setDestination;
      const state = {
        destination,
        getToken: jest.fn().mockResolvedValue('session-token'),
        households: [household],
        isSigningOut: false,
        refresh: jest.fn(),
        selectedHousehold: household,
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
    addShoppingListItem: jest.fn(),
    setShoppingListItemChecked: jest.fn(),
    deleteShoppingListItem: jest.fn(),
  },
}));
jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  createURL: () => 'mealplanner:///',
}));

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

function shoppingListResponse(): { shopping_list: ShoppingList } {
  return { shopping_list: { id: 'list-a', household_id: 'household-a', items: [] } };
}

describe('signed-in startup routing', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockInitialDestination = 'app';
    mockInitialSignedIn = true;
    mockSetSignedIn = undefined;
    mockSetDestination = undefined;
    jest.mocked(api.shoppingList).mockResolvedValue(shoppingListResponse());
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
    expect(tabs?.routeNames).toEqual(['plan', 'recipes', 'shopping', 'pantry', 'settings']);
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

  it('removes signed-in screens after Settings sign-out and starts fresh after sign-in', async () => {
    const renderResult = renderRouter(
      {
        appDir: `${process.cwd()}/src/app`,
        overrides: { '(auth)/sign-in': SignInAgainFixture },
      },
      { initialUrl: '/' },
    );
    await renderResult;
    await screen.findByText('Shopping list');
    await navigateTo(renderResult, '/settings');
    await screen.findByText('Current household');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Sign in again')).toBeTruthy();
    expect(screen.queryByText('Current household')).toBeNull();
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
      expect(screen.queryByText('Current household')).toBeNull();
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
    for (const tab of ['plan', 'recipes', 'pantry', 'settings', 'shopping']) {
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
    await navigateTo(renderResult, '/settings');
    await navigateTo(renderResult, '/recipes');

    for (const expectedPath of ['/settings', '/plan', '/shopping']) {
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
});
