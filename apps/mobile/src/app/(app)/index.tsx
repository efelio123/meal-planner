import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function HouseholdHome() {
  const { selectedHousehold } = useHouseholdState();

  return <Screen><View style={styles.content}>
    <Text style={styles.title}>{selectedHousehold?.name ?? 'Your household'}</Text>
    <Text style={styles.body}>You’re signed in. Meal planning and shared shopping lists are the next product slice.</Text>
    <SignOutAction />
  </View></Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
});
