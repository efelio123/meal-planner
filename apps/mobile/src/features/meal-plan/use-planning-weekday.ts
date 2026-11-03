import { notifyWidgetRefresh, subscribeWidgetRefresh } from '@/lib/widget-refresh-events';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// A module queue orders writes even if one Plan owner unmounts and another mounts.
let preferenceWrites: Promise<unknown> = Promise.resolve();
export const planningWeekdayKey = (userId: string) => `meal-planner:planning-weekday:${userId}`;
export function usePlanningWeekday(userId: string | null | undefined) {
  const [stored, setStored] = useState({ userId, weekday: 1, error: null as string | null });
  const owner = useRef(userId);
  const generation = useRef(0);
  useLayoutEffect(() => { owner.current = userId; generation.current += 1; }, [userId]);
  useLayoutEffect(() => subscribeWidgetRefresh((id, weekday) => {
    if (id !== userId || owner.current !== id) return;
    generation.current += 1;
    setStored({ userId: id, weekday, error: null });
  }), [userId]);
  useEffect(() => {
    const version = generation.current;
    if (!userId) return;
    let active = true;
    void preferenceWrites.then(() => AsyncStorage.getItem(planningWeekdayKey(userId))).then((value) => {
      if (!active || owner.current !== userId || generation.current !== version) return;
      const valid = value !== null && /^[0-6]$/u.test(value);
      setStored({ userId, weekday: valid ? Number(value) : 1, error: null });
    }).catch(() => {
      if (active && owner.current === userId && generation.current === version) {
        setStored({ userId, weekday: 1, error: 'Your saved starting day could not be loaded. Using Monday.' });
      }
    });
    return () => { active = false; };
  }, [userId]);
  const save = useCallback((weekday: number) => {
    if (!userId || owner.current !== userId) return;
    notifyWidgetRefresh(userId, weekday);
    const version = generation.current;
    const write = preferenceWrites.catch(() => undefined).then(() => AsyncStorage.setItem(planningWeekdayKey(userId), String(weekday)));
    preferenceWrites = write.catch(() => undefined);
    void write.catch(() => {
      if (owner.current === userId && generation.current === version) {
        setStored({ userId, weekday, error: 'Your starting day could not be saved. You can still use these dates.' });
      }
    });
  }, [userId]);
  return { weekday: stored.userId === userId ? stored.weekday : 1, error: stored.userId === userId ? stored.error : null, save };
}
