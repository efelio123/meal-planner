type Listener = (householdId: string) => void;
const listeners = new Set<Listener>();
export function onHouseholdAccessRefresh(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function notifyHouseholdAccessRefresh(householdId: string) { for (const listener of listeners) listener(householdId); }
