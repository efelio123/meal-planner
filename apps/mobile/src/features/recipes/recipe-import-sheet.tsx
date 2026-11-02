import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Keyboard, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { AppBackButton } from '@/components/app-back-button';
import { KeyboardAwareSheet } from '@/components/keyboard-aware-sheet';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { ExpansionChevron, visualStyles } from '@/components/visual-roles';
import { useTheme } from '@/hooks/use-theme';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { ApiError, api, type GetToken, type Recipe } from '@/lib/api';
import { RecipeCover } from './recipe-cover';
import { importedSectionName, type RecipeImportSelection } from './recipe-import';

type Props = {
  householdId: string; expectedFlowScope: string; getToken: GetToken; isCurrent: () => boolean;
  excludedRecipeId?: string; destinationName: string | null;
  onImport: (source: Recipe, selection: RecipeImportSelection, activeFoodIds: ReadonlySet<string>) => string | null;
};
export function RecipeImportSheet({ householdId, expectedFlowScope, getToken, isCurrent, excludedRecipeId, destinationName, onImport }: Props) {
  const theme = useTheme(); const router = useRouter(); const flow = useNativeSheetFlow();
  const [query, setQuery] = useState(''); const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [details, setDetails] = useState<Record<string, Recipe>>({}); const cache = useRef<Record<string, Recipe>>({});
  const pendingDetails = useRef(new Map<string, Promise<Recipe | null>>());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [detailsErrors, setDetailsErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState(''); const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const generation = useRef(0); const focused = useRef(true); const applying = useRef(false); const submitted = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; generation.current += 1; pendingDetails.current.clear(); };
  }, []));
  const alive = useCallback((epoch: number) => focused.current && epoch === generation.current && isCurrent() && flow.scope === expectedFlowScope, [expectedFlowScope, flow.scope, isCurrent]);
  const loadList = useCallback(async (refresh = false) => {
    if (applying.current || !isCurrent()) return;
    const epoch = ++generation.current;
    cache.current = {}; pendingDetails.current.clear();
    setDetails({}); setDetailsErrors({}); setLoadingDetails({}); setExpanded({}); setActionError('');
    setListError(''); setRecipes([]); setLoading(!refresh); setRefreshing(refresh);
    try {
      const result = await api.recipes(getToken, householdId);
      if (alive(epoch)) setRecipes(result.recipes.filter((recipe) => recipe.id !== excludedRecipeId && recipe.household_id === householdId && !recipe.archived_at));
    } catch (reason) {
      if (alive(epoch)) setListError(reason instanceof ApiError ? reason.message : 'We could not load recipes. Try again.');
    } finally { if (alive(epoch)) { setLoading(false); setRefreshing(false); } }
  }, [alive, excludedRecipeId, getToken, householdId, isCurrent]);
  useEffect(() => {
    const timer = setTimeout(() => { void loadList(); }, 0);
    return () => clearTimeout(timer);
  }, [loadList]);

  const loadDetails = (recipe: Recipe): Promise<Recipe | null> => {
    if (cache.current[recipe.id]) return Promise.resolve(cache.current[recipe.id]);
    const existing = pendingDetails.current.get(recipe.id); if (existing) return existing;
    const epoch = generation.current;
    setLoadingDetails((current) => ({ ...current, [recipe.id]: true }));
    setDetailsErrors((current) => ({ ...current, [recipe.id]: '' }));
    const promise = api.recipe(getToken, householdId, recipe.id).then(({ recipe: source }) => {
      if (!alive(epoch)) return null;
      if (source.id !== recipe.id || source.household_id !== householdId || source.archived_at || !source.ingredients || !source.steps) throw new Error('This recipe is unavailable. Refresh and try again.');
      cache.current[recipe.id] = source; setDetails((current) => ({ ...current, [recipe.id]: source }));
      return source;
    }).catch((reason: unknown) => {
      if (alive(epoch)) setDetailsErrors((current) => ({ ...current, [recipe.id]: reason instanceof ApiError || reason instanceof Error ? reason.message : 'We could not load this recipe. Try again.' }));
      return null;
    }).finally(() => {
      if (alive(epoch)) { pendingDetails.current.delete(recipe.id); setLoadingDetails((current) => ({ ...current, [recipe.id]: false })); }
    });
    pendingDetails.current.set(recipe.id, promise); return promise;
  };
  const toggle = (recipe: Recipe) => {
    if (applying.current || !isCurrent()) return;
    const open = !expanded[recipe.id]; setExpanded((current) => ({ ...current, [recipe.id]: open }));
    if (open) void loadDetails(recipe);
  };
  const importSelection = async (recipe: Recipe, selection: RecipeImportSelection) => {
    if (applying.current || submitted.current || !isCurrent()) return;
    const epoch = generation.current; applying.current = true; setBusyId(recipe.id); setActionError(''); Keyboard.dismiss();
    try {
      const source = await loadDetails(recipe);
      if (!source || !alive(epoch)) return;
      const catalog = await api.catalogItems(getToken, householdId);
      if (!alive(epoch)) return;
      const ids = new Set(catalog.items.filter((item) => item.household_id === householdId && item.item_type === 'food').map((item) => item.id));
      const error = onImport(source, selection, ids);
      if (error) { setActionError(error); return; }
      submitted.current = true;
      router.dismiss(2);
    } catch (reason) {
      if (alive(epoch)) setActionError(reason instanceof ApiError || reason instanceof Error ? reason.message : 'We could not import these ingredients. Try again.');
    } finally { if (alive(epoch) && !submitted.current) { applying.current = false; setBusyId(null); } }
  };
  const importButton = (recipe: Recipe, selection: RecipeImportSelection, label: string, count: number) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busyId !== null || refreshing || count === 0} onPress={() => void importSelection(recipe, selection)} style={visualStyles.sheetAction}>
    <ThemedText themeColor={busyId !== null || refreshing || count === 0 ? 'textSecondary' : 'link'}>Import</ThemedText>
  </Pressable>;
  const filtered = recipes.filter((recipe) => recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <KeyboardAwareSheet testID="recipe-import-sheet" style={{ backgroundColor: theme.elevatedSurface }}>
    <View collapsable={false} testID="recipe-import-header" style={styles.headerContent}>
      <View style={styles.header}>
        <AppBackButton accessibilityLabel="Back to Food Catalog" onPress={() => { Keyboard.dismiss(); router.back(); }} />
        <ThemedText accessibilityRole="header" style={visualStyles.sheetTitle}>Import from recipe</ThemedText>

        <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); router.back(); }} style={visualStyles.sheetAction}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
      </View>
      <ThemedText themeColor="textSecondary">{destinationName ? `Import into ${destinationName}` : 'Import as recipe sections'}. Amounts stay as written.</ThemedText>
      <View style={styles.searchRow}><View style={styles.copy}><ThemedInput accessibilityLabel="Search recipes to import" placeholder="Search recipes" value={query} onChangeText={setQuery} returnKeyType="search" /></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh recipes to import" disabled={busyId !== null || refreshing} onPress={() => void loadList(true)} style={styles.iconAction}><SymbolView accessibilityElementsHidden name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} size={20} tintColor={theme.link} /></Pressable></View>
      {busyId ? <ActivityIndicator accessibilityLabel="Importing recipe ingredients" color={theme.activity} /> : null}
      {actionError ? <ThemedText accessibilityRole="alert" themeColor="error">{actionError}</ThemedText> : null}
    </View>
    <ScrollView testID="recipe-import-results" style={styles.scroll} contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled" automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadList(true)} tintColor={theme.activity} />}>
      {loading ? <ActivityIndicator accessibilityLabel="Loading recipes to import" color={theme.activity} /> : null}
      {listError ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{listError}</ThemedText><PrimaryButton title="Retry loading recipes" onPress={() => void loadList()} /></View> : null}
      {!loading && !listError && filtered.length === 0 ? <ThemedText themeColor="textSecondary">{query.trim() ? 'No recipes match your search.' : 'No other recipes are available to import.'}</ThemedText> : null}
      {filtered.map((recipe) => {
        const source = details[recipe.id];
        const expandable = source ? Boolean(source.ingredient_sections?.length) : recipe.ingredient_section_count !== 0;
        const open = expandable && Boolean(expanded[recipe.id]);
        const summary = <><RecipeCover recipe={recipe} size="row" /><View style={styles.copy}><ThemedText style={styles.name}>{recipe.name}</ThemedText><ThemedText themeColor="textSecondary">{recipe.ingredient_count} ingredients{recipe.servings ? ` · Serves ${recipe.servings}` : ''}</ThemedText>{!expandable ? <ThemedText themeColor="textSecondary">Includes all directions{!destinationName ? ` · New section: ${importedSectionName(recipe.name)}` : ''}</ThemedText> : null}</View></>;
        return <View key={recipe.id} style={[styles.card, { backgroundColor: theme.surface }]}>
          {expandable ? <Pressable accessibilityRole="button" accessibilityLabel={`Expand ${recipe.name}`} accessibilityState={{ expanded: open }} disabled={busyId !== null || refreshing} onPress={() => toggle(recipe)} style={styles.recipeRow}>{summary}<ExpansionChevron expanded={open} /></Pressable>
            : <View style={styles.recipeRow}>{summary}{importButton(recipe, { kind: 'whole' }, `Import whole recipe ${recipe.name}`, recipe.ingredient_count)}</View>}
          {detailsErrors[recipe.id] ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{detailsErrors[recipe.id]}</ThemedText><PrimaryButton title={`Retry ${recipe.name}`} disabled={busyId !== null} onPress={() => void loadDetails(recipe)} /></View> : null}
          {open && loadingDetails[recipe.id] ? <ActivityIndicator accessibilityLabel={`Loading sections of ${recipe.name}`} color={theme.activity} /> : null}
          {open && source ? <View style={styles.choices}>
            <View style={[styles.choice, { borderTopColor: theme.border }]}><View style={styles.copy}><ThemedText style={styles.name}>Whole recipe</ThemedText><ThemedText themeColor="textSecondary">{source.ingredients!.length} ingredients · {source.steps!.length} directions</ThemedText></View>{importButton(recipe, { kind: 'whole' }, `Import whole recipe ${recipe.name}`, source.ingredients!.length)}</View>
            {[...(source.ingredient_sections ?? []), { name: 'Other ingredients', position: null }].map((section) => {
              const count = source.ingredients!.filter((row) => (row.section_position ?? null) === section.position).length;
              if (section.position === null && count === 0) return null;
              return <View key={section.position ?? 'other'} style={[styles.choice, { borderTopColor: theme.border }]}><View style={styles.copy}><ThemedText style={styles.name}>{section.name}</ThemedText><ThemedText themeColor="textSecondary">{count} ingredients only{!destinationName && section.position !== null ? ` · New section: ${section.name}` : ''}</ThemedText></View>{importButton(recipe, { kind: 'section', position: section.position }, `Import ${section.name} ingredients from ${recipe.name}`, count)}</View>;
            })}
          </View> : null}
        </View>;
      })}
    </ScrollView>
  </KeyboardAwareSheet>;
}
const styles = StyleSheet.create({
  headerContent: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, minHeight: 0 }, results: { paddingHorizontal: 22, paddingBottom: 16, gap: 12 },
  card: { borderRadius: 16, overflow: 'hidden' }, recipeRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 3 }, name: { fontWeight: '700' }, choices: { paddingHorizontal: 14 },
  choice: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  message: { padding: 14, gap: 12 },
});
