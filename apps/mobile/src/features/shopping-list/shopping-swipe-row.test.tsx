import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ShoppingSwipeRow } from './shopping-swipe-row';
import { SHOPPING_REVEAL_WIDTH } from './shopping-swipe-logic';

const mockPanCallbacks: { begin?: () => void; start?: () => void; update?: (event: { translationX: number }) => void; end?: () => void; finalize?: (_event: unknown, completed: boolean) => void } = {};
const mockSpringValues: number[] = [];
jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled() { return this; }, activeOffsetX() { return this; }, failOffsetY() { return this; }, onBegin(callback: () => void) { mockPanCallbacks.begin = callback; return this; }, onStart(callback: () => void) { mockPanCallbacks.start = callback; return this; }, onUpdate(callback: (event: { translationX: number }) => void) { mockPanCallbacks.update = callback; return this; }, onEnd(callback: () => void) { mockPanCallbacks.end = callback; return this; }, onFinalize(callback: (_event: unknown, completed: boolean) => void) { mockPanCallbacks.finalize = callback; return this; } };
  return { Gesture: { Pan: () => pan }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: (style: () => object) => style(),
    withSpring: (value: number) => { mockSpringValues.push(value); return value; },
    withTiming: (value: number) => value,
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

describe('Shopping swipe row', () => {
  it('does not suppress rapid checkbox taps when the pan never activates', async () => {
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
    await render(<ShoppingSwipeRow active={false} enabled itemId="milk" itemName="Milk" separatorColor={null} {...callbacks}><Text>Milk</Text></ShoppingSwipeRow>);

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
    await render(<ShoppingSwipeRow active={false} enabled itemId="milk" itemName="Milk" separatorColor={null} {...callbacks}><Text>Milk</Text></ShoppingSwipeRow>);
    fireEvent(screen.getByTestId('shopping-swipe-milk'), 'layout', { nativeEvent: { layout: { width: 340 } } });
    mockSpringValues.length = 0;

    mockPanCallbacks.begin?.();
    mockPanCallbacks.start?.();
    mockPanCallbacks.update?.({ translationX: -90 });
    mockPanCallbacks.end?.();
    mockPanCallbacks.finalize?.({}, false);

    expect(callbacks.onReveal).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(mockSpringValues.at(-1)).toBe(-SHOPPING_REVEAL_WIDTH);
  });

  it('keeps the resting row content visible and hides Delete from accessibility until revealed', async () => {
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
    const view = await render(<ShoppingSwipeRow active={false} enabled itemId="milk" itemName="Milk" separatorColor={null} {...callbacks}><Text>Milk</Text></ShoppingSwipeRow>);
    expect(screen.getByText('Milk')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Milk from Shopping' })).toBeNull();

    await act(async () => view.rerender(<ShoppingSwipeRow active enabled itemId="milk" itemName="Milk" separatorColor={null} {...callbacks}><Text>Milk</Text></ShoppingSwipeRow>));
    expect(screen.getByRole('button', { name: 'Remove Milk from Shopping' })).toBeTruthy();
  });

  it('allows a retry if removing the row fails', async () => {
    const onRemove = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove, onReveal: jest.fn() };
    await render(<ShoppingSwipeRow active enabled itemId="milk" itemName="Milk" separatorColor={null} {...callbacks}><Text>Milk</Text></ShoppingSwipeRow>);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Remove Milk from Shopping' })));
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByRole('button', { name: 'Remove Milk from Shopping' }));
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it('draws an interior separator outside the moving row only when needed', async () => {
    const callbacks = { onClose: jest.fn(), onDragEnd: jest.fn(), onDragStart: jest.fn(), onRemove: jest.fn(), onReveal: jest.fn() };
    const view = await render(<ShoppingSwipeRow active enabled itemId="milk" itemName="Milk" separatorColor="#888888" {...callbacks}><Text>Milk</Text></ShoppingSwipeRow>);
    expect(screen.getByTestId('shopping-separator-milk').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#888888' })]));

    await act(async () => view.rerender(<ShoppingSwipeRow active enabled itemId="milk" itemName="Milk" separatorColor={null} {...callbacks}><Text>Milk</Text></ShoppingSwipeRow>));
    expect(screen.queryByTestId('shopping-separator-milk')).toBeNull();
  });
});
