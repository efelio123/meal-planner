import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SwipeToDeleteRow } from '@/components/swipe-to-delete-row';
import { ThemedText } from '@/components/themed-text';
import { DisclosureChevron } from '@/components/visual-roles';
import { MealEntryCover } from './meal-entry-cover';
import { mealTitle, mealSubtitle } from './meal-entry';
import { useTheme } from '@/hooks/use-theme';
import type { MealPlanEntry } from '@/lib/api';
import { dateLabel } from './meal-plan-utils';

type Props = {
  entry: MealPlanEntry; slotLabel: string; active: boolean; pending: boolean; blocked: boolean; swipeEnabled: boolean;
  onEdit: (entry: MealPlanEntry) => void; onStart: (entry: MealPlanEntry) => void;
  onEnd: (entry: MealPlanEntry) => void; onReveal: (entry: MealPlanEntry) => void;
  onClose: (entry: MealPlanEntry) => void; onRemove: (entry: MealPlanEntry) => Promise<void>;
};

export function MealPlanCard({ entry, slotLabel, active, pending, blocked, swipeEnabled, onEdit, onStart, onEnd, onReveal, onClose, onRemove }: Props) {
  const theme = useTheme();
  const disabled = pending || blocked;
  const title = mealTitle(entry);
  const subtitle = mealSubtitle(entry);
  const frame = [styles.frame, { backgroundColor: theme.surface, borderColor: theme.border }];
  const row = <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${title}, ${slotLabel}`} accessibilityHint={subtitle ?? undefined} accessibilityState={{ disabled }} disabled={disabled} onPress={() => onEdit(entry)} style={[styles.row, { backgroundColor: theme.surface }]}>
    <MealEntryCover entry={entry} />
    <View style={styles.info}><ThemedText numberOfLines={2} style={styles.title}>{title}</ThemedText>{subtitle ? <ThemedText themeColor="textSecondary" numberOfLines={2}>{subtitle}</ThemedText> : null}</View>
    {pending ? <ActivityIndicator accessibilityLabel={`Removing ${title}, ${slotLabel}`} color={theme.activity} /> : <DisclosureChevron />}
  </Pressable>;
  if (Platform.OS === 'web') return <View style={frame}>{row}</View>;
  return <SwipeToDeleteRow rowId={entry.id} testID={`plan-swipe-${entry.id}`}
    removeAccessibilityLabel={`Remove ${title}, ${slotLabel}, ${dateLabel(entry.planned_for)} from plan`}
    containerStyle={frame} active={active} enabled={swipeEnabled && !disabled}
    onDragStart={() => onStart(entry)} onDragEnd={() => onEnd(entry)}
    onReveal={() => onReveal(entry)} onClose={() => onClose(entry)} onRemove={() => onRemove(entry)}>{row}</SwipeToDeleteRow>;
}

const styles = StyleSheet.create({
  frame: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 12, minHeight: 80, padding: 12 },
  info: { flex: 1, gap: 5 },
  title: { fontSize: 16, fontWeight: '600' },
});
