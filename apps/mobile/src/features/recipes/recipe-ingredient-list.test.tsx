import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { RecipeIngredientList, type RecipeDragLock } from './recipe-ingredient-list';
import type { RecipeIngredientDraft } from './recipe-form-utils';

jest.mock('react-native-sortables', () => jest.requireActual('./testing/sortables-mock'));
jest.mock('react-native-worklets', () => ({ ...jest.requireActual('react-native-worklets/src/mock'), scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useManualGesture: (config: unknown) => config,
    GestureStateManager: { fail: jest.fn() },
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: React.ReactNode }) => React.createElement(View, { testID: 'touch-observer', ...{ gesture } }, children),
  };
});
const row: RecipeIngredientDraft = { key: 'one', catalogItemId: 'milk', catalogItemName: 'Milk', categoryEmoji: null, amount: '1/2', unitCode: 'cup', unitLabel: 'Cup', customUnitLabel: '', note: 'cold' };
const rows = [row, { ...row, key: 'two', amount: '' }];
function setup(ingredients = rows) {
  const onFinish = jest.fn(); const onStart = jest.fn(); const onEdit = jest.fn(); const onRemove = jest.fn(); const onMove = jest.fn().mockReturnValue(2);
  const dragBlocked = { value: { owner: 'test', blocked: false }, get() { return this.value; }, set(value: RecipeDragLock) { this.value = value; } } as ReturnType<typeof useSharedValue<RecipeDragLock>>;
  return { ingredients, interactionId: 'test', enabled: true, busy: false, scrollRef: { current: null } as never, dragBlocked, onFinish, onStart, onEdit, onRemove, onMove };
}

it('uses only a held handle, keeps a single-row handle disabled and preserves Edit/Remove', async () => {
  const props = setup([row]);
  await render(<RecipeIngredientList {...props} />);
  const grid = screen.getByTestId('recipe-sortable-grid');
  expect(grid.props.customHandle).toBe(true);
  expect(grid.props.dragActivationDelay).toBe(250);
  expect(grid.props.hapticsEnabled).toBe(false);
  expect(grid.props.scrollableRef).toBe(props.scrollRef);
  expect(screen.getByLabelText('Reorder Milk, position 1 of 1').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId('ingredient-drag-handle').props.mode).toBe('non-draggable');
  expect(screen.queryByText('Move up')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Reorder Milk, position 1 of 1'));
  expect(props.onStart).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Milk' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Milk from recipe' }));
  expect(props.onEdit).toHaveBeenCalledWith(row);
  expect(props.onRemove).toHaveBeenCalledWith('one');
});

it.each(['released', 'cancelled'] as const)('commits only a positively released gesture: %s', async (ending) => {
  const props = setup();
  await render(<RecipeIngredientList {...props} />);
  const observer = screen.getAllByTestId('touch-observer')[0].props.gesture;
  const grid = screen.getByTestId('recipe-sortable-grid');
  await act(async () => { observer.onTouchesDown(); grid.props.onDragStart({ key: 'one' }); });
  expect(props.onStart).toHaveBeenCalledTimes(1);
  expect(props.dragBlocked.value.blocked).toBe(true);
  await act(async () => {
    if (ending === 'released') observer.onTouchesUp({ handlerTag: 1 }); else observer.onTouchesCancel();
    grid.props.onActiveItemDropped({ key: 'one', indexToKey: ['two', 'one'] });
  });
  await waitFor(() => expect(props.onFinish).toHaveBeenCalledWith(['two', 'one'], ending === 'released'));
  expect(props.onEdit).not.toHaveBeenCalled(); expect(props.onRemove).not.toHaveBeenCalled();
});

it('offers nonvisual movement by position and announces a completed move', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const props = setup();
  await render(<RecipeIngredientList {...props} />);
  await fireEvent(screen.getByLabelText('Reorder Milk, position 1 of 2'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(props.onMove).toHaveBeenCalledWith('one', 1);
  expect(announce).toHaveBeenCalledWith('Milk, position 2 of 2');
  announce.mockRestore();
});

it('ignores a late activation from a previous editor interaction', async () => {
  const props = setup();
  await render(<RecipeIngredientList {...props} />);
  props.dragBlocked.set({ owner: 'a newer editor', blocked: false });
  await act(async () => { screen.getByTestId('recipe-sortable-grid').props.onDragStart({ key: 'one' }); });
  expect(props.onStart).not.toHaveBeenCalled();
  expect(props.dragBlocked.get()).toEqual({ owner: 'a newer editor', blocked: false });
});
