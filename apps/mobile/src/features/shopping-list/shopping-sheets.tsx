import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Dimensions, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, type KeyboardEvent } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type CatalogItem, type CatalogUnits, type ShoppingListItem, type ShoppingListItemInput } from '@/lib/api';
import { ChoicePicker, type ChoiceOption } from '@/features/catalog/choice-picker';
import { useCatalogContext, type CatalogChoiceKind } from '@/features/catalog/catalog-context';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useShoppingContext } from './shopping-context';
import { shoppingAmountError } from './shopping-amount';

type SheetProps = { onChanged: () => void; onRemove: (item: ShoppingListItem) => Promise<void> };
type ShoppingCatalogSummary = Pick<CatalogItem, 'id' | 'item_type' | 'name' | 'category_name' | 'shopping_unit_code' | 'custom_shopping_unit_id' | 'preferred_store_id'> & { archived?: boolean };
export function shoppingPickerKeyboardInset(screenHeight: number, keyboardTop: number): number {
  return Math.max(0, Math.ceil(screenHeight - keyboardTop));
}
function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  return <View collapsable={false} style={[styles.header, { borderBottomColor: theme.border }]}>
    <ThemedText accessibilityRole="header" style={styles.headerTitle}>{title}</ThemedText>
    <Pressable accessibilityRole="button" accessibilityLabel={onBack ? 'Back' : 'Cancel'} onPress={onBack ?? (() => router.back())} style={styles.headerAction}><ThemedText themeColor="link">{onBack ? 'Back' : 'Cancel'}</ThemedText></Pressable>
  </View>;
}

