import { act, render } from '@testing-library/react-native';
import { AppearanceProvider } from './appearance-provider';
import { AppearanceFirstUse } from './appearance-first-use';
import { createAppearanceStore } from './appearance-store';
const mockPresent = jest.fn(() => 'appearance-sheet'); const mockPush = jest.fn();
let mockPath = '/recipes'; let mockOpen = false;
const mockRouter = { push: mockPush };
const mockFlow = { present: mockPresent, get hasOpenSheet() { return mockOpen; } };
jest.mock('expo-router', () => ({ usePathname: () => mockPath, useRouter: () => mockRouter }));
jest.mock('@/features/native-sheets/native-sheet-context', () => ({ useNativeSheetFlow: () => mockFlow }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('./appearance-screen', () => ({ AppearanceChooser: () => null }));
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); mockOpen = false; mockPath = '/recipes'; });
afterEach(() => { jest.useRealTimers(); });
it('defers until authenticated, hydrated, idle at a tab root without another sheet', async () => {
  const store = createAppearanceStore({ getItem: async () => null, setItem: async () => {} }); await store.load();
  const result = await render(<AppearanceProvider store={store}><AppearanceFirstUse eligible={false} /></AppearanceProvider>);
  await act(() => jest.advanceTimersByTimeAsync(500)); expect(mockPresent).not.toHaveBeenCalled();
  mockPath = '/recipes/create';
  await result.rerender(<AppearanceProvider store={store}><AppearanceFirstUse eligible /></AppearanceProvider>);
  await act(() => jest.advanceTimersByTimeAsync(500)); expect(mockPresent).not.toHaveBeenCalled();
  mockPath = '/recipes'; mockOpen = true;
  await result.rerender(<AppearanceProvider store={store}><AppearanceFirstUse eligible /></AppearanceProvider>);
  await act(() => jest.advanceTimersByTimeAsync(500)); expect(mockPresent).not.toHaveBeenCalled();
  mockOpen = false;
  await result.rerender(<AppearanceProvider store={store}><AppearanceFirstUse eligible /></AppearanceProvider>);
  await act(() => jest.advanceTimersByTimeAsync(500));
  expect(mockPresent).toHaveBeenCalledTimes(1); expect(mockPresent).toHaveBeenCalledWith(expect.anything(), { detents: [1], direct: true });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/native-sheet/[sheetId]', params: { sheetId: 'appearance-sheet' } });
  await result.rerender(<AppearanceProvider store={store}><AppearanceFirstUse eligible /></AppearanceProvider>);
  await act(() => jest.advanceTimersByTimeAsync(500)); expect(mockPresent).toHaveBeenCalledTimes(1);
});
it('does not prompt an installation that has already seen the chooser', async () => {
  const store = createAppearanceStore({ getItem: async () => JSON.stringify({ version: 1, themeId: 'green', chooserSeenVersion: 1 }), setItem: async () => {} }); await store.load();
  await render(<AppearanceProvider store={store}><AppearanceFirstUse eligible /></AppearanceProvider>);
  await act(() => jest.advanceTimersByTimeAsync(500)); expect(mockPresent).not.toHaveBeenCalled();
});

it('does not overwrite an unreadable saved preference by automatically saving a chooser default', async () => {
  const storage = { getItem: jest.fn().mockRejectedValue(new Error('disk')), setItem: jest.fn() };
  const store = createAppearanceStore(storage); await store.load();
  await render(<AppearanceProvider store={store}><AppearanceFirstUse eligible /></AppearanceProvider>);
  await act(() => jest.advanceTimersByTimeAsync(500));
  expect(mockPresent).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
});
