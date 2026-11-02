import { useContext, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ThemePalettes } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AppearanceProvider } from './appearance-provider';
import { AppearanceContext } from './appearance-context';
import { AppearanceChoices, AppearanceChooser } from './appearance-screen';
import { createAppearanceStore } from './appearance-store';
let mockMode = 'light'; const mockBack = jest.fn();
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockMode }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('expo-symbols', () => { const React = jest.requireActual('react'); const { View } = jest.requireActual('react-native'); return { SymbolView: (props: object) => React.createElement(View, props) }; });
function fixture(value: string | null = null) {
  const storage = { getItem: jest.fn().mockResolvedValue(value), setItem: jest.fn().mockResolvedValue(undefined) };
  return { storage, store: createAppearanceStore(storage) };
}
function DraftAndSheet() {
  const [text, setText] = useState(''); const [sheet, setSheet] = useState(false); const theme = useTheme();
  return <View><Text testID="palette-screen">{theme.screen}</Text><TextInput accessibilityLabel="Recipe draft" value={text} onChangeText={setText} /><Pressable accessibilityRole="button" onPress={() => setSheet(true)}><Text>Open retained sheet</Text></Pressable>{sheet ? <Text testID="retained-sheet">{theme.elevatedSurface}</Text> : null}</View>;
}
beforeEach(() => { jest.clearAllMocks(); mockMode = 'light'; });
it('applies a choice immediately while keeping existing draft and open-sheet state', async () => {
  const { store, storage } = fixture(); await render(<AppearanceProvider store={store}><AppearanceChoices /><DraftAndSheet /></AppearanceProvider>);
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Green' })).not.toBeDisabled());
  await fireEvent.changeText(screen.getByLabelText('Recipe draft'), 'Dinner for Sunday'); await fireEvent.press(screen.getByText('Open retained sheet'));
  await fireEvent.press(screen.getByRole('radio', { name: 'Green' }));
  expect(screen.getByRole('radio', { name: 'Green' })).toBeChecked();
  expect(screen.getByLabelText('Recipe draft').props.value).toBe('Dinner for Sunday');
  expect(screen.getByTestId('retained-sheet').props.children).toBe(ThemePalettes.green.light.elevatedSurface);
  expect(screen.getByTestId('palette-screen').props.children).toBe(ThemePalettes.green.light.screen);
  await waitFor(() => expect(storage.setItem).toHaveBeenCalled());
});
it('updates the chosen colors on a live phone appearance change without remounting children', async () => {
  const { store } = fixture(JSON.stringify({ version: 1, themeId: 'apricot', chooserSeenVersion: 1 }));
  const result = await render(<AppearanceProvider store={store}><DraftAndSheet /></AppearanceProvider>);
  await waitFor(() => expect(screen.getByTestId('palette-screen').props.children).toBe(ThemePalettes.apricot.light.screen));
  await fireEvent.changeText(screen.getByLabelText('Recipe draft'), 'Keep my work'); mockMode = 'dark';
  await result.rerender(<AppearanceProvider store={store}><DraftAndSheet /></AppearanceProvider>);
  expect(screen.getByTestId('palette-screen').props.children).toBe(ThemePalettes.apricot.dark.screen);
  expect(screen.getByLabelText('Recipe draft').props.value).toBe('Keep my work');
});
it('shows a failed save and retries without an extra Save step', async () => {
  const { store, storage } = fixture(); await store.load(); storage.setItem.mockRejectedValueOnce(new Error('disk'));
  await render(<AppearanceProvider store={store}><AppearanceChoices /></AppearanceProvider>);
  await fireEvent.press(screen.getByRole('radio', { name: 'Green' })); await screen.findByRole('alert');
  expect(screen.getByRole('radio', { name: 'Phone theme' })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry appearance' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Green' })).toBeChecked());
});
it('the first-use native frame has preserved header, bounded body and reachable Continue footer', async () => {
  const { store, storage } = fixture(); await store.load(); await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}><AppearanceProvider store={store}><AppearanceChooser /></AppearanceProvider></SafeAreaProvider>);
  expect(screen.getByTestId('appearance-chooser-root').props.collapsable).toBe(false);
  expect(screen.getByTestId('appearance-chooser-header').props.collapsable).toBe(false);
  expect(screen.getByTestId('appearance-chooser-footer').props.collapsable).toBe(false);
  expect(screen.getByTestId('appearance-chooser-scroll').props.contentInsetAdjustmentBehavior).toBe('never');
  await waitFor(() => expect(storage.setItem).toHaveBeenCalled());
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' })); expect(mockBack).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().chooserSeenVersion).toBe(1);
});
it('keeps installation preference when account/household children change', async () => {
  function Account({ name }: { name: string }) { const prefs = useContext(AppearanceContext); return <Text>{name}: {prefs?.themeId}</Text>; }
  const { store } = fixture(); const result = await render(<AppearanceProvider store={store}><Account name="First household" /></AppearanceProvider>);
  await act(() => store.load()); await act(() => store.chooseTheme('green'));
  await result.rerender(<AppearanceProvider store={store}><Account name="Signed out" /></AppearanceProvider>);
  expect(screen.getByText('Signed out: green')).toBeTruthy();
  await result.rerender(<AppearanceProvider store={store}><Account name="Other account" /></AppearanceProvider>);
  expect(screen.getByText('Other account: green')).toBeTruthy();
});
