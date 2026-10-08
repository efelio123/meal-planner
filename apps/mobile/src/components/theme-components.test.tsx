import { render } from '@testing-library/react-native';
import { Platform, StyleSheet, Text } from 'react-native';
import { Screen } from './screen';
import { TimeZonePicker, timeZoneSheetStyle } from './time-zone-picker';
import { NativeSheetProvider } from '@/features/native-sheets/native-sheet-context';

let mockMode: 'light' | 'dark' = 'light';

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockMode,
}));

describe.each([
  ['light', '#ffffff', '#ffffff', '#ffffff'],
  ['dark', '#101114', '#1d1e22', '#1d1e22'],
] as const)('the %s theme', (mode, screenColor, inputColor, sheetColor) => {
  beforeEach(() => { mockMode = mode; });

  it('renders the shared screen with its semantic background', async () => {
    const component = await render(<Screen><Text>Content</Text></Screen>);
    expect(StyleSheet.flatten(component.getByTestId('screen').props.style)).toMatchObject({ backgroundColor: screenColor });
    expect(StyleSheet.flatten(component.getByTestId('screen').props.contentContainerStyle)).toMatchObject({ flexGrow: 1, justifyContent: 'center' });
  });

  it('supports top-aligned long-form signed-in pages', async () => {
    const component = await render(<Screen contentAlignment="top"><Text>Content</Text></Screen>);
    expect(StyleSheet.flatten(component.getByTestId('screen').props.style).flex).toBe(1);
    expect(StyleSheet.flatten(component.getByTestId('screen').props.contentContainerStyle)).toMatchObject({ justifyContent: 'flex-start' });
    expect(StyleSheet.flatten(component.getByTestId('screen').props.contentContainerStyle).flexGrow).toBeUndefined();
    expect(component.getByTestId('screen').props.alwaysBounceVertical).toBe(Platform.OS === 'ios');
  });

  it('delegates tab-root iOS insets to NativeTabs without adding SafeAreaView edges twice', async () => {
    const component = await render(<Screen nativeTabScreen safeAreaEdges={['top', 'left', 'right']}><Text>Tab content</Text></Screen>);
    const safeArea = component.getByTestId('screen').parent;

    if (Platform.OS === 'ios') {
      expect(safeArea?.props.edges).toEqual({ top: 'off', right: 'off', bottom: 'off', left: 'off' });
      expect(component.getByTestId('screen').props.contentInsetAdjustmentBehavior).toBe('automatic');
      expect(component.getByTestId('screen').props.automaticallyAdjustKeyboardInsets).toBe(false);
    } else {
      expect(safeArea?.props.edges).toEqual({ top: 'additive', right: 'additive', bottom: 'off', left: 'additive' });
      expect(component.getByTestId('screen').props.contentInsetAdjustmentBehavior).toBe('never');
    }
  });

  it('keeps keyboard inset adjustment on non-tab forms', async () => {
    const component = await render(<Screen><Text>Form</Text></Screen>);
    expect(component.getByTestId('screen').props.automaticallyAdjustKeyboardInsets).toBe(Platform.OS === 'ios');
  });

  it('fills a native-tab viewport without automatic insets when manual safe area is enabled', async () => {
    const component = await render(<Screen contentAlignment="top" nativeTabScreen manualNativeTabInsets><Text>Short tab</Text></Screen>);
    const scroll = component.getByTestId('screen');
    if (Platform.OS === 'ios') {
      expect(scroll.props.contentInsetAdjustmentBehavior).toBe('never');
      expect(StyleSheet.flatten(scroll.props.contentContainerStyle).flexGrow).toBe(1);
    } else {
      expect(scroll.props.contentInsetAdjustmentBehavior).toBe('never');
      expect(StyleSheet.flatten(scroll.props.contentContainerStyle).flexGrow).toBeUndefined();
    }
  });

  it('reserves native tab-bar space for a nested page with a fixed footer', async () => {
    const component = await render(<Screen contentAlignment="top" nativeTabBottomInset safeAreaEdges={['left', 'right']} footer={<Text>Confirm</Text>}><Text>Review</Text></Screen>);
    const outer = component.getByTestId('screen').parent;
    if (Platform.OS === 'ios') {
      expect(outer?.props.edges).toEqual({ top: false, right: false, bottom: true, left: false });
    } else {
      expect(outer?.props.edges).toEqual({ top: 'off', right: 'additive', bottom: 'off', left: 'additive' });
    }
    expect(component.getByText('Confirm')).toBeTruthy();
  });

  it('renders the time-zone picker and derives its sheet background from the same theme', async () => {
    const component = await render(<NativeSheetProvider scope="theme-test"><TimeZonePicker onChange={jest.fn()} value="America/Phoenix" /></NativeSheetProvider>);
    expect(component.getByLabelText('Time zone').props.style[1]).toMatchObject({ backgroundColor: inputColor });
    expect(timeZoneSheetStyle(sheetColor)).toContainEqual({ backgroundColor: sheetColor });
  });
});
