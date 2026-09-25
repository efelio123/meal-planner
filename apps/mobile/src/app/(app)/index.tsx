import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function HouseholdHome() {
  const { selectedHousehold } = useHouseholdState();
  return <Screen><View style={styles.content}>
    <ThemedText style={styles.title}>{selectedHousehold?.name ?? 'Your household'}</ThemedText>
    <ThemedText themeColor="textSecondary" style={styles.body}>You’re signed in. Meal planning and shared shopping lists are the next product slice.</ThemedText>
    <SignOutAction />
  </View></Screen>;
}
const styles = StyleSheet.create({ content: { gap: 16 }, title: { fontSize: 30, fontWeight: '700', lineHeight: 30 }, body: { fontSize: 16, lineHeight: 22 } });
