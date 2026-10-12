import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { CircularAddButton, DisclosureChevron, TabPageHeader, visualStyles } from '@/components/visual-roles';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, type CatalogItem, type ShoppingListItem } from '@/lib/api';
import { ChoicePicker } from '@/features/catalog/choice-picker';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useMealPlanContextOptional } from '@/features/meal-plan/meal-plan-context';
import { ShoppingCatalogPickerSheet, openShoppingDetails } from './shopping-sheets';
import { useShoppingContext } from './shopping-context';
import { useShoppingList } from './use-shopping-list';
import { ShoppingSwipeRow } from './shopping-swipe-row';

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
  const { add, clear, error, householdId, items, loading, pendingItemIds, refresh, remove, toggle } = useShoppingList();
  const [storeFilter, setStoreFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [purchasedExpanded, setPurchasedExpanded] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [failedCreatedItem, setFailedCreatedItem] = useState<{ scope: string; item: CatalogItem } | null>(null);
  const [retryingCreatedItem, setRetryingCreatedItem] = useState(false);
  const suppressRowPressUntil = useRef(0);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const scrollDragStartY = useRef(0);
  const scrollOffsetY = useRef(0);
  const scrollStartedAfterReveal = useRef(false);
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
    setFailedCreatedItem(null);
    setRetryingCreatedItem(false);
    openedEditParam.current = null;
    suppressRowPressUntil.current = 0;
    setOpenSwipeId(null);
  }, [scope]);
  useEffect(() => {
    const prior = previousRevision.current;
    previousRevision.current = { householdId, revision: shoppingRevision + mealRevision };
    if (prior.householdId === householdId && prior.revision !== shoppingRevision + mealRevision) {
      setOpenSwipeId(null);
      void refresh();
    }
  }, [householdId, mealRevision, refresh, shoppingRevision]);
  const params = useLocalSearchParams<{ editItemId?: string }>();
  const quickAdd = useCallback(async (item: CatalogItem) => {
    try { await add(item.id, { amount: '1' }); }
    catch (reason) {
      if (reason instanceof ApiError && reason.code === 'SHOPPING_ITEM_ALREADY_EXISTS') await refresh();
      throw reason;
    }
  }, [add, refresh]);
  const openItem = useCallback(async (item: ShoppingListItem) => {
    if (!householdId || !item.catalog_item_id) return;
    setOpenSwipeId(null);
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
    }, item, { onChanged: () => undefined, onRemove: remove });
  }, [householdId, remove, router, sheetFlow]);

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
    setFailedCreatedItem(null);
    void quickAdd(createdItem.item).catch((reason: unknown) => {
      if (scopeRef.current !== createdItem.scope) return;
      if (reason instanceof ApiError && reason.code === 'SHOPPING_ITEM_ALREADY_EXISTS') {
        setActionError(`${createdItem.item.name} is already on Shopping. Open it to edit.`);
        return;
      }
      setFailedCreatedItem(createdItem);
      setActionError(reason instanceof Error ? `Catalog item created, but it wasn’t added to Shopping: ${reason.message}` : 'Catalog item created, but it wasn’t added to Shopping. Please retry.');
    });
    return undefined;
  }, [createdItem, quickAdd, scope, setCreatedItem]));

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
    setOpenSwipeId(null);
    setActionError(null);
    const sheetId = sheetFlow.present(<ShoppingCatalogPickerSheet items={items} onAdd={quickAdd} onRemove={remove} />, { detents: [0.65, 0.94], initialDetent: 1 });
    router.push({ pathname: '/shopping/sheet/picker', params: { sheetId } } as never);
  };
  const clearList = () => {
    setOpenSwipeId(null);
    const confirmClear = async () => {
      const startedScope = scopeRef.current; setActionError(null);
      try { await clear(); if (scopeRef.current === startedScope) setActionError(null); }
      catch { if (scopeRef.current === startedScope) setActionError('We couldn’t clear the list. Please try again.'); }
    };
    const message = 'This removes every item from all stores, including purchased items. Catalog items, recipes, and meal plans stay unchanged.';
    if (Platform.OS === 'web') { if (globalThis.confirm(`Clear the whole list?\n\n${message}`)) void confirmClear(); }
    else Alert.alert('Clear the whole list?', message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear list', style: 'destructive', onPress: () => void confirmClear() }]);
  };

  const removeFromSwipe = async (item: ShoppingListItem) => {
    const startedScope = scopeRef.current;
    setActionError(null);
    try { await remove(item); }
    catch (reason) {
      if (scopeRef.current === startedScope) setActionError(reason instanceof Error ? reason.message : 'We couldn’t remove that item. Please try again.');
      throw reason;
    }
  };

  const suppressRowPress = useCallback(() => { suppressRowPressUntil.current = Date.now() + 500; }, []);
  const suppressRowPressForDrag = useCallback(() => { suppressRowPressUntil.current = Date.now() + 10000; }, []);
  const interceptRowPress = useCallback((itemId: string) => {
    // A Pressable can fire as the pan releases. Do not let that synthetic tap
    // close the newly revealed action before the user can reach it.
    if (Date.now() < suppressRowPressUntil.current) return true;
    if (openSwipeId) {
      setOpenSwipeId(null);
      if (openSwipeId === itemId) {
        suppressRowPress();
        return true;
      }
    }
    return false;
  }, [openSwipeId, suppressRowPress]);

  const renderRows = (sectionItems: ShoppingListItem[]) => sectionItems.map((item, index) => {
    const pending = pendingItemIds.has(item.id);
    const separatorColor = index < sectionItems.length - 1 ? theme.border : null;
    const amount = [item.amount, item.unit_label].filter(Boolean).join(' ');
    const subtitle = [amount || null, item.store_name || null].filter(Boolean).join(' · ');
    const row = <View style={[styles.itemRow, { backgroundColor: theme.surface }]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Mark ${item.name} ${item.is_checked ? 'not purchased' : 'purchased'}`} accessibilityState={{ checked: item.is_checked, disabled: pending }} disabled={pending} onPress={() => { if (interceptRowPress(item.id)) return; setActionError(null); void toggle(item).catch((reason: unknown) => setActionError(reason instanceof Error ? reason.message : 'We couldn’t update that item.')); }} style={styles.checkHit}>
        <SymbolView name={{ ios: item.is_checked ? 'checkmark.circle.fill' : 'circle', android: item.is_checked ? 'check_circle' : 'radio_button_unchecked', web: item.is_checked ? 'check_circle' : 'radio_button_unchecked' }} size={25} tintColor={item.is_checked ? theme.primary : theme.textSecondary} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => { if (!interceptRowPress(item.id)) void openItem(item); }} style={styles.itemBody}>
        <View style={styles.itemCopy}><ThemedText style={[styles.itemName, item.is_checked && styles.checked]} numberOfLines={2}>{item.name}</ThemedText>
          {subtitle ? <ThemedText themeColor="textSecondary" style={styles.itemSubtitle} numberOfLines={1}>{subtitle}</ThemedText> : null}
        </View>
        <View testID={`shopping-edit-chevron-${item.id}`} accessibilityElementsHidden importantForAccessibility="no"><DisclosureChevron /></View>
      </Pressable>
      {pending ? <ActivityIndicator accessibilityLabel={`Updating ${item.name}`} color={theme.activity} /> : null}
    </View>;
    if (Platform.OS === 'web') return <View key={item.id} style={separatorColor ? { borderBottomColor: separatorColor, borderBottomWidth: StyleSheet.hairlineWidth } : undefined}>{row}</View>;
    return <ShoppingSwipeRow key={item.id} active={openSwipeId === item.id} enabled={!pending}
      itemId={item.id} itemName={item.name} separatorColor={separatorColor} onDragStart={suppressRowPressForDrag} onDragEnd={suppressRowPress}
      onReveal={() => { scrollStartedAfterReveal.current = false; scrollDragStartY.current = scrollOffsetY.current; setOpenSwipeId(item.id); }}
      onClose={() => setOpenSwipeId((current) => current === item.id ? null : current)}
      onRemove={async () => { setOpenSwipeId(null); await removeFromSwipe(item); }}>
      {row}
    </ShoppingSwipeRow>;
  });

  return <Screen contentAlignment="top" nativeTabScreen manualNativeTabInsets safeAreaEdges={['top', 'left', 'right']} onRefresh={() => { setOpenSwipeId(null); return refresh(); }}
    onScrollBeginDrag={(event) => { scrollStartedAfterReveal.current = Boolean(openSwipeId); scrollDragStartY.current = event.nativeEvent.contentOffset.y; scrollOffsetY.current = scrollDragStartY.current; }}
    onScroll={(event) => {
      // The vertical ScrollView can begin a drag during a horizontal row swipe.
      // Close only after the page itself has actually moved vertically.
      scrollOffsetY.current = event.nativeEvent.contentOffset.y;
      if (openSwipeId && scrollStartedAfterReveal.current && Math.abs(scrollOffsetY.current - scrollDragStartY.current) > 12) {
        scrollStartedAfterReveal.current = false;
        setOpenSwipeId(null);
      }
    }} refreshing={loading && items.length > 0}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.content}>
      <TabPageHeader title="Shopping" subtitle={<ThemedText themeColor="textSecondary">{selectedHousehold?.name ?? 'Household'} · shared list</ThemedText>} actions={<CircularAddButton accessibilityLabel="Add from Catalog" onPress={addFromCatalog} />} />
      {shoppingNotice ? <View style={[styles.notice, { backgroundColor: theme.surfaceSelected }]}><ThemedText accessibilityRole="alert" style={styles.noticeText}>{shoppingNotice.count} {shoppingNotice.count === 1 ? 'item' : 'items'} added from this week’s meals.</ThemedText><Pressable accessibilityRole="button" accessibilityLabel="Dismiss shopping confirmation" onPress={() => mealPlanContext?.clearShoppingAddNotice(shoppingNotice.requestId)}><ThemedText themeColor="link">Dismiss</ThemedText></Pressable></View> : null}
      <View style={styles.filterRow}><View style={styles.filter}><ChoicePicker compact label="Store" choices={storeOptions} selectedId={activeStoreFilter} value={storeOptions.find((option) => option.id === activeStoreFilter)?.label ?? 'All stores'} onSelect={(value) => { setOpenSwipeId(null); setStoreFilter(value); }} /></View><View style={styles.filter}><ChoicePicker compact label="Sort" choices={sortOptions} selectedId={sort} value={sortOptions.find((option) => option.id === sort)?.label ?? 'Recently added'} onSelect={(value) => { setOpenSwipeId(null); setSort(value as SortKey); }} /></View></View>
      <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>To buy</ThemedText><ThemedText themeColor="textSecondary">{toBuy.length}</ThemedText></View>
      {loading && items.length === 0 ? <ActivityIndicator accessibilityLabel="Loading shopping list" color={theme.activity} /> : null}
      {error ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText><PrimaryButton onPress={() => { setOpenSwipeId(null); void refresh(); }} title="Retry" /></View> : null}
      {actionError ? <ThemedText accessibilityRole="alert" themeColor="error">{actionError}</ThemedText> : null}
      {failedCreatedItem?.scope === scope ? <PrimaryButton disabled={retryingCreatedItem} onPress={() => {
        setRetryingCreatedItem(true);
        void quickAdd(failedCreatedItem.item).then(() => { if (scopeRef.current === scope) { setFailedCreatedItem(null); setActionError(null); } }).catch((reason: unknown) => {
          if (scopeRef.current !== scope) return;
          if (reason instanceof ApiError && reason.code === 'SHOPPING_ITEM_ALREADY_EXISTS') {
            setFailedCreatedItem(null);
            setActionError(`${failedCreatedItem.item.name} is already on Shopping. Open it to edit.`);
          } else setActionError(reason instanceof Error ? reason.message : 'We couldn’t add this Catalog item. Please try again.');
        }).finally(() => { if (scopeRef.current === scope) setRetryingCreatedItem(false); });
      }} title={retryingCreatedItem ? 'Adding…' : `Retry adding ${failedCreatedItem.item.name}`} /> : null}
      {!loading && !error && toBuy.length === 0 ? <ThemedText themeColor="textSecondary">{activeStoreFilter === 'all' ? 'Nothing to buy yet. Add items from your Catalog.' : 'No items to buy for this store.'}</ThemedText> : null}
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>{renderRows(toBuy)}</View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: purchasedExpanded }} onPress={() => { setOpenSwipeId(null); setPurchasedExpanded((value) => !value); }} style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>Purchased</ThemedText><View style={styles.purchasedHeaderRight}><ThemedText themeColor="textSecondary">{purchased.length}</ThemedText><SymbolView name={{ ios: purchasedExpanded ? 'chevron.up' : 'chevron.down', android: purchasedExpanded ? 'expand_less' : 'expand_more', web: purchasedExpanded ? 'expand_less' : 'expand_more' }} size={17} tintColor={theme.textSecondary} /></View></Pressable>
      {purchasedExpanded && purchased.length ? <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>{renderRows(purchased)}</View> : null}
      {purchasedExpanded && !purchased.length && items.length ? <ThemedText themeColor="textSecondary">No purchased items yet.</ThemedText> : null}
      {!loading && !error && items.length === 0 ? <ThemedText themeColor="textSecondary" style={styles.empty}>Your shared Shopping list is ready for Catalog items.</ThemedText> : null}
      {items.length > 0 ? <Pressable accessibilityRole="button" onPress={clearList} style={[styles.clearAction, { borderColor: theme.border }]}><ThemedText themeColor="error">Clear list</ThemedText></Pressable> : null}
      {Platform.OS === 'web' ? <PrimaryButton disabled={loading} onPress={() => { setOpenSwipeId(null); void refresh(); }} title={loading ? 'Refreshing…' : 'Refresh'} /> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 18 },
  notice: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 12 }, noticeText: { flex: 1 }, filterRow: { flexDirection: 'row', gap: 10 }, filter: { flex: 1 }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }, group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }, itemRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 68, paddingHorizontal: 10, paddingVertical: 9 }, checkHit: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 }, itemBody: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, minHeight: 44, minWidth: 0 }, itemCopy: { flex: 1, gap: 4, minWidth: 0 }, itemName: { fontSize: 16, fontWeight: '600' }, checked: { textDecorationLine: 'line-through' }, itemSubtitle: { fontSize: 13 }, purchasedHeaderRight: { alignItems: 'center', flexDirection: 'row', gap: 8 }, clearAction: { alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 46, marginTop: 4 }, empty: { paddingBottom: 4 }, message: { gap: 10 },
});
