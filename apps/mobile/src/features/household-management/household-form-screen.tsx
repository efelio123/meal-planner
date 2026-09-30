import { useAuth } from '@clerk/expo';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { TimeZonePicker } from '@/components/time-zone-picker';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type Household } from '@/lib/api';
import { deviceTimeZone } from '@/lib/time-zones';

export function HouseholdFormScreen({ mode }: { mode: 'create' | 'edit' }) {
  const { householdId } = useLocalSearchParams<{ householdId?: string }>();
  const { isSignedIn, sessionId, userId } = useAuth();
  const { getToken, households, isSigningOut, refresh } = useHouseholdState();
  const target = households.find((item) => item.id === householdId) ?? null;
  const contextKey = JSON.stringify([mode, householdId ?? null, isSignedIn, userId ?? null, sessionId ?? null, target?.role ?? null, isSigningOut]);
  const contextRef = useRef(contextKey);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const savedHouseholdRef = useRef<Household | null>(null);
  const [name, setName] = useState(mode === 'edit' ? target?.name ?? '' : '');
  const [timeZone, setTimeZone] = useState(mode === 'edit' ? target?.time_zone ?? deviceTimeZone() : deviceTimeZone());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHousehold, setSavedHousehold] = useState<Household | null>(null);

  useLayoutEffect(() => {
    if (contextRef.current !== contextKey) {
      contextRef.current = contextKey;
      generationRef.current += 1;
      inFlightRef.current = false;
      savedHouseholdRef.current = null;
      setSavedHousehold(null);
      setBusy(false);
      setError(null);
    }
  }, [contextKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      inFlightRef.current = false;
    };
  }, []);

  const navigateToSavedHousehold = async (household: Household, isCurrent: () => boolean) => {
    const refreshed = await refresh();
    if (!isCurrent()) return;
    if (!refreshed?.households.some((item) => item.id === household.id)) {
      setError('Your changes were saved, but we couldn’t confirm the household details. Retry the refresh.');
      return;
    }
    router.replace(`/(app)/(tabs)/profile/my-households/${household.id}` as Href);
  };

  const retryRefresh = async () => {
    const household = savedHouseholdRef.current;
    if (!household || inFlightRef.current) return;
    const generation = generationRef.current;
    const context = contextRef.current;
    const isCurrent = () => mountedRef.current && generationRef.current === generation && contextRef.current === context;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await navigateToSavedHousehold(household, isCurrent);
    } catch {
      if (isCurrent()) setError('Your changes were saved, but we couldn’t refresh household details. Retry the refresh.');
    } finally {
      if (isCurrent()) {
        inFlightRef.current = false;
        setBusy(false);
      }
    }
  };

  const save = async () => {
    if (savedHouseholdRef.current) {
      await retryRefresh();
      return;
    }
    if (inFlightRef.current || isSigningOut || !isSignedIn) return;
    if (!name.trim()) {
      setError('Enter a household name.');
      return;
    }
    if (mode === 'edit' && (!target || target.role !== 'owner')) return;

    const contextAtStart = contextRef.current;
    const generationAtStart = generationRef.current;
    const isCurrent = () => mountedRef.current
      && contextRef.current === contextAtStart
      && generationRef.current === generationAtStart;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const household = mode === 'create'
        ? (await api.createHousehold(getToken, name.trim(), timeZone)).household
        : (await api.updateHousehold(getToken, target!.id, { name: name.trim(), time_zone: timeZone })).household;
      if (!isCurrent()) return;
      savedHouseholdRef.current = household;
      setSavedHousehold(household);
      await navigateToSavedHousehold(household, isCurrent);
    } catch (reason) {
      if (!isCurrent()) return;
      if (savedHouseholdRef.current) {
        setError('Your changes were saved, but we couldn’t refresh household details. Retry the refresh.');
      } else if (reason instanceof ApiError && reason.status === 400) {
        setError('Enter a household name and a valid IANA time zone, such as America/Phoenix.');
      } else {
        setError(mode === 'create' ? 'We couldn’t create this household. Please try again.' : 'We couldn’t save these changes. Please try again.');
      }
    } finally {
      if (isCurrent()) {
        inFlightRef.current = false;
        setBusy(false);
      }
    }
  };

  if (mode === 'edit' && (!target || target.role !== 'owner')) return null;

  return (
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" type="subtitle">{mode === 'create' ? 'Create household' : 'Edit household'}</ThemedText>
        <ThemedInput
          accessibilityLabel="Household name"
          autoCapitalize="words"
          editable={!busy && !savedHousehold}
          onChangeText={setName}
          placeholder="Household name"
          value={name}
        />
        <TimeZonePicker disabled={busy || Boolean(savedHousehold)} onChange={setTimeZone} value={timeZone} />
        <ThemedText themeColor="textSecondary">The IANA time-zone name is saved for this household.</ThemedText>
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
        <PrimaryButton
          disabled={busy}
          onPress={() => { void save(); }}
          title={busy
            ? savedHousehold ? 'Refreshing…' : mode === 'create' ? 'Creating…' : 'Saving…'
            : savedHousehold ? 'Retry refresh' : mode === 'create' ? 'Create household' : 'Save changes'}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: 16 } });
