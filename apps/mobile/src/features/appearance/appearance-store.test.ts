import { APPEARANCE_KEY, CHOOSER_VERSION, createAppearanceStore, parseAppearance } from './appearance-store';
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const record = (themeId = 'green', chooserSeenVersion = 1) => JSON.stringify({ version: 1, themeId, chooserSeenVersion });
function setup(value: string | null = null) {
  const storage = { getItem: jest.fn().mockResolvedValue(value), setItem: jest.fn().mockResolvedValue(undefined) };
  return { storage, store: createAppearanceStore(storage) };
}
it.each([null, 'invalid', '{}', record('unknown'), JSON.stringify({ version: 1, themeId: 'green', chooserSeenVersion: -1 })])('defaults invalid/missing preference %s to the main app theme', (value) => {
  expect(parseAppearance(value)).toEqual({ version: 1, themeId: 'apricot', chooserSeenVersion: 0 });
});
it('hydrates a saved preference once and survives a fresh store without account or household keys', async () => {
  const { storage, store } = setup(record()); await store.load(); await store.load();
  expect(storage.getItem).toHaveBeenCalledTimes(1); expect(store.getSnapshot()).toMatchObject({ themeId: 'green', hydrated: true, chooserSeenVersion: 1 });
  await store.chooseTheme('apricot');
  storage.getItem.mockResolvedValue(storage.setItem.mock.calls.at(-1)?.[1]);
  const restarted = createAppearanceStore(storage); await restarted.load();
  expect(restarted.getSnapshot().themeId).toBe('apricot');
  expect(storage.setItem).toHaveBeenCalledWith(APPEARANCE_KEY, record('apricot'));
});
it('serializes rapid selections and persists the latest choice last', async () => {
  const { storage, store } = setup(); await store.load(); const first = deferred<void>();
  storage.setItem.mockImplementationOnce(() => first.promise);
  const a = store.chooseTheme('apricot'); const b = store.chooseTheme('green');
  expect(store.getSnapshot().themeId).toBe('green'); await Promise.resolve(); expect(storage.setItem).toHaveBeenCalledTimes(1);
  first.resolve(); await Promise.all([a, b]);
  expect(storage.setItem.mock.calls.map((call) => JSON.parse(call[1]).themeId)).toEqual(['apricot', 'green']);
  expect(store.getSnapshot()).toMatchObject({ themeId: 'green', saving: false, error: null });
});
it('reconciles a failed latest write to the previous confirmed choice and supports retry', async () => {
  const { storage, store } = setup(); await store.load();
  await store.chooseTheme('apricot'); storage.setItem.mockRejectedValueOnce(new Error('disk'));
  await store.chooseTheme('green'); expect(store.getSnapshot()).toMatchObject({ themeId: 'apricot', saving: false });
  expect(store.getSnapshot().error).toContain('couldn’t save'); await store.retry();
  expect(store.getSnapshot()).toMatchObject({ themeId: 'green', error: null });
});
it('an earlier failed write cannot roll back a newer successful selection', async () => {
  const { storage, store } = setup(); await store.load(); storage.setItem.mockRejectedValueOnce(new Error('disk'));
  await Promise.all([store.chooseTheme('apricot'), store.chooseTheme('green')]);
  expect(store.getSnapshot()).toMatchObject({ themeId: 'green', error: null });
});
it('keeps the chooser seen for this session if saving its version fails', async () => {
  const { storage, store } = setup(); await store.load(); storage.setItem.mockRejectedValueOnce(new Error('disk'));
  await store.markChooserPresented(); await store.markChooserPresented();
  expect(store.getSnapshot().chooserSeenVersion).toBe(CHOOSER_VERSION); expect(storage.setItem).toHaveBeenCalledTimes(1);
  await store.chooseTheme('green'); expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1])).toMatchObject({ themeId: 'green', chooserSeenVersion: 1 });
});
it('read failures allow the safe main appearance and an explicit retry', async () => {
  const { storage, store } = setup(record('green')); storage.getItem.mockRejectedValueOnce(new Error('disk'));
  await store.load(); expect(store.getSnapshot()).toMatchObject({ hydrated: true, themeId: 'apricot' });
  await store.retry(); expect(store.getSnapshot()).toMatchObject({ themeId: 'green', error: null });
});
it('a hung read times out and its late result cannot overwrite a newer selection', async () => {
  jest.useFakeTimers();
  try {
    const read = deferred<string | null>(); const storage = { getItem: () => read.promise, setItem: jest.fn().mockResolvedValue(undefined) };
    const store = createAppearanceStore(storage, 50); const loading = store.load();
    await jest.advanceTimersByTimeAsync(51); await loading;
    expect(store.getSnapshot()).toMatchObject({ hydrated: true, themeId: 'apricot' });
    await store.chooseTheme('green'); read.resolve(record('apricot')); await Promise.resolve();
    expect(store.getSnapshot().themeId).toBe('green');
  } finally { jest.useRealTimers(); }
});
it('ignores a retry read overtaken by an explicit selection', async () => {
  const { storage, store } = setup(); storage.getItem.mockRejectedValueOnce(new Error('disk')); await store.load();
  const read = deferred<string | null>(); storage.getItem.mockImplementationOnce(() => read.promise); const retry = store.retry();
  await store.chooseTheme('green'); read.resolve(record('apricot')); await retry;
  expect(store.getSnapshot().themeId).toBe('green');
});

it('preserves an explicitly saved Phone theme instead of replacing it with the new default', async () => {
  const { store } = setup(record('system')); await store.load();
  expect(store.getSnapshot()).toMatchObject({ themeId: 'system', hydrated: true, chooserSeenVersion: 1 });
});
