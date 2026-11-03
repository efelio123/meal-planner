import { WidgetController, widgetPreferenceKey } from './controller';
import { parseWidgetStatus, widgetScopeKey, widgetSessionKey, type NativeWidgetModule, type WidgetSettings } from './native-adapter';
import { ThemePalettes } from '@/constants/theme';

const nativeState = (extra: Record<string, unknown> = {}) => JSON.stringify({ available: true, enabled: true, pending_count: 0, ...extra });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function setup() {
  const session = widgetSessionKey('https://fixture.invalid', 'test-user', 'test-session');
  const scope = widgetScopeKey(session, 'local-test-user', 'test-home');
  const settings: WidgetSettings = { scope, api_origin: 'https://fixture.invalid', user_id: 'local-test-user', household_id: 'test-home', week_start: 1, theme: ThemePalettes.apricot };
  const bridge: NativeWidgetModule = { verifySession: jest.fn(), activateScope: jest.fn(), status: jest.fn(() => nativeState()), connect: jest.fn(async () => nativeState()), refresh: jest.fn(async () => nativeState()), disable: jest.fn(async () => nativeState({ enabled: false })) };
  const storage = { getItem: jest.fn(async () => 'true'), setItem: jest.fn(async () => undefined) };
  const token = jest.fn(async () => 'fictional-clerk-authority');
  const controller = new WidgetController('test-user', scope, bridge, storage, token, () => settings);
  return { controller, bridge, storage, token, settings, scope };
}
test('secure scope keys distinguish session, user, household and API', () => {
  const a = widgetSessionKey('https://one.invalid', 'user', 'session');
  expect(a).not.toEqual(widgetSessionKey('https://two.invalid', 'user', 'session'));
  expect(widgetScopeKey(a, 'local-user', 'one')).not.toEqual(widgetScopeKey(a, 'local-user', 'two'));
  expect(widgetSessionKey('https://one.invalid', 'user', 'new-session')).not.toEqual(a);
});
test('app authority is not serialized in native metadata', async () => {
  const d = setup(); d.controller.start(); await flush();
  expect(d.bridge.activateScope).toHaveBeenCalledWith(d.scope);
  expect(d.bridge.connect).toHaveBeenCalled();
  const [metadata, authority] = (d.bridge.connect as jest.Mock).mock.calls[0];
  expect(metadata).not.toContain(authority);
  expect(JSON.parse(metadata).theme).toEqual(ThemePalettes.apricot);
  expect(d.storage.getItem).toHaveBeenCalledWith(widgetPreferenceKey('test-user'));
  d.controller.stop();
});
test('sign-out during app authority acquisition prevents the native request', async () => {
  const d = setup(); const token = deferred<string>(); d.token.mockReturnValue(token.promise);
  d.controller.start(); await flush(); d.controller.stop();
  token.resolve('fictional-late-authority'); await flush();
  expect(d.bridge.connect).not.toHaveBeenCalled();
});
test('a late result cannot republish after scope disposal', async () => {
  const d = setup(); const result = deferred<string>(); (d.bridge.connect as jest.Mock).mockReturnValue(result.promise);
  d.controller.start(); await flush();
  const before = d.controller.snapshot(); d.controller.stop();
  result.resolve(nativeState({ pending_count: 19 })); await flush();
  expect(d.controller.snapshot()).toBe(before);
});
test('rapid app refreshes coalesce while preserving the final refresh', async () => {
  const d = setup(); const result = deferred<string>(); (d.bridge.connect as jest.Mock).mockReturnValueOnce(result.promise);
  d.controller.start(); await flush();
  void d.controller.request(); void d.controller.request(); void d.controller.request();
  result.resolve(nativeState()); await flush();
  expect(d.bridge.connect).toHaveBeenCalledTimes(2);
  d.controller.stop();
});
test('local disable is honored even if saving the preference fails', async () => {
  const d = setup(); d.controller.start(); await flush();
  d.storage.setItem.mockRejectedValueOnce(new Error('fictional storage failure'));
  await d.controller.setEnabled(false);
  expect(d.bridge.disable).toHaveBeenCalledWith(d.scope);
  expect(d.controller.snapshot().enabled).toBe(false);
  expect(d.controller.snapshot().error).toBeTruthy();
  d.controller.stop();
});
test('reconnect waits for explicit action rather than repeated refreshes', async () => {
  const d = setup(); (d.bridge.status as jest.Mock).mockReturnValue(nativeState({ needs_reconnect: true }));
  d.controller.start(); await flush(); await d.controller.request();
  expect(d.bridge.connect).not.toHaveBeenCalled();
  await d.controller.request(true);
  expect(d.bridge.connect).toHaveBeenCalledTimes(1);
  d.controller.stop();
});
test('no configured native module is an available app fallback', async () => {
  const d = setup(); const controller = new WidgetController('test-user', d.scope, null, d.storage, d.token, () => d.settings);
  controller.start(); await flush(); await controller.setEnabled(true);
  expect(controller.snapshot().native.available).toBe(false);
  expect(d.token).not.toHaveBeenCalled(); controller.stop();
});
test('native status exposes only whitelisted page fields', () => {
  const parsed = parseWidgetStatus(nativeState({ config: { generation: 'not-page-data' }, pending_count: 2, snapshot: { generated_at: '2026-11-02T00:00:00Z' } }));
  expect(parsed.pending).toBe(2); expect(parsed.lastSync).toBe('2026-11-02T00:00:00Z');
  expect(parsed).not.toHaveProperty('config'); expect(parseWidgetStatus('{}').available).toBe(false);
});
