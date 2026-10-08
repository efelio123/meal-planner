import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useMealPlanContext } from './meal-plan-context';
import { RecipeCover } from '@/features/recipes/recipe-cover';
import { useTheme } from '@/hooks/use-theme';
import type { MealPlanEntry, MealSlot } from '@/lib/api';
import { MealPlanAddSheet, MealPlanEditSheet } from './meal-plan-sheets';
import { addCalendarDays, dateLabel, dayNumber, MEAL_SLOTS, shortDayLabel } from './meal-plan-utils';
import { useMealPlan } from './use-meal-plan';

export function MealPlanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const flow = useNativeSheetFlow();
  const mealPlanContext = useMealPlanContext();
  const { householdId, scope, weekOffset, week, loading, refreshing, error, refresh, changeWeek, setTodayWeek, create, update, remove } = useMealPlan();
  const [daySelection, setDaySelection] = useState<{ scope: string; day: string | null }>({ scope: '', day: null });
  const lastFocus = useRef(false);
  const latestRefresh = useRef(refresh);
  useEffect(() => { latestRefresh.current = refresh; }, [refresh]);
  const dates = useMemo(() => week ? Array.from({ length: 7 }, (_, index) => addCalendarDays(week.week_start, index)) : [], [week]);
  const selectedDay = daySelection.scope === scope ? daySelection.day : null;
  const activeDay = selectedDay && dates.includes(selectedDay) ? selectedDay : week?.local_today && dates.includes(week.local_today) ? week.local_today : dates[0] ?? null;
  const entries = week?.entries ?? [];

  // Keep the week loaded during ordinary tab switches; refresh once the user
  // returns after the first initial focus so changes from another device show.
  useFocusEffect(useCallback(() => {
    if (lastFocus.current) void latestRefresh.current({ quiet: true });
    lastFocus.current = true;
  }, []));

  const addEntry = (day: string, slot: MealSlot) => {
    if (!householdId || !week) return;
    const id = flow.present(
      <MealPlanAddSheet householdId={householdId} weekOffset={weekOffset} dates={dates} initialDate={day} initialSlot={slot} onSave={async (draft) => {
        await create({ planned_for: draft.plannedFor, meal_slot: draft.mealSlot, recipe_id: draft.recipeId! });
        if (mealPlanContext.scope === scope) setDaySelection({ scope, day: draft.plannedFor });
      }} />,
      { detents: [0.62, 0.96], onDismiss: mealPlanContext.clearRecipeCreate },
    );
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/add', params: { sheetId: id } } as never);
  };
  const editEntry = (entry: MealPlanEntry) => {
    if (!householdId || !week) return;
    const id = flow.present(
      <MealPlanEditSheet householdId={householdId} dates={dates} entry={entry}
        onSave={(draft) => update(entry.id, { planned_for: draft.plannedFor, meal_slot: draft.mealSlot, recipe_id: draft.recipeId!, expected_revision: draft.expected_revision })}
        onRemove={() => remove(entry.id, entry.edit_revision)}
        onReload={() => refresh()} />,
      { detents: [0.62, 0.96] },
    );
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/edit', params: { sheetId: id } } as never);
  };

  const weekText = week ? (() => {
    const startMonth = dateLabel(week.week_start, { month: 'long' });
    const endMonth = dateLabel(week.week_end, { month: 'long' });
    return startMonth === endMonth
      ? `${startMonth} ${dateLabel(week.week_start, { day: 'numeric' })}–${dateLabel(week.week_end, { day: 'numeric' })}`
      : `${dateLabel(week.week_start, { month: 'long', day: 'numeric' })}–${dateLabel(week.week_end, { month: 'long', day: 'numeric' })}`;
  })() : '';
  const daysWithEntries = new Set(entries.map((entry) => entry.planned_for));
  const activeDayEntries = entries.filter((entry) => entry.planned_for === activeDay);

  return <Screen contentAlignment="top" nativeTabScreen safeAreaEdges={['top', 'left', 'right']} onRefresh={async () => { await refresh(); }} refreshing={refreshing}>
    <View style={styles.page}>
      <View style={styles.titleRow}><ThemedText accessibilityRole="header" style={styles.title}>Plan</ThemedText><Pressable accessibilityRole="button" onPress={() => { setDaySelection({ scope, day: null }); void setTodayWeek(); }} style={styles.todayAction}><ThemedText themeColor="link">Today</ThemedText></Pressable></View>
      <View style={styles.weekHeader}>
        <View><ThemedText themeColor="textSecondary" style={styles.eyebrow}>THIS WEEK</ThemedText><ThemedText style={styles.weekText}>{weekText || 'This week'}</ThemedText></View>
        <View style={styles.weekNavigation}>
          <Pressable accessibilityLabel="Previous week" accessibilityRole="button" onPress={() => { setDaySelection({ scope, day: null }); changeWeek(-1); }} style={styles.iconButton}><SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={20} tintColor={theme.text} /></Pressable>
          <Pressable accessibilityLabel="Next week" accessibilityRole="button" onPress={() => { setDaySelection({ scope, day: null }); changeWeek(1); }} style={styles.iconButton}><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={theme.text} /></Pressable>
        </View>
      </View>
      {week ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRail}>
        {dates.map((day) => {
          const active = activeDay === day;
          return <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${shortDayLabel(day)} ${dateLabel(day, { month: 'long', day: 'numeric' })}`} accessibilityState={{ selected: active }} onPress={() => setDaySelection({ scope, day })} style={[styles.day, active && { backgroundColor: theme.primary }]}>
            <ThemedText themeColor={active ? undefined : 'textSecondary'} style={[styles.dayLabel, active && { color: theme.primaryText }]}>{shortDayLabel(day)}</ThemedText>
            <ThemedText style={[styles.dayNumber, active && { color: theme.primaryText }]}>{dayNumber(day)}</ThemedText>
            <View style={[styles.dayDot, { backgroundColor: active ? theme.primaryText : daysWithEntries.has(day) ? theme.primary : 'transparent' }]} />
          </Pressable>;
        })}
      </ScrollView> : null}
      <Pressable accessibilityLabel="Review shopping needs" accessibilityRole="button" disabled={!week || loading || Boolean(error)} onPress={() => router.push({ pathname: '/(app)/(tabs)/plan/shopping-review', params: { weekStart: week!.week_start } } as never)} style={[styles.reviewBanner, { backgroundColor: theme.surfaceSelected, borderColor: theme.border }, (!week || loading || Boolean(error)) && styles.disabledBanner]}>
        <View style={[styles.reviewIcon, { backgroundColor: theme.primary }]}><SymbolView name={{ ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' }} size={22} tintColor={theme.primaryText} /></View>
        <View style={styles.reviewCopy}><ThemedText style={styles.reviewTitle}>Review shopping needs</ThemedText><ThemedText themeColor="textSecondary">Choose ingredients to add to Shopping</ThemedText></View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={theme.link} />
      </Pressable>
      {loading && !week ? <ActivityIndicator accessibilityLabel="Loading meal plan" color={theme.activity} /> : null}
      {error ? <View style={styles.errorBlock}><ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText><PrimaryButton onPress={() => void refresh()} title="Retry" /></View> : null}
      {!loading && !error && !week ? <ThemedText themeColor="textSecondary">Your week could not be loaded.</ThemedText> : null}
      {activeDay && week && !error ? <View style={styles.mealList}>
        <View style={styles.dayHeading}><ThemedText accessibilityRole="header" style={styles.dayTitle}>{dateLabel(activeDay)}</ThemedText><ThemedText themeColor="textSecondary">{activeDayEntries.length} {activeDayEntries.length === 1 ? 'meal' : 'meals'}</ThemedText></View>
        {MEAL_SLOTS.map((slot) => {
          const entry = entries.find((candidate) => candidate.planned_for === activeDay && candidate.meal_slot === slot.id);
          return <View key={slot.id} style={styles.mealSection}>
            <ThemedText accessibilityRole="header" style={styles.mealHeading}>{slot.label}</ThemedText>
            {entry ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${entry.recipe_name}, ${slot.label}`} onPress={() => editEntry(entry)} style={[styles.filledMeal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <RecipeCover recipe={{ name: entry.recipe_name ?? 'Recipe', cover_kind: entry.cover_kind ?? 'initials', cover_emoji: entry.cover_emoji ?? null }} size="row" />
              <View style={styles.mealInfo}><ThemedText numberOfLines={2} style={styles.recipeTitle}>{entry.recipe_name}</ThemedText><ThemedText themeColor="textSecondary">{entry.archived_at ? 'Archived recipe' : 'Household meal'}</ThemedText></View>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
            </Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`Add ${slot.label}`} onPress={() => addEntry(activeDay, slot.id)} style={[styles.emptyMeal, { borderColor: theme.border }]}>
              <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={19} tintColor={theme.link} /><ThemedText themeColor="link">Add {slot.label.toLocaleLowerCase()}</ThemedText>
            </Pressable>}
          </View>;
        })}
      </View> : null}
      {Platform.OS === 'web' ? <PrimaryButton onPress={() => void refresh()} title="Refresh week" /> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 34, fontWeight: '700', lineHeight: 40 },
  todayAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  weekHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  weekNavigation: { alignItems: 'center', flexDirection: 'row' },
  iconButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  weekText: { fontSize: 15, fontWeight: '600' },
  dayRail: { gap: 8, paddingVertical: 3 },
  day: { alignItems: 'center', borderRadius: 18, gap: 5, justifyContent: 'center', minWidth: 46, paddingHorizontal: 8, paddingVertical: 9 },
  dayLabel: { fontSize: 12, fontWeight: '600' },
  dayNumber: { fontSize: 16, fontWeight: '700' },
  dayDot: { borderRadius: 3, height: 5, width: 5 },
  reviewBanner: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', padding: 16 },
  reviewIcon: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  disabledBanner: { opacity: 0.55 },
  reviewCopy: { flex: 1, gap: 5 },
  reviewTitle: { fontSize: 16, fontWeight: '700' },
  mealList: { gap: 20 },
  dayHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  dayTitle: { fontSize: 19, fontWeight: '700' },
  mealSection: { gap: 8 },
  mealHeading: { fontSize: 18, fontWeight: '700', marginLeft: 2 },
  filledMeal: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 82, padding: 12 },
  mealInfo: { flex: 1, gap: 5 },
  recipeTitle: { fontSize: 16, fontWeight: '600' },
  emptyMeal: { alignItems: 'center', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 62, paddingHorizontal: 15 },
  errorBlock: { gap: 10 },
});
