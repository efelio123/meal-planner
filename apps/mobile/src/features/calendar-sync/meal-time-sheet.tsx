import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { visualStyles } from '@/components/visual-roles';
import { useTheme } from '@/hooks/use-theme';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { parseMealTime } from './meal-time';

export function MealTimeSheet({ label, value, scope, onSave }: { label: string; value: string; scope: string; onSave: (value: string) => void }) {
  const [text, setText] = useState(value); const [error, setError] = useState(false);
  const theme = useTheme(); const router = useRouter(); const flow = useNativeSheetFlow();
  function save() {
    if (scope !== flow.scope) return;
    const parsed = parseMealTime(text); if (!parsed) { setError(true); return; }
    onSave(parsed); router.back();
  }
  return <View collapsable={false} style={[styles.root, { backgroundColor: theme.elevatedSurface }]}>
    <View collapsable={false} style={styles.header}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.action}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
      <ThemedText accessibilityRole="header" style={visualStyles.sheetTitle}>{label}</ThemedText>
      <Pressable accessibilityRole="button" onPress={save} style={styles.action}><ThemedText themeColor="link">Save</ThemedText></Pressable>
    </View>
    <ScrollView style={styles.body} contentContainerStyle={styles.content} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
      <ThemedText>Enter a time such as 8:00 AM or 18:00.</ThemedText>
      <ThemedInput accessibilityLabel={`${label} time`} value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={save} />
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">Use HH:MM, with AM or PM if you prefer.</ThemedText> : null}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ root: { flex: 1, minHeight: 0, paddingHorizontal: 20, paddingTop: 12 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, gap: 10 }, action: { minHeight: 44, justifyContent: 'center' }, body: { flex: 1, minHeight: 0 }, content: { gap: 16, paddingTop: 18, paddingBottom: 24 } });
