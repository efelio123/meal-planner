import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type GetToken, type MealPlanNeed, type MealPlanShoppingReview } from '@/lib/api';
import { useMealPlanContext } from './meal-plan-context';
import { dateLabel, formatAmount, newMealRequestId, shortDayLabel } from './meal-plan-utils';

export function ShoppingReviewScreen() {
  const { weekStart = '' } = useLocalSearchParams<{ weekStart: string }>();
  const theme = useTheme();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const householdId = selectedHousehold?.id ?? null;
  const { markShoppingChanged } = useMealPlanContext();
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${weekStart}`;
  const scopeRef = useRef(scope);
  const latestToken = useRef<GetToken>(getToken);
  const generation = useRef(0);
  const [requestId, setRequestId] = useState(() => newMealRequestId());
  const [review, setReview] = useState<MealPlanShoppingReview | null>(null);
  const reviewRef = useRef<MealPlanShoppingReview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewNeedsRefresh, setReviewNeedsRefresh] = useState(false);

  useEffect(() => { latestToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    generation.current += 1;
    reviewRef.current = null;
    setReview(null); setSelected([]); setExpanded([]); setError(null); setNotice(null); setAllowDuplicate(false);
    setReviewNeedsRefresh(false); setSubmitting(false);
    setRequestId(newMealRequestId());
    setLoading(Boolean(householdId));
  }, [householdId, scope]);

  const load = useCallback(async () => {
    if (!householdId || !weekStart) { setLoading(false); setError('Choose a week from Plan before reviewing shopping needs.'); return; }
    const startedScope = scopeRef.current;
    const version = ++generation.current;
    setLoading(true); setError(null); setNotice(null); setAllowDuplicate(false); setReviewNeedsRefresh(false);
    try {
      const result = await api.mealPlanShoppingReview(() => latestToken.current(), householdId, weekStart);
      if (generation.current !== version || scopeRef.current !== startedScope) return;
      reviewRef.current = result;
      setReview(result);
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

  const confirm = async () => {
    if (!householdId || !review || !selectedNeeds.length || submitting || reviewNeedsRefresh) return;
    if (duplicateSelected && !allowDuplicate) { setAllowDuplicate(true); setNotice('Some selected items already appear on Shopping. This will add separate lines without changing the existing items.'); return; }
    const startedScope = scopeRef.current;
    setSubmitting(true); setError(null); setNotice(null);
    try {
      const result = await api.addMealPlanNeedsToShopping(() => latestToken.current(), householdId, {
        week_start: review.week_start,
        review_token: review.review_token,
        request_id: requestId,
        selected_need_keys: selectedNeeds.map((need) => need.need_key),
      });
      if (scopeRef.current !== startedScope) return;
      markShoppingChanged(householdId);
      setNotice(`${result.items.length} ${result.items.length === 1 ? 'item' : 'items'} added to Shopping.`);
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

  const toggleSelected = (needKey: string) => {
    setRequestId(newMealRequestId());
    setAllowDuplicate(false); setNotice(null);
    setSelected((current) => current.includes(needKey) ? current.filter((key) => key !== needKey) : [...current, needKey]);
  };

  return <Screen contentAlignment="top" safeAreaEdges={['left', 'right']} onRefresh={load} refreshing={loading} footer={review && needs.length > 0 ? <View style={[styles.footer, { backgroundColor: theme.screen, borderTopColor: theme.border }]}>
    <ThemedText themeColor="textSecondary" style={styles.footerNote}>Nothing is added until you confirm.</ThemedText>
    <PrimaryButton disabled={!selected.length || submitting || loading || reviewNeedsRefresh || Boolean(error)} onPress={() => void confirm()} title={submitting ? 'Adding…' : allowDuplicate ? `Add ${selected.length} selected anyway` : `Add ${selected.length} selected to Shopping`} />
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
        <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={styles.sectionTitle}>Ingredients</ThemedText><Pressable accessibilityRole="button" disabled={submitting || loading || Boolean(error)} accessibilityState={{ disabled: submitting || loading || Boolean(error) }} accessibilityLabel={selected.length === needs.length ? 'Deselect all ingredients' : 'Select all ingredients'} onPress={() => { setSelected(selected.length === needs.length ? [] : needs.map((need) => need.need_key)); setAllowDuplicate(false); setNotice(null); }}><ThemedText themeColor="link">{selected.length === needs.length ? 'Deselect all' : 'Select all'}</ThemedText></Pressable></View>
        <View style={[styles.needList, { backgroundColor: theme.surface }]}>
          {needs.map((need, index) => <NeedRow key={need.need_key} need={need} first={index === 0} selected={selected.includes(need.need_key)} expanded={expanded.includes(need.need_key)} disabled={submitting || loading || Boolean(error)} onToggle={() => toggleSelected(need.need_key)} onExpand={() => setExpanded((current) => current.includes(need.need_key) ? current.filter((item) => item !== need.need_key) : [...current, need.need_key])} />)}
        </View>
        {needs.some((need) => need.existing_matches.length > 0) ? <>
          <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={styles.sectionTitle}>Already on Shopping</ThemedText><ThemedText themeColor="textSecondary">Not selected</ThemedText></View>
          <View style={[styles.needList, { backgroundColor: theme.surface }]}>{needs.filter((need) => need.existing_matches.length > 0).map((need, index) => <View key={`existing-${need.need_key}`} style={[styles.existingRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.checkIcon, { borderColor: theme.border }]} />
            <View style={styles.needInfo}><ThemedText style={styles.needName}>{need.name}</ThemedText><ThemedText themeColor="textSecondary">{need.sources[0] ? `${need.sources[0].recipe_name} · ${shortDayLabel(need.sources[0].planned_for)}` : ''}</ThemedText>{need.existing_matches.map((match) => <ThemedText key={match.item_id} themeColor="link">{match.kind === 'exact' ? 'Already on list' : `Possible match · ${match.name}`}</ThemedText>)}</View>
            <ThemedText style={styles.amount}>{formatAmount(need.amount, need.unit_label)}</ThemedText>
          </View>)}</View>
        </> : null}
        {notice ? <ThemedText accessibilityRole="alert" themeColor="textSecondary">{notice}</ThemedText> : null}
        {error && review && reviewNeedsRefresh ? <PrimaryButton disabled={submitting || loading} onPress={() => void load()} title="Refresh review" /> : null}
        {error && !reviewNeedsRefresh ? <PrimaryButton disabled={submitting || loading} onPress={() => void confirm()} title="Retry add safely" /> : null}
      </> : null}
      {Platform.OS === 'web' ? <PrimaryButton onPress={() => void load()} title="Refresh review" /> : null}
    </View>
  </Screen>;
}

function NeedRow({ need, first, selected, expanded, disabled, onToggle, onExpand }: { need: MealPlanNeed; first: boolean; selected: boolean; expanded: boolean; disabled: boolean; onToggle: () => void; onExpand: () => void }) {
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
      <ThemedText style={styles.amount}>{formatAmount(need.amount, need.unit_label)}</ThemedText>
    </View>
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
  sourceAction: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 42, marginLeft: 32, paddingHorizontal: 0 },
  sourceList: { gap: 10, paddingLeft: 32, paddingBottom: 14, paddingTop: 9 },
  sourceRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  sourceCopy: { flex: 1, gap: 3 },
  existingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 62, paddingHorizontal: 0, paddingVertical: 9 },
  message: { gap: 10 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingHorizontal: 24, paddingTop: 9, paddingBottom: Platform.OS === 'web' ? 12 : 6 },
  footerNote: { fontSize: 12, textAlign: 'center' },
});
