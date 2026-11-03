import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, useClerk } from '@clerk/expo';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ApiError, api, type Household, type Me } from '@/lib/api';
import { getStartupDiagnostics } from '@/lib/startup-diagnostics';

const SELECTED_HOUSEHOLD_KEY = 'meal-planner:selected-household-id';
export type AppDestination = 'loading' | 'signed-out' | 'api-error' | 'complete-profile' | 'create-or-join' | 'select-household' | 'app';
export type HouseholdSelectionResult =
  | { status: 'selected'; household: Household }
  | { status: 'cancelled'; reason: 'signed-out' | 'signing-out' | 'busy' | 'refreshing' | 'not-a-member' | 'stale' }
  | { status: 'failed'; reason: 'storage' };

type HouseholdState = ReturnType<typeof useHouseholdStateValue>;
const HouseholdStateContext = createContext<HouseholdState | null>(null);

function useHouseholdStateValue() {
  const { getToken, isLoaded, isSignedIn, sessionId, userId } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const latestGetToken = useRef(getToken);
  const refreshVersion = useRef(0);
  const sessionIdentity = JSON.stringify([isSignedIn, userId ?? null, sessionId ?? null]);
  const sessionIdentityRef = useRef(sessionIdentity);
  const validatedSessionIdentity = useRef<string | null>(null);
  const sessionIsSignedIn = useRef(isSignedIn);
  const signOutStarted = useRef(false);
  const refreshInFlight = useRef<number | null>(null);
  const switchInFlight = useRef(false);
  const switchOperation = useRef(0);
  const selectionGeneration = useRef(0);
  const membershipRevision = useRef(0);
  const meRef = useRef<Me | null>(null);
  const preferenceQueue = useRef<Promise<void>>(Promise.resolve());
  const [me, setMe] = useState<Me | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [destination, setDestination] = useState<AppDestination>('loading');
  const destinationRef = useRef<AppDestination>('loading');
  const [activeStateIdentity, setActiveStateIdentity] = useState(sessionIdentity);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSwitchingHousehold, setIsSwitchingHousehold] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const diagnostics = getStartupDiagnostics();
  const changeDestination = useCallback((next: AppDestination) => {
    destinationRef.current = next;
    setDestination(next);
  }, []);
  const enqueuePreferenceTask = useCallback(<T,>(task: () => Promise<T>) => {
    const result = preferenceQueue.current.then(task, task);
    preferenceQueue.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);
  const readStoredHouseholdId = useCallback(() => enqueuePreferenceTask(async () => {
    const startedAt = Date.now();
    try {
      return await AsyncStorage.getItem(SELECTED_HOUSEHOLD_KEY);
    } finally {
      diagnostics?.record('household_preference_read', Date.now() - startedAt);
    }
  }), [diagnostics, enqueuePreferenceTask]);
  const clearStoredHouseholdId = useCallback(() => enqueuePreferenceTask(async () => {
    const startedAt = Date.now();
    try {
      await AsyncStorage.removeItem(SELECTED_HOUSEHOLD_KEY);
    } finally {
      diagnostics?.record('household_preference_clear', Date.now() - startedAt);
    }
  }), [diagnostics, enqueuePreferenceTask]);
  const reconcileStoredHouseholdId = useCallback((id: string, previousId: string | null, isCurrent: () => boolean) => enqueuePreferenceTask(async () => {
    if (!isCurrent()) return false;
    const startedAt = Date.now();
    try {
      await AsyncStorage.setItem(SELECTED_HOUSEHOLD_KEY, id);
    } finally {
      diagnostics?.record('household_preference_write', Date.now() - startedAt);
    }
    if (!isCurrent()) {
      if (previousId) await AsyncStorage.setItem(SELECTED_HOUSEHOLD_KEY, previousId);
      else await AsyncStorage.removeItem(SELECTED_HOUSEHOLD_KEY);
      return false;
    }
    return true;
  }), [diagnostics, enqueuePreferenceTask]);

  useEffect(() => {
    latestGetToken.current = getToken;
  }, [getToken]);

  useLayoutEffect(() => {
    if (sessionIdentityRef.current === sessionIdentity) return;
    sessionIdentityRef.current = sessionIdentity;
    setActiveStateIdentity(sessionIdentity);
    sessionIsSignedIn.current = isSignedIn;
    validatedSessionIdentity.current = null;
    meRef.current = null;
    membershipRevision.current += 1;
    setMe(null);
    setSelectedHousehold(null);
    changeDestination(isSignedIn ? 'loading' : 'signed-out');
    selectionGeneration.current += 1;
    switchOperation.current += 1;
    switchInFlight.current = false;
    setIsSwitchingHousehold(false);
    refreshVersion.current += 1;
    refreshInFlight.current = null;
    if (isSignedIn) signOutStarted.current = false;
  }, [changeDestination, isSignedIn, sessionIdentity]);

  const commitMe = useCallback((nextMe: Me | null) => {
    meRef.current = nextMe;
    membershipRevision.current += 1;
    setMe(nextMe);
  }, []);
  const commitSelectedHousehold = useCallback((household: Household | null) => {
    setSelectedHousehold(household);
  }, []);

  const select = useCallback(async (householdId: string): Promise<HouseholdSelectionResult> => {
    if (!sessionIsSignedIn.current) return { status: 'cancelled', reason: 'signed-out' };
    if (signOutStarted.current) return { status: 'cancelled', reason: 'signing-out' };
    if (switchInFlight.current) return { status: 'cancelled', reason: 'busy' };
    if (
      sessionIdentity !== sessionIdentityRef.current
      || validatedSessionIdentity.current !== sessionIdentity
    ) return { status: 'cancelled', reason: 'refreshing' };
    if (refreshInFlight.current !== null) return { status: 'cancelled', reason: 'refreshing' };

    const household = meRef.current?.households.find((item) => item.id === householdId);
    if (!household) return { status: 'cancelled', reason: 'not-a-member' };

    switchInFlight.current = true;
    setIsSwitchingHousehold(true);
    const operation = ++switchOperation.current;
    const generation = selectionGeneration.current;
    const capturedMembershipRevision = membershipRevision.current;
    const capturedIdentity = sessionIdentityRef.current;
    const isCurrent = () => (
      switchOperation.current === operation
      && generation === selectionGeneration.current
      && capturedMembershipRevision === membershipRevision.current
      && capturedIdentity === sessionIdentityRef.current
      && sessionIsSignedIn.current === true
      && !signOutStarted.current
      && refreshInFlight.current === null
      && meRef.current?.households.some((item) => item.id === householdId && item.role === household.role) === true
    );

    try {
      const result = await enqueuePreferenceTask(async (): Promise<HouseholdSelectionResult> => {
        const previousId = await AsyncStorage.getItem(SELECTED_HOUSEHOLD_KEY);
        if (!isCurrent()) return { status: 'cancelled', reason: 'stale' };
        const startedAt = Date.now();
        try {
          await AsyncStorage.setItem(SELECTED_HOUSEHOLD_KEY, householdId);
        } finally {
          diagnostics?.record('household_preference_write', Date.now() - startedAt);
        }

        if (!isCurrent()) {
          if (previousId) await AsyncStorage.setItem(SELECTED_HOUSEHOLD_KEY, previousId);
          else await AsyncStorage.removeItem(SELECTED_HOUSEHOLD_KEY);
          return { status: 'cancelled', reason: 'stale' };
        }

        commitSelectedHousehold(household);
        changeDestination('app');
        return { status: 'selected', household };
      });
      return result;
    } catch {
      return { status: 'failed', reason: 'storage' };
    } finally {
      if (switchOperation.current === operation) {
        switchInFlight.current = false;
        setIsSwitchingHousehold(false);
      }
    }
  }, [changeDestination, commitSelectedHousehold, diagnostics, enqueuePreferenceTask, sessionIdentity]);

  const refresh = useCallback(async (): Promise<Me | null> => {
    if (!isSignedIn || signOutStarted.current) {
      commitMe(null);
      commitSelectedHousehold(null);
      changeDestination('signed-out');
      return null;
    }

    const capturedIdentity = sessionIdentityRef.current;
    const keepSignedInNavigator = (
      capturedIdentity === sessionIdentity
      && validatedSessionIdentity.current === capturedIdentity
      && destinationRef.current === 'app'
      && meRef.current !== null
    );
    const keepProfileCompletionRoute = (
      capturedIdentity === sessionIdentity
      && destinationRef.current === 'complete-profile'
    );
    const version = ++refreshVersion.current;
    selectionGeneration.current += 1;
    refreshInFlight.current = version;
    const isCurrentRefresh = () => (
      version === refreshVersion.current
      && refreshInFlight.current === version
      && capturedIdentity === sessionIdentityRef.current
      && sessionIsSignedIn.current === true
      && !signOutStarted.current
    );
    if (!keepSignedInNavigator && !keepProfileCompletionRoute) changeDestination('loading');
    try {
      let nextMe = await api.me(() => latestGetToken.current(), undefined, diagnostics);
      nextMe = { ...nextMe, households: nextMe.households.map((home) => {
        const cached = meRef.current?.households.find((item) => item.id === home.id);
        return cached?.membership_id && cached.membership_id === home.membership_id && (cached.permissions_revision ?? 0) > (home.permissions_revision ?? 0) ? { ...home, role: cached.role, permissions: cached.permissions, permissions_revision: cached.permissions_revision } : home;
      }) };
      if (!isCurrentRefresh()) return null;
      validatedSessionIdentity.current = capturedIdentity;
      commitMe(nextMe);
      const storedId = await readStoredHouseholdId();
      if (!isCurrentRefresh()) return null;
      const stored = nextMe.households.find((household) => household.id === storedId) ?? null;
      if (stored) {
        commitSelectedHousehold(stored);
        changeDestination('app');
        return nextMe;
      }
      if (nextMe.households.length === 0) {
        await clearStoredHouseholdId();
        if (!isCurrentRefresh()) return null;
        commitSelectedHousehold(null);
        changeDestination('create-or-join');
        return nextMe;
      }
      if (nextMe.households.length === 1) {
        const onlyHousehold = nextMe.households[0];
        const storedByRefresh = await reconcileStoredHouseholdId(onlyHousehold.id, storedId, isCurrentRefresh);
        if (!isCurrentRefresh()) return null;
        if (!storedByRefresh) return null;
        commitSelectedHousehold(onlyHousehold);
        changeDestination('app');
        return nextMe;
      }
      await clearStoredHouseholdId();
      if (!isCurrentRefresh()) return null;
      commitSelectedHousehold(null);
      changeDestination('select-household');
      return nextMe;
    } catch (error) {
      if (isCurrentRefresh()) {
        if (error instanceof ApiError && error.code === 'DISPLAY_NAME_REQUIRED') {
          validatedSessionIdentity.current = null;
          commitMe(null);
          commitSelectedHousehold(null);
          changeDestination('complete-profile');
        } else if (!keepSignedInNavigator && !keepProfileCompletionRoute) {
          changeDestination('api-error');
        }
      }
      return null;
    } finally {
      if (refreshInFlight.current === version) refreshInFlight.current = null;
    }
  }, [changeDestination, clearStoredHouseholdId, commitMe, commitSelectedHousehold, diagnostics, isSignedIn, readStoredHouseholdId, reconcileStoredHouseholdId, sessionIdentity]);

  const accessRequests = useRef(new Map<string, Promise<void>>());
  const refreshAccess = useCallback((householdId: string): Promise<void> => {
    const identity = sessionIdentityRef.current;
    const requestKey = `${identity}:${householdId}`;
    const existing = accessRequests.current.get(requestKey); if (existing) return existing;
    if (!sessionIsSignedIn.current || signOutStarted.current || !meRef.current?.households.some((home) => home.id === householdId)) return Promise.resolve();
    const membership = membershipRevision.current;
    const work = api.household(() => latestGetToken.current(), householdId).then(({ household }) => {
      if (household.id !== householdId || identity !== sessionIdentityRef.current || membership !== membershipRevision.current || signOutStarted.current || !sessionIsSignedIn.current) return;
      const current = meRef.current; const previous = current?.households.find((home) => home.id === householdId);
      if (!current || !previous) return;
      if (previous.membership_id && previous.membership_id === household.membership_id && (previous.permissions_revision ?? 0) > (household.permissions_revision ?? 0)) return;
      if (previous.name === household.name && previous.time_zone === household.time_zone
        && previous.role === household.role && previous.membership_id === household.membership_id
        && previous.permissions_revision === household.permissions_revision
        && JSON.stringify([...(previous.permissions ?? [])].sort()) === JSON.stringify([...(household.permissions ?? [])].sort())) return;
      commitMe({ ...current, households: current.households.map((home) => home.id === householdId ? household : home) });
      setSelectedHousehold((home) => home?.id === householdId ? household : home);
    }).catch((reason: unknown) => {
      if (identity === sessionIdentityRef.current && membership === membershipRevision.current && reason instanceof ApiError && reason.status === 404) void refresh();
    }).finally(() => { accessRequests.current.delete(requestKey); });
    accessRequests.current.set(requestKey, work); return work;
  }, [commitMe, refresh]);

  const signOut = useCallback(async () => {
    signOutStarted.current = true;
    selectionGeneration.current += 1;
    switchOperation.current += 1;
    switchInFlight.current = false;
    setIsSwitchingHousehold(false);
    refreshVersion.current += 1;
    refreshInFlight.current = null;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await clerkSignOut();
    } catch {
      signOutStarted.current = false;
      setSignOutError('We couldn’t sign you out. Please try again.');
      setIsSigningOut(false);
      void refresh();
      return;
    }

    commitMe(null);
    commitSelectedHousehold(null);
    changeDestination('signed-out');
    try {
      await clearStoredHouseholdId();
    } catch {
      // A stale preference is harmless: /v1/me validates it before reuse.
    }
    setIsSigningOut(false);
  }, [changeDestination, clearStoredHouseholdId, clerkSignOut, commitMe, commitSelectedHousehold, refresh]);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => clearTimeout(timer);
  }, [isLoaded, refresh, sessionIdentity]);

  const identityTransitioning = sessionIdentity !== activeStateIdentity;
  return {
    destination: identityTransitioning ? (isSignedIn ? 'loading' : 'signed-out') : destination,
    getToken,
    refreshAccess,
    households: identityTransitioning ? [] : me?.households ?? [],
    isSigningOut,
    isSwitchingHousehold: identityTransitioning ? false : isSwitchingHousehold,
    me: identityTransitioning ? null : me,
    refresh,
    select,
    selectedHousehold: identityTransitioning ? null : selectedHousehold,
    signOut,
    signOutError,
  };
}

export function HouseholdStateProvider({ children }: PropsWithChildren) {
  return <HouseholdStateContext.Provider value={useHouseholdStateValue()}>{children}</HouseholdStateContext.Provider>;
}

export function useHouseholdState() {
  const value = useContext(HouseholdStateContext);
  if (!value) throw new Error('useHouseholdState must be used within HouseholdStateProvider.');
  return value;
}
