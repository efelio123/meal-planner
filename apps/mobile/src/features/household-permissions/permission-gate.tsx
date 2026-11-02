import type { ReactNode } from 'react';
import type { PermissionAction } from '@/lib/household-permissions';
import { useHouseholdAccess } from './use-household-access';
export function PermissionGate({ action, householdId, children }: { action: PermissionAction; householdId?: string | null; children: ReactNode }) {
  const { can } = useHouseholdAccess(householdId); return can(action) ? <>{children}</> : null;
}
