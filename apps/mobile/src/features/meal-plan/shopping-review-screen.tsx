import { ReviewShoppingItemSheet } from './review-shopping-item-sheet';
import { reconcileShoppingReview } from './review-reconciliation';
import { PlanningDateSheet } from './planning-date-sheet';
import { calendarDay, isCalendarDate, rangeDays, rangeError, rangeLabel } from './planning-dates';
import { useShoppingList } from '@/features/shopping-list/use-shopping-list';
import { useAuth } from '@clerk/expo';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { DisclosureChevron, ExpansionChevron, visualStyles } from '@/components/visual-roles';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type GetToken, type MealPlanNeed, type MealPlanShoppingReview } from '@/lib/api';
import { useMealPlanContext } from './meal-plan-context';
import { dateLabel, formatAmount, newMealRequestId } from './meal-plan-utils';
import { ShoppingAmountSheet } from './shopping-amount-sheet';

export function ShoppingReviewScreen() {
  const { weekStart = '', weekEnd } = useLocalSearchParams<{ weekStart: string; weekEnd?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const sheetFlow = useNativeSheetFlow();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const householdId = selectedHousehold?.id ?? null;
  const { invalidate: refreshShopping } = useShoppingList();
  const { markShoppingChanged } = useMealPlanContext();
  const identity = JSON.stringify([userId ?? '', sessionId ?? '', householdId ?? '', weekStart, weekEnd ?? '']);
  const [chosenRange, setChosenRange] = useState({ identity, start: weekStart, end: weekEnd ?? (isCalendarDate(weekStart) ? calendarDay(weekStart, 6) : '') });
  const start = chosenRange.identity === identity ? chosenRange.start : weekStart;
  const end = chosenRange.identity === identity ? chosenRange.end : weekEnd ?? (isCalendarDate(weekStart) ? calendarDay(weekStart, 6) : '');
  const invalidRange = rangeError(start, end);
  const scope = JSON.stringify([identity, start, end]);
  const mounted = useRef(true);
  const submittingRequest = useRef<string | null>(null);
  const scopeRef = useRef(scope);
  const latestToken = useRef<GetToken>(getToken);
  const generation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  const confirmationVersion = useRef(0);
  const [requestId, setRequestId] = useState(() => newMealRequestId());
  const [review, setReview] = useState<MealPlanShoppingReview | null>(null);
  const reviewRef = useRef<MealPlanShoppingReview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedRef = useRef(selected);
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const amountOverridesRef = useRef<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const expandedRef = useRef(expanded);
  const editorIntent = useRef<object | null>(null);
  const [editingShoppingItem, setEditingShoppingItem] = useState(false);
  const pendingEditorReturn = useRef<string | null>(null);
  const reviewFocused = useRef(false);
  useLayoutEffect(() => { selectedRef.current = selected; expandedRef.current = expanded; }, [expanded, selected]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewNeedsRefresh, setReviewNeedsRefresh] = useState(false);

  useEffect(() => { latestToken.current = getToken; }, [getToken]);
  useEffect(() => () => { confirmationVersion.current += 1; }, []);
  useLayoutEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    editorIntent.current = null; pendingEditorReturn.current = null; setEditingShoppingItem(false);
    submittingRequest.current = null;
    generation.current += 1;
    confirmationVersion.current += 1;
    reviewRef.current = null;
    setReview(null); setSelected([]); setExpanded([]); setError(null); setNotice(null);
    amountOverridesRef.current = {};
    setAmountOverrides({});
    setReviewNeedsRefresh(false); setSubmitting(false);
    setRequestId(newMealRequestId());
    setLoading(Boolean(householdId));
  }, [householdId, scope]);

  const load = useCallback(async () => {
    if (!householdId || invalidRange) { setLoading(false); setError(invalidRange ?? 'Choose dates from Plan before reviewing shopping needs.'); return; }
    const startedScope = scopeRef.current;
    const version = ++generation.current;
    confirmationVersion.current += 1;
    setLoading(true); setError(null); setNotice(null); setReviewNeedsRefresh(false);
    try {
      const result = await api.mealPlanShoppingReview(() => latestToken.current(), householdId, start, end);
      if (!mounted.current || generation.current !== version || scopeRef.current !== startedScope) return;
      const reconciled = reconcileShoppingReview(reviewRef.current, selectedRef.current, amountOverridesRef.current, expandedRef.current, result);
      reviewRef.current = result;
      setReview(result);
      amountOverridesRef.current = reconciled.overrides;
      setAmountOverrides(reconciled.overrides);
      selectedRef.current = reconciled.selected; setSelected(reconciled.selected);
      expandedRef.current = reconciled.expanded; setExpanded(reconciled.expanded);
      if (reconciled.adjustedAmountsChanged) setNotice('Some required ingredients changed. Review their amounts before adding them.');
      setRequestId(newMealRequestId());
      setReviewNeedsRefresh(false);
    } catch (reason) {
      if (mounted.current && generation.current === version && scopeRef.current === startedScope) {
        setError(reason instanceof ApiError ? reason.message : 'We couldn’t load shopping needs. Please try again.');
        if (reviewRef.current) {
          setReviewNeedsRefresh(true);
          setNotice('This review may be out of date. Refresh it before adding items.');
        }
      }
    } finally {
      if (mounted.current && generation.current === version && scopeRef.current === startedScope) setLoading(false);
    }
  }, [end, householdId, invalidRange, start]);

  useEffect(() => {
    if (reviewRef.current) return;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  const latestLoad = useRef(load);
  useLayoutEffect(() => { latestLoad.current = load; }, [load]);
  const reconcileEditorReturn = useCallback(() => {
    if (!mounted.current || !reviewFocused.current || pendingEditorReturn.current !== scopeRef.current) return;
    pendingEditorReturn.current = null;
    void latestLoad.current();
  }, []);
  useFocusEffect(useCallback(() => {
    reviewFocused.current = true;
    reconcileEditorReturn();
    return () => { reviewFocused.current = false; };
  }, [reconcileEditorReturn]));
  const editShoppingMatch = (need: MealPlanNeed) => {
    const match = need.existing_matches[0];
    if (!match || !householdId || loading || submittingRequest.current || editorIntent.current) return;
    const intent = {};
    const startedScope = scopeRef.current;
    editorIntent.current = intent; setEditingShoppingItem(true);
    setReviewNeedsRefresh(true);
    const id = sheetFlow.present(<ReviewShoppingItemSheet itemId={match.item_id} />, {
      detents: [0.68, 0.94], initialDetent: 1,
      onDismiss: () => {
        if (editorIntent.current !== intent || scopeRef.current !== startedScope) return;
        editorIntent.current = null; setEditingShoppingItem(false);
        pendingEditorReturn.current = startedScope;
        reconcileEditorReturn();
      },
    });
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/shopping-item', params: { sheetId: id } } as never);
  };
  const needs = useMemo(() => review?.needs ?? [], [review]);
  const selectedNeeds = useMemo(() => needs.filter((need) => selected.includes(need.need_key)), [needs, selected]);
  const selectableNeeds = needs.filter((need) => need.existing_matches.length === 0);

  const setAmountOverride = (need: MealPlanNeed, amount: string) => {
    if (scopeRef.current !== scope || need.amount === null) return;
    const next = { ...amountOverridesRef.current };
    if (amount.trim() === need.amount) delete next[need.need_key];
    else next[need.need_key] = amount;
    amountOverridesRef.current = next;
    confirmationVersion.current += 1;
    setAmountOverrides(next);
    setRequestId(newMealRequestId());
    setNotice(null);
    setError(null);
    setReviewNeedsRefresh(false);
  };

  const editAmount = (need: MealPlanNeed) => {
    if (need.amount === null || submitting || loading || reviewNeedsRefresh) return;
    const startedScope = scopeRef.current;
    const id = sheetFlow.present(
      <ShoppingAmountSheet
        need={need}
        initialValue={amountOverridesRef.current[need.need_key] ?? need.amount}
        onCancel={() => router.back()}
        onDone={(amount) => {
          if (!mounted.current || scopeRef.current !== startedScope) return;
          setAmountOverride(need, amount);
          router.back();
        }}
      />,
      { detents: [0.52, 0.92] },
    );
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/shopping-amount', params: { sheetId: id } } as never);
  };

  const submitSelected = async () => {
    if (!householdId || !review || !selectedNeeds.length || submittingRequest.current || loading || invalidRange || reviewNeedsRefresh) return;
    const requestOwner = `${scope}:${requestId}`;
    submittingRequest.current = requestOwner;
    const startedScope = scopeRef.current;
    setSubmitting(true); setError(null); setNotice(null);
    try {
      const selectedOverrides: Record<string, string> = {};
      for (const need of selectedNeeds) {
        const amount = amountOverrides[need.need_key];
        if (amount !== undefined) selectedOverrides[need.need_key] = amount;
      }
      const result = await api.addMealPlanNeedsToShopping(() => latestToken.current(), householdId, {
        week_start: review.week_start,
        week_end: review.week_end,
        review_token: review.review_token,
        request_id: requestId,
        selected_need_keys: selectedNeeds.map((need) => need.need_key),
        ...(Object.keys(selectedOverrides).length ? { amount_overrides: selectedOverrides } : {}),
      });
      if (!mounted.current || scopeRef.current !== startedScope) return;
      markShoppingChanged(householdId, result.items.length, requestId);
      void refreshShopping();
      router.dismissAll();
      router.navigate('/(app)/(tabs)/shopping' as never);
    } catch (reason) {
      if (!mounted.current || scopeRef.current !== startedScope) return;
      setError(reason instanceof ApiError ? reason.message : 'We couldn’t add those items. Please retry.');
      if (reason instanceof ApiError && (reason.code === 'MEAL_PLAN_REVIEW_STALE' || reason.code === 'MEAL_PLAN_REQUEST_REUSED' || reason.status < 500)) {
        setReviewNeedsRefresh(true);
      }
      if (reason instanceof ApiError && reason.code === 'MEAL_PLAN_REVIEW_STALE') setNotice('Refresh this review to see the latest plan and Shopping matches.');
    } finally {
      if (submittingRequest.current === requestOwner) submittingRequest.current = null;
      if (mounted.current && scopeRef.current === startedScope) setSubmitting(false);
    }
  };

  const confirm = () => {
    if (!householdId || !review || !selectedNeeds.length || submitting || reviewNeedsRefresh) return;
    void submitSelected();
  };

  const chooseRangeDate = (endpoint: 'start' | 'end') => {
    if (submittingRequest.current || !isCalendarDate(start) || !isCalendarDate(end)) return;
    const startedScope = scopeRef.current;
    const id = sheetFlow.present(<PlanningDateSheet title={endpoint === 'start' ? 'Shopping from' : 'Shopping through'}
      initialDate={endpoint === 'start' ? start : end}
      validate={(date) => rangeError(endpoint === 'start' ? date : start, endpoint === 'end' ? date : end)}
      onCancel={() => router.back()}
      onDone={(date) => {
        if (!mounted.current || scopeRef.current !== startedScope || submittingRequest.current) return;
        const nextStart = endpoint === 'start' ? date : start;
        const nextEnd = endpoint === 'end' ? date : end;
        if (rangeError(nextStart, nextEnd)) return;
        if (nextStart !== start || nextEnd !== end) {
          generation.current += 1;
          confirmationVersion.current += 1;
          reviewRef.current = null; amountOverridesRef.current = {};
          setReview(null); setSelected([]); setAmountOverrides({}); setExpanded([]);
          setChosenRange({ identity, start: nextStart, end: nextEnd });
        }
        router.back();
      }} />, { detents: [0.7, 0.96] });
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/date', params: { sheetId: id } } as never);
  };

  const toggleSelected = (needKey: string) => {
    confirmationVersion.current += 1;
    setRequestId(newMealRequestId());
    setNotice(null);
    setSelected((current) => current.includes(needKey) ? current.filter((key) => key !== needKey) : [...current, needKey]);
  };

  return <Screen layout="tab-stack" contentAlignment="top" onRefresh={load} refreshing={loading} footer={review && needs.length > 0 ? <View style={[styles.footer, { backgroundColor: theme.screen, borderTopColor: theme.border }]}>
    <ThemedText themeColor="textSecondary" style={styles.footerNote}>Nothing is added until you confirm.</ThemedText>
    <PrimaryButton disabled={!selected.length || submitting || loading || reviewNeedsRefresh || Boolean(error) || Boolean(invalidRange)} onPress={confirm} title={submitting ? 'Adding…' : `Add ${selected.length} selected to Shopping`} />
  </View> : undefined}>
    <Stack.Screen options={{ title: 'Shopping needs', headerBackButtonDisplayMode: 'minimal' }} />
    <View style={styles.content}>
      {!invalidRange ? <ThemedText themeColor="link" style={styles.eyebrow}>{rangeLabel(start, end)}</ThemedText> : null}
      <ThemedText accessibilityRole="header" style={styles.title}>Review what to buy</ThemedText>
      <ThemedText themeColor="textSecondary">Ingredients from your selected dates. Select only what your household needs.</ThemedText>
      <View style={styles.rangeControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change shopping start date" disabled={submitting} onPress={() => chooseRangeDate('start')} style={[styles.rangeSelector, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText themeColor="textSecondary">From</ThemedText><View style={styles.rangeDate}><ThemedText style={{ flex: 1 }}>{isCalendarDate(start) ? dateLabel(start, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Choose date'}</ThemedText><DisclosureChevron /></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Change shopping end date" disabled={submitting} onPress={() => chooseRangeDate('end')} style={[styles.rangeSelector, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText themeColor="textSecondary">Through</ThemedText><View style={styles.rangeDate}><ThemedText style={{ flex: 1 }}>{isCalendarDate(end) ? dateLabel(end, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Choose date'}</ThemedText><DisclosureChevron /></View>
        </Pressable>
      </View>
      <ThemedText themeColor="textSecondary">{!invalidRange ? `${rangeDays(start, end)} ${rangeDays(start, end) === 1 ? 'day' : 'days'}. ` : ''}Changing dates recalculates ingredients and resets your selections and adjusted amounts.</ThemedText>
      {loading && !review ? <ActivityIndicator accessibilityLabel="Loading shopping needs" color={theme.activity} /> : null}
      {error ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText><PrimaryButton disabled={loading} onPress={() => void load()} title="Retry" /></View> : null}
      {review && needs.length === 0 ? <ThemedText themeColor="textSecondary">No recipe ingredients are planned for these dates.</ThemedText> : null}
      {review && needs.length > 0 ? <>
        <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>Ingredients</ThemedText><Pressable accessibilityRole="button" disabled={submitting || loading || Boolean(error) || selectableNeeds.length === 0} accessibilityState={{ disabled: submitting || loading || Boolean(error) || selectableNeeds.length === 0 }} accessibilityLabel={selected.length === selectableNeeds.length ? 'Deselect all ingredients' : 'Select all ingredients'} onPress={() => { confirmationVersion.current += 1; setRequestId(newMealRequestId()); setSelected(selected.length === selectableNeeds.length ? [] : selectableNeeds.map((need) => need.need_key)); setNotice(null); }} style={visualStyles.sheetAction}><ThemedText themeColor="link">{selected.length === selectableNeeds.length ? 'Deselect all' : 'Select all'}</ThemedText></Pressable></View>
        <View style={[styles.needList, { backgroundColor: theme.surface }]}>
          {needs.map((need, index) => <NeedRow key={need.need_key} need={need} buyAmount={amountOverrides[need.need_key] ?? need.amount} first={index === 0} selected={selected.includes(need.need_key)} expanded={expanded.includes(need.need_key)} disabled={submitting || loading || Boolean(error) || need.existing_matches.length > 0} editDisabled={submitting || loading || reviewNeedsRefresh} onToggle={() => toggleSelected(need.need_key)} onEditAmount={() => editAmount(need)} onExpand={() => setExpanded((current) => current.includes(need.need_key) ? current.filter((item) => item !== need.need_key) : [...current, need.need_key])} />)}
        </View>
        {needs.some((need) => need.existing_matches.length > 0) ? <>
          <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>Already on Shopping</ThemedText></View>
          <View style={[styles.needList, { backgroundColor: theme.surface }]}>{needs.filter((need) => need.existing_matches.length > 0).map((need, index) => <View key={`existing-${need.need_key}`} style={[styles.existingRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.needInfo}><ThemedText style={styles.needName}>{need.name}</ThemedText><ThemedText themeColor="textSecondary" numberOfLines={2}>{[need.sources[0] ? `${need.sources[0].recipe_name} · ${dateLabel(need.sources[0].planned_for, { month: 'short', day: 'numeric', year: 'numeric' })}` : null, 'Already on Shopping'].filter(Boolean).join(' · ')}</ThemedText></View>
            <ThemedText style={styles.amount}>{formatAmount(need.amount, need.unit_label)}</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${need.name} on Shopping`} disabled={submitting || loading || editingShoppingItem} style={visualStyles.sheetAction} onPress={() => editShoppingMatch(need)}><ThemedText themeColor="link">Edit</ThemedText></Pressable>
          </View>)}</View>
        </> : null}
        {notice ? <ThemedText accessibilityRole="alert" themeColor="textSecondary">{notice}</ThemedText> : null}
        {error && review && reviewNeedsRefresh ? <PrimaryButton disabled={submitting || loading} onPress={() => void load()} title="Refresh review" /> : null}
        {error && !reviewNeedsRefresh ? <PrimaryButton disabled={submitting || loading} onPress={confirm} title="Retry add safely" /> : null}
      </> : null}
      {Platform.OS === 'web' ? <PrimaryButton onPress={() => void load()} title="Refresh review" /> : null}
    </View>
  </Screen>;
}

function NeedRow({ need, buyAmount, first, selected, expanded, disabled, editDisabled, onToggle, onEditAmount, onExpand }: { need: MealPlanNeed; buyAmount: string | null; first: boolean; selected: boolean; expanded: boolean; disabled: boolean; editDisabled: boolean; onToggle: () => void; onEditAmount: () => void; onExpand: () => void }) {
  const theme = useTheme();
  const sourceSummary = need.sources.length === 1
    ? `${need.sources[0].recipe_name} · ${dateLabel(need.sources[0].planned_for, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : `Combined across ${need.sources.length} meals`;
  return <View style={[styles.needCard, !first && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
    <View style={styles.needMain}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`${selected ? 'Remove' : 'Select'} ${need.name}`} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onToggle} style={styles.checkbox}>
        <View style={[styles.checkIcon, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : 'transparent' }]}>{selected ? <ThemedText style={{ color: theme.primaryText, fontSize: 14, lineHeight: 17, fontWeight: '700' }}>✓</ThemedText> : null}</View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onExpand} style={styles.needInfo}>
        <ThemedText style={styles.needName}>{need.name}</ThemedText>
        <ThemedText themeColor="textSecondary" numberOfLines={1}>{sourceSummary}</ThemedText>
      </Pressable>
      {selected && need.amount !== null ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit amount to buy for ${need.name}`} accessibilityState={{ disabled: editDisabled }} disabled={editDisabled} onPress={onEditAmount} style={styles.editAmountAction}><ThemedText themeColor="link">Edit amount</ThemedText></Pressable> : null}
    </View>
    {need.amount !== null
      ? <ThemedText themeColor="textSecondary" style={styles.amountSummary}>{selected ? `${formatAmount(buyAmount, need.unit_label)} to buy · ${formatAmount(need.amount, need.unit_label)} needed` : `${formatAmount(need.amount, need.unit_label)} needed`}</ThemedText>
      : <ThemedText themeColor="textSecondary" style={styles.amountSummary}>{formatAmount(null, null)}</ThemedText>}
    {need.sources.length > 1 ? <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${need.name} meal sources`} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onExpand} style={[styles.sourceAction, { borderTopColor: theme.border }]}>
        <ThemedText themeColor="link">Used in {need.sources.length} meals</ThemedText><ExpansionChevron expanded={expanded} variant="action" />
      </Pressable>
      {expanded ? <View style={styles.sourceList}>{need.sources.map((source, index) => <View key={`${source.planned_for}-${source.meal_slot}-${index}`} style={styles.sourceRow}>
        <View style={styles.sourceCopy}><ThemedText themeColor="textSecondary">{dateLabel(source.planned_for, { month: 'short', day: 'numeric', year: 'numeric' })} · {source.recipe_name}</ThemedText>{source.note ? <ThemedText themeColor="textSecondary">{source.note}</ThemedText> : null}</View><ThemedText style={styles.amount}>{formatAmount(source.amount, source.unit_label)}</ThemedText>
      </View>)}</View> : null}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  rangeDate: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rangeControls: { flexDirection: 'row', gap: 12 },
  rangeSelector: { flex: 1, minWidth: 0, minHeight: 68, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4 },
  content: { gap: 15, paddingBottom: 8 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 25, fontWeight: '700', lineHeight: 31, marginTop: -7 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  needList: { borderRadius: 16, overflow: 'hidden', paddingHorizontal: 16 },
  needCard: { backgroundColor: 'transparent' },
  needMain: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 72, paddingHorizontal: 0, paddingVertical: 10 },
  checkbox: { alignItems: 'center', height: 44, justifyContent: 'center', width: 30 },
  checkIcon: { alignItems: 'center', borderRadius: 7, borderWidth: 1.5, height: 23, justifyContent: 'center', width: 23 },
  needInfo: { flex: 1, gap: 4, minWidth: 0 },
  needName: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  editAmountAction: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 44, minWidth: 84, paddingLeft: 4 },
  amountSummary: { fontSize: 12, fontWeight: '600', marginLeft: 38, marginBottom: 10 },
  sourceAction: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, marginLeft: 32, paddingHorizontal: 0 },
  sourceList: { gap: 10, paddingLeft: 32, paddingBottom: 14, paddingTop: 9 },
  sourceRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  sourceCopy: { flex: 1, gap: 3 },
  existingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 50, paddingVertical: 8 },
  message: { gap: 10 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingHorizontal: 24, paddingTop: 9, paddingBottom: Platform.OS === 'web' ? 12 : 6 },
  footerNote: { fontSize: 12, textAlign: 'center' },
});
