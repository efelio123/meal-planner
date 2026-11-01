import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useRecipeLeaveGuard } from './recipe-leave-guard';

// Keep native press dispatch out of stale-callback unit tests. Actual-router
// coverage below uses real Pressables and the real SDK removal guard.
jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  const mock = Object.create(Object.getPrototypeOf(Native), Object.getOwnPropertyDescriptors(Native));
  Object.defineProperty(mock, 'Pressable', { enumerable: true, configurable: true, value: (props: Record<string, unknown>) => React.createElement(Native.View, { accessible: true, ...props }) });
  return mock;
});
const mockDisable = jest.fn();
let mockProtected = false;
let mockBlocked: (event: { repeat: () => void }) => void;
jest.mock('expo-router', () => ({ usePreventRemove: (enabled: boolean, callback: typeof mockBlocked) => { mockProtected = enabled; mockBlocked = callback; return mockDisable; } }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ surface: '#fff', errorSurface: '#fee', error: '#f00', link: '#00f' }) }));
function Harness({ scope = 'home-a', enabled = true, saving = false, saveUnknown = false }) {
  const guard = useRecipeLeaveGuard({ scope, enabled, saving, saveUnknown });
  return <>{guard.confirmation}<Pressable accessibilityRole="button" accessibilityLabel="Successful save" onPress={guard.allowSavedExit}><Text>Saved</Text></Pressable></>;
}
beforeEach(() => { jest.clearAllMocks(); });

it('keeps editing, deduplicates repeated exits and continues only the first blocked action once', async () => {
  await render(<Harness />);
  const repeat = jest.fn(); const later = jest.fn();
  await act(async () => { mockBlocked({ repeat }); mockBlocked({ repeat: later }); });
  expect(screen.getAllByText('Discard recipe changes?')).toHaveLength(1);
  const staleDiscard = screen.getByRole('button', { name: 'Discard changes' }).props.onPress;
  await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  await act(async () => staleDiscard());
  expect(repeat).not.toHaveBeenCalled(); expect(mockProtected).toBe(true);
  await act(async () => mockBlocked({ repeat }));
  const discard = screen.getByRole('button', { name: 'Discard changes' }).props.onPress;
  await act(async () => { discard(); discard(); });
  expect(repeat).toHaveBeenCalledTimes(1); expect(later).not.toHaveBeenCalled(); expect(mockProtected).toBe(false);
});
it('does not offer to discard while a save is in flight, then keeps the draft protected on failure', async () => {
  const view = await render(<Harness saving />); const repeat = jest.fn();
  await act(async () => mockBlocked({ repeat }));
  expect(screen.getByText('Recipe is saving')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull();
  await view.rerender(<Harness saveUnknown />);
  expect(screen.getByText(/does not undo a save/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  expect(repeat).not.toHaveBeenCalled(); expect(mockProtected).toBe(true);
});
it('clears pending confirmation and disables prevention for a successful save', async () => {
  await render(<Harness />);
  await act(async () => mockBlocked({ repeat: jest.fn() }));
  await fireEvent.press(screen.getByRole('button', { name: 'Successful save' }));
  expect(mockDisable).toHaveBeenCalledTimes(1); expect(mockProtected).toBe(false);
  expect(screen.queryByText('Discard recipe changes?')).toBeNull();
});
it('ignores stale discard callbacks after changing scope or unmounting', async () => {
  const view = await render(<Harness />); const repeat = jest.fn();
  await act(async () => mockBlocked({ repeat }));
  const oldDiscard = screen.getByRole('button', { name: 'Discard changes' }).props.onPress;
  await view.rerender(<Harness scope="home-b" />);
  await act(async () => oldDiscard());
  expect(repeat).not.toHaveBeenCalled(); expect(screen.queryByText('Discard recipe changes?')).toBeNull();
  await act(async () => mockBlocked({ repeat }));
  const discard = screen.getByRole('button', { name: 'Discard changes' }).props.onPress;
  await view.unmount(); await act(async () => discard());
  expect(repeat).not.toHaveBeenCalled();
});
it('leaves blank or unchanged drafts unprotected', async () => {
  await render(<Harness enabled={false} />); expect(mockProtected).toBe(false);
});
