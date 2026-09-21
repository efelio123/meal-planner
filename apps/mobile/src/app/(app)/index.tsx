import { useClerk } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Button, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function HouseholdHome() {
  const { selectedHousehold } = useHouseholdState();
  const { signOut } = useClerk();
  const router = useRouter();

  return <Screen><View style={styles.content}>
    <Text style={styles.title}>{selectedHousehold?.name ?? 'Your household'}</Text>
    <Text style={styles.body}>You’re signed in. Meal planning and shared shopping lists are the next product slice.</Text>
    <Button onPress={() => void signOut().then(() => router.replace('/'))} title="Sign out" />
  </View></Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
});
