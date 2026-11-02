import { useHouseholdAccess } from '@/features/household-permissions/use-household-access';
import { PlanningDayStrip } from './planning-day-strip';
import { PlanningDateSheet } from './planning-date-sheet';
import { currentWindow, nearestVisibleDay, rangeLabel } from './planning-dates';
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
import { addCalendarDays, dateLabel, MEAL_SLOTS, shoppingReviewWeekStart } from './meal-plan-utils';
import { useMealPlan } from './use-meal-plan';

function entryKey(entry: MealPlanEntry) { return `${entry.id}:${entry.edit_revision}`; }

export function MealPlanScreen() {
  const theme = useTheme();
  const { can, canNow } = useHouseholdAccess();
  const router = useRouter();
  const flow = useNativeSheetFlow();
  const mealPlanContext = useMealPlanContext();
  const { householdId, scope, windowKey, week, loading, refreshing, error, refresh, changeWeek, changeStart, preferredWeekday, preferenceError, setTodayWeek, create, update, remove, pendingRemovalIds, blockedRemovalIds } = useMealPlan();
  const [daySelection, setDaySelection] = useState<{ scope: string; day: string | null }>({ scope: '', day: null });
  const lastFocus = useRef(false);
  const latestRefresh = useRef(refresh);
  useEffect(() => { latestRefresh.current = refresh; }, [refresh]);
  const visibleStart = typeof windowKey === 'string' ? windowKey : week?.week_start ?? null;
  const visibleEnd = visibleStart ? addCalendarDays(visibleStart, 6) : null;
  const dates = useMemo(() => visibleStart ? Array.from({ length: 7 }, (_, index) => addCalendarDays(visibleStart, index)) : [], [visibleStart]);
  const selectedDay = daySelection.scope === scope ? daySelection.day : null;
  const localToday = week?.local_today;
  const activeDay = useMemo(() => {
    if (!visibleStart || !visibleEnd) return null;
    if (selectedDay) return nearestVisibleDay(selectedDay, visibleStart, visibleEnd);
    return localToday && dates.includes(localToday) ? localToday : visibleStart;
  }, [dates, localToday, selectedDay, visibleEnd, visibleStart]);
  const entries = week?.entries ?? [];

  const interaction = useMemo(() => ({ scope, windowKey, activeDay }), [activeDay, scope, windowKey]);
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
    if (!canNow('plan.add')) return;
    if (!householdId || !week || currentInteraction.current !== interaction || !screenFocused.current) return;
    closeSwipe();
    const id = flow.present(
      <MealPlanAddSheet householdId={householdId} windowStart={week.week_start} dates={dates} initialDate={day} initialSlot={slot} onSave={async (draft) => {
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

  const weekText = visibleStart && visibleEnd ? rangeLabel(visibleStart, visibleEnd) : '';
  const chooseStart = useCallback((start: string) => {
    closeSwipe();
    if (activeDay) setDaySelection({ scope, day: nearestVisibleDay(activeDay, start, addCalendarDays(start, 6)) });
    changeStart(start);
  }, [activeDay, changeStart, closeSwipe, scope]);
  const openStartCalendar = () => {
    if (!week || loading) return;
    closeSwipe();
    const startedInteraction = currentInteraction.current;
    const id = flow.present(<PlanningDateSheet title="Week starting" initialDate={week.week_start} onCancel={() => router.back()} onDone={(start) => {
      if (currentInteraction.current !== startedInteraction) return;
      if (start !== week.week_start) chooseStart(start);
      router.back();
    }} />, { detents: [0.7, 0.96] });
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/date', params: { sheetId: id } } as never);
  };
  const daysWithEntries = new Set(entries.map((entry) => entry.planned_for));
  const activeDayEntries = entries.filter((entry) => entry.planned_for === activeDay);
  const reviewStart = shoppingReviewWeekStart(week, loading, error);
  const reviewUnavailable = reviewStart === null;
  const openShoppingReview = () => {
    if (!reviewStart || currentInteraction.current !== interaction || !screenFocused.current) return;
    closeSwipe();
    router.push({ pathname: '/(app)/(tabs)/plan/shopping-review', params: { weekStart: reviewStart, weekEnd: week?.week_end } } as never);
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
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Choose planning start date" accessibilityActions={[{ name: 'decrement', label: 'Previous day window' }, { name: 'increment', label: 'Next day window' }]} onAccessibilityAction={(event) => {
          if (!week || loading) return;
          if (event.nativeEvent.actionName === 'decrement') chooseStart(addCalendarDays(week.week_start, -1));
          if (event.nativeEvent.actionName === 'increment') chooseStart(addCalendarDays(week.week_start, 1));
        }} disabled={!week || loading} onPress={openStartCalendar}>
          <ThemedText themeColor="textSecondary" style={styles.eyebrow}>{week && week.week_start === currentWindow(week.local_today, preferredWeekday) ? 'THIS WEEK' : 'DATE RANGE'}</ThemedText><ThemedText style={styles.weekText}>{weekText || 'Loading dates'}</ThemedText>
        </Pressable>
        <View style={styles.weekNavigation}>
          <Pressable accessibilityLabel="Previous week" accessibilityRole="button" onPress={() => { closeSwipe(); if (activeDay && visibleStart && visibleEnd) setDaySelection({ scope, day: nearestVisibleDay(activeDay, addCalendarDays(visibleStart, -7), addCalendarDays(visibleEnd, -7)) }); changeWeek(-1); }} style={styles.iconButton}><SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={20} tintColor={theme.text} /></Pressable>
          <Pressable accessibilityLabel="Next week" accessibilityRole="button" onPress={() => { closeSwipe(); if (activeDay && visibleStart && visibleEnd) setDaySelection({ scope, day: nearestVisibleDay(activeDay, addCalendarDays(visibleStart, 7), addCalendarDays(visibleEnd, 7)) }); changeWeek(1); }} style={styles.iconButton}><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={theme.text} /></Pressable>
        </View>
      </View>
      {visibleStart ? <PlanningDayStrip start={visibleStart} activeDay={activeDay} plannedDates={daysWithEntries} disabled={loading || Boolean(error)} onSelect={(day) => { closeSwipe(); setDaySelection({ scope, day }); }} onStartChange={chooseStart} /> : null}
      {preferenceError ? <ThemedText accessibilityRole="alert" themeColor="error">{preferenceError}</ThemedText> : null}
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
              active={openSwipeKey === entryKey(entry)} pending={pendingRemovalIds.has(entry.id)} blocked={blockedRemovalIds.has(entry.id)} swipeEnabled={can('plan.remove') && !loading && !refreshing}
              onEdit={editEntry} onStart={beginSwipe} onEnd={endSwipe} onReveal={revealSwipe} onClose={closeMealSwipe} onRemove={removeFromSwipe} /> : can('plan.add') ? <Pressable accessibilityRole="button" accessibilityLabel={`Add ${slot.label}`} disabled={loading || Boolean(error)} onPress={() => addEntry(activeDay, slot.id)} style={[styles.emptyMeal, { borderColor: theme.border }]}>
              <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={19} tintColor={theme.link} /><ThemedText themeColor="link">Add {slot.label.toLocaleLowerCase()}</ThemedText>
            </Pressable> : <ThemedText themeColor="textSecondary">No meal planned</ThemedText>}
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
