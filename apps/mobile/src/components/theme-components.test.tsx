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
    expect(StyleSheet.flatten(component.getByTestId('screen').props.contentContainerStyle)).toMatchObject({ justifyContent: 'center' });
  });

  it('supports top-aligned long-form signed-in pages', async () => {
    const component = await render(<Screen contentAlignment="top"><Text>Content</Text></Screen>);
    expect(StyleSheet.flatten(component.getByTestId('screen').props.contentContainerStyle)).toMatchObject({ justifyContent: 'flex-start' });
  });

  it('delegates tab-root iOS insets to NativeTabs without adding SafeAreaView edges twice', async () => {
    const component = await render(<Screen nativeTabScreen safeAreaEdges={['top', 'left', 'right']}><Text>Tab content</Text></Screen>);
    const safeArea = component.getByTestId('screen').parent;

    if (Platform.OS === 'ios') {
      expect(safeArea?.props.edges).toEqual({ top: 'off', right: 'off', bottom: 'off', left: 'off' });
      expect(component.getByTestId('screen').props.contentInsetAdjustmentBehavior).toBe('automatic');
    } else {
      expect(safeArea?.props.edges).toEqual({ top: 'additive', right: 'additive', bottom: 'off', left: 'additive' });
      expect(component.getByTestId('screen').props.contentInsetAdjustmentBehavior).toBe('never');
    }
  });

  it('renders the time-zone picker and derives its sheet background from the same theme', async () => {
    const component = await render(<NativeSheetProvider scope="theme-test"><TimeZonePicker onChange={jest.fn()} value="America/Phoenix" /></NativeSheetProvider>);
    expect(component.getByLabelText('Time zone').props.style[1]).toMatchObject({ backgroundColor: inputColor });
    expect(timeZoneSheetStyle(sheetColor)).toContainEqual({ backgroundColor: sheetColor });
  });
});
