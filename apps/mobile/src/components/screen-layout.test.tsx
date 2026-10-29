import { render, within } from '@testing-library/react-native';
import { Platform, StyleSheet, Text } from 'react-native';
import { Screen, type ScreenLayout } from './screen';

const originalPlatform = Platform.OS;
afterEach(() => { Platform.OS = originalPlatform; });

it('keeps the inline keyboard frame inside native safe areas across focus and retains scroll content', async () => {
  Platform.OS = 'ios';
  const view = await render(<Screen layout="tab-root" inlineKeyboardActive={false}><Text>Shopping content</Text></Screen>);
  const scroll = view.getByTestId('screen');
  const frame = view.getByTestId('screen-inline-keyboard-area');
  expect(scroll.parent).toBe(frame);
  expect(frame.parent?.props.edges.bottom).toBe(true);
  await view.rerender(<Screen layout="tab-root" inlineKeyboardActive><Text>Shopping content</Text></Screen>);
  expect(view.getByTestId('screen')).toBe(scroll);
  await view.rerender(<Screen layout="tab-root" inlineKeyboardActive={false}><Text>Shopping content</Text></Screen>);
  expect(view.getByTestId('screen')).toBe(scroll);
  expect(frame.parent?.props.edges.bottom).toBe(true);
});

describe.each(['ios', 'android', 'web'] as const)('%s page layout ownership', (platform) => {
  it.each(['tab-root', 'tab-stack', 'stack-modal', 'standalone'] as ScreenLayout[])('%s reserves only its visible chrome and keeps the final action outside the scroll body', async (layout) => {
    Platform.OS = platform;
    const view = await render(<Screen layout={layout} contentAlignment="top" footer={<Text>Last action</Text>}>
      {Array.from({ length: 40 }, (_, index) => <Text key={index}>Row {index}</Text>)}
    </Screen>);
    const scroll = view.getByTestId('screen');
    const edges = scroll.parent?.props.edges;
    if (platform === 'ios' && (layout === 'tab-root' || layout === 'tab-stack')) {
      expect(edges).toEqual({ top: layout === 'tab-root', right: true, bottom: true, left: true });
    } else {
      expect(edges).toEqual({
        top: layout === 'standalone' || layout === 'tab-root' ? 'additive' : 'off',
        right: 'additive', left: 'additive',
        bottom: platform === 'android' && (layout === 'tab-root' || layout === 'tab-stack') ? 'off' : 'additive',
      });
    }
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe('never');
    expect(scroll.props.automaticallyAdjustContentInsets).toBe(false);
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(platform === 'ios' && layout !== 'tab-root');
    expect(StyleSheet.flatten(scroll.props.style).flex).toBe(1);
    expect(view.getByText('Row 39')).toBeTruthy();
    expect(view.getByText('Last action')).toBeTruthy();
    expect(within(scroll).queryByText('Last action')).toBeNull();
  });
});
