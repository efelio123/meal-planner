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

  const choose = async (id: string) => {
    const household = households.find((candidate) => candidate.id === id);
    if (!household) return;
    setBusy(id);
    await select(household);
    router.replace('/');
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
