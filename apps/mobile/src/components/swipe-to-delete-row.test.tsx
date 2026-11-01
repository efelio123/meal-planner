import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SwipeToDeleteRow } from './swipe-to-delete-row';
import { SWIPE_REVEAL_WIDTH } from './swipe-to-delete-logic';

const mockPanCallbacks: { begin?: () => void; start?: () => void; update?: (event: { translationX: number }) => void; end?: () => void; finalize?: (_event: unknown, completed: boolean) => void } = {};
const mockSpringValues: number[] = [];
const mockTimingCallbacks: ((finished: boolean) => void)[] = [];
jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled() { return this; }, activeOffsetX() { return this; }, failOffsetY() { return this; }, onBegin(callback: () => void) { mockPanCallbacks.begin = callback; return this; }, onStart(callback: () => void) { mockPanCallbacks.start = callback; return this; }, onUpdate(callback: (event: { translationX: number }) => void) { mockPanCallbacks.update = callback; return this; }, onEnd(callback: () => void) { mockPanCallbacks.end = callback; return this; }, onFinalize(callback: (_event: unknown, completed: boolean) => void) { mockPanCallbacks.finalize = callback; return this; } };
  return { Gesture: { Pan: () => pan }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: number) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    withSpring: (value: number) => { mockSpringValues.push(value); return value; },
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => { if (callback) mockTimingCallbacks.push(callback); return value; },
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

