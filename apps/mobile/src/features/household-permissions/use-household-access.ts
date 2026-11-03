import { useCallback, useLayoutEffect, useRef } from 'react';
import { useHouseholdState } from '@/hooks/use-household-state';
import { permits, type PermissionAction } from '@/lib/household-permissions';
export function useHouseholdAccess(householdId?: string | null) {
  const state = useHouseholdState();
  const household = householdId === undefined ? state.selectedHousehold : state.households?.find((home) => home.id === householdId) ?? (state.selectedHousehold?.id === householdId ? state.selectedHousehold : null);
  const can = useCallback((action: PermissionAction) => permits(household, action), [household]);
  const live = useRef(can); useLayoutEffect(() => { live.current = can; }, [can]);
  const canNow = useCallback((action: PermissionAction) => live.current(action), []);
  return { can, canNow, household, known: Boolean(household && (household.role === 'owner' || Array.isArray(household.permissions))) };
}
