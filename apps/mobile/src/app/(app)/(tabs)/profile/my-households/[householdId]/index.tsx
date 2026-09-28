import { useLocalSearchParams, router, type Href } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useResetToHouseholdStartup } from '@/features/profile/use-reset-to-household-startup';

export default function HouseholdDetailsRoute() {
  const { householdId } = useLocalSearchParams<{ householdId: string }>();
  const { households, isSwitchingHousehold, select, selectedHousehold } = useHouseholdState();
  const [error, setError] = useState<string | null>(null);
  const resetToStartup = useResetToHouseholdStartup();
  const target = households.find((item) => item.id === householdId) ?? null;

  useLayoutEffect(() => {
    if (!target) router.replace('/(app)/(tabs)/profile/my-households' as Href);
  }, [target]);

  if (!target) return null;

  const switchHousehold = async () => {
    if (isSwitchingHousehold) return;
    setError(null);
    const result = await select(target.id);
    if (result.status === 'selected') {
      resetToStartup();
      return;
    }
    if (result.status === 'failed') {
      setError('We couldn’t switch households. Your current household is unchanged. Please try again.');
    } else if (result.reason === 'refreshing') {
      setError('Your household list is refreshing. Please try again in a moment.');
    } else if (result.reason === 'not-a-member' || result.reason === 'stale') {
      setError('Your household access changed. Return to My households and try again.');
    }
  };

  return (
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" type="subtitle">{target.name}</ThemedText>
        <View style={styles.field}>
          <ThemedText themeColor="textSecondary">Time zone</ThemedText>
          <ThemedText>{target.time_zone}</ThemedText>
        </View>
        <View style={styles.field}>
          <ThemedText themeColor="textSecondary">Your role</ThemedText>
          <ThemedText>{target.role}</ThemedText>
        </View>
        {target.role === 'owner' ? (
          <PrimaryButton
            onPress={() => router.push(`/(app)/(tabs)/profile/my-households/${target.id}/invitations` as Href)}
            title="Invitations"
          />
        ) : null}
        {selectedHousehold?.id !== target.id ? (
          <PrimaryButton
            disabled={isSwitchingHousehold}
            onPress={() => void switchHousehold()}
            title={isSwitchingHousehold ? 'Switching household…' : 'Switch to this household'}
          />
        ) : <ThemedText themeColor="textSecondary">This is your active household.</ThemedText>}
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: 16 }, field: { gap: 4 } });
