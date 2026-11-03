import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { planningWeekdayKey, usePlanningWeekday } from './use-planning-weekday';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
beforeEach(() => { jest.clearAllMocks(); jest.mocked(AsyncStorage.getItem).mockResolvedValue(null); jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined); });
it('defaults invalid storage to Monday and scopes preferences to each user', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('not-a-weekday').mockResolvedValueOnce('0');
  const hook = await renderHook(({ user }: { user: string }) => usePlanningWeekday(user), { initialProps: { user: 'a' } });
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(planningWeekdayKey('a')));
  expect(hook.result.current.weekday).toBe(1);
  await hook.rerender({ user: 'b' });
  await waitFor(() => expect(hook.result.current.weekday).toBe(0));
  expect(AsyncStorage.getItem).toHaveBeenLastCalledWith(planningWeekdayKey('b'));
});
it('does not let late hydration overwrite a user gesture', async () => {
  const old = deferred<string | null>(); jest.mocked(AsyncStorage.getItem).mockReturnValueOnce(old.promise);
  const hook = await renderHook(() => usePlanningWeekday('a'));
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
  await act(async () => { hook.result.current.save(4); });
  await act(async () => { old.resolve('2'); await old.promise; });
  expect(hook.result.current.weekday).toBe(4);
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(planningWeekdayKey('a'), '4'));
});
it('ignores a previous user read and keeps an unsaved preference usable after storage failure', async () => {
  const old = deferred<string | null>(); jest.mocked(AsyncStorage.getItem).mockReturnValueOnce(old.promise).mockResolvedValueOnce('3');
  const hook = await renderHook(({ user }: { user: string }) => usePlanningWeekday(user), { initialProps: { user: 'a' } });
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1));
  await hook.rerender({ user: 'b' }); await waitFor(() => expect(hook.result.current.weekday).toBe(3));
  await act(async () => { old.resolve('6'); await old.promise; }); expect(hook.result.current.weekday).toBe(3);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage full'));
  await act(async () => { hook.result.current.save(5); });
  await waitFor(() => expect(hook.result.current.error).toContain('could not be saved'));
  expect(hook.result.current.weekday).toBe(5);
});
it('orders rapid preference writes so the final weekday wins', async () => {
  const first = deferred<void>(); jest.mocked(AsyncStorage.setItem).mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
  const hook = await renderHook(() => usePlanningWeekday('a'));
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
  await act(async () => { hook.result.current.save(4); hook.result.current.save(5); });
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  await act(async () => { first.resolve(); await first.promise; });
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2));
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(planningWeekdayKey('a'), '5');
});

it('publishes changes to another mounted owner and rejects its late hydration', async () => {
  const old = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('1').mockReturnValueOnce(old.promise);
  const plan = await renderHook(() => usePlanningWeekday('shared-user'));
  const widget = await renderHook(() => usePlanningWeekday('shared-user'));
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledTimes(2));
  await act(async () => { plan.result.current.save(6); });
  expect(widget.result.current.weekday).toBe(6);
  await act(async () => { old.resolve('1'); await old.promise; });
  expect(widget.result.current.weekday).toBe(6);
});
