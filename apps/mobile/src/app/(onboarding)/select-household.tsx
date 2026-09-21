import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function SelectHousehold() {
  const { households, select } = useHouseholdState();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (id: string) => {
    const household = households.find((candidate) => candidate.id === id);
    if (!household) return;
    setBusy(id);
    await select(household);
    router.replace('/');
  };

  return <Screen><View style={styles.content}>
    <Text style={styles.title}>Choose a household</Text>
    {households.map((household) => <View key={household.id} style={styles.card}>
      <Text style={styles.name}>{household.name}</Text>
      <Text>{household.role}</Text>
      <Button disabled={busy !== null} onPress={() => void choose(household.id)} title={busy === household.id ? 'Selecting…' : 'Select'} />
    </View>)}
  </View></Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  card: { borderColor: '#d0d5dd', borderRadius: 8, borderWidth: 1, gap: 8, padding: 16 },
  name: { fontSize: 18, fontWeight: '600' },
});
