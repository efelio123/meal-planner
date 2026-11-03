import type { GetToken } from '@/lib/api';
import { parseWidgetStatus, unavailableWidgets, type NativeWidgetModule, type WidgetSettings, type WidgetStatus } from './native-adapter';

type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
export type WidgetScreenState = { enabled: boolean; busy: boolean; hydrated: boolean; error: string | null; native: WidgetStatus };
export const widgetPreferenceKey = (userId: string) => `meal-planner:widgets-enabled:${userId}`;

/** One app-side coordinator per signed-in scope. Native storage remains the outbox authority. */
export class WidgetController {
  private state: WidgetScreenState = { enabled: false, busy: false, hydrated: false, error: null, native: unavailableWidgets };
  private listeners = new Set<() => void>();
  private active = false;
  private epoch = 0;
  private loading: Promise<void> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private force = false;
  private widgetSettings: WidgetSettings | null = null;
  updateSettings(settings: WidgetSettings) { this.widgetSettings = settings; }
  constructor(readonly owner: string, readonly scope: string, readonly bridge: NativeWidgetModule | null,
    private readonly storage: Storage, private readonly getToken: GetToken, private readonly settings?: () => WidgetSettings) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(value: Partial<WidgetScreenState>) { this.state = { ...this.state, ...value }; for (const listener of this.listeners) listener(); }
  private current(epoch: number) { return this.active && this.epoch === epoch; }
  start() {
    this.active = true; const epoch = ++this.epoch;
    try { this.bridge?.activateScope(this.scope); if (this.bridge) this.publish({ native: parseWidgetStatus(this.bridge.status()) }); }
    catch { this.publish({ native: unavailableWidgets }); }
    this.loading = this.storage.getItem(widgetPreferenceKey(this.owner)).then(async value => {
      if (!this.current(epoch)) return;
      this.publish({ enabled: value === 'true', hydrated: true, error: null });
      if (value !== 'true' && this.bridge && this.state.native.enabled) {
        const result = await this.bridge.disable(this.scope);
        if (this.current(epoch)) this.publish({ native: parseWidgetStatus(result) });
      }
    }).catch(() => { if (this.current(epoch)) this.publish({ hydrated: true, error: 'Your widget preference could not be loaded. Try again.' }); });
    void this.loading.then(() => { if (this.current(epoch) && this.state.enabled) void this.request(); });
  }
  stop() { this.active = false; this.epoch++; }
  async setEnabled(enabled: boolean) {
    const epoch = this.epoch;
    if (!this.active || !this.bridge || !this.state.native.available) return;
    this.publish({ busy: true, error: null });
    try {
      if (!enabled) {
        // Honor local disable immediately even when preference persistence/network fails.
        const result = await this.bridge.disable(this.scope);
        if (!this.current(epoch)) return;
        this.publish({ enabled: false, native: parseWidgetStatus(result) });
      }
      await this.storage.setItem(widgetPreferenceKey(this.owner), String(enabled));
      if (!this.current(epoch)) return;
      this.publish({ enabled });
      if (enabled) await this.request(true);
    } catch { if (this.current(epoch)) this.publish({ error: 'Your widget preference could not be saved. Try again.' }); }
    finally { if (this.current(epoch)) this.publish({ busy: false }); }
  }
  request(force = false): Promise<void> {
    if (!this.active || !this.state.enabled || !this.bridge || !this.state.native.available || !this.state.hydrated) return Promise.resolve();
    this.force ||= force;
    if (this.running) { this.again = true; return this.running; }
    const epoch = this.epoch;
    this.running = this.run(epoch).finally(() => {
      this.running = null;
      if (this.again && this.active) { this.again = false; void this.request(); }
    });
    return this.running;
  }
  private async run(epoch: number) {
    const force = this.force; this.force = false;
    this.publish({ busy: true, error: null });
    try {
      if (!force && this.state.native.needsReconnect) return;
      const token = await this.getToken();
      if (!token || !this.current(epoch)) return;
      const settings = this.widgetSettings ?? this.settings?.();
      if (!settings || settings.scope !== this.scope) return;
      // Clerk authority is a transient native call argument, never serialized in metadata/props.
      const result = await this.bridge!.connect(JSON.stringify(settings), token, force);
      if (this.current(epoch)) this.publish({ native: parseWidgetStatus(result) });
    } catch { if (this.current(epoch)) this.publish({ error: 'Widgets could not refresh. Try again.' }); }
    finally { if (this.current(epoch)) this.publish({ busy: false }); }
  }
}
