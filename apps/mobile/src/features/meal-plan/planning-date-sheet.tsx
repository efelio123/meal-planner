import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { KeyboardAwareSheet } from '@/components/keyboard-aware-sheet';
import { PrimaryButton } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { visualStyles } from '@/components/visual-roles';
import { useTheme } from '@/hooks/use-theme';
import { calendarDay, calendarMonth, monthDays } from './planning-dates';
import { dateLabel, dayNumber, shortDayLabel } from './meal-plan-utils';

export function PlanningDateSheet({ title, initialDate, validate, onCancel, onDone }: {
  title: string; initialDate: string; validate?: (date: string) => string | null;
  onCancel: () => void; onDone: (date: string) => void;
}) {
  const theme = useTheme();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [draft, setDraft] = useState(initialDate);
  const [month, setMonth] = useState(() => `${initialDate.slice(0, 7)}-01`);
  const days = monthDays(month);
  const error = validate?.(draft) ?? null;
  return <KeyboardAwareSheet testID="planning-date-sheet" style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <View collapsable={false} style={[styles.header, { borderColor: theme.border }]}>
      <ThemedText accessibilityRole="header" style={visualStyles.sheetTitle}>{title}</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel date change" onPress={onCancel} style={visualStyles.sheetAction}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never">
      <View style={styles.monthHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(calendarMonth(month, -1))} style={styles.monthAction}><SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={20} tintColor={theme.text} /></Pressable>
        <ThemedText accessibilityRole="header" style={styles.monthTitle}>{dateLabel(month, { month: 'long', year: 'numeric' })}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(calendarMonth(month, 1))} style={styles.monthAction}><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={theme.text} /></Pressable>
      </View>
      <View style={styles.row}>{Array.from({ length: 7 }, (_, index) => <View key={index} style={styles.cell}><ThemedText themeColor="textSecondary" style={styles.weekday}>{shortDayLabel(calendarDay('2026-10-04', index))}</ThemedText></View>)}</View>
      {Array.from({ length: days.length / 7 }, (_, row) => <View style={styles.row} key={row}>
        {days.slice(row * 7, row * 7 + 7).map((day, col) => day ? <Pressable key={day} accessibilityRole="button" accessibilityLabel={dateLabel(day)} accessibilityState={{ selected: day === draft }} onPress={() => setDraft(day)} style={[styles.cell, styles.date, day === draft && { backgroundColor: theme.primary }]}>
          <ThemedText style={day === draft ? { color: theme.primaryText } : undefined}>{dayNumber(day)}</ThemedText>
        </Pressable> : <View key={`blank-${col}`} style={styles.cell} />)}
      </View>)}
      <ThemedText>{dateLabel(draft)}</ThemedText>
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
    </ScrollView>
    <View collapsable={false} style={[styles.footer, { borderColor: theme.border }]}><PrimaryButton title="Done" disabled={Boolean(error)} onPress={() => { if (!error && mounted.current) onDone(draft); }} /></View>
  </KeyboardAwareSheet>;
}
const styles = StyleSheet.create({
  sheet: { flex: 1 }, scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 24, paddingVertical: 12 },
  content: { padding: 16, gap: 8 }, monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  monthTitle: { flexShrink: 1, fontWeight: '700', textAlign: 'center' }, monthAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' }, cell: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  date: { borderRadius: 14, paddingVertical: 8 }, weekday: { fontSize: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
});
