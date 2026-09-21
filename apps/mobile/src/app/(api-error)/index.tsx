import { Button, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function ApiErrorScreen() {
  const { refresh } = useHouseholdState();

  return <Screen><View style={styles.content}>
    <Text style={styles.title}>We couldn’t load your households</Text>
    <Text style={styles.body}>Your sign-in is still active. Check your connection and try again.</Text>
    <Button onPress={() => void refresh()} title="Try again" />
  </View></Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
});
