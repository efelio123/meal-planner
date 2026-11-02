import { useAuth } from '@clerk/expo';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useHouseholdState } from '@/hooks/use-household-state';
import { subscribeCalendarRefresh } from '@/lib/calendar-refresh-events';
import { CalendarController } from './controller';

const CalendarContext = createContext<CalendarController | null>(null);
export const useCalendarController = () => useContext(CalendarContext);
export function CalendarSyncProvider({ children }: PropsWithChildren) {
  const { userId, sessionId, isSignedIn } = useAuth();
  const { selectedHousehold, getToken, me, destination } = useHouseholdState();
  const home = selectedHousehold?.id; const actor = me?.user.id;
  const scope = isSignedIn && destination === 'app' && actor && home ? `${userId}:${sessionId}:${actor}:${home}` : null;
  const controller = useMemo(() => scope && actor && home ? new CalendarController(actor, home,
    getToken, () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive') : null, [scope, actor, home, getToken]);
  // Commit cleanup invalidates outgoing work before a new account/household can
  // obtain authority. Start is repeatable for React's development effect replay.
  useLayoutEffect(() => { controller?.start(); return () => controller?.stop(); }, [controller]);
  useEffect(() => {
    if (!controller || !home || !controller.adapter.available()) return;
    controller.requestSync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') controller.requestSync(); });
    const unsubscribe = subscribeCalendarRefresh((id) => { if (id === home) controller.requestSync(); });
    return () => { subscription.remove(); unsubscribe(); };
  }, [controller, home]);
  return <CalendarContext value={controller}>{children}</CalendarContext>;
}
