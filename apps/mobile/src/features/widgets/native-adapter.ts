import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { ThemeTokens } from '@/constants/theme';

export type WidgetSettings = { scope: string; api_origin: string; user_id: string; household_id: string; week_start: number; theme: { light: ThemeTokens; dark: ThemeTokens } };
export type WidgetStatus = { available: boolean; enabled: boolean; needsReconnect: boolean; pending: number; state: string; lastSync: string | null };
export const unavailableWidgets: WidgetStatus = { available: false, enabled: false, needsReconnect: false, pending: 0, state: '', lastSync: null };
export type NativeWidgetModule = {
  verifySession: (session: string | null) => void;
  activateScope: (scope: string | null) => void;
  status: () => string;
  connect: (settings: string, token: string, force: boolean) => Promise<string>;
  refresh: () => Promise<string>;
  disable: (scope: string) => Promise<string>;
  requestPin?: () => boolean;
};
export function parseWidgetStatus(value: string): WidgetStatus {
  const state = JSON.parse(value);
  if (state?.available !== true) return unavailableWidgets;
  return { available: true, enabled: state.enabled === true, needsReconnect: state.needs_reconnect === true,
    pending: Number.isSafeInteger(state.pending_count) && state.pending_count >= 0 ? state.pending_count : 0,
    state: typeof state.state === 'string' ? state.state : '', lastSync: typeof state.snapshot?.generated_at === 'string' ? state.snapshot.generated_at : null };
}
export function nativeWidgets(): NativeWidgetModule | null {
  if (Platform.OS === 'web' || (Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) < 17)) return null;
  try {
    const module = requireOptionalNativeModule<NativeWidgetModule>('MealPlannerWidgets');
    return module && ['verifySession', 'activateScope', 'status', 'connect', 'refresh', 'disable'].every(key => typeof module[key as keyof NativeWidgetModule] === 'function') ? module : null;
  } catch { return null; }
}
export const widgetSessionKey = (api: string, user: string, session: string) => JSON.stringify([api, user, session]);
export const widgetScopeKey = (session: string, user: string, home: string) => `${session}|${JSON.stringify([user, home])}`;
