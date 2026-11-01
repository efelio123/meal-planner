import { Activity } from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { NativeSheetScreen } from './native-sheet-screen';

const mockRemove = jest.fn();
const mockCallbacks = new Set<() => void>();
const mockUnsubscribe = jest.fn();
const mockNavigation = {
  addListener: jest.fn((_event: string, callback: () => void) => {
    mockCallbacks.add(callback);
    return () => { mockUnsubscribe(); mockCallbacks.delete(callback); };
  }),
};
const mockEntry = { id: 'picker', scope: 'scope', content: <Text>Retained picker</Text>, detents: [0.5], initialDetent: 0 };
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ sheetId: 'picker' }), useRouter: () => ({ back: jest.fn() }), useNavigation: () => mockNavigation }));
jest.mock('./native-sheet-context', () => ({ useNativeSheetFlow: () => ({ get: () => mockEntry, remove: mockRemove }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ elevatedSurface: '#fff' }) }));

beforeEach(() => { jest.clearAllMocks(); mockCallbacks.clear(); });

it('retains one removal listener while covered and reconnecting, then cleans up the real removal', async () => {
  const view = await render(<Activity mode="visible"><NativeSheetScreen /></Activity>);
  expect(mockCallbacks.size).toBe(1);
  await view.rerender(<Activity mode="hidden"><NativeSheetScreen /></Activity>);
  expect(mockRemove).not.toHaveBeenCalled();
  expect(mockCallbacks.size).toBe(1);
  await view.rerender(<Activity mode="visible"><NativeSheetScreen /></Activity>);
  expect(mockCallbacks.size).toBe(1);
  await act(async () => { [...mockCallbacks].forEach((callback) => callback()); });
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(mockRemove).toHaveBeenCalledWith('picker');
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  expect(mockCallbacks.size).toBe(0);
});

it('cleans up a picker removed while hidden when Save dismisses both modal and picker', async () => {
  const view = await render(<Activity mode="visible"><NativeSheetScreen /></Activity>);
  await view.rerender(<Activity mode="hidden"><NativeSheetScreen /></Activity>);
  await act(async () => { [...mockCallbacks].forEach((callback) => callback()); });
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(mockRemove).toHaveBeenCalledWith('picker');
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  expect(mockCallbacks.size).toBe(0);
});
