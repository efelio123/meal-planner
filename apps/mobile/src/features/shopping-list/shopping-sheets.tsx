import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type CatalogItem, type CatalogUnits, type ShoppingListItem, type ShoppingListItemInput } from '@/lib/api';
import { ChoicePicker, type ChoiceOption } from '@/features/catalog/choice-picker';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useShoppingContext } from './shopping-context';

type SheetProps = { onChanged: () => void; onError: (message: string) => void };
type ShoppingCatalogSummary = Pick<CatalogItem, 'id' | 'item_type' | 'name' | 'category_name' | 'shopping_unit_code' | 'custom_shopping_unit_id' | 'preferred_store_id'> & { archived?: boolean };

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  return <View style={[styles.header, { borderBottomColor: theme.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={onBack ? 'Back' : 'Cancel'} onPress={onBack ?? (() => router.back())} style={styles.headerAction}><ThemedText themeColor="link">{onBack ? '‹ Back' : 'Cancel'}</ThemedText></Pressable>
    <ThemedText accessibilityRole="header" style={styles.headerTitle}>{title}</ThemedText>
    <View style={styles.headerAction} />
  </View>;
}

export function ShoppingCatalogPickerSheet({ items, onError }: { items: ShoppingListItem[]; onError: (message: string) => void }) {
  const theme = useTheme();
  const router = useRouter();
  const sheetFlow = useNativeSheetFlow();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const { scope } = useShoppingContext();
  const householdId = selectedHousehold?.id;
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestScope = JSON.stringify([userId, sessionId, householdId]);
  const latestToken = useRef(getToken);
  const requestScopeRef = useRef(requestScope);
  const previousRequestScope = useRef(requestScope);
  useLayoutEffect(() => {
    requestScopeRef.current = requestScope;
    if (previousRequestScope.current === requestScope) return;
    previousRequestScope.current = requestScope;
    setCatalogItems([]);
    setSearch('');
    setLoadError(null);
    setLoading(Boolean(householdId));
  }, [householdId, requestScope]);
  useEffect(() => { latestToken.current = getToken; }, [getToken]);

  const load = useCallback(async () => {
    if (!householdId) { setLoading(false); return; }
    const startedScope = requestScope;
    setLoading(true); setLoadError(null);
    try {
      const result = await api.catalogItems(() => latestToken.current(), householdId);
      if (requestScopeRef.current === startedScope) setCatalogItems(result.items);
    } catch {
      if (requestScopeRef.current === startedScope) setLoadError('We couldn’t load Catalog items. Please try again.');
    } finally { if (requestScopeRef.current === startedScope) setLoading(false); }
  }, [householdId, requestScope]);
  useEffect(() => {
    const task = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(task);
  }, [load]);

  const openDetails = (item: CatalogItem, existing?: ShoppingListItem) => {
    const id = sheetFlow.present(<ShoppingItemDetailsSheet catalogItem={item} existingItem={existing} closeParentOnSave onChanged={() => undefined} onError={onError} />, { detents: [0.68, 0.94] });
    router.push({ pathname: '/native-sheet/[sheetId]', params: { sheetId: id } } as never);
  };
  const createCatalogItem = () => {
    Keyboard.dismiss();
    router.back();
    requestAnimationFrame(() => router.push({ pathname: '/(app)/(tabs)/shopping/catalog-item', params: { shoppingOriginScope: scope } } as never));
  };
  const filtered = catalogItems.filter((item) => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const present = (item: CatalogItem) => openDetails(item, items.find((entry) => entry.catalog_item_id === item.id));

  return <View style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <Header title="Add from Catalog" />
    <ThemedInput accessibilityLabel="Search Catalog" onChangeText={setSearch} placeholder="Search household items" value={search} returnKeyType="search" />
    {loading ? <ActivityIndicator accessibilityLabel="Loading Catalog items" color={theme.activity} /> : null}
    {loadError ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{loadError}</ThemedText><PrimaryButton onPress={() => void load()} title="Retry" /></View> : null}
    {!loading && !loadError && filtered.length === 0 ? <ThemedText themeColor="textSecondary">{catalogItems.length ? 'No matching items.' : 'Your Catalog is empty.'}</ThemedText> : null}
    <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
      {filtered.map((item) => {
        const existing = items.find((entry) => entry.catalog_item_id === item.id);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={existing ? `Edit ${item.name} on Shopping` : `Add ${item.name} from Catalog`} onPress={() => present(item)} style={[styles.catalogRow, { borderBottomColor: theme.border }]}>
        <View style={styles.rowCopy}><ThemedText style={styles.rowTitle}>{item.name}</ThemedText><ThemedText themeColor="textSecondary">{item.item_type === 'food' ? 'Food' : 'Household'}{item.category_name ? ` · ${item.category_name}` : ''}</ThemedText></View>
        {existing ? <ThemedText themeColor="link">Edit</ThemedText> : <SymbolView name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }} size={23} tintColor={theme.link} />}
      </Pressable>;
      })}
    </ScrollView>
    <Pressable accessibilityRole="button" onPress={createCatalogItem} style={[styles.createCatalog, { borderColor: theme.border }]}>
      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={theme.link} /><ThemedText themeColor="link">Create Catalog item</ThemedText>
    </Pressable>
  </View>;
}

function ShoppingItemDetailsSheet({ catalogItem, existingItem, onChanged, onError, closeParentOnSave = false }: { catalogItem: ShoppingCatalogSummary; existingItem?: ShoppingListItem; onChanged: () => void; onError: (message: string) => void; closeParentOnSave?: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const { markChanged } = useShoppingContext();
  const householdId = selectedHousehold?.id ?? null;
  const requestScope = JSON.stringify([userId, sessionId, householdId]);
  const latestToken = useRef(getToken);
  const scopeRef = useRef(requestScope);
  const initialUnitId = existingItem
    ? existingItem.shopping_unit_code ? `built:${existingItem.shopping_unit_code}`
      : existingItem.custom_shopping_unit_id ? `custom:${existingItem.custom_shopping_unit_id}`
        : existingItem.recipe_unit_code ? `recipe:${existingItem.recipe_unit_code}` : ''
    : catalogItem.shopping_unit_code ? `built:${catalogItem.shopping_unit_code}`
      : catalogItem.custom_shopping_unit_id ? `custom:${catalogItem.custom_shopping_unit_id}` : '';
  const [amount, setAmount] = useState(existingItem?.amount ?? '');
  const [unitId, setUnitId] = useState(initialUnitId);
  const initialUnitIdRef = useRef(initialUnitId);
  const [storeId, setStoreId] = useState(existingItem ? existingItem.store_id ?? '' : catalogItem.preferred_store_id ?? '');
  const [units, setUnits] = useState<CatalogUnits | null>(null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [detail, setDetail] = useState<ShoppingListItem | null>(null);
  const [loading, setLoading] = useState(Boolean(existingItem));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [initialRequestScope] = useState(requestScope);
  const scopeChanged = initialRequestScope !== requestScope;
  useLayoutEffect(() => { scopeRef.current = requestScope; }, [requestScope]);
  useEffect(() => { latestToken.current = getToken; }, [getToken]);
  useEffect(() => {
    if (!householdId || scopeChanged) return;
    const started = requestScope;
    const task = setTimeout(() => {
      setLoading(true); setLoadError(false); setError(null);
      void Promise.all([
        api.catalogUnits(() => latestToken.current(), householdId),
        api.catalogStores(() => latestToken.current(), householdId),
        existingItem ? api.shoppingListItem(() => latestToken.current(), householdId, existingItem.id) : Promise.resolve(null),
      ]).then(([unitResult, storeResult, itemResult]) => {
        if (scopeRef.current !== started) return;
        setUnits(unitResult); setStores(storeResult.stores);
        if (itemResult) setDetail(itemResult.item);
      }).catch(() => {
        if (scopeRef.current === started) { setLoadError(true); setError('We couldn’t load item details or shopping choices. Please retry.'); }
      }).finally(() => { if (scopeRef.current === started) setLoading(false); });
    }, 0);
    return () => clearTimeout(task);
  }, [existingItem, householdId, requestScope, retryCount, scopeChanged]);

  const shoppingUnits: ChoiceOption[] = useMemo(() => [
    ...(units?.shopping_units.built_in ?? []).map((unit) => ({ id: `built:${unit.code}`, label: unit.label, group: unit.unit_group === 'package_count' ? 'Package & count' : 'Measured' })),
    ...(units?.shopping_units.household ?? []).map((unit) => ({ id: `custom:${unit.id}`, label: unit.label, group: 'Household units' })),
    ...((detail?.unit_kind === 'recipe' && detail.unit_label) ? [{ id: `recipe:${detail.recipe_unit_code ?? 'custom'}`, label: detail.unit_label, group: 'Recipe amount' }] : []),
  ], [detail, units]);
  const storesChoices = stores.map((store) => ({ id: store.id, label: store.name }));
  const selectedUnit = shoppingUnits.find((unit) => unit.id === unitId)?.label ?? '';
  const selectedStore = storesChoices.find((store) => store.id === storeId)?.label ?? '';

  const save = async () => {
    if (!householdId || scopeChanged || saving || loading || (existingItem && !detail)) return;
    const started = scopeRef.current;
    setSaving(true); setError(null);
    const selectedUnitId = unitId.startsWith('built:') ? unitId.slice(6) : unitId.startsWith('custom:') ? unitId.slice(7) : '';
    const values: ShoppingListItemInput = {
      amount: amount.trim() || null,
      store_id: storeId || null,
    };
    if (!unitId.startsWith('recipe:') && (!existingItem || unitId !== initialUnitIdRef.current)) {
      values.shopping_unit_code = selectedUnitId && unitId.startsWith('built:') ? selectedUnitId : null;
      values.custom_shopping_unit_id = selectedUnitId && unitId.startsWith('custom:') ? selectedUnitId : null;
    }
    try {
      if (existingItem) await api.updateShoppingListItem(() => latestToken.current(), householdId, existingItem.id, values);
      else await api.addShoppingListItem(() => latestToken.current(), householdId, catalogItem.id, values);
      if (scopeRef.current !== started) return;
      markChanged(householdId);
      onChanged();
      router.back();
      if (closeParentOnSave) requestAnimationFrame(() => router.back());
    } catch (reason) {
      if (scopeRef.current === started) setError(reason instanceof ApiError ? reason.message : 'We couldn’t save this Shopping item. Please try again.');
    } finally { if (scopeRef.current === started) setSaving(false); }
  };

  const remove = () => {
    if (!existingItem) return;
    const confirmRemove = async () => {
      const started = scopeRef.current;
      try {
        await api.deleteShoppingListItem(() => latestToken.current(), householdId!, existingItem.id);
        if (scopeRef.current === started) { markChanged(householdId!); onChanged(); router.back(); if (closeParentOnSave) requestAnimationFrame(() => router.back()); }
      } catch { if (scopeRef.current === started) onError('We couldn’t remove that item. Please try again.'); }
    };
    if (Platform.OS === 'web') { if (globalThis.confirm(`Remove ${catalogItem.name} from Shopping?`)) void confirmRemove(); }
    else Alert.alert('Remove from Shopping?', `Remove ${catalogItem.name} from the shared list?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void confirmRemove() }]);
  };

  return <View style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <Header title={existingItem ? 'Edit item' : 'Add item'} />
    {scopeChanged ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">Your household or sign-in changed. Close this sheet and choose an item again.</ThemedText><PrimaryButton onPress={() => router.back()} title="Close" /></View> : <ScrollView style={styles.formScroll} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
      <View style={styles.itemHero}><View style={[styles.itemGlyph, { backgroundColor: theme.surfaceSelected }]}><ThemedText style={styles.glyphText}>{catalogItem.name.trim().slice(0, 1).toLocaleUpperCase()}</ThemedText></View><View style={styles.rowCopy}><ThemedText style={styles.heroName}>{catalogItem.name}</ThemedText><ThemedText themeColor="textSecondary">{catalogItem.item_type === 'food' ? 'Food' : 'Household'}{catalogItem.category_name ? ` · ${catalogItem.category_name}` : ''}</ThemedText></View></View>
      <ThemedText accessibilityRole="header" style={styles.sectionTitle}>Add details</ThemedText>
      <ThemedInput accessibilityLabel="Amount" keyboardType="decimal-pad" onChangeText={setAmount} placeholder="Amount (optional)" value={amount} />
      <ChoicePicker label="Unit" searchable choices={shoppingUnits} selectedId={unitId} value={selectedUnit} emptyChoiceLabel="No unit" onSelect={setUnitId} />
      <ChoicePicker label="Store" choices={storesChoices} selectedId={storeId} value={selectedStore} emptyChoiceLabel="No store" onSelect={setStoreId} />
      {existingItem ? <View style={styles.meals}><ThemedText style={styles.sectionTitle}>Used in meals</ThemedText>{loading ? <ActivityIndicator accessibilityLabel="Loading meal details" color={theme.activity} /> : detail?.used_in_meals?.length ? detail.used_in_meals.map((meal, index) => <ThemedText key={`${meal.planned_for}-${index}`} themeColor="textSecondary">{new Date(`${meal.planned_for}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {meal.recipe_name}</ThemedText>) : <ThemedText themeColor="textSecondary">No planned meals use this item this week.</ThemedText>}</View> : null}
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      {loadError ? <PrimaryButton disabled={loading} onPress={() => setRetryCount((count) => count + 1)} title={loading ? 'Retrying…' : 'Retry loading details'} /> : null}
      {existingItem && !catalogItem.archived ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/(app)/(tabs)/catalog/item/[itemId]', params: { itemId: catalogItem.id } } as never)}><ThemedText themeColor="link">View in Catalog</ThemedText></Pressable> : null}
      <PrimaryButton disabled={saving || loading || Boolean(existingItem && !detail)} onPress={() => void save()} title={saving ? 'Saving…' : existingItem ? 'Save changes' : 'Add to Shopping'} />
      {existingItem ? <Pressable accessibilityRole="button" accessibilityLabel="Remove from Shopping" onPress={remove} style={styles.removeAction}><ThemedText themeColor="error">Remove from Shopping</ThemedText></Pressable> : null}
    </ScrollView>}
  </View>;
}

export function openShoppingDetails(sheetFlow: ReturnType<typeof useNativeSheetFlow>, router: ReturnType<typeof useRouter>, catalogItem: ShoppingCatalogSummary, existingItem: ShoppingListItem | undefined, handlers: SheetProps) {
  const sheetId = sheetFlow.present(<ShoppingItemDetailsSheet catalogItem={catalogItem} existingItem={existingItem} onChanged={handlers.onChanged} onError={handlers.onError} />, { detents: [0.68, 0.94] });
  router.push({ pathname: '/native-sheet/[sheetId]', params: { sheetId } } as never);
}

const styles = StyleSheet.create({
  sheet: { flex: 1, gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  header: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingBottom: 8 },
  headerAction: { justifyContent: 'center', minHeight: 44, minWidth: 68 }, headerTitle: { fontSize: 18, fontWeight: '700' },
  list: { flex: 1, minHeight: 80 }, catalogRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 64, paddingHorizontal: 8 },
  rowCopy: { flex: 1, gap: 3 }, rowTitle: { fontSize: 16, fontWeight: '600' }, createCatalog: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 52, paddingHorizontal: 8 },
  formScroll: { flex: 1 }, form: { gap: 16, paddingBottom: 20 }, itemHero: { alignItems: 'center', flexDirection: 'row', gap: 14, paddingVertical: 8 }, itemGlyph: { alignItems: 'center', borderRadius: 12, height: 48, justifyContent: 'center', width: 48 }, glyphText: { fontSize: 21, fontWeight: '700' }, heroName: { fontSize: 22, fontWeight: '700' }, sectionTitle: { fontSize: 17, fontWeight: '700' }, meals: { gap: 8, paddingTop: 6 }, removeAction: { alignItems: 'center', minHeight: 44, justifyContent: 'center' }, message: { gap: 10 },
});
