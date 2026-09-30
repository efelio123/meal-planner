import { useAuth } from '@clerk/expo';
import { router, type Href } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ProfileNavigationRow } from '@/features/profile/profile-navigation-row';
import { useHouseholdState } from '@/hooks/use-household-state';

export function MyHouseholdsScreen() {
  const { isSignedIn, sessionId, userId } = useAuth();
  const { households, isSigningOut, refresh, selectedHousehold } = useHouseholdState();
  const contextKey = JSON.stringify([isSignedIn, userId ?? null, sessionId ?? null, isSigningOut]);
  const contextRef = useRef(contextKey);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const refreshingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useLayoutEffect(() => {
    if (contextRef.current === contextKey) return;
    contextRef.current = contextKey;
    requestVersion.current += 1;
    refreshingRef.current = false;
    setRefreshing(false);
    setRefreshError(null);
    setStale(false);
  }, [contextKey]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      refreshingRef.current = false;
    };
  }, []);

  const refreshHouseholds = async () => {
    if (refreshingRef.current || !isSignedIn || isSigningOut) return;
    refreshingRef.current = true;
    const context = contextRef.current;
    const version = ++requestVersion.current;
    const isCurrent = () => mounted.current
      && contextRef.current === context
      && requestVersion.current === version;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const nextMe = await refresh();
      if (!isCurrent()) return;
      if (!nextMe) {
        setStale(true);
        setRefreshError('We couldn’t refresh your households. The information shown may be out of date. Try again.');
        return;
      }
      setStale(false);
      setRefreshError(null);
    } catch {
      if (isCurrent()) {
        setStale(true);
        setRefreshError('We couldn’t refresh your households. The information shown may be out of date. Try again.');
      }
    } finally {
      if (isCurrent()) {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    }
  };

  return (
    <Screen
      contentAlignment="top"
      onRefresh={Platform.OS === 'web' ? undefined : refreshHouseholds}
      refreshing={refreshing}
      safeAreaEdges={['left', 'right']}
    >
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" type="subtitle">My households</ThemedText>
        {refreshing ? <ThemedText accessibilityLiveRegion="polite" themeColor="textSecondary">Refreshing households…</ThemedText> : null}
        {stale ? <ThemedText themeColor="textSecondary">Showing the last confirmed household information.</ThemedText> : null}
        {refreshError ? <ThemedText accessibilityRole="alert" themeColor="error">{refreshError}</ThemedText> : null}
        {Platform.OS === 'web' || refreshError ? (
          <PrimaryButton disabled={refreshing} onPress={() => { void refreshHouseholds(); }} title={refreshError ? 'Retry refresh' : refreshing ? 'Refreshing…' : 'Refresh households'} />
        ) : null}
        <PrimaryButton onPress={() => router.push('/(app)/(tabs)/profile/my-households/create' as Href)} title="Create household" />
        {households.map((household) => (
          <ProfileNavigationRow
            key={household.id}
            accessibilityLabel={`${household.name}${selectedHousehold?.id === household.id ? ', active household' : ''}`}
            onPress={() => router.push(`/(app)/(tabs)/profile/my-households/${household.id}` as Href)}
            subtitle={`${household.role}${selectedHousehold?.id === household.id ? ' · Active' : ''}`}
            title={household.name}
          />
        ))}
        {households.length === 0 ? <ThemedText themeColor="textSecondary">No households are available.</ThemedText> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: 16 } });