describe('shared swipe-to-delete row', () => {
  it('does not suppress rapid checkbox taps when the pan never activates', async () => {
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
    await render(<SwipeToDeleteRow active={false} enabled rowId="milk" removeAccessibilityLabel="Remove Milk from Shopping" testID="shopping-swipe-milk" separatorTestID="shopping-separator-milk" separatorColor={null} {...callbacks}><Text>Milk</Text></SwipeToDeleteRow>);

    mockPanCallbacks.finalize?.({}, false);
    mockPanCallbacks.finalize?.({}, false);
    expect(callbacks.onDragStart).not.toHaveBeenCalled();
    expect(callbacks.onDragEnd).not.toHaveBeenCalled();

    mockPanCallbacks.start?.();
    mockPanCallbacks.end?.();
    mockPanCallbacks.finalize?.({}, true);
    expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onDragEnd).toHaveBeenCalledTimes(1);
  });

  it('keeps Delete revealed after an activated pan finalizes as cancelled', async () => {
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
    await render(<SwipeToDeleteRow active={false} enabled rowId="milk" removeAccessibilityLabel="Remove Milk from Shopping" testID="shopping-swipe-milk" separatorTestID="shopping-separator-milk" separatorColor={null} {...callbacks}><Text>Milk</Text></SwipeToDeleteRow>);
    fireEvent(screen.getByTestId('shopping-swipe-milk'), 'layout', { nativeEvent: { layout: { width: 340 } } });
    mockSpringValues.length = 0;

    mockPanCallbacks.begin?.();
    mockPanCallbacks.start?.();
    mockPanCallbacks.update?.({ translationX: -90 });
    mockPanCallbacks.end?.();
    mockPanCallbacks.finalize?.({}, false);

    expect(callbacks.onReveal).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(mockSpringValues.at(-1)).toBe(-SWIPE_REVEAL_WIDTH);
  });

  it('keeps the resting row content visible and hides Delete from accessibility until revealed', async () => {
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
    const view = await render(<SwipeToDeleteRow active={false} enabled rowId="milk" removeAccessibilityLabel="Remove Milk from Shopping" testID="shopping-swipe-milk" separatorTestID="shopping-separator-milk" separatorColor={null} {...callbacks}><Text>Milk</Text></SwipeToDeleteRow>);
    expect(screen.getByText('Milk')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Milk from Shopping' })).toBeNull();

    await act(async () => view.rerender(<SwipeToDeleteRow active enabled rowId="milk" removeAccessibilityLabel="Remove Milk from Shopping" testID="shopping-swipe-milk" separatorTestID="shopping-separator-milk" separatorColor={null} {...callbacks}><Text>Milk</Text></SwipeToDeleteRow>));
    expect(screen.getByRole('button', { name: 'Remove Milk from Shopping' })).toBeTruthy();
  });

  it('allows a retry if removing the row fails', async () => {
    const onRemove = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove, onReveal: jest.fn() };
    await render(<SwipeToDeleteRow active enabled rowId="milk" removeAccessibilityLabel="Remove Milk from Shopping" testID="shopping-swipe-milk" separatorTestID="shopping-separator-milk" separatorColor={null} {...callbacks}><Text>Milk</Text></SwipeToDeleteRow>);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Remove Milk from Shopping' })));
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByRole('button', { name: 'Remove Milk from Shopping' }));
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it('draws an interior separator outside the moving row only when needed', async () => {
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
    const view = await render(<SwipeToDeleteRow active enabled rowId="milk" removeAccessibilityLabel="Remove Milk from Shopping" testID="shopping-swipe-milk" separatorTestID="shopping-separator-milk" separatorColor="#888888" {...callbacks}><Text>Milk</Text></SwipeToDeleteRow>);
    expect(screen.getByTestId('shopping-separator-milk').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#888888' })]));

    await act(async () => view.rerender(<SwipeToDeleteRow active enabled rowId="milk" removeAccessibilityLabel="Remove Milk from Shopping" testID="shopping-swipe-milk" separatorTestID="shopping-separator-milk" separatorColor={null} {...callbacks}><Text>Milk</Text></SwipeToDeleteRow>));
    expect(screen.queryByTestId('shopping-separator-milk')).toBeNull();
  });
});

it('finishes press suppression after an activated cancellation, with no removal or reveal', async () => {
  const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
  await render(<SwipeToDeleteRow active={false} enabled rowId="meal" removeAccessibilityLabel="Remove meal" {...callbacks}><Text>Meal</Text></SwipeToDeleteRow>);
  mockPanCallbacks.begin?.(); mockPanCallbacks.start?.(); mockPanCallbacks.finalize?.({}, false);
  expect(callbacks.onDragEnd).toHaveBeenCalledTimes(1);
  expect(callbacks.onRemove).not.toHaveBeenCalled();
  expect(callbacks.onReveal).not.toHaveBeenCalled();
});
it('continues a revealed swipe to full deletion and removes only once', async () => {
  const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn().mockResolvedValue(undefined), onReveal: jest.fn() };
  const view = await render(<SwipeToDeleteRow active={false} enabled rowId="meal" removeAccessibilityLabel="Remove meal" {...callbacks}><Text>Meal</Text></SwipeToDeleteRow>);
  await fireEvent(screen.getByTestId('swipe-meal'), 'layout', { nativeEvent: { layout: { width: 340 } } });
  mockPanCallbacks.begin?.(); mockPanCallbacks.start?.(); mockPanCallbacks.update?.({ translationX: -76 }); mockPanCallbacks.end?.(); mockPanCallbacks.finalize?.({}, true);
  expect(callbacks.onReveal).toHaveBeenCalledTimes(1);
  await view.rerender(<SwipeToDeleteRow active enabled rowId="meal" removeAccessibilityLabel="Remove meal" {...callbacks}><Text>Meal</Text></SwipeToDeleteRow>);
  mockTimingCallbacks.length = 0;
  mockPanCallbacks.begin?.(); mockPanCallbacks.start?.(); mockPanCallbacks.update?.({ translationX: -145 }); mockPanCallbacks.end?.(); mockPanCallbacks.finalize?.({}, true);
  expect(callbacks.onRemove).not.toHaveBeenCalled();
  await act(async () => { mockTimingCallbacks[0](true); mockTimingCallbacks[0](true); });
  expect(callbacks.onRemove).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Remove meal' }));
  expect(callbacks.onRemove).toHaveBeenCalledTimes(1);
});
it('does not remove from a disabled action and keeps a card frame outside moving content', async () => {
  const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
  await render(<SwipeToDeleteRow active enabled={false} rowId="meal" removeAccessibilityLabel="Remove meal" containerStyle={{ borderWidth: 1, borderRadius: 16 }} {...callbacks}><Text>Meal</Text></SwipeToDeleteRow>);
  await fireEvent.press(screen.getByRole('button', { name: 'Remove meal' }));
  expect(callbacks.onRemove).not.toHaveBeenCalled();
  expect(screen.getByTestId('swipe-meal').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ borderWidth: 1, borderRadius: 16 })]));
});
