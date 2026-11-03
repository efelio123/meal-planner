const listeners = new Set<(userId: string, weekday: number) => void>();
export function notifyWidgetRefresh(userId: string, weekday: number) { for (const listener of listeners) listener(userId, weekday); }
export function subscribeWidgetRefresh(listener: (userId: string, weekday: number) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
