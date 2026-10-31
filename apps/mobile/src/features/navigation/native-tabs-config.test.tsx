import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { shoppingBadge } from '@/features/shopping-list/shopping-badge';
import type { ShoppingListItem } from '@/lib/api';
import NativeTabLayout from '@/app/(app)/(tabs)/_layout.native';

let mockBadge = { label: undefined as string | undefined, accessibilityLabel: 'Shopping' };
jest.mock('@/features/shopping-list/shopping-list-provider', () => ({ useShoppingBadge: () => mockBadge }));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: 'user-a', sessionId: 'session-a' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ selectedHousehold: null }) }));

jest.mock('expo-router/native-tabs', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  function NativeTabs({ children, ...props }: PropsWithChildren<Record<string, unknown>>) {
    return React.createElement(View, { ...props, testID: 'native-tabs' }, children);
  }
  function Trigger({ children, name, ...props }: PropsWithChildren<{ name: string; disableAutomaticContentInsets?: boolean }>) {
    return React.createElement(View, { ...props, testID: `tab-${name}` }, children);
  }
  function TriggerLabel({ children }: React.PropsWithChildren) {
    return React.createElement(Text, null, children);
  }
  function TriggerIcon() { return null; }
  Trigger.Badge = function TriggerBadge({ children, hidden }: PropsWithChildren<{ hidden?: boolean }>) { return hidden ? null : React.createElement(Text, { testID: 'shopping-tab-badge' }, children); };
  Trigger.Label = TriggerLabel;
  Trigger.Icon = TriggerIcon;
  return { NativeTabs: Object.assign(NativeTabs, { Trigger }) };
});

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));

it('configures the five ordered native tabs and history-based Back', async () => {
  const result = await render(<NativeTabLayout />);
  const tabs = result.getByTestId('native-tabs');

  expect(tabs.props.backBehavior).toBe('history');
  expect(result.getAllByTestId(/^tab-/).map((tab) => tab.props.testID)).toEqual([
    'tab-plan',
    'tab-recipes',
    'tab-shopping',
    'tab-catalog',
    'tab-profile',
  ]);
  for (const tab of result.getAllByTestId(/^tab-/)) {
    expect(tab.props.disableAutomaticContentInsets).toBe(Platform.OS === 'ios');
  }
});


it.each([null, 0, 1, 12, 99, 100])('renders the native badge for count %s without changing the navigator', async (count) => {
  const items = Array.from({ length: count ?? 0 }, () => ({ is_checked: false }) as ShoppingListItem);
  mockBadge = shoppingBadge(items, count !== null);
  const view = await render(<NativeTabLayout />);
  const badge = view.queryByTestId('shopping-tab-badge');
  if (!count) expect(badge).toBeNull();
  else expect(badge?.props.children).toBe(count > 99 ? '99+' : String(count));
  expect(view.getByTestId('tab-shopping').props.accessibilityLabel).toBe(mockBadge.accessibilityLabel);
  const navigator = view.getByTestId('native-tabs');
  mockBadge = shoppingBadge([], true);
  await view.rerender(<NativeTabLayout />);
  expect(view.getByTestId('native-tabs')).toBe(navigator);
});