export function ShoppingCatalogPickerSheet({ items, onAdd, onRemove }: { items: ShoppingListItem[]; onAdd: (item: CatalogItem) => Promise<void>; onRemove: (item: ShoppingListItem) => Promise<void> }) {
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
  const [addError, setAddError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [duplicateItem, setDuplicateItem] = useState<ShoppingListItem | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const addingRef = useRef(false);
  const confirmationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);
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
    setAddError(null);
    setAddedIds(new Set());
    setConfirmation(null);
    if (confirmationTimeout.current) clearTimeout(confirmationTimeout.current);
    confirmationTimeout.current = null;
    setDuplicateItem(null);
    addingRef.current = false;
    setAddingId(null);
    setLoading(Boolean(householdId));
  }, [householdId, requestScope]);
  useEffect(() => { latestToken.current = getToken; }, [getToken]);
  useEffect(() => { activeRef.current = true; return () => {
    activeRef.current = false;
    if (confirmationTimeout.current) clearTimeout(confirmationTimeout.current);
  }; }, []);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const onFrame = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardInset(shoppingPickerKeyboardInset(Dimensions.get('screen').height, event.endCoordinates.screenY));
    };
    const changing = Keyboard.addListener('keyboardWillChangeFrame', onFrame);
    const shown = Keyboard.addListener('keyboardDidShow', onFrame);
    const hidden = Keyboard.addListener('keyboardWillHide', () => setKeyboardInset(0));
    return () => { changing.remove(); shown.remove(); hidden.remove(); };
  }, []);
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
    const id = sheetFlow.present(<ShoppingItemDetailsSheet catalogItem={item} existingItem={existing} closeParentOnSave onChanged={() => undefined} onRemove={onRemove} />, { detents: [0.68, 0.94], initialDetent: 1 });
    router.push({ pathname: '/shopping/sheet/details', params: { sheetId: id } } as never);
  };
  const createCatalogItem = () => {
    Keyboard.dismiss();
    router.back();
    requestAnimationFrame(() => router.push({ pathname: '/(app)/(tabs)/shopping/catalog-item', params: { shoppingOriginScope: scope } } as never));
  };
  const closePicker = () => {
    if (confirmationTimeout.current) clearTimeout(confirmationTimeout.current);
    confirmationTimeout.current = null;
    router.back();
  };
  const createCatalogAction = () => <Pressable accessibilityRole="button" accessibilityLabel="Create item in Catalog" disabled={Boolean(addingId)} onPress={createCatalogItem} style={styles.createCatalog}>
    <SymbolView name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }} size={22} tintColor={theme.link} /><ThemedText themeColor="link">Create item in Catalog</ThemedText><ThemedText themeColor="link">›</ThemedText>
  </Pressable>;
  const filtered = catalogItems.filter((item) => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selectItem = async (item: CatalogItem, existing?: ShoppingListItem) => {
    if (addingRef.current || !householdId) return;
    if (addedIds.has(item.id)) return;
    if (existing) { Keyboard.dismiss(); openDetails(item, existing); return; }
    const startedScope = requestScopeRef.current;
    addingRef.current = true;
    setAddingId(item.id);
    setAddError(null);
    try {
      await onAdd(item);
      if (activeRef.current && requestScopeRef.current === startedScope) {
        setAddedIds((current) => new Set(current).add(item.id));
        setConfirmation(`${item.name} added to Shopping`);
        if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`${item.name} added to Shopping`);
        if (confirmationTimeout.current) clearTimeout(confirmationTimeout.current);
        confirmationTimeout.current = setTimeout(() => {
          if (activeRef.current && requestScopeRef.current === startedScope) setConfirmation(null);
          confirmationTimeout.current = null;
        }, 2200);
      }
    } catch (reason) {
      if (!activeRef.current || requestScopeRef.current !== startedScope) return;
      if (reason instanceof ApiError && reason.code === 'SHOPPING_ITEM_ALREADY_EXISTS') {
        try {
          const currentList = await api.shoppingList(() => latestToken.current(), householdId);
          if (activeRef.current && requestScopeRef.current === startedScope) setDuplicateItem(currentList.shopping_list.items.find((entry) => entry.catalog_item_id === item.id) ?? null);
        } catch { /* The error remains visible; a later search can retry. */ }
      }
      if (activeRef.current && requestScopeRef.current === startedScope) setAddError(reason instanceof ApiError ? reason.message : 'We couldn’t add this item. Please try again.');
    } finally {
      if (activeRef.current && requestScopeRef.current === startedScope) { addingRef.current = false; setAddingId(null); }
    }
  };

  // Keep the native root and header views distinct inside the iOS form sheet.
  return <View collapsable={false} testID="shopping-catalog-picker-sheet" style={[styles.pickerSheet, { backgroundColor: theme.elevatedSurface }]}>
      <View testID="shopping-catalog-sticky-header" collapsable={false} style={[styles.pickerSticky, { backgroundColor: theme.elevatedSurface }]}>
        <View collapsable={false} style={[styles.header, { borderBottomColor: theme.border }]}>
          <ThemedText accessibilityRole="header" style={styles.headerTitle}>Add item</ThemedText>
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Create Catalog item" disabled={Boolean(addingId)} onPress={createCatalogItem} style={styles.headerIconAction}><SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={23} tintColor={theme.link} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Done" disabled={Boolean(addingId)} onPress={closePicker} style={styles.headerAction}><ThemedText themeColor="link">Done</ThemedText></Pressable>
          </View>
        </View>
        <View style={styles.pickerSearch}><ThemedInput accessibilityLabel="Search Catalog" onChangeText={setSearch} placeholder="Search household items" value={search} returnKeyType="search" /></View>
        {addError ? <ThemedText accessibilityRole="alert" themeColor="error" style={styles.pickerMessage}>{addError}</ThemedText> : null}
      </View>
      <ScrollView testID="shopping-catalog-results" style={styles.pickerResultsScroll} contentContainerStyle={[styles.pickerResultsContent, { paddingBottom: 96 + keyboardInset }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        {loading ? <ActivityIndicator accessibilityLabel="Loading Catalog items" color={theme.activity} /> : null}
        {loadError ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">{loadError}</ThemedText><PrimaryButton onPress={() => void load()} title="Retry" /></View> : null}
        {!loading && !loadError && filtered.length === 0 ? <ThemedText themeColor="textSecondary">{catalogItems.length ? 'No matching items.' : 'Your Catalog is empty.'}</ThemedText> : null}
        <View style={[styles.catalogCard, { backgroundColor: theme.surface }]}>
          {filtered.map((item) => {
            const existing = items.find((entry) => entry.catalog_item_id === item.id) ?? (duplicateItem?.catalog_item_id === item.id ? duplicateItem : undefined);
            const justAdded = addedIds.has(item.id);
            const disabled = Boolean(addingId) || justAdded;
            return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={justAdded ? `${item.name} on Shopping` : existing ? `Edit ${item.name} on Shopping` : `Add ${item.name} from Catalog`} accessibilityState={{ disabled }} disabled={disabled} onPress={() => void selectItem(item, existing)} style={[styles.catalogRow, { borderBottomColor: theme.border }]}>
              <View style={[styles.itemGlyph, { backgroundColor: theme.screen }]}><ThemedText style={styles.glyphText}>{item.name.trim().slice(0, 1).toLocaleUpperCase()}</ThemedText></View>
              <View style={styles.rowCopy}><ThemedText style={styles.rowTitle}>{item.name}</ThemedText><ThemedText themeColor="textSecondary">{item.item_type === 'food' ? 'Food' : 'Household'}{item.category_name ? ` · ${item.category_name}` : ''}</ThemedText></View>
              {addingId === item.id ? <ActivityIndicator accessibilityLabel={`Adding ${item.name}`} color={theme.activity} /> : existing || justAdded ? <ThemedText themeColor="link">On list</ThemedText> : <ThemedText themeColor="textSecondary">›</ThemedText>}
            </Pressable>;
          })}
        </View>
      </ScrollView>
    <View testID="shopping-catalog-footer" style={[styles.pickerFooter, { backgroundColor: theme.elevatedSurface, borderTopColor: theme.border, bottom: keyboardInset, paddingBottom: keyboardInset > 0 ? 0 : 16 }]}>
      {createCatalogAction()}
    </View>
    {confirmation ? <View accessibilityLiveRegion="polite" pointerEvents="none" testID="shopping-add-confirmation" style={[styles.pickerConfirmation, { bottom: keyboardInset + 76 }]}>
      <View style={[styles.pickerConfirmationPill, { backgroundColor: theme.surfaceSelected, borderColor: theme.border }]}>
        <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={20} tintColor={theme.link} />
        <ThemedText>{confirmation}</ThemedText>
      </View>
    </View> : null}
  </View>;
}

function ShoppingItemDetailsSheet({ catalogItem, existingItem, onChanged, onRemove, closeParentOnSave = false }: { catalogItem: ShoppingCatalogSummary; existingItem?: ShoppingListItem; onChanged: () => void; onRemove: (item: ShoppingListItem) => Promise<void>; closeParentOnSave?: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const { scope: shoppingScope, createdChoice, setCreatedChoice, markChanged } = useShoppingContext();
  const { revision: catalogRevision } = useCatalogContext();
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
  const [amount, setAmount] = useState(existingItem ? existingItem.amount ?? '' : '1');
  const [unitId, setUnitId] = useState(initialUnitId);
  const unitIdRef = useRef(initialUnitId);
  const initialUnitIdRef = useRef(initialUnitId);
  const [storeId, setStoreId] = useState(existingItem ? existingItem.store_id ?? '' : catalogItem.preferred_store_id ?? '');
  const storeIdRef = useRef(existingItem ? existingItem.store_id ?? '' : catalogItem.preferred_store_id ?? '');
  const unitOverridden = useRef(false);
  const storeOverridden = useRef(false);
  const [currentCatalogItem, setCurrentCatalogItem] = useState<ShoppingCatalogSummary>(catalogItem);
  const [units, setUnits] = useState<CatalogUnits | null>(null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [detail, setDetail] = useState<ShoppingListItem | null>(null);
  const [preferenceNotice, setPreferenceNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(existingItem));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const loadGeneration = useRef(0);
  const [initialRequestScope] = useState(requestScope);
  const scopeChanged = initialRequestScope !== requestScope;
  useLayoutEffect(() => { scopeRef.current = requestScope; }, [requestScope]);
  useEffect(() => { latestToken.current = getToken; }, [getToken]);
  useEffect(() => {
    if (!createdChoice) return;
    setCreatedChoice(null);
    if (scopeChanged || createdChoice.scope !== shoppingScope || createdChoice.catalogItemId !== catalogItem.id) return;
    if (createdChoice.kind === 'shopping-unit') {
      unitOverridden.current = true;
      unitIdRef.current = `custom:${createdChoice.id}`;
      setUnitId(unitIdRef.current);
    } else if (createdChoice.kind === 'store') {
      storeOverridden.current = true;
      storeIdRef.current = createdChoice.id;
      setStoreId(createdChoice.id);
    }
    setPreferenceNotice(null);
  }, [catalogItem.id, createdChoice, scopeChanged, setCreatedChoice, shoppingScope]);
  useEffect(() => {
    if (!householdId || scopeChanged) return;
    const started = requestScope;
    const generation = ++loadGeneration.current;
    const task = setTimeout(() => {
      setLoading(true); setLoadError(false); setError(null);
      void Promise.all([
        api.catalogUnits(() => latestToken.current(), householdId),
        api.catalogStores(() => latestToken.current(), householdId),
        existingItem ? api.shoppingListItem(() => latestToken.current(), householdId, existingItem.id) : Promise.resolve(null),
        catalogItem.archived ? Promise.resolve(null) : api.catalogItem(() => latestToken.current(), householdId, catalogItem.id),
      ]).then(([unitResult, storeResult, itemResult, catalogResult]) => {
        if (scopeRef.current !== started || loadGeneration.current !== generation) return;
        setUnits(unitResult); setStores(storeResult.stores);
        const refreshedItem = catalogResult?.item ?? catalogItem;
        setCurrentCatalogItem(refreshedItem);
        const defaultUnitId = refreshedItem.shopping_unit_code ? `built:${refreshedItem.shopping_unit_code}`
          : refreshedItem.custom_shopping_unit_id ? `custom:${refreshedItem.custom_shopping_unit_id}` : '';
        const activeUnitIds = [
          ...unitResult.shopping_units.built_in.map((unit) => `built:${unit.code}`),
          ...unitResult.shopping_units.household.map((unit) => `custom:${unit.id}`),
        ];
        const checkedUnit = !existingItem && !unitOverridden.current ? defaultUnitId : unitIdRef.current;
        const checkedStore = !existingItem && !storeOverridden.current ? refreshedItem.preferred_store_id ?? '' : storeIdRef.current;
        const staleUnit = Boolean(checkedUnit && !checkedUnit.startsWith('recipe:') && !activeUnitIds.includes(checkedUnit));
        const staleStore = Boolean(checkedStore && !storeResult.stores.some((store) => store.id === checkedStore));
        unitIdRef.current = staleUnit ? '' : checkedUnit;
        storeIdRef.current = staleStore ? '' : checkedStore;
        setUnitId(unitIdRef.current);
        setStoreId(storeIdRef.current);
        const staleChoices = [staleUnit ? 'unit' : null, staleStore ? 'store' : null].filter(Boolean).join(' and ');
        const noticePrefix = !existingItem && !unitOverridden.current && !storeOverridden.current ? 'The saved Catalog' : 'The selected';
        setPreferenceNotice(staleChoices ? `${noticePrefix} ${staleChoices} ${staleUnit && staleStore ? 'are' : 'is'} no longer active. Choose an active option or leave it blank.` : null);
        if (itemResult) setDetail(itemResult.item);
      }).catch(() => {
        if (scopeRef.current === started && loadGeneration.current === generation) { setLoadError(true); setError('We couldn’t load item details or shopping choices. Please retry.'); }
      }).finally(() => { if (scopeRef.current === started && loadGeneration.current === generation) setLoading(false); });
    }, 0);
    return () => { clearTimeout(task); loadGeneration.current += 1; };
  }, [catalogItem, catalogRevision, existingItem, householdId, requestScope, retryCount, scopeChanged]);

  const shoppingUnits: ChoiceOption[] = useMemo(() => [
    ...(units?.shopping_units.built_in ?? []).map((unit) => ({ id: `built:${unit.code}`, label: unit.label, group: unit.unit_group === 'package_count' ? 'Package & count' : 'Measured' })),
    ...(units?.shopping_units.household ?? []).map((unit) => ({ id: `custom:${unit.id}`, label: unit.label, group: 'Household units' })),
    ...((detail?.unit_kind === 'recipe' && detail.unit_label) ? [{ id: `recipe:${detail.recipe_unit_code ?? 'custom'}`, label: detail.unit_label, group: 'Recipe amount' }] : []),
  ], [detail, units]);
  const storesChoices = stores.map((store) => ({ id: store.id, label: store.name }));
  const selectedUnit = shoppingUnits.find((unit) => unit.id === unitId)?.label ?? '';
  const selectedStore = storesChoices.find((store) => store.id === storeId)?.label ?? '';
  const amountValidationError = shoppingAmountError(amount);
  const routeToChoices = (kind: CatalogChoiceKind, mode: 'create' | 'manage') => {
    Keyboard.dismiss();
    const suffix = mode === 'create' ? '/create' : '';
    router.push(`/(app)/(tabs)/shopping/choices/${kind}${suffix}?shoppingTarget=details&shoppingCatalogItemId=${encodeURIComponent(catalogItem.id)}` as never);
  };
  const editCatalogItem = () => {
    Keyboard.dismiss();
    router.push({ pathname: '/(app)/(tabs)/shopping/catalog-item/[itemId]', params: { itemId: catalogItem.id } } as never);
  };

  const save = async () => {
    if (!householdId || scopeChanged || saving || loading || loadError || amountValidationError || (existingItem && !detail)) return;
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

  const remove = async () => {
    if (!existingItem || !householdId || scopeChanged || saving || removing) return;
    const started = scopeRef.current;
    setRemoving(true); setError(null);
    try {
      await onRemove(existingItem);
      if (scopeRef.current !== started) return;
      router.back();
      if (closeParentOnSave) requestAnimationFrame(() => router.back());
    } catch {
      if (scopeRef.current === started) setError('We couldn’t remove that item. Please try again.');
    } finally { if (scopeRef.current === started) setRemoving(false); }
  };

  return <ScrollView testID="shopping-item-details-sheet" style={[styles.sheetScroll, { backgroundColor: theme.elevatedSurface }]} contentContainerStyle={styles.sheetContent} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
    <Header title={existingItem ? 'Edit item' : 'Add to Shopping'} />
    {scopeChanged ? <View style={styles.message}><ThemedText accessibilityRole="alert" themeColor="error">Your household or sign-in changed. Close this sheet and choose an item again.</ThemedText><PrimaryButton onPress={() => router.back()} title="Close" /></View> : <>
      <View style={styles.itemHero}><View style={[styles.itemGlyph, { backgroundColor: theme.screen }]}><ThemedText style={styles.glyphText}>{currentCatalogItem.name.trim().slice(0, 1).toLocaleUpperCase()}</ThemedText></View><View style={styles.rowCopy}><ThemedText style={styles.heroName}>{currentCatalogItem.name}</ThemedText><ThemedText themeColor="textSecondary">{currentCatalogItem.item_type === 'food' ? 'Food' : 'Household'}{currentCatalogItem.category_name ? ` · ${currentCatalogItem.category_name}` : ''}</ThemedText></View></View>
      {!currentCatalogItem.archived ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${currentCatalogItem.name} in Catalog`} onPress={editCatalogItem} style={styles.editCatalogAction}><ThemedText themeColor="link">Edit Catalog item</ThemedText><ThemedText themeColor="link">›</ThemedText></Pressable> : null}
      <View style={styles.amountUnitRow}><View style={styles.amountField}><ThemedText style={styles.fieldLabel}>Amount</ThemedText><ThemedInput accessibilityLabel="Amount" autoCapitalize="none" autoCorrect={false} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'} onChangeText={setAmount} placeholder="e.g. 2 2/3" selectTextOnFocus value={amount} /></View><View style={styles.unitField}><ChoicePicker label="Unit" searchable choices={shoppingUnits} selectedId={unitId} value={selectedUnit} emptyChoiceLabel="No unit" disabled={loading || loadError} sheetRoute="/shopping/sheet/choice" sheetDetents={[0.58, 0.94]} sheetInitialDetentIndex={1} createLabel="Add unit" onOpen={() => Keyboard.dismiss()} onSelect={(id) => { unitOverridden.current = true; unitIdRef.current = id; setUnitId(id); setPreferenceNotice(null); }} onCreate={() => routeToChoices('shopping-unit', 'create')} /></View></View>
      {amountValidationError ? <ThemedText accessibilityRole="alert" themeColor="error">{amountValidationError}</ThemedText> : null}
      <ChoicePicker label="Store (optional)" searchable choices={storesChoices} selectedId={storeId} value={selectedStore} emptyChoiceLabel="No store" disabled={loading || loadError} sheetRoute="/shopping/sheet/choice" sheetDetents={[0.52, 0.92]} createLabel="Create store" manageLabel="Manage stores" onOpen={() => Keyboard.dismiss()} onSelect={(id) => { storeOverridden.current = true; storeIdRef.current = id; setStoreId(id); setPreferenceNotice(null); }} onCreate={() => routeToChoices('store', 'create')} onManage={() => routeToChoices('store', 'manage')} />
      {!existingItem && (initialUnitId || currentCatalogItem.preferred_store_id) ? <ThemedText themeColor="textSecondary">Prefilled from Catalog. Change it for this shopping trip.</ThemedText> : null}
      {preferenceNotice ? <ThemedText accessibilityRole="alert" themeColor="textSecondary">{preferenceNotice}</ThemedText> : null}
      {existingItem ? <View style={[styles.meals, { backgroundColor: theme.surface }]}><ThemedText style={styles.sectionTitle}>Used in meals</ThemedText>{loading ? <ActivityIndicator accessibilityLabel="Loading meal details" color={theme.activity} /> : detail?.used_in_meals?.length ? detail.used_in_meals.map((meal, index) => <ThemedText key={`${meal.planned_for}-${index}`} themeColor="textSecondary">{new Date(`${meal.planned_for}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {meal.recipe_name}</ThemedText>) : <ThemedText themeColor="textSecondary">No planned meals use this item this week.</ThemedText>}</View> : null}
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      {loadError ? <PrimaryButton disabled={loading} onPress={() => setRetryCount((count) => count + 1)} title={loading ? 'Retrying…' : 'Retry loading details'} /> : null}
      <View style={styles.saveAction}><PrimaryButton disabled={saving || removing || loading || loadError || Boolean(amountValidationError) || Boolean(existingItem && !detail)} onPress={() => void save()} title={saving ? 'Saving…' : existingItem ? 'Save changes' : 'Add to Shopping'} /></View>
      {existingItem ? <Pressable accessibilityRole="button" accessibilityLabel="Remove from Shopping" accessibilityState={{ disabled: removing || saving }} disabled={removing || saving} onPress={() => void remove()} style={styles.removeAction}><ThemedText themeColor="error">{removing ? 'Removing…' : 'Remove from Shopping'}</ThemedText></Pressable> : null}
    </>}
  </ScrollView>;
}

export function openShoppingDetails(sheetFlow: ReturnType<typeof useNativeSheetFlow>, router: ReturnType<typeof useRouter>, catalogItem: ShoppingCatalogSummary, existingItem: ShoppingListItem | undefined, handlers: SheetProps) {
  const sheetId = sheetFlow.present(<ShoppingItemDetailsSheet catalogItem={catalogItem} existingItem={existingItem} onChanged={handlers.onChanged} onRemove={handlers.onRemove} />, { detents: [0.68, 0.94], initialDetent: 1 });
  router.push({ pathname: '/shopping/sheet/details', params: { sheetId } } as never);
}

const styles = StyleSheet.create({
  pickerSheet: { flex: 1 },
  pickerSticky: { paddingHorizontal: 22, paddingTop: 28 },
  pickerSearch: { paddingTop: 16 },
  pickerResultsScroll: { flex: 1 },
  pickerResultsContent: { flexGrow: 1, gap: 16, paddingHorizontal: 22, paddingTop: 16 },
  pickerMessage: { paddingTop: 10 },
  pickerFooter: { borderTopWidth: StyleSheet.hairlineWidth, left: 0, paddingBottom: 16, paddingHorizontal: 22, position: 'absolute', right: 0, zIndex: 1 },
  pickerConfirmation: { alignItems: 'center', left: 16, position: 'absolute', right: 16, zIndex: 2 },
  pickerConfirmationPill: { alignItems: 'center', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, maxWidth: '100%', paddingHorizontal: 16, paddingVertical: 10 },
  sheetScroll: { flex: 1 },
  sheetContent: { flexGrow: 1, gap: 18, paddingBottom: 32, paddingHorizontal: 22, paddingTop: 28 },
  header: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -22, minHeight: 58, paddingBottom: 10, paddingHorizontal: 22 },
  headerAction: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 44, minWidth: 68 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  headerIconAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  catalogCard: { borderRadius: 16, overflow: 'hidden' },
  catalogRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 72, paddingHorizontal: 14, paddingVertical: 8 },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  createCatalog: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 60, paddingHorizontal: 8 },
  itemHero: { alignItems: 'center', flexDirection: 'row', gap: 14, paddingVertical: 10 },
  editCatalogAction: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 6, minHeight: 36, paddingHorizontal: 2 },
  itemGlyph: { alignItems: 'center', borderRadius: 12, height: 56, justifyContent: 'center', width: 56 },
  glyphText: { fontSize: 23, fontWeight: '700', lineHeight: 29 },
  heroName: { fontSize: 19, fontWeight: '700', lineHeight: 26 },
  amountUnitRow: { flexDirection: 'row', gap: 12 },
  amountField: { flex: 1, gap: 8, minWidth: 0 },
  unitField: { flex: 1, minWidth: 0 },
  fieldLabel: { fontWeight: '600' },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  meals: { borderRadius: 14, gap: 12, padding: 16 },
  saveAction: { marginTop: 'auto', paddingTop: 12 },
  removeAction: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  message: { gap: 10 },
});
