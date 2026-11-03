const listeners = new Set<(householdId: string) => void>();
export function notifyCalendarRefresh(householdId: string) { for (const listener of listeners) listener(householdId); }
export function subscribeCalendarRefresh(listener: (householdId: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
