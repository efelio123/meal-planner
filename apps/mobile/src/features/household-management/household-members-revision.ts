type Scope = {
  householdId: string;
  sessionId: string | null;
  userId: string | null;
};

const revisions = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

function scopeKey({ householdId, sessionId, userId }: Scope) {
  return JSON.stringify([userId, sessionId, householdId]);
}

export function householdMembersRevision(scope: Scope) {
  return revisions.get(scopeKey(scope)) ?? 0;
}

export function subscribeToHouseholdMembers(scope: Scope, listener: () => void) {
  const key = scopeKey(scope);
  const scopedListeners = listeners.get(key) ?? new Set<() => void>();
  scopedListeners.add(listener);
  listeners.set(key, scopedListeners);
  return () => {
    scopedListeners.delete(listener);
    if (scopedListeners.size === 0) listeners.delete(key);
  };
}

/** Notify only the matching household/session that an authoritative People reload is needed. */
export function markHouseholdMembersChanged(scope: Scope) {
  const key = scopeKey(scope);
  revisions.set(key, householdMembersRevision(scope) + 1);
  listeners.get(key)?.forEach((listener) => listener());
}
