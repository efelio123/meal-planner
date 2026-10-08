import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import type { ShoppingListItem } from '@/lib/api';
import { ChoicePicker } from '@/features/catalog/choice-picker';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useMealPlanContextOptional } from '@/features/meal-plan/meal-plan-context';
import { ShoppingCatalogPickerSheet, openShoppingDetails } from './shopping-sheets';
import { useShoppingContext } from './shopping-context';
import { useShoppingList } from './use-shopping-list';

type SortKey = 'recent' | 'name-asc' | 'name-desc' | 'store' | 'category';
const sortOptions = [
  { id: 'recent', label: 'Recently added' }, { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' }, { id: 'store', label: 'Store' }, { id: 'category', label: 'Category' },
];

export default function ShoppingListScreen() {
  const theme = useTheme(); const router = useRouter(); const sheetFlow = useNativeSheetFlow();
  const { selectedHousehold } = useHouseholdState();
  const { scope, createdItem, setCreatedItem, revisionForHousehold } = useShoppingContext();
  const mealPlanContext = useMealPlanContextOptional();
  const { clear, error, householdId, items, loading, pendingItemIds, refresh, toggle } = useShoppingList();
  const [storeFilter, setStoreFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [purchasedExpanded, setPurchasedExpanded] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const scopeRef = useRef(scope); const previousRevision = useRef({ householdId, revision: householdId ? revisionForHousehold(householdId) : 0 });
  const openedEditParam = useRef<string | null>(null);
  const shoppingRevision = householdId ? revisionForHousehold(householdId) : 0;
  const mealRevision = householdId ? mealPlanContext?.shoppingRevisionForHousehold(householdId) ?? 0 : 0;
  const shoppingNotice = householdId ? mealPlanContext?.shoppingAddNoticeForHousehold(householdId) ?? null : null;

  useLayoutEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    setStoreFilter('all');
    setSort('recent');
    setPurchasedExpanded(true);
    setActionError(null);
    openedEditParam.current = null;
  }, [scope]);
  useEffect(() => {
    const prior = previousRevision.current;
    previousRevision.current = { householdId, revision: shoppingRevision + mealRevision };
    if (prior.householdId === householdId && prior.revision !== shoppingRevision + mealRevision) void refresh();
  }, [householdId, mealRevision, refresh, shoppingRevision]);

  const params = useLocalSearchParams<{ editItemId?: string }>();
  const openItem = useCallback(async (item: ShoppingListItem) => {
    if (!householdId || !item.catalog_item_id) return;
    setActionError(null);
    openShoppingDetails(sheetFlow, router, {
      id: item.catalog_item_id,
      item_type: item.catalog_item_type ?? 'food',
      name: item.name,
      category_name: item.category_name ?? null,
      shopping_unit_code: item.catalog_preferred_shopping_unit_code ?? null,
      custom_shopping_unit_id: item.catalog_preferred_custom_shopping_unit_id ?? null,
      preferred_store_id: item.catalog_preferred_store_id ?? null,
      archived: item.catalog_item_archived ?? false,
    }, item, { onChanged: () => undefined, onError: setActionError });
  }, [householdId, router, sheetFlow]);

  useFocusEffect(useCallback(() => {
    const itemId = typeof params.editItemId === 'string' ? params.editItemId : null;
    if (!itemId || openedEditParam.current === itemId) return undefined;
    const item = items.find((candidate) => candidate.id === itemId);
    if (item) { openedEditParam.current = itemId; void openItem(item); }
    return undefined;
  }, [items, openItem, params.editItemId]));

  useFocusEffect(useCallback(() => {
    if (!createdItem || createdItem.scope !== scope) return undefined;
    setCreatedItem(null);
    openShoppingDetails(sheetFlow, router, createdItem.item, undefined, { onChanged: () => undefined, onError: setActionError });
    return undefined;
  }, [createdItem, router, scope, setCreatedItem, sheetFlow]));

  const storeOptions = useMemo(() => [
    { id: 'all', label: 'All stores' },
    ...[...new Map(items.filter((item) => item.store_id && item.store_name).map((item) => [item.store_id!, item.store_name!])).entries()].map(([id, label]) => ({ id, label })),
    { id: 'none', label: 'No store' },
  ], [items]);
  const activeStoreFilter = storeOptions.some((option) => option.id === storeFilter) ? storeFilter : 'all';
  const filtered = items.filter((item) => activeStoreFilter === 'all' || (activeStoreFilter === 'none' ? !item.store_id : item.store_id === activeStoreFilter));
  const compareName = (a: ShoppingListItem, b: ShoppingListItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const ordered = [...filtered].sort((a, b) => {
    if (sort === 'name-asc') return compareName(a, b);
    if (sort === 'name-desc') return compareName(b, a);
    if (sort === 'store') return (a.store_name ?? '').localeCompare(b.store_name ?? '') || compareName(a, b);
    if (sort === 'category') return (a.category_name ?? '').localeCompare(b.category_name ?? '') || compareName(a, b);
    return b.created_at.localeCompare(a.created_at);
  });
  const toBuy = ordered.filter((item) => !item.is_checked); const purchased = ordered.filter((item) => item.is_checked);
  const addFromCatalog = () => {
    setActionError(null);
    const sheetId = sheetFlow.present(<ShoppingCatalogPickerSheet items={items} onError={setActionError} />, { detents: [0.65, 0.94] });
    router.push({ pathname: '/native-sheet/[sheetId]', params: { sheetId } } as never);
  };
  const clearList = () => {
    const confirmClear = async () => {
      const startedScope = scopeRef.current; setActionError(null);
      try { await clear(); if (scopeRef.current === startedScope) setActionError(null); }
      catch { if (scopeRef.current === startedScope) setActionError('We couldn’t clear the list. Please try again.'); }
    };
    const message = 'This removes every item from all stores, including purchased items. Catalog items, recipes, and meal plans stay unchanged.';
    if (Platform.OS === 'web') { if (globalThis.confirm(`Clear the whole list?\n\n${message}`)) void confirmClear(); }
    else Alert.alert('Clear the whole list?', message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear list', style: 'destructive', onPress: () => void confirmClear() }]);
  };

  const renderRows = (sectionItems: ShoppingListItem[]) => sectionItems.map((item) => {
    const pending = pendingItemIds.has(item.id);
    const amount = [item.amount, item.unit_label].filter(Boolean).join(' ');
    const subtitle = [amount || null, item.store_name || null].filter(Boolean).join(' · ');
    return <View key={item.id} style={[styles.itemRow, { borderBottomColor: theme.border }]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Mark ${item.name} ${item.is_checked ? 'not purchased' : 'purchased'}`} accessibilityState={{ checked: item.is_checked, disabled: pending }} disabled={pending} onPress={() => { setActionError(null); void toggle(item).catch((reason: unknown) => setActionError(reason instanceof Error ? reason.message : 'We couldn’t update that item.')); }} style={styles.checkHit}>
        <SymbolView name={{ ios: item.is_checked ? 'checkmark.circle.fill' : 'circle', android: item.is_checked ? 'check_circle' : 'radio_button_unchecked', web: item.is_checked ? 'check_circle' : 'radio_button_unchecked' }} size={25} tintColor={item.is_checked ? theme.primary : theme.textSecondary} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => void openItem(item)} style={styles.itemBody}>
        <ThemedText style={[styles.itemName, item.is_checked && styles.checked]} numberOfLines={2}>{item.name}</ThemedText>
        {subtitle ? <ThemedText themeColor="textSecondary" style={styles.itemSubtitle} numberOfLines={1}>{subtitle}</ThemedText> : null}
      </Pressable>
      {pending ? <ActivityIndicator accessibilityLabel={`Updating ${item.name}`} color={theme.activity} /> : null}
    </View>;
  });

  return <Screen contentAlignment="top" nativeTabScreen manualNativeTabInsets safeAreaEdges={['top', 'left', 'right']} onRefresh={refresh} refreshing={loading && items.length > 0}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.content}>
      <View style={styles.titleRow}><View style={styles.titleCopy}><ThemedText accessibilityRole="header" style={styles.title}>Shopping</ThemedText><ThemedText themeColor="textSecondary">{selectedHousehold?.name ?? 'Household'} · shared list</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel="Add from Catalog" onPress={addFromCatalog} style={[styles.addButton, { backgroundColor: theme.primary }]}><SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={22} tintColor={theme.primaryText} /></Pressable></View>
      {shoppingNotice ? <View style={[styles.notice, { backgroundColor: theme.surfaceSelected }]}><ThemedText accessibilityRole="alert" style={styles.noticeText}>{shoppingNotice.count} {shoppingNotice.count === 1 ? 'item' : 'items'} added from this week’s meals.</ThemedText><Pressable accessibilityRole="button" accessibilityLabel="Dismiss shopping confirmation" onPress={() => mealPlanContext?.clearShoppingAddNotice(shoppingNotice.requestId)}><ThemedText themeColor="link">Dismiss</ThemedText></Pressable></View> : null}
      <View style={styles.filterRow}><View style={styles.filter}><ChoicePicker compact label="Store" choices={storeOptions} selectedId={activeStoreFilter} value={storeOptions.find((option) => option.id === activeStoreFilter)?.label ?? 'All stores'} onSelect={setStoreFilter} /></View><View style={styles.filter}><ChoicePicker compact label="Sort" choices={sortOptions} selectedId={sort} value={sortOptions.find((option) => option.id === sort)?.label ?? 'Recently added'} onSelect={(value) => setSort(value as SortKey)} /></View></View>
      <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={styles.sectionTitle}>To buy</ThemedText><ThemedText themeColor="textSecondary">{toBuy.length}</ThemedText></View>
      {loading && items.length === 0 ? <ActivityIndicator accessibilityLabel="Loading shopping list" color={theme.activity} /> : null}
      {error ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText><PrimaryButton onPress={() => void refresh()} title="Retry" /></View> : null}
      {actionError ? <ThemedText accessibilityRole="alert" themeColor="error">{actionError}</ThemedText> : null}
      {!loading && !error && toBuy.length === 0 ? <ThemedText themeColor="textSecondary">{activeStoreFilter === 'all' ? 'Nothing to buy yet. Add items from your Catalog.' : 'No items to buy for this store.'}</ThemedText> : null}
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>{renderRows(toBuy)}</View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: purchasedExpanded }} onPress={() => setPurchasedExpanded((value) => !value)} style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={styles.sectionTitle}>Purchased</ThemedText><View style={styles.purchasedHeaderRight}><ThemedText themeColor="textSecondary">{purchased.length}</ThemedText><SymbolView name={{ ios: purchasedExpanded ? 'chevron.up' : 'chevron.down', android: purchasedExpanded ? 'expand_less' : 'expand_more', web: purchasedExpanded ? 'expand_less' : 'expand_more' }} size={17} tintColor={theme.textSecondary} /></View></Pressable>
      {purchasedExpanded && purchased.length ? <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>{renderRows(purchased)}</View> : null}
      {purchasedExpanded && !purchased.length && items.length ? <ThemedText themeColor="textSecondary">No purchased items yet.</ThemedText> : null}
      {!loading && !error && items.length === 0 ? <ThemedText themeColor="textSecondary" style={styles.empty}>Your shared Shopping list is ready for Catalog items.</ThemedText> : null}
      {items.length > 0 ? <Pressable accessibilityRole="button" onPress={clearList} style={[styles.clearAction, { borderColor: theme.border }]}><ThemedText themeColor="error">Clear list</ThemedText></Pressable> : null}
      {Platform.OS === 'web' ? <PrimaryButton disabled={loading} onPress={() => void refresh()} title={loading ? 'Refreshing…' : 'Refresh'} /> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 18 }, titleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, titleCopy: { flex: 1, gap: 3 }, title: { fontSize: 30, fontWeight: '700', lineHeight: 36 }, addButton: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  notice: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 12 }, noticeText: { flex: 1 }, filterRow: { flexDirection: 'row', gap: 10 }, filter: { flex: 1 }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }, sectionTitle: { fontSize: 19, fontWeight: '700' }, group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }, itemRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 68, paddingHorizontal: 10, paddingVertical: 9 }, checkHit: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 }, itemBody: { flex: 1, gap: 4, minWidth: 0 }, itemName: { fontSize: 16, fontWeight: '600' }, checked: { textDecorationLine: 'line-through' }, itemSubtitle: { fontSize: 13 }, purchasedHeaderRight: { alignItems: 'center', flexDirection: 'row', gap: 8 }, clearAction: { alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 46, marginTop: 4 }, empty: { paddingBottom: 4 }, message: { gap: 10 },
});
