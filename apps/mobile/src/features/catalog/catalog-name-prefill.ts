export type NamePrefillParams = {
  initialName?: string | string[];
  prefillScope?: string | string[];
};

export function namePrefillScope(userId: string | null | undefined, sessionId: string | null | undefined, householdId: string | null | undefined): string | null {
  return userId && sessionId && householdId ? JSON.stringify([userId, sessionId, householdId]) : null;
}

export function namePrefillParams(query: string, scope: string | null): { initialName?: string; prefillScope?: string } {
  const name = query.trim();
  return name && scope ? { initialName: name, prefillScope: scope } : {};
}

// Call only from a form's lazy state initializer. Later renders, choice loads
// and scope resets must use the user's draft (or clear it), never replay a seed.
export function initialCreateName(params: NamePrefillParams, scope: string | null, editing = false): string {
  return !editing && scope && typeof params.initialName === 'string' && typeof params.prefillScope === 'string' && params.prefillScope === scope
    ? params.initialName.trim() : '';
}
