import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';

export default function SelectHousehold() {
  const { households, select } = useHouseholdState();
  const theme = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (id: string) => {
    if (!households.some((candidate) => candidate.id === id)) return;
    setBusy(id);
    setError(null);
    const result = await select(id);
    if (result.status === 'selected') router.replace('/');
    else if (result.status === 'failed') setError('We couldn’t select that household. Please try again.');
    else if (result.reason === 'refreshing') setError('Your household list is refreshing. Please try again in a moment.');
    else if (result.reason === 'not-a-member' || result.reason === 'stale') {
      setError('Your household list changed. Please try again.');
    }
    setBusy(null);
  };

  return (
    <Screen>
      <View style={styles.content}>
        <ThemedText style={styles.title}>Choose a household</ThemedText>
        {households.map((household) => (
          <View key={household.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText style={styles.name}>{household.name}</ThemedText>
            <ThemedText themeColor="textSecondary">{household.role}</ThemedText>
            <PrimaryButton disabled={busy !== null} onPress={() => void choose(household.id)} title={busy === household.id ? 'Selecting…' : 'Select'} />
          </View>
        ))}
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
        <SignOutAction />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700', lineHeight: 34 },
  card: { borderRadius: 8, borderWidth: 1, gap: 8, padding: 16 },
  name: { fontSize: 18, fontWeight: '600' },
});
