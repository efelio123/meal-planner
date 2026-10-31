import { mealDraftPayload } from './meal-entry';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton } from '@/components/themed-controls';
import { MealPlanCard } from './meal-plan-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { DisclosureChevron, TabPageHeader, visualStyles } from '@/components/visual-roles';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useMealPlanContext } from './meal-plan-context';
import { useTheme } from '@/hooks/use-theme';
import type { MealPlanEntry, MealSlot } from '@/lib/api';
import { MealPlanAddSheet, MealPlanEditSheet } from './meal-plan-sheets';
import { addCalendarDays, dateLabel, dayNumber, MEAL_SLOTS, shoppingReviewWeekStart, shortDayLabel } from './meal-plan-utils';
import { useMealPlan } from './use-meal-plan';

function entryKey(entry: MealPlanEntry) { return `${entry.id}:${entry.edit_revision}`; }

export function MealPlanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const flow = useNativeSheetFlow();
  const mealPlanContext = useMealPlanContext();
  const { householdId, scope, weekOffset, week, loading, refreshing, error, refresh, changeWeek, setTodayWeek, create, update, remove, pendingRemovalIds, blockedRemovalIds } = useMealPlan();
  const [daySelection, setDaySelection] = useState<{ scope: string; day: string | null }>({ scope: '', day: null });
  const lastFocus = useRef(false);
  const latestRefresh = useRef(refresh);
  useEffect(() => { latestRefresh.current = refresh; }, [refresh]);
  const dates = useMemo(() => week ? Array.from({ length: 7 }, (_, index) => addCalendarDays(week.week_start, index)) : [], [week]);
  const selectedDay = daySelection.scope === scope ? daySelection.day : null;
  const activeDay = selectedDay && dates.includes(selectedDay) ? selectedDay : week?.local_today && dates.includes(week.local_today) ? week.local_today : dates[0] ?? null;
  const entries = week?.entries ?? [];

  const interaction = useMemo(() => ({ scope, weekOffset, activeDay }), [activeDay, scope, weekOffset]);
  const currentInteraction = useRef(interaction);
  const latestWeek = useRef(week);
  const latestWrites = useRef({ loading, refreshing, pendingRemovalIds, blockedRemovalIds });
  const screenFocused = useRef(true);
  const appActive = useRef(true);
  const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);
  const [swipeResetVersion, setSwipeResetVersion] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const suppressRowPressUntil = useRef(0);
  const swipeEpoch = useRef(0);
  const swipeIntents = useRef(new Map<string, { interaction: typeof interaction; epoch: number }>());
  const scrollOffsetY = useRef(0);
  const scrollDragStartY = useRef(0);
  const scrollStartedAfterReveal = useRef(false);
  const closeSwipe = useCallback(() => {
    swipeEpoch.current += 1;
    swipeIntents.current.clear();
    scrollStartedAfterReveal.current = false;
    setOpenSwipeKey(null);
    // Explicit resets also replace an unrevealed, partly dragged native row;
    // active=false alone would not change while that initial pan is in flight.
    setSwipeResetVersion((current) => current + 1);
  }, []);
  useLayoutEffect(() => {
    const weekChanged = latestWeek.current !== week;
    latestWeek.current = week;
    latestWrites.current = { loading, refreshing, pendingRemovalIds, blockedRemovalIds };
    if (currentInteraction.current === interaction) { if (weekChanged) closeSwipe(); return; }
    currentInteraction.current = interaction;
    closeSwipe();
    suppressRowPressUntil.current = 0;
    setActionError(null);
  }, [blockedRemovalIds, closeSwipe, interaction, loading, pendingRemovalIds, refreshing, week]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appActive.current = state === 'active';
      if (state !== 'active') closeSwipe();
    });
    return () => subscription?.remove();
  }, [closeSwipe]);
  // Returning to Plan reconciles changes from another phone. Swipe state is
  // feature-owned and never closes merely because a reveal rerenders the page.
  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    if (lastFocus.current) void latestRefresh.current({ quiet: true });
    lastFocus.current = true;
    return () => { screenFocused.current = false; closeSwipe(); };
  }, [closeSwipe]));
  const isCurrentMeal = useCallback((entry: MealPlanEntry) => {
    const writes = latestWrites.current;
    if (currentInteraction.current !== interaction || !screenFocused.current || !appActive.current || writes.loading || writes.refreshing) return false;
    if (writes.pendingRemovalIds.has(entry.id) || writes.blockedRemovalIds.has(entry.id)) return false;
    const current = latestWeek.current?.entries.find((item) => item.id === entry.id);
    return current?.edit_revision === entry.edit_revision && current.planned_for === activeDay && current.meal_slot === entry.meal_slot;
  }, [activeDay, interaction]);
  const beginSwipe = useCallback((entry: MealPlanEntry) => {
    if (!isCurrentMeal(entry)) return;
    const key = entryKey(entry);
    swipeIntents.current.set(key, { interaction, epoch: swipeEpoch.current });
    suppressRowPressUntil.current = Date.now() + 10000;
    setOpenSwipeKey((current) => current && current !== key ? null : current);
  }, [interaction, isCurrentMeal]);
  const validIntent = useCallback((entry: MealPlanEntry) => {
    const intent = swipeIntents.current.get(entryKey(entry));
    return isCurrentMeal(entry) && intent?.interaction === interaction && intent.epoch === swipeEpoch.current;
  }, [interaction, isCurrentMeal]);
  const revealSwipe = useCallback((entry: MealPlanEntry) => {
    if (!validIntent(entry)) return;
    scrollStartedAfterReveal.current = false;
    scrollDragStartY.current = scrollOffsetY.current;
    setOpenSwipeKey(entryKey(entry));
  }, [validIntent]);
  const removeFromSwipe = useCallback(async (entry: MealPlanEntry) => {
    if (!validIntent(entry)) throw new Error('The selected meal changed. Please try again.');
    swipeIntents.current.delete(entryKey(entry));
    setOpenSwipeKey(null);
    setActionError(null);
    try { await remove(entry.id, entry.edit_revision); }
    catch (reason) {
      if (currentInteraction.current === interaction && screenFocused.current) {
        setActionError(reason instanceof Error ? reason.message : 'We couldn’t remove this planned meal. Please try again.');
      }
      throw reason;
    }
  }, [interaction, remove, validIntent]);
  const endSwipe = useCallback(() => {
    if (currentInteraction.current === interaction) suppressRowPressUntil.current = Date.now() + 500;
  }, [interaction]);
  const closeMealSwipe = useCallback((entry: MealPlanEntry) => {
    const key = entryKey(entry);
    swipeIntents.current.delete(key);
    if (currentInteraction.current === interaction) setOpenSwipeKey((current) => current === key ? null : current);
  }, [interaction]);
  const refreshPlan = async () => { closeSwipe(); setActionError(null); await refresh(); };

  const addEntry = (day: string, slot: MealSlot) => {
    if (!householdId || !week || currentInteraction.current !== interaction || !screenFocused.current) return;
    closeSwipe();
    const id = flow.present(
      <MealPlanAddSheet householdId={householdId} weekOffset={weekOffset} dates={dates} initialDate={day} initialSlot={slot} onSave={async (draft) => {
        await create(mealDraftPayload(draft));
        if (mealPlanContext.scope === scope) setDaySelection({ scope, day: draft.plannedFor });
      }} />,
      { detents: [0.62, 0.96], initialDetent: 1, onDismiss: mealPlanContext.clearRecipeCreate },
    );
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/add', params: { sheetId: id } } as never);
  };
  const editEntry = useCallback((entry: MealPlanEntry) => {
    if (!householdId || !week || !isCurrentMeal(entry) || Date.now() < suppressRowPressUntil.current) return;
    const wasRevealed = openSwipeKey === entryKey(entry);
    closeSwipe();
    if (wasRevealed) return;
    const id = flow.present(
      <MealPlanEditSheet householdId={householdId} dates={dates} entry={entry}
        onSave={(draft) => update(entry.id, { ...mealDraftPayload(draft), expected_revision: draft.expected_revision })}
        onRemove={() => remove(entry.id, entry.edit_revision)}
        onReload={() => refresh()} />,
      { detents: [0.62, 0.96], initialDetent: 1 },
    );
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/edit', params: { sheetId: id } } as never);
  }, [closeSwipe, dates, flow, householdId, isCurrentMeal, openSwipeKey, refresh, remove, router, update, week]);

  const weekText = week ? (() => {
    const startMonth = dateLabel(week.week_start, { month: 'long' });
    const endMonth = dateLabel(week.week_end, { month: 'long' });
    return startMonth === endMonth
      ? `${startMonth} ${dateLabel(week.week_start, { day: 'numeric' })}–${dateLabel(week.week_end, { day: 'numeric' })}`
      : `${dateLabel(week.week_start, { month: 'long', day: 'numeric' })}–${dateLabel(week.week_end, { month: 'long', day: 'numeric' })}`;
  })() : '';
  const daysWithEntries = new Set(entries.map((entry) => entry.planned_for));
  const activeDayEntries = entries.filter((entry) => entry.planned_for === activeDay);
  const reviewStart = shoppingReviewWeekStart(week, loading, error);
  const reviewUnavailable = reviewStart === null;
  const openShoppingReview = () => {
    if (!reviewStart || currentInteraction.current !== interaction || !screenFocused.current) return;
    closeSwipe();
    router.push({ pathname: '/(app)/(tabs)/plan/shopping-review', params: { weekStart: reviewStart } } as never);
  };

  return <Screen layout="tab-root" contentAlignment="top" testID="meal-plan-screen" onRefresh={refreshPlan} refreshing={refreshing}
    onScrollBeginDrag={(event) => {
      scrollStartedAfterReveal.current = Boolean(openSwipeKey);
      scrollDragStartY.current = event.nativeEvent.contentOffset.y;
      scrollOffsetY.current = scrollDragStartY.current;
    }}
    onScroll={(event) => {
      scrollOffsetY.current = event.nativeEvent.contentOffset.y;
      if (openSwipeKey && scrollStartedAfterReveal.current && Math.abs(scrollOffsetY.current - scrollDragStartY.current) > 12) closeSwipe();
    }}>
    <View style={styles.page}>
      <TabPageHeader title="Plan" actions={<Pressable accessibilityRole="button" onPress={() => { closeSwipe(); setDaySelection({ scope, day: null }); void setTodayWeek(); }} style={styles.todayAction}><ThemedText themeColor="link">Today</ThemedText></Pressable>} />
      <View style={styles.weekHeader}>
        <View><ThemedText themeColor="textSecondary" style={styles.eyebrow}>THIS WEEK</ThemedText><ThemedText style={styles.weekText}>{weekText || 'This week'}</ThemedText></View>
        <View style={styles.weekNavigation}>
          <Pressable accessibilityLabel="Previous week" accessibilityRole="button" onPress={() => { closeSwipe(); setDaySelection({ scope, day: null }); changeWeek(-1); }} style={styles.iconButton}><SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={20} tintColor={theme.text} /></Pressable>
          <Pressable accessibilityLabel="Next week" accessibilityRole="button" onPress={() => { closeSwipe(); setDaySelection({ scope, day: null }); changeWeek(1); }} style={styles.iconButton}><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={theme.text} /></Pressable>
        </View>
      </View>
      {week ? <View testID="meal-plan-week-strip" style={styles.dayRail}>
        {dates.map((day) => {
          const active = activeDay === day;
          return <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${shortDayLabel(day)} ${dateLabel(day, { month: 'long', day: 'numeric' })}`} accessibilityState={{ selected: active }} onPress={() => { closeSwipe(); setDaySelection({ scope, day }); }} style={[styles.day, active && { backgroundColor: theme.primary }]}>
            <ThemedText themeColor={active ? undefined : 'textSecondary'} style={[styles.dayLabel, active && { color: theme.primaryText }]}>{shortDayLabel(day)}</ThemedText>
            <ThemedText style={[styles.dayNumber, active && { color: theme.primaryText }]}>{dayNumber(day)}</ThemedText>
            <View testID={`meal-plan-day-dot-${day}`} style={[styles.dayDot, { backgroundColor: active ? theme.primaryText : daysWithEntries.has(day) ? theme.primary : 'transparent' }]} />
          </Pressable>;
        })}
      </View> : null}
      <Pressable accessibilityLabel="Review shopping needs" accessibilityRole="button" disabled={reviewUnavailable} onPress={openShoppingReview} style={[styles.reviewBanner, { backgroundColor: theme.surfaceSelected, borderColor: theme.border }, reviewUnavailable && styles.disabledBanner]}>
        <View style={[styles.reviewIcon, { backgroundColor: theme.primary }]}><SymbolView name={{ ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' }} size={22} tintColor={theme.primaryText} /></View>
        <View style={styles.reviewCopy}><ThemedText style={styles.reviewTitle}>Review shopping needs</ThemedText><ThemedText themeColor="textSecondary">Choose ingredients to add to Shopping</ThemedText></View>
        <DisclosureChevron variant="action" />
      </Pressable>
      {loading && !week ? <ActivityIndicator accessibilityLabel="Loading meal plan" color={theme.activity} /> : null}
      {error || actionError ? <View style={styles.errorBlock}><ThemedText accessibilityRole="alert" themeColor="error">{actionError ?? error}</ThemedText><PrimaryButton onPress={() => void refreshPlan()} title="Retry" /></View> : null}
      {!loading && !error && !week ? <ThemedText themeColor="textSecondary">Your week could not be loaded.</ThemedText> : null}
      {activeDay && week ? <View style={styles.mealList}>
        <View style={styles.dayHeading}><ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>{dateLabel(activeDay)}</ThemedText><ThemedText themeColor="textSecondary">{activeDayEntries.length} {activeDayEntries.length === 1 ? 'meal' : 'meals'}</ThemedText></View>
        {MEAL_SLOTS.map((slot) => {
          const entry = entries.find((candidate) => candidate.planned_for === activeDay && candidate.meal_slot === slot.id);
          return <View key={slot.id} style={styles.mealSection}>
            <ThemedText accessibilityRole="header" style={styles.mealHeading}>{slot.label}</ThemedText>
            {entry ? <MealPlanCard key={`${scope}:${entryKey(entry)}:${swipeResetVersion}`} entry={entry} slotLabel={slot.label}
              active={openSwipeKey === entryKey(entry)} pending={pendingRemovalIds.has(entry.id)} blocked={blockedRemovalIds.has(entry.id)} swipeEnabled={!loading && !refreshing}
              onEdit={editEntry} onStart={beginSwipe} onEnd={endSwipe} onReveal={revealSwipe} onClose={closeMealSwipe} onRemove={removeFromSwipe} /> : <Pressable accessibilityRole="button" accessibilityLabel={`Add ${slot.label}`} onPress={() => addEntry(activeDay, slot.id)} style={[styles.emptyMeal, { borderColor: theme.border }]}>
              <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={19} tintColor={theme.link} /><ThemedText themeColor="link">Add {slot.label.toLocaleLowerCase()}</ThemedText>
            </Pressable>}
          </View>;
        })}
      </View> : null}
      {Platform.OS === 'web' ? <PrimaryButton onPress={() => void refreshPlan()} title="Refresh week" /> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  todayAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  weekHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  weekNavigation: { alignItems: 'center', flexDirection: 'row' },
  iconButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  weekText: { fontSize: 15, fontWeight: '600' },
  dayRail: { flexDirection: 'row', paddingVertical: 3, width: '100%' },
  day: { alignItems: 'center', borderRadius: 18, flex: 1, gap: 5, justifyContent: 'center', minWidth: 0, paddingHorizontal: 2, paddingVertical: 9 },
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
  mealSection: { gap: 8 },
  mealHeading: { fontSize: 18, fontWeight: '700', marginLeft: 2 },
  emptyMeal: { alignItems: 'center', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 62, paddingHorizontal: 15 },
  errorBlock: { gap: 10 },
});
