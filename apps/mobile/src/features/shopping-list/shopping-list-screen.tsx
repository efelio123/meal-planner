import { PermissionGate } from '@/features/household-permissions/permission-gate';
import { useHouseholdAccess } from '@/features/household-permissions/use-household-access';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Platform, Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { EmojiText } from '@/components/emoji-text';
import { CircularAddButton, DisclosureChevron, ExpansionChevron, TabPageHeader, visualStyles } from '@/components/visual-roles';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import type { CatalogItem, ShoppingListItem } from '@/lib/api';
import { ChoicePicker } from '@/features/catalog/choice-picker';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useMealPlanContextOptional } from '@/features/meal-plan/meal-plan-context';
import { ShoppingCatalogPickerSheet, openShoppingDetails } from './shopping-sheets';
import { useShoppingContext } from './shopping-context';
import { useShoppingList } from './use-shopping-list';
import { SwipeToDeleteRow } from '@/components/swipe-to-delete-row';
import { groupShoppingItems } from './shopping-list-groups';

type SortKey = 'recent' | 'name-asc' | 'name-desc' | 'store' | 'category';
const sortOptions = [
  { id: 'recent', label: 'Recently added' }, { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' }, { id: 'store', label: 'Store' }, { id: 'category', label: 'Category' },
];

export default function ShoppingListScreen() {
  const theme = useTheme();
  const { can } = useHouseholdAccess(); const router = useRouter(); const sheetFlow = useNativeSheetFlow();
  const { selectedHousehold } = useHouseholdState();
  const { scope, createdItem, setCreatedItem } = useShoppingContext();
  const mealPlanContext = useMealPlanContextOptional();
  const { addOrReadd, clear, clearPurchased, clearing, error, householdId, items, loading, pendingItemIds, refresh, remove, toggle } = useShoppingList();
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInput = useRef<TextInputInstance>(null);
  const [storeFilter, setStoreFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [purchasedExpanded, setPurchasedExpanded] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [collapsedSearchGroups, setCollapsedSearchGroups] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [clearNotice, setClearNotice] = useState<string | null>(null);
  const bulkDisabled = loading || Boolean(clearing) || pendingItemIds.size > 0;
  const [failedCreatedItem, setFailedCreatedItem] = useState<{ scope: string; item: CatalogItem } | null>(null);
  const [retryingCreatedItem, setRetryingCreatedItem] = useState(false);
  const suppressRowPressUntil = useRef(0);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const scrollDragStartY = useRef(0);
  const scrollOffsetY = useRef(0);
  const scrollStartedAfterReveal = useRef(false);
  const scopeRef = useRef(scope);
  const scopeVersion = useRef(0);
  const openedEditParam = useRef<string | null>(null);
  const shoppingNotice = householdId ? mealPlanContext?.shoppingAddNoticeForHousehold(householdId) ?? null : null;

  useLayoutEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    scopeVersion.current += 1;
    setSearch('');
    setCollapsedGroups(new Set());
    setCollapsedSearchGroups(new Set());
    searchInput.current?.blur();
    setSearchFocused(false);
    Keyboard.dismiss();
    setStoreFilter('all');
    setSort('recent');
    setPurchasedExpanded(true);
    setActionError(null);
    setClearNotice(null);
    setFailedCreatedItem(null);
    setRetryingCreatedItem(false);
    openedEditParam.current = null;
    suppressRowPressUntil.current = 0;
    setOpenSwipeId(null);
  }, [scope]);
  useEffect(() => {
    if (!clearNotice) return;
    const timer = setTimeout(() => setClearNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [clearNotice]);
  const dismissSearch = useCallback(() => {
    searchInput.current?.blur();
    setSearchFocused(false);
    Keyboard.dismiss();
  }, []);
  useFocusEffect(useCallback(() => () => {
    searchInput.current?.blur();
    setSearchFocused(false);
  }, []));
  const closeSwipeForSearch = () => {
    setOpenSwipeId(null);
    scrollStartedAfterReveal.current = false;
    suppressRowPressUntil.current = 0;
  };
  const params = useLocalSearchParams<{ editItemId?: string }>();
  const quickAdd = useCallback((item: CatalogItem) => addOrReadd(item.id), [addOrReadd]);
  const openItem = useCallback(async (item: ShoppingListItem) => {
    if (clearing || !householdId || !item.catalog_item_id) return;
    setOpenSwipeId(null);
    setActionError(null);
    dismissSearch();
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
  }, [clearing, dismissSearch, householdId, remove, router, sheetFlow]);

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
  const query = search.trim().toLocaleLowerCase();
  const searching = query.length > 0;
  const showPurchased = searching || purchasedExpanded;
  const changeSearch = (value: string) => {
    closeSwipeForSearch();
    if (value.trim().toLocaleLowerCase() !== query) setCollapsedSearchGroups(new Set());
    setSearch(value);
  };
  const toggleGroup = (key: string) => {
    setOpenSwipeId(null);
    const setCollapsed = searching ? setCollapsedSearchGroups : setCollapsedGroups;
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const filtered = items.filter((item) => (activeStoreFilter === 'all' || (activeStoreFilter === 'none' ? !item.store_id : item.store_id === activeStoreFilter))
    && item.name.toLocaleLowerCase().includes(query));
  const compareName = (a: ShoppingListItem, b: ShoppingListItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const ordered = [...filtered].sort((a, b) => {
    if (sort === 'name-asc') return compareName(a, b);
    if (sort === 'name-desc') return compareName(b, a);
    // Category/Store order belongs to the identity-based group helper below.
    if (sort === 'store' || sort === 'category') return 0;
    return b.created_at.localeCompare(a.created_at);
  });
  const toBuy = ordered.filter((item) => !item.is_checked); const purchased = ordered.filter((item) => item.is_checked);
  const addFromCatalog = () => {
    if (clearing) return;
    dismissSearch();
    setOpenSwipeId(null);
    setActionError(null);
    const sheetId = sheetFlow.present(<ShoppingCatalogPickerSheet items={items} onAdd={quickAdd} />, { detents: [0.65, 0.94], initialDetent: 1 });
    router.push({ pathname: '/shopping/sheet/picker', params: { sheetId } } as never);
  };
  const clearList = (mode: 'all' | 'purchased') => {
    if (bulkDisabled) return;
    dismissSearch();
    const startedScope = scopeRef.current;
    const startedVersion = scopeVersion.current;
    const isCurrent = () => scopeRef.current === startedScope && scopeVersion.current === startedVersion;
    setOpenSwipeId(null);
    const confirmClear = async () => {
      if (!isCurrent()) return;
      setActionError(null); setClearNotice(null);
      try {
        const count = await (mode === 'purchased' ? clearPurchased() : clear());
        if (isCurrent()) {
          if (mode === 'all') { setCollapsedGroups(new Set()); setCollapsedSearchGroups(new Set()); }
          setClearNotice(mode === 'all' ? 'Shopping list cleared.' : count === 0 ? 'No purchased items to clear.' : `${count} purchased ${count === 1 ? 'item' : 'items'} removed.`);
        }
      } catch (reason) {
        if (isCurrent()) setActionError(reason instanceof Error ? reason.message : 'We couldn’t clear the list. Please try again.');
      }
    };
    const title = mode === 'purchased' ? 'Clear purchased items?' : 'Clear the whole list?';
    const message = mode === 'purchased' ? 'This removes purchased items from all stores in this household. Items still needed will stay on the list.' : 'This removes every item from all stores, including purchased items. Catalog items, recipes, and meal plans stay unchanged.';
    const action = mode === 'purchased' ? 'Clear purchased items' : 'Clear entire list';
    if (Platform.OS === 'web') { if (globalThis.confirm(`${title}\n\n${message}`)) void confirmClear(); }
    else Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: action, style: 'destructive', onPress: () => void confirmClear() }]);
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
    const writesDisabled = Boolean(clearing) || pending;
    const separatorColor = index < sectionItems.length - 1 ? theme.border : null;
    const amount = [item.amount, item.unit_label].filter(Boolean).join(' ');
    const subtitle = [amount || null, item.store_name || null].filter(Boolean).join(' · ');
    const row = <View style={[styles.itemRow, { backgroundColor: theme.surface }]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Mark ${item.name} ${item.is_checked ? 'not purchased' : 'purchased'}`} accessibilityState={{ checked: item.is_checked, disabled: writesDisabled || !can('shopping.check') }} disabled={writesDisabled || !can('shopping.check')} onPress={() => { if (interceptRowPress(item.id)) return; setActionError(null); void toggle(item).catch((reason: unknown) => setActionError(reason instanceof Error ? reason.message : 'We couldn’t update that item.')); }} style={styles.checkHit}>
        <SymbolView name={{ ios: item.is_checked ? 'checkmark.circle.fill' : 'circle', android: item.is_checked ? 'check_circle' : 'radio_button_unchecked', web: item.is_checked ? 'check_circle' : 'radio_button_unchecked' }} size={25} tintColor={item.is_checked ? theme.primary : theme.textSecondary} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} accessibilityState={{ disabled: Boolean(clearing) }} disabled={Boolean(clearing)} onPress={() => { if (!interceptRowPress(item.id)) void openItem(item); }} style={styles.itemBody}>
        <View style={styles.itemCopy}><ThemedText style={[styles.itemName, item.is_checked && styles.checked]} numberOfLines={2}>{item.name}</ThemedText>
          {subtitle ? <ThemedText themeColor="textSecondary" style={styles.itemSubtitle} numberOfLines={1}>{subtitle}</ThemedText> : null}
        </View>
        <View testID={`shopping-edit-chevron-${item.id}`} accessibilityElementsHidden importantForAccessibility="no"><DisclosureChevron /></View>
      </Pressable>
      {pending ? <ActivityIndicator accessibilityLabel={`Updating ${item.name}`} color={theme.activity} /> : null}
    </View>;
    if (Platform.OS === 'web') return <View key={item.id} style={separatorColor ? { borderBottomColor: separatorColor, borderBottomWidth: StyleSheet.hairlineWidth } : undefined}>{row}</View>;
    return <SwipeToDeleteRow key={item.id} active={openSwipeId === item.id} enabled={!writesDisabled && can('shopping.remove')}
      rowId={item.id} removeAccessibilityLabel={`Remove ${item.name} from Shopping`} testID={`shopping-swipe-${item.id}`} separatorTestID={`shopping-separator-${item.id}`} separatorColor={separatorColor} onDragStart={suppressRowPressForDrag} onDragEnd={suppressRowPress}
      onReveal={() => { scrollStartedAfterReveal.current = false; scrollDragStartY.current = scrollOffsetY.current; setOpenSwipeId(item.id); }}
      onClose={() => setOpenSwipeId((current) => current === item.id ? null : current)}
      onRemove={async () => { setOpenSwipeId(null); await removeFromSwipe(item); }}>
      {row}
    </SwipeToDeleteRow>;
  });

  const renderSectionRows = (sectionItems: ShoppingListItem[], section: 'needed' | 'purchased') => {
    if (!sectionItems.length) return null;
    if (sort !== 'category' && sort !== 'store') return <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>{renderRows(sectionItems)}</View>;
    return <View style={styles.itemGroups}>{groupShoppingItems(sectionItems, sort, items).map((group) => {
      const key = JSON.stringify([sort, section, group.key]);
      const expanded = !(searching ? collapsedSearchGroups : collapsedGroups).has(key);
      return <View key={group.key} testID={`shopping-group-${section}-${group.key}`} style={styles.itemGroup}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${group.label}, ${group.items.length} ${group.items.length === 1 ? 'item' : 'items'}`}
          accessibilityState={{ expanded }} onPress={() => toggleGroup(key)} style={({ pressed }) => [styles.groupHeading, { opacity: pressed ? 0.82 : 1 }]}>
          <View style={styles.groupHeadingCopy}>
            {group.emoji ? <EmojiText size={18} accessibilityElementsHidden importantForAccessibility="no">{group.emoji}</EmojiText> : null}
            <ThemedText themeColor="textSecondary" style={styles.groupLabel}>{group.label}</ThemedText>
          </View>
          <View style={styles.purchasedHeaderRight}><ThemedText themeColor="textSecondary" style={styles.groupCount}>{group.items.length}</ThemedText>
            <ExpansionChevron expanded={expanded} testID={`shopping-expansion-${section}-${group.key}`} />
          </View>
        </Pressable>
        {expanded ? <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>{renderRows(group.items)}</View> : null}
      </View>;
    })}</View>;
  };

  return <Screen layout="tab-root" inlineKeyboardActive={searchFocused} contentAlignment="top" onRefresh={() => { setOpenSwipeId(null); return refresh(); }}
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
      <TabPageHeader title="Shopping" subtitle={<ThemedText themeColor="textSecondary">{selectedHousehold?.name ?? 'Household'} · shared list</ThemedText>} actions={<PermissionGate action="shopping.add"><CircularAddButton accessibilityLabel="Add from Catalog" disabled={Boolean(clearing)} onPress={addFromCatalog} /></PermissionGate>} />
      {shoppingNotice ? <View style={[styles.notice, { backgroundColor: theme.surfaceSelected }]}><ThemedText accessibilityRole="alert" style={styles.noticeText}>{shoppingNotice.count} {shoppingNotice.count === 1 ? 'item' : 'items'} added from this week’s meals.</ThemedText><Pressable accessibilityRole="button" accessibilityLabel="Dismiss shopping confirmation" onPress={() => mealPlanContext?.clearShoppingAddNotice(shoppingNotice.requestId)}><ThemedText themeColor="link">Dismiss</ThemedText></Pressable></View> : null}
      <View style={[styles.searchField, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
        <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={19} tintColor={theme.inputPlaceholder} />
        <ThemedInput ref={searchInput} accessibilityLabel="Search shopping list" autoCapitalize="none" autoCorrect={false} placeholder="Search shopping list" returnKeyType="search" submitBehavior="blurAndSubmit" value={search}
          onFocus={() => { closeSwipeForSearch(); setSearchFocused(true); }} onBlur={() => setSearchFocused(false)} onSubmitEditing={dismissSearch}
          onChangeText={changeSearch} style={styles.searchInput} />
        {search.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={4} onPress={() => changeSearch('')} style={styles.clearSearch}>
          <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={21} tintColor={theme.inputPlaceholder} />
        </Pressable> : null}
      </View>
      <View style={styles.filterRow}><View style={styles.filter}><ChoicePicker compact label="Store" onOpen={dismissSearch} choices={storeOptions} selectedId={activeStoreFilter} value={storeOptions.find((option) => option.id === activeStoreFilter)?.label ?? 'All stores'} onSelect={(value) => { setOpenSwipeId(null); setStoreFilter(value); }} /></View><View style={styles.filter}><ChoicePicker compact label="Sort" onOpen={dismissSearch} choices={sortOptions} selectedId={sort} value={sortOptions.find((option) => option.id === sort)?.label ?? 'Recently added'} onSelect={(value) => { setOpenSwipeId(null); setSort(value as SortKey); }} /></View></View>
      <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>To buy</ThemedText><ThemedText testID="shopping-to-buy-count" themeColor="textSecondary">{toBuy.length}</ThemedText></View>
      {loading && items.length === 0 ? <ActivityIndicator accessibilityLabel="Loading shopping list" color={theme.activity} /> : null}
      {error ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText><PrimaryButton onPress={() => { setOpenSwipeId(null); void refresh(); }} title="Retry" /></View> : null}
      {actionError ? <ThemedText accessibilityRole="alert" themeColor="error">{actionError}</ThemedText> : null}
      {failedCreatedItem?.scope === scope ? <PrimaryButton disabled={Boolean(clearing) || retryingCreatedItem} onPress={() => {
        setRetryingCreatedItem(true);
        void quickAdd(failedCreatedItem.item).then(() => { if (scopeRef.current === scope) { setFailedCreatedItem(null); setActionError(null); } }).catch((reason: unknown) => {
          if (scopeRef.current !== scope) return;
          setActionError(reason instanceof Error ? reason.message : 'We couldn’t add this Catalog item. Please try again.');
        }).finally(() => { if (scopeRef.current === scope) setRetryingCreatedItem(false); });
      }} title={retryingCreatedItem ? 'Adding…' : `Retry adding ${failedCreatedItem.item.name}`} /> : null}
      {!searching && !loading && !error && toBuy.length === 0 ? <ThemedText themeColor="textSecondary">{activeStoreFilter === 'all' ? 'Nothing to buy yet. Add items from your Catalog.' : 'No items to buy for this store.'}</ThemedText> : null}
      {searching && !loading && !error && filtered.length === 0 ? <View style={styles.message}>
        <ThemedText themeColor="textSecondary">No items match your search.</ThemedText>
        {activeStoreFilter !== 'all' ? <ThemedText themeColor="textSecondary">Try another name or change the Store filter.</ThemedText> : null}
      </View> : null}
      {renderSectionRows(toBuy, 'needed')}
      {searching ? <View style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>Purchased</ThemedText><ThemedText testID="shopping-purchased-count" themeColor="textSecondary">{purchased.length}</ThemedText></View>
        : <Pressable accessibilityRole="button" accessibilityState={{ expanded: purchasedExpanded }} onPress={() => { setOpenSwipeId(null); setPurchasedExpanded((value) => !value); }} style={styles.sectionHeader}><ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>Purchased</ThemedText><View style={styles.purchasedHeaderRight}><ThemedText testID="shopping-purchased-count" themeColor="textSecondary">{purchased.length}</ThemedText><ExpansionChevron expanded={purchasedExpanded} /></View></Pressable>}
      {showPurchased ? renderSectionRows(purchased, 'purchased') : null}
      {!searching && purchasedExpanded && !purchased.length && items.length ? <ThemedText themeColor="textSecondary">No purchased items yet.</ThemedText> : null}
      {!searching && !loading && !error && items.length === 0 ? <ThemedText themeColor="textSecondary" style={styles.empty}>Your shared Shopping list is ready for Catalog items.</ThemedText> : null}
      {clearNotice ? <ThemedText accessibilityLiveRegion="polite">{clearNotice}</ThemedText> : null}
      {items.length > 0 ? <View style={styles.clearActions}>
        <ThemedText themeColor="textSecondary">Applies to all stores, including hidden items.</ThemedText>
        {items.some((item) => item.is_checked) ? <PermissionGate action="shopping.clear_purchased"><Pressable accessibilityRole="button" accessibilityLabel="Clear purchased items" accessibilityState={{ disabled: bulkDisabled }} disabled={bulkDisabled} onPress={() => clearList('purchased')} style={[styles.clearAction, { borderColor: theme.border, opacity: bulkDisabled ? 0.5 : 1 }]}><ThemedText themeColor="error">{clearing === 'purchased' ? 'Clearing…' : 'Clear purchased items'}</ThemedText></Pressable></PermissionGate> : null}
        <PermissionGate action="shopping.clear_all"><Pressable accessibilityRole="button" accessibilityLabel="Clear entire list" accessibilityState={{ disabled: bulkDisabled }} disabled={bulkDisabled} onPress={() => clearList('all')} style={[styles.clearAction, { borderColor: theme.border, opacity: bulkDisabled ? 0.5 : 1 }]}><ThemedText themeColor="error">{clearing === 'all' ? 'Clearing…' : 'Clear entire list'}</ThemedText></Pressable></PermissionGate>
      </View> : null}
      {Platform.OS === 'web' ? <PrimaryButton disabled={loading} onPress={() => { setOpenSwipeId(null); void refresh(); }} title={loading ? 'Refreshing…' : 'Refresh'} /> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  itemGroups: { gap: 14 },
  itemGroup: { gap: 6 },
  groupHeading: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 4, paddingVertical: 6 },
  groupHeadingCopy: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 8, minWidth: 0 },
  groupLabel: { flexShrink: 1, fontSize: 13, fontWeight: '600' },
  groupCount: { fontSize: 13 },
  clearActions: { gap: 10 },
  searchField: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 52, paddingHorizontal: 14 },
  searchInput: { backgroundColor: 'transparent', borderWidth: 0, flex: 1, minWidth: 0, paddingHorizontal: 0 },
  clearSearch: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  content: { gap: 16, paddingBottom: 18 },
  notice: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 12 }, noticeText: { flex: 1 }, filterRow: { flexDirection: 'row', gap: 10 }, filter: { flex: 1 }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }, group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }, itemRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 68, paddingHorizontal: 10, paddingVertical: 9 }, checkHit: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 }, itemBody: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, minHeight: 44, minWidth: 0 }, itemCopy: { flex: 1, gap: 4, minWidth: 0 }, itemName: { fontSize: 16, fontWeight: '600' }, checked: { textDecorationLine: 'line-through' }, itemSubtitle: { fontSize: 13 }, purchasedHeaderRight: { alignItems: 'center', flexDirection: 'row', gap: 8 }, clearAction: { alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 46, marginTop: 4 }, empty: { paddingBottom: 4 }, message: { gap: 10 },
});
