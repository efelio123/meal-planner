import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type GetToken, type MealPlanNeed, type MealPlanShoppingReview } from '@/lib/api';
import { useMealPlanContext } from './meal-plan-context';
import { dateLabel, formatAmount, newMealRequestId, preserveShoppingAmountOverrides, shortDayLabel } from './meal-plan-utils';
import { ShoppingAmountSheet } from './shopping-amount-sheet';

export function ShoppingReviewScreen() {
  const { weekStart = '' } = useLocalSearchParams<{ weekStart: string }>();
  const theme = useTheme();
  const router = useRouter();
  const sheetFlow = useNativeSheetFlow();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const householdId = selectedHousehold?.id ?? null;
  const { markShoppingChanged } = useMealPlanContext();
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${weekStart}`;
  const scopeRef = useRef(scope);
  const latestToken = useRef<GetToken>(getToken);
  const generation = useRef(0);
  const confirmationVersion = useRef(0);
  const [requestId, setRequestId] = useState(() => newMealRequestId());
  const [review, setReview] = useState<MealPlanShoppingReview | null>(null);
  const reviewRef = useRef<MealPlanShoppingReview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const amountOverridesRef = useRef<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
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
    if (!householdId || !weekStart) { setLoading(false); setError('Choose a week from Plan before reviewing shopping needs.'); return; }
    const startedScope = scopeRef.current;
    const version = ++generation.current;
    confirmationVersion.current += 1;
    setLoading(true); setError(null); setNotice(null); setReviewNeedsRefresh(false);
    try {
      const result = await api.mealPlanShoppingReview(() => latestToken.current(), householdId, weekStart);
      if (generation.current !== version || scopeRef.current !== startedScope) return;
      const preservedOverrides = preserveShoppingAmountOverrides(reviewRef.current, amountOverridesRef.current, result);
      reviewRef.current = result;
      setReview(result);
      amountOverridesRef.current = preservedOverrides;
      setAmountOverrides(preservedOverrides);
      setSelected(result.needs.filter((need) => need.default_selected).map((need) => need.need_key));
      setRequestId(newMealRequestId());
      setReviewNeedsRefresh(false);
    } catch (reason) {
      if (generation.current === version && scopeRef.current === startedScope) {
        setError(reason instanceof ApiError ? reason.message : 'We couldn’t load shopping needs. Please try again.');
        if (reviewRef.current) {
          setReviewNeedsRefresh(true);
          setNotice('This review may be out of date. Refresh it before adding items.');
        }
      }
    } finally {
      if (generation.current === version && scopeRef.current === startedScope) setLoading(false);
    }
  }, [householdId, weekStart]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  const needs = useMemo(() => review?.needs ?? [], [review]);
  const selectedNeeds = useMemo(() => needs.filter((need) => selected.includes(need.need_key)), [needs, selected]);
  const duplicateSelected = selectedNeeds.some((need) => need.existing_matches.length > 0);

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
          if (scopeRef.current !== startedScope) return;
          setAmountOverride(need, amount);
          router.back();
        }}
      />,
      { detents: [0.52, 0.92] },
    );
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/shopping-amount', params: { sheetId: id } } as never);
  };

  const submitSelected = async () => {
    if (!householdId || !review || !selectedNeeds.length || submitting || reviewNeedsRefresh) return;
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
        review_token: review.review_token,
        request_id: requestId,
        selected_need_keys: selectedNeeds.map((need) => need.need_key),
        ...(Object.keys(selectedOverrides).length ? { amount_overrides: selectedOverrides } : {}),
      });
      if (scopeRef.current !== startedScope) return;
      markShoppingChanged(householdId, result.items.length, requestId);
      router.dismissAll();
      router.navigate('/(app)/(tabs)/shopping' as never);
    } catch (reason) {
      if (scopeRef.current !== startedScope) return;
      setError(reason instanceof ApiError ? reason.message : 'We couldn’t add those items. Please retry.');
      if (reason instanceof ApiError && (reason.code === 'MEAL_PLAN_REVIEW_STALE' || reason.code === 'MEAL_PLAN_REQUEST_REUSED' || reason.status < 500)) {
        setReviewNeedsRefresh(true);
      }
      if (reason instanceof ApiError && reason.code === 'MEAL_PLAN_REVIEW_STALE') setNotice('Refresh this review to see the latest plan and Shopping matches.');
    } finally {
      if (scopeRef.current === startedScope) setSubmitting(false);
    }
  };

  const confirm = () => {
    if (!householdId || !review || !selectedNeeds.length || submitting || reviewNeedsRefresh) return;
    if (!duplicateSelected) { void submitSelected(); return; }
    const startedScope = scopeRef.current;
    const startedVersion = confirmationVersion.current;
    const addAnyway = () => {
      if (scopeRef.current !== startedScope || confirmationVersion.current !== startedVersion || reviewRef.current !== review) return;
      void submitSelected();
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm('Some items are already in the shopping list. Add separate lines anyway?')) addAnyway();
      return;
    }
    Alert.alert('Some items are already in the shopping list', 'Adding anyway creates separate lines without changing the items already there.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add anyway', onPress: addAnyway },
    ]);
  };

  const toggleSelected = (needKey: string) => {
    confirmationVersion.current += 1;
    setRequestId(newMealRequestId());
    setNotice(null);
    setSelected((current) => current.includes(needKey) ? current.filter((key) => key !== needKey) : [...current, needKey]);
  };

  return <Screen contentAlignment="top" nativeTabBottomInset safeAreaEdges={['left', 'right']} onRefresh={load} refreshing={loading} footer={review && needs.length > 0 ? <View style={[styles.footer, { backgroundColor: theme.screen, borderTopColor: theme.border }]}>
    <ThemedText themeColor="textSecondary" style={styles.footerNote}>Nothing is added until you confirm.</ThemedText>
    <PrimaryButton disabled={!selected.length || submitting || loading || reviewNeedsRefresh || Boolean(error)} onPress={confirm} title={submitting ? 'Adding…' : `Add ${selected.length} selected to Shopping`} />
  </View> : undefined}>
    <Stack.Screen options={{ title: 'Shopping needs', headerBackButtonDisplayMode: 'minimal' }} />
    <View style={styles.content}>
      {review ? <ThemedText themeColor="link" style={styles.eyebrow}>WEEK OF {dateLabel(review.week_start, { month: 'long', day: 'numeric' }).toLocaleUpperCase()}</ThemedText> : null}
      <ThemedText accessibilityRole="header" style={styles.title}>Review what to buy</ThemedText>
      <ThemedText themeColor="textSecondary">Ingredients from this week’s planned meals. Select only what your household needs.</ThemedText>
      {loading && !review ? <ActivityIndicator accessibilityLabel="Loading shopping needs" color={theme.activity} /> : null}
      {error ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText><PrimaryButton disabled={loading} onPress={() => void load()} title="Retry" /></View> : null}
      {review && needs.length === 0 ? <ThemedText themeColor="textSecondary">No recipe ingredients are planned for this week.</ThemedText> : null}
      {review && needs.length > 0 ? <>
        <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={styles.sectionTitle}>Ingredients</ThemedText><Pressable accessibilityRole="button" disabled={submitting || loading || Boolean(error)} accessibilityState={{ disabled: submitting || loading || Boolean(error) }} accessibilityLabel={selected.length === needs.length ? 'Deselect all ingredients' : 'Select all ingredients'} onPress={() => { confirmationVersion.current += 1; setRequestId(newMealRequestId()); setSelected(selected.length === needs.length ? [] : needs.map((need) => need.need_key)); setNotice(null); }}><ThemedText themeColor="link">{selected.length === needs.length ? 'Deselect all' : 'Select all'}</ThemedText></Pressable></View>
        <View style={[styles.needList, { backgroundColor: theme.surface }]}>
          {needs.map((need, index) => <NeedRow key={need.need_key} need={need} buyAmount={amountOverrides[need.need_key] ?? need.amount} first={index === 0} selected={selected.includes(need.need_key)} expanded={expanded.includes(need.need_key)} disabled={submitting || loading || Boolean(error)} editDisabled={submitting || loading || reviewNeedsRefresh} onToggle={() => toggleSelected(need.need_key)} onEditAmount={() => editAmount(need)} onExpand={() => setExpanded((current) => current.includes(need.need_key) ? current.filter((item) => item !== need.need_key) : [...current, need.need_key])} />)}
        </View>
        {needs.some((need) => need.existing_matches.length > 0) ? <>
          <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={styles.sectionTitle}>Already on Shopping</ThemedText></View>
          <View style={[styles.needList, { backgroundColor: theme.surface }]}>{needs.filter((need) => need.existing_matches.length > 0).map((need, index) => <View key={`existing-${need.need_key}`} style={[styles.existingRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.needInfo}><ThemedText style={styles.needName}>{need.name}</ThemedText><ThemedText themeColor="textSecondary" numberOfLines={2}>{[need.sources[0] ? `${need.sources[0].recipe_name} · ${shortDayLabel(need.sources[0].planned_for)}` : null, ...need.existing_matches.map((match) => match.kind === 'exact' ? 'Already on list' : `Possible match · ${match.name}`)].filter(Boolean).join(' · ')}</ThemedText></View>
            <ThemedText style={styles.amount}>{formatAmount(need.amount, need.unit_label)}</ThemedText>
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
    ? `${need.sources[0].recipe_name} · ${shortDayLabel(need.sources[0].planned_for)}`
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
        <ThemedText themeColor="link">Used in {need.sources.length} meals</ThemedText><SymbolView name={{ ios: expanded ? 'chevron.up' : 'chevron.down', android: expanded ? 'expand_less' : 'expand_more', web: expanded ? 'expand_less' : 'expand_more' }} size={18} tintColor={theme.link} />
      </Pressable>
      {expanded ? <View style={styles.sourceList}>{need.sources.map((source, index) => <View key={`${source.planned_for}-${source.meal_slot}-${index}`} style={styles.sourceRow}>
        <View style={styles.sourceCopy}><ThemedText themeColor="textSecondary">{shortDayLabel(source.planned_for)} · {source.recipe_name}</ThemedText>{source.note ? <ThemedText themeColor="textSecondary">{source.note}</ThemedText> : null}</View><ThemedText style={styles.amount}>{formatAmount(source.amount, source.unit_label)}</ThemedText>
      </View>)}</View> : null}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 15, paddingBottom: 8 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 25, fontWeight: '700', lineHeight: 31, marginTop: -7 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 19, fontWeight: '700' },
  needList: { borderRadius: 15, overflow: 'hidden', paddingHorizontal: 12 },
  needCard: { backgroundColor: 'transparent' },
  needMain: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 72, paddingHorizontal: 0, paddingVertical: 10 },
  checkbox: { alignItems: 'center', height: 42, justifyContent: 'center', width: 30 },
  checkIcon: { alignItems: 'center', borderRadius: 7, borderWidth: 1.5, height: 23, justifyContent: 'center', width: 23 },
  needInfo: { flex: 1, gap: 4, minWidth: 0 },
  needName: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  editAmountAction: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 42, minWidth: 84, paddingLeft: 4 },
  amountSummary: { fontSize: 12, fontWeight: '600', marginLeft: 38, marginBottom: 10 },
  sourceAction: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 42, marginLeft: 32, paddingHorizontal: 0 },
  sourceList: { gap: 10, paddingLeft: 32, paddingBottom: 14, paddingTop: 9 },
  sourceRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  sourceCopy: { flex: 1, gap: 3 },
  existingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 50, paddingVertical: 8 },
  message: { gap: 10 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingHorizontal: 24, paddingTop: 9, paddingBottom: Platform.OS === 'web' ? 12 : 6 },
  footerNote: { fontSize: 12, textAlign: 'center' },
});
