import { isThemeId, type ThemeId } from '@/constants/theme';

export const APPEARANCE_KEY = 'meal-planner:appearance:v1';
export const CHOOSER_VERSION = 1;
export type AppearanceRecord = { version: 1; themeId: ThemeId; chooserSeenVersion: number };
export type AppearanceSnapshot = AppearanceRecord & { hydrated: boolean; saving: boolean; error: string | null };
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
const initial: AppearanceRecord = { version: 1, themeId: 'system', chooserSeenVersion: 0 };
export function parseAppearance(value: string | null): AppearanceRecord {
  try {
    const record = JSON.parse(value ?? 'null');
    if (record?.version === 1 && isThemeId(record.themeId) && Number.isInteger(record.chooserSeenVersion) && record.chooserSeenVersion >= 0) return { version: 1, themeId: record.themeId, chooserSeenVersion: record.chooserSeenVersion };
  } catch { /* Missing/invalid preferences retain the phone theme. */ }
  return { ...initial };
}

/** Installation-local; independent of accounts, households and navigation. */
export function createAppearanceStore(storage: Storage, readTimeoutMs = 2000) {
  let snapshot: AppearanceSnapshot = { ...initial, hydrated: false, saving: false, error: null };
  let confirmed = { ...initial };
  let loadPromise: Promise<void> | undefined;
  let queue = Promise.resolve(); let sequence = 0;
  let retryRecord: AppearanceRecord | null = null;
  let readFailed = false;
  const listeners = new Set<() => void>();
  const publish = (next: Partial<AppearanceSnapshot>) => { snapshot = { ...snapshot, ...next }; listeners.forEach((listener) => listener()); };
  const load = (retry = false): Promise<void> => {
    if (loadPromise && !retry) return loadPromise;
    const epoch = sequence;
    loadPromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const value = await Promise.race([storage.getItem(APPEARANCE_KEY), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('storage timeout')), readTimeoutMs); })]);
        if (sequence !== epoch) return;
        confirmed = parseAppearance(value); readFailed = false;
        publish({ ...confirmed, hydrated: true, error: null });
      } catch {
        if (sequence === epoch) { readFailed = true; publish({ hydrated: true, error: 'We couldn’t load your appearance. You can retry or choose a theme.' }); }
      } finally { if (timer) clearTimeout(timer); }
    })();
    return loadPromise;
  };
  const persist = (desired: AppearanceRecord): Promise<void> => {
    const epoch = ++sequence; retryRecord = null; readFailed = false;
    publish({ ...desired, saving: true, error: null });
    queue = queue.then(async () => {
      try {
        await storage.setItem(APPEARANCE_KEY, JSON.stringify(desired)); confirmed = desired;
        if (sequence === epoch) publish({ saving: false, error: null });
      } catch {
        if (sequence === epoch) {
          retryRecord = desired;
          publish({ themeId: confirmed.themeId, saving: false, error: 'We couldn’t save your appearance. Your previous theme is still selected.' });
        }
      }
    });
    return queue;
  };
  const chooseTheme = (themeId: ThemeId) => persist({ version: 1, themeId, chooserSeenVersion: snapshot.chooserSeenVersion });
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    chooseTheme,
    markChooserPresented: () => {
      if (!snapshot.hydrated || snapshot.chooserSeenVersion >= CHOOSER_VERSION) return Promise.resolve();
      return persist({ version: 1, themeId: snapshot.themeId, chooserSeenVersion: CHOOSER_VERSION });
    },
    retry: () => readFailed ? load(true) : retryRecord ? persist({ ...retryRecord, chooserSeenVersion: snapshot.chooserSeenVersion }) : Promise.resolve(),
  };
}
export type AppearanceStore = ReturnType<typeof createAppearanceStore>;
