import type { PropsWithChildren } from 'react';
import { render } from '@testing-library/react-native';
import { shoppingBadge } from '@/features/shopping-list/shopping-badge';
import type { ShoppingListItem } from '@/lib/api';
const WebTabLayout = jest.requireActual<{ default: () => React.JSX.Element }>('@/app/(app)/(tabs)/_layout.tsx').default;
let mockBadge = shoppingBadge([], false);
jest.mock('@/features/shopping-list/shopping-list-provider', () => ({ useShoppingBadge: () => mockBadge }));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: 'user', sessionId: 'session' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ selectedHousehold: null }) }));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  function Tabs({ children, ...props }: PropsWithChildren<Record<string, unknown>>) { return React.createElement(View, { ...props, testID: 'web-tabs' }, children); }
  function Screen({ name, options }: { name: string; options: unknown }) { return React.createElement(View, { testID: `web-tab-${name}`, options } as unknown as React.ComponentProps<typeof View>); }
  return { Tabs: Object.assign(Tabs, { Screen }) };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

it.each([null, 0, 1, 99, 100])('configures the web Shopping badge at count %s without remounting tabs', async (count) => {
  mockBadge = shoppingBadge(Array.from({ length: count ?? 0 }, () => ({ is_checked: false }) as ShoppingListItem), count !== null);
  const view = await render(<WebTabLayout />);
  const tabs = view.getByTestId('web-tabs');
  expect(tabs.props.backBehavior).toBe('history');
  expect(view.getAllByTestId(/^web-tab-/).map((tab) => tab.props.testID)).toEqual(['web-tab-plan', 'web-tab-recipes', 'web-tab-shopping', 'web-tab-catalog', 'web-tab-profile']);
  expect(view.getByTestId('web-tab-shopping').props.options).toEqual({ title: 'Shopping', tabBarBadge: mockBadge.label, tabBarAccessibilityLabel: mockBadge.accessibilityLabel });
  mockBadge = shoppingBadge([], true);
  await view.rerender(<WebTabLayout />);
  expect(view.getByTestId('web-tabs')).toBe(tabs);
  expect(view.getByTestId('web-tab-shopping').props.options.tabBarBadge).toBeUndefined();
});
