import { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useHouseholdState } from '@/hooks/use-household-state';
import { onHouseholdAccessRefresh } from '@/lib/household-access-events';
export function HouseholdAccessRefresh() {
  const { selectedHousehold, households, refreshAccess } = useHouseholdState();
  const path = usePathname(); const target = path.match(/\/my-households\/([^/]+)/u)?.[1] ?? selectedHousehold?.id;
  const allowed = households?.some((home) => home.id === target);
  useEffect(() => {
    if (!target || !allowed || !refreshAccess) return;
    const timer = setTimeout(() => { void refreshAccess(target); }, 0);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refreshAccess(target); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [allowed, path, refreshAccess, target]);
  useEffect(() => onHouseholdAccessRefresh((id) => { if (households?.some((home) => home.id === id)) void refreshAccess?.(id); }), [households, refreshAccess]);
  return null;
}
