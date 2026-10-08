import { useAuth } from '@clerk/expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { RecipeCover } from '@/features/recipes/recipe-cover';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type GetToken, type MealPlanEntry, type MealPlanWeek, type MealSlot, type Recipe } from '@/lib/api';
import { useMealPlanContext } from './meal-plan-context';
import { dateLabel, MEAL_SLOTS } from './meal-plan-utils';

type MealDraft = { plannedFor: string; mealSlot: MealSlot; recipeId: string | null };

function Header({ title, onCancel }: { title: string; onCancel: () => void }) {
  const theme = useTheme();
  return <View style={[styles.header, { borderBottomColor: theme.border }]}>
    {Platform.OS === 'web' ? <View style={styles.grabber} /> : null}
    <View style={styles.headerRow}>
      <ThemedText accessibilityRole="header" style={styles.headerTitle}>{title}</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={12} onPress={onCancel} style={styles.headerButton}>
        <ThemedText themeColor="link">Cancel</ThemedText>
      </Pressable>
    </View>
  </View>;
}

function DayPickerSheet({ dates, selected, onSelect }: { dates: string[]; selected: string; onSelect: (date: string) => void }) {
  const theme = useTheme();
  const router = useRouter();
  return <View style={[styles.picker, { backgroundColor: theme.elevatedSurface }]}>
    <Header title="Choose a day" onCancel={() => router.back()} />
    <ScrollView contentContainerStyle={styles.pickerList}>
      {dates.map((date) => <Pressable key={date} accessibilityRole="radio" accessibilityState={{ selected: date === selected }} onPress={() => { onSelect(date); router.back(); }} style={[styles.dayOption, { borderBottomColor: theme.border }]}>
        <ThemedText>{dateLabel(date)}</ThemedText>
        {date === selected ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={20} tintColor={theme.primary} /> : null}
      </Pressable>)}
    </ScrollView>
  </View>;
}

