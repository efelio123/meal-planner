import { StyleSheet, View } from 'react-native';
import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
export default function ApiErrorScreen() { const { refresh } = useHouseholdState(); return <Screen><View style={styles.content}><ThemedText style={styles.title}>We couldn’t load your households</ThemedText><ThemedText themeColor="textSecondary" style={styles.body}>Your sign-in is still active. Check your connection and try again.</ThemedText><PrimaryButton onPress={() => void refresh()} title="Try again" /><SignOutAction /></View></Screen>; }
const styles = StyleSheet.create({ content: { gap: 16 }, title: { fontSize: 30, fontWeight: '700' }, body: { fontSize: 16, lineHeight: 22 } });
