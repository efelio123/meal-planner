import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, useClerk } from '@clerk/expo';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { api, type Household, type Me } from '@/lib/api';

const SELECTED_HOUSEHOLD_KEY = 'meal-planner:selected-household-id';
export type AppDestination = 'loading' | 'signed-out' | 'api-error' | 'create-or-join' | 'select-household' | 'app';
type HouseholdState = ReturnType<typeof useHouseholdStateValue>;
const HouseholdStateContext = createContext<HouseholdState | null>(null);

function useHouseholdStateValue() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const latestGetToken = useRef(getToken);
  const refreshVersion = useRef(0);
  const sessionIsSignedIn = useRef(isSignedIn);
  const signOutStarted = useRef(false);
  const [me, setMe] = useState<Me | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [destination, setDestination] = useState<AppDestination>('loading');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    latestGetToken.current = getToken;
  }, [getToken]);

  // This runs during the commit that observes a Clerk session change, before
  // passive effects can start or resume refresh work.
  useLayoutEffect(() => {
    if (sessionIsSignedIn.current === isSignedIn) return;
    sessionIsSignedIn.current = isSignedIn;
    refreshVersion.current += 1;
    if (isSignedIn) signOutStarted.current = false;
  }, [isSignedIn]);

  const select = useCallback(async (household: Household) => {
    if (!sessionIsSignedIn.current || signOutStarted.current) return;
    await AsyncStorage.setItem(SELECTED_HOUSEHOLD_KEY, household.id);
    if (!sessionIsSignedIn.current || signOutStarted.current) return;
    setSelectedHousehold(household);
    setDestination('app');
  }, []);

  const refresh = useCallback(async () => {
    if (!isSignedIn || signOutStarted.current) {
      setMe(null);
      setSelectedHousehold(null);
      setDestination('signed-out');
      return;
    }
    const version = refreshVersion.current;
    const isCurrentRefresh = () => (
      version === refreshVersion.current
      && sessionIsSignedIn.current
      && !signOutStarted.current
    );
    setDestination('loading');
    try {
      const nextMe = await api.me(() => latestGetToken.current());
      if (!isCurrentRefresh()) return;
      setMe(nextMe);
      const storedId = await AsyncStorage.getItem(SELECTED_HOUSEHOLD_KEY);
      if (!isCurrentRefresh()) return;
      const stored = nextMe.households.find((household) => household.id === storedId) ?? null;
      if (stored) {
        setSelectedHousehold(stored);
        setDestination('app');
        return;
      }
      if (nextMe.households.length === 0) {
        await AsyncStorage.removeItem(SELECTED_HOUSEHOLD_KEY);
        if (!isCurrentRefresh()) return;
        setSelectedHousehold(null);
        setDestination('create-or-join');
        return;
      }
      if (nextMe.households.length === 1) {
        await select(nextMe.households[0]);
        return;
      }
      await AsyncStorage.removeItem(SELECTED_HOUSEHOLD_KEY);
      if (!isCurrentRefresh()) return;
      setSelectedHousehold(null);
      setDestination('select-household');
    } catch {
      if (isCurrentRefresh()) setDestination('api-error');
    }
  }, [isSignedIn, select]);

  const signOut = useCallback(async () => {
    signOutStarted.current = true;
    refreshVersion.current += 1;
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

    setMe(null);
    setSelectedHousehold(null);
    setDestination('signed-out');
    try {
      await AsyncStorage.removeItem(SELECTED_HOUSEHOLD_KEY);
    } catch {
      // A stale preference is harmless: /v1/me validates it before reuse.
    }
    setIsSigningOut(false);
  }, [clerkSignOut, refresh]);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => clearTimeout(timer);
  }, [isLoaded, refresh]);

  return {
    destination, getToken, households: me?.households ?? [], isSigningOut, refresh, select,
    selectedHousehold, signOut, signOutError,
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
