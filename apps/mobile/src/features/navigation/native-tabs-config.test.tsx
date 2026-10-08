import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import NativeTabLayout from '@/app/(app)/(tabs)/_layout.native';

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: 'user-a', sessionId: 'session-a' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ selectedHousehold: null }) }));

jest.mock('expo-router/unstable-native-tabs', () => {
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
