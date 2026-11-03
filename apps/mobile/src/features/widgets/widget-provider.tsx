import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { apiOrigin } from '@/auth-config';
import { DEFAULT_THEME_ID, ThemePalettes } from '@/constants/theme';
import { AppearanceContext } from '@/features/appearance/appearance-context';
import { usePlanningWeekday } from '@/features/meal-plan/use-planning-weekday';
import { useShoppingList } from '@/features/shopping-list/shopping-list-provider';
import { useHouseholdState } from '@/hooks/use-household-state';
import { onHouseholdAccessRefresh } from '@/lib/household-access-events';
import { subscribeCalendarRefresh } from '@/lib/calendar-refresh-events';
import { WidgetController } from './controller';
import { nativeWidgets, unavailableWidgets, widgetScopeKey, widgetSessionKey } from './native-adapter';

const Context = createContext<WidgetController | null>(null);
const bridge = nativeWidgets();
const empty = { enabled: false, busy: false, hydrated: true, error: null, native: unavailableWidgets };
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;
export function useWidgets() {
  const controller = useContext(Context);
  const state = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.snapshot ?? emptySnapshot, controller?.snapshot ?? emptySnapshot);
  return { controller, ...state };
}

/** Mounted outside loading/error navigation, so sign-out cannot leave a prior account's cache active. */
export function WidgetSessionFence() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const { destination, me, selectedHousehold } = useHouseholdState();
  const key = isLoaded ? isSignedIn && userId && sessionId ? widgetSessionKey(apiOrigin, userId, sessionId) : isSignedIn ? undefined : null : undefined;
  useLayoutEffect(() => { if (key !== undefined) { try { bridge?.verifySession(key); } catch { /* Older/missing native builds remain usable. */ } } }, [key]);
  // Preserve the last selected household during transient loading/offline errors,
  // but clear it when the app has confirmed there is no accessible selection.
  const scope = key && destination === 'app' && me?.user.id && selectedHousehold?.id
    ? widgetScopeKey(key, me.user.id, selectedHousehold.id)
    : key && ['create-or-join', 'select-household', 'complete-profile'].includes(destination) ? null : undefined;
  useLayoutEffect(() => { if (scope !== undefined) { try { bridge?.activateScope(scope); } catch { /* Native support is optional. */ } } }, [scope]);
  return null;
}
export function WidgetSyncProvider({ children }: PropsWithChildren) {
  const { userId, sessionId, isSignedIn } = useAuth();
  const { selectedHousehold, getToken, me, destination } = useHouseholdState();
  const { items } = useShoppingList();
  const appearance = useContext(AppearanceContext);
  const { weekday } = usePlanningWeekday(userId);
  const home = selectedHousehold?.id;
  const actor = me?.user.id;
  const scope = isSignedIn && userId && sessionId && home && actor && destination === 'app'
    ? widgetScopeKey(widgetSessionKey(apiOrigin, userId, sessionId), actor, home) : null;
  const theme = ThemePalettes[appearance?.themeId ?? DEFAULT_THEME_ID];
  const controller = useMemo(() => scope && userId && apiOrigin.startsWith('https://') ? new WidgetController(userId, scope, bridge, AsyncStorage, getToken) : null, [scope, userId, getToken]);
  useLayoutEffect(() => { controller?.updateSettings({ scope: scope ?? '', api_origin: apiOrigin, user_id: actor ?? '', household_id: home ?? '', week_start: weekday, theme }); }, [controller, scope, actor, home, weekday, theme]);
  useLayoutEffect(() => { controller?.start(); return () => controller?.stop(); }, [controller]);
  useEffect(() => { void controller?.request(); }, [controller, items, theme, weekday]);
  useEffect(() => {
    if (!controller) return;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void controller.request(); });
    const unsubscribe = subscribeCalendarRefresh(id => { if (id === home) void controller.request(); });
    const unsubscribeAccess = onHouseholdAccessRefresh(id => { if (id === home) void controller.request(); });
    return () => { subscription.remove(); unsubscribe(); unsubscribeAccess(); };
  }, [controller, home]);
  return <Context value={controller}>{children}</Context>;
}
