import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';

import { api, type Household, type Me } from '@/lib/api';

const SELECTED_HOUSEHOLD_KEY = 'meal-planner:selected-household-id';
export type AppDestination = 'loading' | 'signed-out' | 'api-error' | 'create-or-join' | 'select-household' | 'app';
type HouseholdState = ReturnType<typeof useHouseholdStateValue>;
const HouseholdStateContext = createContext<HouseholdState | null>(null);

function useHouseholdStateValue() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [destination, setDestination] = useState<AppDestination>('loading');

  const select = useCallback(async (household: Household) => {
    await AsyncStorage.setItem(SELECTED_HOUSEHOLD_KEY, household.id);
    setSelectedHousehold(household);
    setDestination('app');
  }, []);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setMe(null);
      setSelectedHousehold(null);
      setDestination('signed-out');
      return;
    }
    setDestination('loading');
    try {
      const nextMe = await api.me(getToken);
      setMe(nextMe);
      const storedId = await AsyncStorage.getItem(SELECTED_HOUSEHOLD_KEY);
      const stored = nextMe.households.find((household) => household.id === storedId) ?? null;
      if (stored) {
        setSelectedHousehold(stored);
        setDestination('app');
        return;
      }
      if (nextMe.households.length === 0) {
        await AsyncStorage.removeItem(SELECTED_HOUSEHOLD_KEY);
        setSelectedHousehold(null);
        setDestination('create-or-join');
        return;
      }
      if (nextMe.households.length === 1) {
        await select(nextMe.households[0]);
        return;
      }
      await AsyncStorage.removeItem(SELECTED_HOUSEHOLD_KEY);
      setSelectedHousehold(null);
      setDestination('select-household');
    } catch {
      setDestination('api-error');
    }
  }, [getToken, isSignedIn, select]);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => clearTimeout(timer);
  }, [isLoaded, refresh]);

  return { destination, getToken, households: me?.households ?? [], refresh, select, selectedHousehold };
}

export function HouseholdStateProvider({ children }: PropsWithChildren) {
  return <HouseholdStateContext.Provider value={useHouseholdStateValue()}>{children}</HouseholdStateContext.Provider>;
}

export function useHouseholdState() {
  const value = useContext(HouseholdStateContext);
  if (!value) throw new Error('useHouseholdState must be used within HouseholdStateProvider.');
  return value;
}