export function MealPlanAddSheet({ householdId, weekOffset, dates, initialDate, initialSlot, onSave }: {
  householdId: string;
  weekOffset: number;
  dates: string[];
  initialDate: string;
  initialSlot: MealSlot;
  onSave: (draft: MealDraft) => Promise<void>;
}) {
  const { sheetId = '' } = useLocalSearchParams<{ sheetId: string }>();
  const { userId, sessionId } = useAuth();
  const { selectedHousehold, getToken } = useHouseholdState();
  const context = useMealPlanContext();
  const router = useRouter();
  const flow = useNativeSheetFlow();
  const theme = useTheme();
  const returnIntent = context.recipeCreateIntentForSheet(sheetId);
  const [draft, setDraft] = useState<MealDraft>(() => ({
    plannedFor: returnIntent?.plannedFor ?? initialDate,
    mealSlot: returnIntent?.mealSlot ?? initialSlot,
    recipeId: null,
  }));
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipeLoadError, setRecipeLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const latestGetToken = useRef<GetToken>(getToken);
  const createdRecipeResult = context.recipeCreateResultForSheet(sheetId);
  const createdRecipeRef = useRef<Recipe | null>(createdRecipeResult);
  useEffect(() => { createdRecipeRef.current = createdRecipeResult; }, [createdRecipeResult]);
  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  const scope = context.scope;
  const expectedScope = JSON.stringify([userId ?? '', sessionId ?? '', householdId]);
  const mountedScope = useRef(expectedScope);
  const latestContextScope = useRef(scope);
  useLayoutEffect(() => { mountedScope.current = expectedScope; latestContextScope.current = context.scope; }, [context.scope, expectedScope]);
  const isCurrent = () => mountedScope.current === expectedScope && latestContextScope.current === expectedScope && selectedHousehold?.id === householdId;
  const filtered = useMemo(() => recipes.filter((recipe) => recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query, recipes]);

  useEffect(() => {
    let active = true;
    void api.recipes(() => latestGetToken.current(), householdId).then((result) => {
      if (active && isCurrent()) setRecipes((current) => {
        const activeRecipes = result.recipes.filter((recipe) => !recipe.archived_at);
        const createdRecipe = createdRecipeRef.current;
        return createdRecipe && !activeRecipes.some((recipe) => recipe.id === createdRecipe.id)
          ? [...activeRecipes, createdRecipe]
          : activeRecipes;
      });
    }).catch((reason: unknown) => {
      if (active && isCurrent()) setRecipeLoadError(reason instanceof ApiError ? reason.message : 'We couldn’t load recipes. Please try again.');
    }).finally(() => { if (active && isCurrent()) setLoading(false); });
    return () => { active = false; };
    // Loading is retried explicitly, not when a tab or token callback changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, version]);

  useFocusEffect(useCallback(() => {
    const createdRecipe = context.recipeCreateResultForSheet(sheetId);
    if (!createdRecipe) return undefined;
    setRecipes((current) => current.some((recipe) => recipe.id === createdRecipe.id) ? current : [...current, createdRecipe]);
    setDraft((current) => ({ ...current, recipeId: createdRecipe.id }));
    setQuery('');
    return undefined;
  }, [context, sheetId]));

  const openDay = () => {
    const id = flow.present(<DayPickerSheet dates={dates} selected={draft.plannedFor} onSelect={(plannedFor) => { setActionError(null); setDraft((current) => ({ ...current, plannedFor })); }} />, { detents: [0.45, 0.8] });
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/day', params: { sheetId: id } } as never);
  };
  const createRecipe = () => {
    setActionError(null);
    context.beginRecipeCreate({ scope, sheetId, plannedFor: draft.plannedFor, mealSlot: draft.mealSlot, weekOffset });
    Keyboard.dismiss();
    router.push('/(app)/(tabs)/plan/recipe-create' as never);
  };
  const submit = async () => {
    if (!draft.recipeId || saving || !isCurrent()) return;
    setSaving(true); setActionError(null); Keyboard.dismiss();
    try { await onSave(draft); if (isCurrent()) router.back(); }
    catch (reason) { if (isCurrent()) setActionError(reason instanceof ApiError ? reason.message : 'We couldn’t add this meal. Please try again.'); }
    finally { if (isCurrent()) setSaving(false); }
  };

  return <View style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <Header title="Add meal" onCancel={() => { context.clearRecipeCreate(); router.back(); }} />
    <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
      <ThemedText themeColor="textSecondary">Plan a saved recipe for your household.</ThemedText>
      <ThemedText style={styles.label}>Day</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={dateLabel(draft.plannedFor)} onPress={openDay} style={[styles.selector, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} size={20} tintColor={theme.textSecondary} />
        <ThemedText style={styles.selectorText}>{dateLabel(draft.plannedFor)}</ThemedText><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={19} tintColor={theme.textSecondary} />
      </Pressable>
      <ThemedText style={styles.label}>Meal</ThemedText>
      <View style={[styles.segments, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {MEAL_SLOTS.map((slot) => <Pressable key={slot.id} accessibilityRole="radio" accessibilityState={{ selected: draft.mealSlot === slot.id }} onPress={() => { setActionError(null); setDraft((current) => ({ ...current, mealSlot: slot.id })); }} style={[styles.segment, draft.mealSlot === slot.id && { backgroundColor: theme.surfaceSelected }]}>
          <ThemedText themeColor={draft.mealSlot === slot.id ? 'link' : undefined} style={styles.segmentText}>{slot.label}</ThemedText>
        </Pressable>)}
      </View>
      <View style={styles.sectionHeading}><ThemedText accessibilityRole="header" style={styles.label}>Recipe</ThemedText><ThemedText themeColor="textSecondary">{recipes.length} household recipes</ThemedText></View>
      <View style={[styles.searchRow, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={19} tintColor={theme.textSecondary} />
        <ThemedInput accessibilityLabel="Search recipes" onChangeText={setQuery} placeholder="Search recipes" returnKeyType="search" value={query} style={styles.searchInput} />
      </View>
      {loading ? <ActivityIndicator accessibilityLabel="Loading recipes" color={theme.activity} /> : null}
      {recipeLoadError ? <View style={styles.errorBlock}><ThemedText accessibilityRole="alert" themeColor="error">{recipeLoadError}</ThemedText><PrimaryButton onPress={() => { setRecipeLoadError(null); setLoading(true); setVersion((value) => value + 1); }} title="Retry" /></View> : null}
      {!recipeLoadError ? <View style={[styles.recipeList, { backgroundColor: theme.surface, borderColor: theme.border }]}>{filtered.map((recipe, index) => <Pressable key={recipe.id} accessibilityRole="radio" accessibilityState={{ selected: draft.recipeId === recipe.id }} onPress={() => { setActionError(null); setDraft((current) => ({ ...current, recipeId: recipe.id })); }} style={[styles.recipeRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }, draft.recipeId === recipe.id && { backgroundColor: theme.surfaceSelected }]}>
        <RecipeCover recipe={recipe} size="row" />
        <View style={styles.recipeInfo}><ThemedText numberOfLines={1} style={styles.recipeName}>{recipe.name}</ThemedText><ThemedText themeColor="textSecondary">{recipe.ingredient_count} ingredients</ThemedText></View>
        {draft.recipeId === recipe.id ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={22} tintColor={theme.primary} /> : null}
      </Pressable>)}</View> : null}
      {!loading && !recipeLoadError && filtered.length === 0 ? <ThemedText themeColor="textSecondary">{query.trim() ? 'No recipes match your search.' : 'No active recipes yet.'}</ThemedText> : null}
      <Pressable accessibilityRole="button" onPress={createRecipe} style={[styles.createRecipe, { borderTopColor: theme.border }]}>
        <SymbolView name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }} size={22} tintColor={theme.link} /><ThemedText themeColor="link" style={styles.flexText}>Create a new recipe</ThemedText><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor={theme.link} />
      </Pressable>
    </ScrollView>
    <View style={[styles.footer, { borderTopColor: theme.border }]}>
      {actionError ? <ThemedText accessibilityRole="alert" themeColor="error">{actionError}</ThemedText> : null}
      <PrimaryButton disabled={!draft.recipeId || saving || loading} onPress={() => void submit()} title={saving ? 'Adding…' : 'Add meal'} />
    </View>
  </View>;
}

export function MealPlanEditSheet({ householdId, dates, entry, onSave, onRemove, onReload }: {
  householdId: string;
  dates: string[];
  entry: MealPlanEntry;
  onSave: (draft: MealDraft & { expected_revision: number }) => Promise<void>;
  onRemove: () => Promise<void>;
  onReload: () => Promise<MealPlanWeek | null>;
}) {
  const { userId, sessionId } = useAuth();
  const { selectedHousehold, getToken } = useHouseholdState();
  const context = useMealPlanContext();
  const flow = useNativeSheetFlow();
  const router = useRouter();
  const theme = useTheme();
  const [draft, setDraft] = useState<MealDraft>({ plannedFor: entry.planned_for, mealSlot: entry.meal_slot, recipeId: entry.recipe_id });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipeLoadError, setRecipeLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [choosingRecipe, setChoosingRecipe] = useState(false);
  const [needsPlanReload, setNeedsPlanReload] = useState(false);
  const [version, setVersion] = useState(0);
  const latestGetToken = useRef<GetToken>(getToken);
  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  const scope = context.scope;
  const expectedScope = JSON.stringify([userId ?? '', sessionId ?? '', householdId]);
  const latestContextScope = useRef(scope);
  useLayoutEffect(() => { latestContextScope.current = context.scope; }, [context.scope]);
  const isCurrent = () => scope === expectedScope && latestContextScope.current === expectedScope && selectedHousehold?.id === householdId;
  const filtered = useMemo(() => recipes.filter((recipe) => recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query, recipes]);
  const selectedRecipe = recipes.find((recipe) => recipe.id === draft.recipeId);
  const selectedRecipeName = selectedRecipe?.name ?? entry.recipe_name ?? 'Recipe';
  useEffect(() => {
    let active = true;
    void api.recipes(() => latestGetToken.current(), householdId).then((result) => { if (active && isCurrent()) setRecipes(result.recipes.filter((recipe) => !recipe.archived_at)); })
      .catch((reason: unknown) => { if (active && isCurrent()) setRecipeLoadError(reason instanceof ApiError ? reason.message : 'We couldn’t load recipes. Please try again.'); })
      .finally(() => { if (active && isCurrent()) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, version]);
  const chooseDay = () => {
    const id = flow.present(<DayPickerSheet dates={dates} selected={draft.plannedFor} onSelect={(plannedFor) => { setActionError(null); setNeedsPlanReload(false); setDraft((current) => ({ ...current, plannedFor })); }} />, { detents: [0.45, 0.8] });
    router.push({ pathname: '/(app)/(tabs)/plan/sheet/day', params: { sheetId: id } } as never);
  };
  const save = async () => {
    if (!draft.recipeId || saving || !isCurrent()) return;
    setSaving(true); setActionError(null); Keyboard.dismiss();
    try { await onSave({ ...draft, expected_revision: entry.edit_revision }); if (isCurrent()) router.back(); }
    catch (reason) {
      if (!isCurrent()) return;
      setActionError(reason instanceof ApiError ? reason.message : 'We couldn’t save this meal. Please try again.');
      setNeedsPlanReload(reason instanceof ApiError && reason.code === 'MEAL_PLAN_REVISION_CONFLICT');
    }
    finally { if (isCurrent()) setSaving(false); }
  };
  const remove = async () => {
    if (saving || !isCurrent()) return;
    setSaving(true); setActionError(null);
    try { await onRemove(); if (isCurrent()) router.back(); }
    catch (reason) {
      if (!isCurrent()) return;
      setActionError(reason instanceof ApiError ? reason.message : 'We couldn’t remove this planned meal. Please try again.');
      setNeedsPlanReload(reason instanceof ApiError && reason.code === 'MEAL_PLAN_REVISION_CONFLICT');
    }
    finally { if (isCurrent()) setSaving(false); }
  };
  const reloadPlan = async () => {
    if (!isCurrent()) return;
    setSaving(true);
    try {
      const refreshed = await onReload();
      if (!isCurrent()) return;
      if (!refreshed) { setActionError('We couldn’t refresh the plan. Please try again.'); return; }
      router.back();
    } catch {
      if (isCurrent()) setActionError('We couldn’t refresh the plan. Please try again.');
    } finally { if (isCurrent()) setSaving(false); }
  };
  return <View style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <Header title="Edit meal" onCancel={() => router.back()} />
    <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
      <ThemedText style={styles.label}>Day</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={dateLabel(draft.plannedFor)} disabled={needsPlanReload} onPress={chooseDay} style={[styles.selector, { backgroundColor: theme.surface, borderColor: theme.border }, needsPlanReload && styles.disabled]}><SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} size={20} tintColor={theme.textSecondary} /><ThemedText style={styles.selectorText}>{dateLabel(draft.plannedFor)}</ThemedText><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={19} tintColor={theme.textSecondary} /></Pressable>
      <ThemedText style={styles.label}>Meal</ThemedText>
      <View style={[styles.segments, { backgroundColor: theme.surface, borderColor: theme.border }]}>{MEAL_SLOTS.map((slot) => <Pressable key={slot.id} disabled={needsPlanReload} accessibilityRole="radio" accessibilityState={{ selected: draft.mealSlot === slot.id, disabled: needsPlanReload }} onPress={() => { setActionError(null); setNeedsPlanReload(false); setDraft((current) => ({ ...current, mealSlot: slot.id })); }} style={[styles.segment, draft.mealSlot === slot.id && { backgroundColor: theme.surfaceSelected }, needsPlanReload && styles.disabled]}><ThemedText themeColor={draft.mealSlot === slot.id ? 'link' : undefined} style={styles.segmentText}>{slot.label}</ThemedText></Pressable>)}</View>
      <ThemedText accessibilityRole="header" style={styles.label}>Recipe</ThemedText>
      {!choosingRecipe ? <Pressable accessibilityRole="button" accessibilityLabel="Change recipe" disabled={needsPlanReload} onPress={() => { setActionError(null); setChoosingRecipe(true); setQuery(''); }} style={[styles.selectedRecipe, { backgroundColor: theme.surface, borderColor: theme.border }, needsPlanReload && styles.disabled]}>
        <RecipeCover recipe={selectedRecipe ?? { name: selectedRecipeName, cover_kind: entry.cover_kind ?? 'initials', cover_emoji: entry.cover_emoji ?? null }} size="row" />
        <View style={styles.recipeInfo}><ThemedText numberOfLines={1} style={styles.recipeName}>{selectedRecipeName}</ThemedText><ThemedText themeColor="textSecondary">{entry.archived_at ? 'Archived recipe' : 'Change recipe'}</ThemedText></View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor={theme.textSecondary} />
      </Pressable> : <>
      <View style={[styles.searchRow, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}><SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={19} tintColor={theme.textSecondary} /><ThemedInput accessibilityLabel="Search recipes" onChangeText={setQuery} placeholder="Search recipes" returnKeyType="search" value={query} style={styles.searchInput} /></View>
      {loading ? <ActivityIndicator accessibilityLabel="Loading recipes" color={theme.activity} /> : null}
      {recipeLoadError ? <View style={styles.errorBlock}><ThemedText accessibilityRole="alert" themeColor="error">{recipeLoadError}</ThemedText><PrimaryButton onPress={() => { setLoading(true); setRecipeLoadError(null); setVersion((value) => value + 1); }} title="Retry" /></View> : null}
      {!recipeLoadError ? <View style={[styles.recipeList, { backgroundColor: theme.surface, borderColor: theme.border }]}>{filtered.map((recipe, index) => <Pressable key={recipe.id} accessibilityRole="radio" accessibilityState={{ selected: draft.recipeId === recipe.id }} onPress={() => { setActionError(null); setNeedsPlanReload(false); setDraft((current) => ({ ...current, recipeId: recipe.id })); setChoosingRecipe(false); }} style={[styles.recipeRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }, draft.recipeId === recipe.id && { backgroundColor: theme.surfaceSelected }]}><RecipeCover recipe={recipe} size="row" /><View style={styles.recipeInfo}><ThemedText numberOfLines={1} style={styles.recipeName}>{recipe.name}</ThemedText><ThemedText themeColor="textSecondary">{recipe.ingredient_count} ingredients</ThemedText></View>{draft.recipeId === recipe.id ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={22} tintColor={theme.primary} /> : null}</Pressable>)}</View> : null}
      {!loading && !recipeLoadError && filtered.length === 0 ? <ThemedText themeColor="textSecondary">No active recipes match your search.</ThemedText> : null}
      </>}
      {entry.archived_at ? <ThemedText themeColor="textSecondary">This recipe is archived. Choose an active recipe to change the plan.</ThemedText> : null}
    </ScrollView>
    <View style={[styles.footer, { borderTopColor: theme.border }]}>
      {actionError ? <ThemedText accessibilityRole="alert" themeColor="error">{actionError}</ThemedText> : null}
      <PrimaryButton disabled={!draft.recipeId || saving || loading || needsPlanReload} onPress={() => void save()} title={saving ? 'Saving…' : 'Save changes'} />
      {needsPlanReload ? <PrimaryButton disabled={saving} onPress={() => void reloadPlan()} title="Refresh plan" /> : null}
      {confirmRemove ? <View style={[styles.removeConfirm, { backgroundColor: theme.surface, borderColor: theme.border }]}><ThemedText>Remove only this occurrence from the plan?</ThemedText><View style={styles.removeActions}><Pressable accessibilityRole="button" disabled={saving || needsPlanReload} onPress={() => setConfirmRemove(false)}><ThemedText themeColor="link">Keep meal</ThemedText></Pressable><Pressable accessibilityRole="button" disabled={saving || needsPlanReload} onPress={() => void remove()}><ThemedText themeColor="error">Remove from plan</ThemedText></Pressable></View></View> : <Pressable accessibilityRole="button" disabled={saving || needsPlanReload} onPress={() => setConfirmRemove(true)} style={styles.removeButton}><ThemedText themeColor="error">Remove from plan</ThemedText></Pressable>}
    </View>
  </View>;
}

export type { MealDraft };

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  picker: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 8 },
  grabber: { alignSelf: 'center', backgroundColor: '#8e8e93', borderRadius: 3, height: 5, marginBottom: 10, opacity: 0.55, width: 36 },
  headerRow: { alignItems: 'center', flexDirection: 'row', minHeight: 48, justifyContent: 'space-between' },
  headerButton: { alignItems: 'flex-start', justifyContent: 'center', minWidth: 64 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  sheetScroll: { flex: 1 },
  sheetContent: { gap: 14, padding: 20, paddingBottom: 24 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'web' ? 16 : 8 },
  pickerList: { paddingHorizontal: 20, paddingBottom: 28 },
  dayOption: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54 },
  label: { fontSize: 16, fontWeight: '700' },
  selector: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 14 },
  segments: { borderRadius: 13, borderWidth: 1, flexDirection: 'row', overflow: 'hidden', padding: 3 },
  segment: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 4 },
  segmentText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectorText: { flex: 1, marginHorizontal: 12 },
  searchRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 48, paddingHorizontal: 13 },
  searchInput: { backgroundColor: 'transparent', borderWidth: 0, flex: 1, minHeight: 44, paddingHorizontal: 0 },
  flexText: { flex: 1 },
  recipeList: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  recipeRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 76, paddingHorizontal: 10, paddingVertical: 9 },
  selectedRecipe: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 72, paddingHorizontal: 10, paddingVertical: 9 },
  recipeInfo: { flex: 1, gap: 5 },
  recipeName: { fontSize: 16, fontWeight: '600' },
  createRecipe: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 54, paddingTop: 8 },
  errorBlock: { gap: 10 },
  removeConfirm: { borderRadius: 14, borderWidth: 1, gap: 12, padding: 14 },
  removeActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  removeButton: { alignItems: 'center', paddingVertical: 12 },
  disabled: { opacity: 0.55 },
});
