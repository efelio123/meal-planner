import { useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { MealPlanNeed } from '@/lib/api';
import { formatAmount, isValidShoppingAmount } from './meal-plan-utils';

function SheetHeader({ onCancel }: { onCancel: () => void }) {
  const theme = useTheme();
  return <View collapsable={false} style={[styles.header, { borderBottomColor: theme.border }]}>
    {Platform.OS === 'web' ? <View style={[styles.webGrabber, { backgroundColor: theme.border }]} /> : null}
    <View style={styles.headerRow}>
      <ThemedText accessibilityRole="header" style={styles.title}>Amount to buy</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel amount change" hitSlop={12} onPress={onCancel}>
        <ThemedText themeColor="link">Cancel</ThemedText>
      </Pressable>
    </View>
  </View>;
}

export function ShoppingAmountSheet({ need, initialValue, onCancel, onDone }: {
  need: MealPlanNeed;
  initialValue: string;
  onCancel: () => void;
  onDone: (amount: string) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(initialValue);
  const valid = isValidShoppingAmount(draft);
  const unitLabel = need.unit_label;
  const validationMessage = valid ? null : 'Enter a positive amount, or deselect this ingredient to buy none.';

  return <View collapsable={false} style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <SheetHeader onCancel={onCancel} />
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
    >
      <View style={[styles.totalRow, { backgroundColor: theme.surface }]}>
        <ThemedText themeColor="textSecondary">Needed for meals</ThemedText>
        <ThemedText style={styles.totalAmount}>{formatAmount(need.amount, unitLabel)}</ThemedText>
      </View>

      <ThemedText accessibilityRole="header" style={styles.fieldLabel}>Add to Shopping</ThemedText>
      <View style={[styles.inputRow, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
        <ThemedInput
          accessibilityLabel="Amount to buy"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="decimal-pad"
          returnKeyType="done"
          value={draft}
          onChangeText={setDraft}
          placeholder="Enter amount"
          style={styles.input}
          onSubmitEditing={() => { if (valid) { Keyboard.dismiss(); onDone(draft.trim()); } }}
        />
        {unitLabel ? <ThemedText themeColor="textSecondary" style={styles.unitLabel}>{unitLabel}</ThemedText> : null}
      </View>
      {validationMessage ? <ThemedText accessibilityRole="alert" themeColor="error">{validationMessage}</ThemedText> : null}
      <ThemedText themeColor="textSecondary">Choose how much {need.name.toLocaleLowerCase()} you plan to buy. You can buy less or more than the recipe total.</ThemedText>

    </ScrollView>
    <View collapsable={false} style={[styles.actions, { borderTopColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Reset amount to ${need.amount}`} onPress={() => setDraft(need.amount ?? '')} style={styles.resetAction}>
          <ThemedText themeColor="link">Reset to {need.amount}</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done editing amount"
          accessibilityState={{ disabled: !valid }}
          disabled={!valid}
          onPress={() => { Keyboard.dismiss(); onDone(draft.trim()); }}
          style={({ pressed }) => [styles.doneButton, { backgroundColor: !valid ? theme.disabled : theme.primary, opacity: pressed ? 0.82 : 1 }]}
        >
          <ThemedText style={[styles.doneText, { color: theme.primaryText }]}>Done</ThemedText>
        </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  sheet: { flex: 1, overflow: 'hidden' },
  sheetScroll: { flex: 1, minHeight: 0 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 14 },
  webGrabber: { alignSelf: 'center', borderRadius: 3, height: 5, marginBottom: 18, width: 48 },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { gap: 18, padding: 24, paddingBottom: 30 },
  totalRow: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: 18 },
  totalAmount: { fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 17, fontWeight: '700', marginBottom: -8 },
  inputRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 62, paddingHorizontal: 14 },
  input: { backgroundColor: 'transparent', borderWidth: 0, flex: 1, minHeight: 58, paddingHorizontal: 0 },
  unitLabel: { fontSize: 16, marginLeft: 10 },
  actions: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: Platform.OS === 'web' ? 16 : 8, paddingHorizontal: 24, paddingTop: 12 },
  resetAction: { minHeight: 48, justifyContent: 'center', paddingRight: 10 },
  doneButton: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 58, minWidth: 112, paddingHorizontal: 22 },
  doneText: { fontSize: 16, fontWeight: '700' },
});
