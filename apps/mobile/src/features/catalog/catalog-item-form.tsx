import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type CatalogCategory, type CatalogItem, type CatalogItemInput, type CatalogItemType, type CatalogShoppingUnit, type CatalogUnits, type GetToken, type RecipeMeasurementUnit } from '@/lib/api';
import { ChoicePicker, type ChoiceOption } from './choice-picker';
import { useCatalogContext, type CatalogChoiceKind } from './catalog-context';

type FormState = {
  name: string;
  itemType: CatalogItemType;
  categoryId: string;
  shoppingUnitId: string;
  storeId: string;
  recipeDimension: RecipeMeasurementUnit['dimension'] | '';
  recipeUnitCode: string;
};
const emptyForm: FormState = { name: '', itemType: 'food', categoryId: '', shoppingUnitId: '', storeId: '', recipeDimension: '', recipeUnitCode: '' };

function byName(choices: { id: string; name: string }[]) { return choices.map((choice) => ({ id: choice.id, label: choice.name })); }
function unitId(choice: CatalogShoppingUnit) { return choice.id ? `custom:${choice.id}` : `built-in:${choice.code}`; }

export function CatalogItemForm() {
  const { getToken, selectedHousehold } = useHouseholdState();
  const theme = useTheme();
  const { sessionId, userId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId?: string }>();
  const itemId = typeof params.itemId === 'string' ? params.itemId : null;
  const { changeKind, choiceResult, markChanged, revision, setChoiceResult } = useCatalogContext();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<CatalogUnits | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadedItemScope, setLoadedItemScope] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [moreDetails, setMoreDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const itemNameRef = useRef<TextInput>(null);
  const formRef = useRef(form);
  const updateForm = useCallback((update: FormState | ((current: FormState) => FormState)) => {
    const next = typeof update === 'function' ? update(formRef.current) : update;
    formRef.current = next;
    setForm(next);
  }, []);
  const latestGetToken = useRef<GetToken>(getToken);
  const loadGeneration = useRef(0);
  const mounted = useRef(true);
  const householdId = selectedHousehold?.id ?? null;
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${itemId ?? ''}`;
  const scopeRef = useRef(scope);
  const previousScope = useRef(scope);

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadGeneration.current += 1; };
  }, []);
  useLayoutEffect(() => {
    scopeRef.current = scope;
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    loadGeneration.current += 1;
    updateForm(emptyForm);
    setCategories([]);
    setStores([]);
    setUnits(null);
    setError(null);
    setSelectionMessage(null);
    setLoadedItemScope(null);
    setInitialLoading(true);
  }, [scope, updateForm]);

  const loadChoices = useCallback(async (includeItem: boolean) => {
    if (!householdId) return null;
    const generation = ++loadGeneration.current;
    const startedScope = scope;
    setInitialLoading(true);
    setError(null);
    if (includeItem) setLoadedItemScope(null);
    try {
      const [categoryResult, storeResult, unitResult, itemResult] = await Promise.all([
        api.catalogCategories(() => latestGetToken.current(), householdId),
        api.catalogStores(() => latestGetToken.current(), householdId),
        api.catalogUnits(() => latestGetToken.current(), householdId),
        includeItem && itemId ? api.catalogItem(() => latestGetToken.current(), householdId, itemId) : Promise.resolve(null),
      ]);
      if (!mounted.current || generation !== loadGeneration.current || startedScope !== scopeRef.current) return;
      setCategories(categoryResult.categories);
      setStores(storeResult.stores);
      setUnits(unitResult);
      const current = itemResult ? formFromItem(itemResult.item) : formRef.current;
      if (itemResult) setLoadedItemScope(startedScope);
      const nextForm = (() => {
        const categoryExists = !current.categoryId || categoryResult.categories.some((category) => category.id === current.categoryId && category.item_type === current.itemType);
        const storeExists = !current.storeId || storeResult.stores.some((store) => store.id === current.storeId);
        const shoppingUnitExists = !current.shoppingUnitId
          || (current.shoppingUnitId.startsWith('custom:')
            ? unitResult.shopping_units.household.some((unit) => `custom:${unit.id}` === current.shoppingUnitId)
            : unitResult.shopping_units.built_in.some((unit) => `built-in:${unit.code}` === current.shoppingUnitId));
        if (!categoryExists || !storeExists || !shoppingUnitExists) {
          setSelectionMessage('A selected category, store, or shopping unit is no longer active. Choose a replacement or leave it unselected.');
        }
        return {
          ...current,
          categoryId: categoryExists ? current.categoryId : '',
          storeId: storeExists ? current.storeId : '',
          shoppingUnitId: shoppingUnitExists ? current.shoppingUnitId : '',
        };
      })();
      updateForm(nextForm);
      return { categories: categoryResult.categories, stores: storeResult.stores, units: unitResult };
    } catch (reason) {
      if (mounted.current && generation === loadGeneration.current && startedScope === scopeRef.current) setError(reason instanceof ApiError ? reason.message : 'We couldn’t load catalog choices. Please try again.');
      return null;
    } finally {
      if (mounted.current && generation === loadGeneration.current && startedScope === scopeRef.current) setInitialLoading(false);
    }
  }, [householdId, itemId, scope, updateForm]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadChoices(Boolean(itemId)); }, 0);
    return () => clearTimeout(timer);
  }, [loadChoices, itemId]);
  useEffect(() => {
    if (choiceResult && (!choiceResult.itemType || choiceResult.itemType === form.itemType)) {
      const result = choiceResult;
      const timer = setTimeout(() => {
        if (result.kind === 'category') updateForm((current) => ({ ...current, categoryId: result.id }));
        if (result.kind === 'store') updateForm((current) => ({ ...current, storeId: result.id }));
        if (result.kind === 'shopping-unit') updateForm((current) => ({ ...current, shoppingUnitId: `custom:${result.id}` }));
        setChoiceResult(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [choiceResult, form.itemType, setChoiceResult, updateForm]);
  useEffect(() => {
    if (!revision || (changeKind !== 'choices' && changeKind !== 'all')) return;
    const timer = setTimeout(() => { void loadChoices(false); }, 0);
    return () => clearTimeout(timer);
  }, [changeKind, loadChoices, revision]);

  const shoppingChoices: ChoiceOption[] = units ? [
    ...units.shopping_units.built_in.map((unit) => ({
      id: unitId(unit),
      label: unit.label,
      group: unit.unit_group === 'package_count' ? 'Built-in package/count · read-only' : 'Built-in measured · read-only',
    })),
    ...units.shopping_units.household.map((unit) => ({ id: unitId(unit), label: `Household · ${unit.label}`, group: 'Household-created' })),
  ] : [];
  const categoryChoices: ChoiceOption[] = categories.filter((category) => category.item_type === form.itemType).map((category) => ({ id: category.id, label: category.name, emoji: category.emoji }));
  const storeChoices = byName(stores);
  const recipeChoices = units?.recipe_measurement_units.filter((unit) => !form.recipeDimension || unit.dimension === form.recipeDimension).map((unit) => ({ id: unit.code, label: unit.label })) ?? [];
  const selectedCategoryOption = categoryChoices.find((choice) => choice.id === form.categoryId);
  const selectedCategory = selectedCategoryOption ? `${selectedCategoryOption.emoji ? `${selectedCategoryOption.emoji} ` : ''}${selectedCategoryOption.label}` : '';
  const selectedStore = storeChoices.find((choice) => choice.id === form.storeId)?.label ?? '';
  const selectedUnit = shoppingChoices.find((choice) => choice.id === form.shoppingUnitId)?.label ?? '';
  const selectedRecipeUnit = recipeChoices.find((choice) => choice.id === form.recipeUnitCode)?.label ?? '';
  const routeToChoices = (kind: CatalogChoiceKind, mode: 'create' | 'manage') => {
    const params = kind === 'category' ? `?itemType=${form.itemType}` : '';
    const suffix = mode === 'create' ? '/create' : '';
    router.push(`/(app)/(tabs)/catalog/choices/${kind}${suffix}${params}` as never);
  };

  const save = async () => {
    if (itemId && loadedItemScope !== scope) return;
    if (!householdId || !form.name.trim()) { setError('Enter an item name.'); return; }
    setSaving(true);
    setError(null);
    const startedScope = scopeRef.current;
    const shoppingChoice = shoppingChoices.find((choice) => choice.id === form.shoppingUnitId);
    const payload: CatalogItemInput = {
      name: form.name.trim(),
      item_type: form.itemType,
      category_id: form.categoryId || null,
      shopping_unit_code: shoppingChoice?.id?.startsWith('built-in:') ? shoppingChoice.id.slice('built-in:'.length) : null,
      custom_shopping_unit_id: shoppingChoice?.id?.startsWith('custom:') ? shoppingChoice.id.slice('custom:'.length) : null,
      preferred_store_id: form.storeId || null,
      recipe_measurement_dimension: form.itemType === 'food' ? form.recipeDimension || null : null,
      recipe_measurement_unit_code: form.itemType === 'food' ? form.recipeUnitCode || null : null,
    };
    try {
      if (itemId) await api.updateCatalogItem(() => latestGetToken.current(), householdId, itemId, payload);
      else await api.createCatalogItem(() => latestGetToken.current(), householdId, payload);
      if (!mounted.current || scopeRef.current !== startedScope) return;
      markChanged('items');
      router.back();
    } catch (reason) {
      if (mounted.current && scopeRef.current === startedScope) {
        if (reason instanceof ApiError && reason.code === 'CATALOG_REFERENCE_ARCHIVED') {
          const refreshed = await loadChoices(false);
          if (!mounted.current || scopeRef.current !== startedScope) return;
          if (refreshed) {
            updateForm((current) => {
              const shoppingChoiceExists = current.shoppingUnitId.startsWith('custom:')
                ? refreshed.units.shopping_units.household.some((unit) => `custom:${unit.id}` === current.shoppingUnitId)
                : current.shoppingUnitId.startsWith('built-in:')
                  ? refreshed.units.shopping_units.built_in.some((unit) => `built-in:${unit.code}` === current.shoppingUnitId)
                  : true;
              return {
                ...current,
                categoryId: refreshed.categories.some((category) => category.id === current.categoryId) ? current.categoryId : '',
                storeId: refreshed.stores.some((store) => store.id === current.storeId) ? current.storeId : '',
                shoppingUnitId: shoppingChoiceExists ? current.shoppingUnitId : '',
              };
            });
          }
          setError('A selected choice was removed while this form was open. Please review the refreshed choices and select again.');
        } else setError(reason instanceof ApiError ? reason.message : 'We couldn’t save this item. Please try again.');
      }
    } finally { if (mounted.current && scopeRef.current === startedScope) setSaving(false); }
  };

  return (
    <View style={styles.routeRoot}>
    <Stack.Screen options={{ title: itemId ? 'Edit item' : 'Add item' }} />
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={styles.content}>
        <ThemedText themeColor="textSecondary">Save an item once for everyone in your household to use in the catalog.</ThemedText>
        {initialLoading ? <ActivityIndicator accessibilityLabel="Loading item" /> : null}
        {itemId && error && loadedItemScope !== scope ? <PrimaryButton disabled={initialLoading} onPress={() => void loadChoices(true)} title="Retry loading item" /> : null}
        <ThemedText style={styles.label}>Item name</ThemedText>
        <ThemedInput ref={itemNameRef} accessibilityLabel="Item name" onChangeText={(name) => { updateForm((current) => ({ ...current, name })); if (name.trim()) setError((current) => current === 'Enter an item name.' ? null : current); }} placeholder="Item name" value={form.name} />
        <ThemedText style={styles.label}>Type</ThemedText>
        <View style={styles.types}>
          {(['food', 'household'] as const).map((itemType) => (
            <Pressable key={itemType} accessibilityRole="radio" accessibilityState={{ checked: form.itemType === itemType }} onPress={() => updateForm((current) => ({ ...current, itemType, categoryId: '', recipeDimension: '', recipeUnitCode: '' }))} style={[styles.typeButton, { borderColor: form.itemType === itemType ? theme.primary : theme.border }]}>
              <ThemedText>{itemType === 'food' ? 'Food' : 'Household'}</ThemedText>
            </Pressable>
          ))}
        </View>
        {selectionMessage ? <ThemedText themeColor="textSecondary">{selectionMessage}</ThemedText> : null}
        <ChoicePicker compact label="Category" choices={categoryChoices} selectedId={form.categoryId} value={selectedCategory} emptyChoiceLabel="No category" createLabel="Create category" manageLabel="Manage categories" onOpen={() => { itemNameRef.current?.blur(); Keyboard.dismiss(); }} onSelect={(categoryId) => { updateForm((current) => ({ ...current, categoryId })); setSelectionMessage(null); }} onCreate={() => routeToChoices('category', 'create')} onManage={() => routeToChoices('category', 'manage')} />
        <ChoicePicker compact label="Typical shopping unit (optional)" choices={shoppingChoices} searchable selectedId={form.shoppingUnitId} value={selectedUnit} createLabel="Create shopping unit" manageLabel="Manage shopping units" onOpen={() => { itemNameRef.current?.blur(); Keyboard.dismiss(); }} onSelect={(shoppingUnitId) => { updateForm((current) => ({ ...current, shoppingUnitId })); setSelectionMessage(null); }} onCreate={() => routeToChoices('shopping-unit', 'create')} onManage={() => routeToChoices('shopping-unit', 'manage')} />
        <ThemedText themeColor="textSecondary">A typical shopping unit only; the catalog does not track quantities on hand.</ThemedText>
        <ChoicePicker compact label="Preferred store (optional)" choices={storeChoices} selectedId={form.storeId} value={selectedStore} emptyChoiceLabel="No preferred store" createLabel="Create store" manageLabel="Manage stores" onOpen={() => { itemNameRef.current?.blur(); Keyboard.dismiss(); }} onSelect={(storeId) => { updateForm((current) => ({ ...current, storeId })); setSelectionMessage(null); }} onCreate={() => routeToChoices('store', 'create')} onManage={() => routeToChoices('store', 'manage')} />
        <>
          <Pressable accessibilityLabel="More details" accessibilityRole="button" accessibilityState={{ expanded: moreDetails }} onPress={() => setMoreDetails((value) => !value)} style={styles.moreButton}>
            <ThemedText style={styles.label}>More details (optional)</ThemedText><ThemedText>⌄</ThemedText>
          </Pressable>
          {moreDetails ? (
            <View style={styles.content}>
              {form.itemType === 'food' ? <>
                <ThemedText themeColor="textSecondary">Optional recipe measurements do not convert shopping units.</ThemedText>
                <ChoicePicker label="Recipe measurement" choices={[
                  { id: 'volume', label: 'Volume' }, { id: 'mass', label: 'Mass' }, { id: 'count', label: 'Count' },
                ]} compact selectedId={form.recipeDimension} value={form.recipeDimension ? form.recipeDimension[0].toUpperCase() + form.recipeDimension.slice(1) : ''} emptyChoiceLabel="No recipe measurement" onSelect={(value) => updateForm((current) => ({ ...current, recipeDimension: value as FormState['recipeDimension'], recipeUnitCode: '' }))} />
                {form.recipeDimension ? <ChoicePicker compact label="Base unit for recipes" choices={recipeChoices} selectedId={form.recipeUnitCode} value={selectedRecipeUnit} onSelect={(recipeUnitCode) => updateForm((current) => ({ ...current, recipeUnitCode }))} /> : null}
              </> : null}
            </View>
          ) : null}
        </>
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
        <PrimaryButton disabled={saving || initialLoading || Boolean(itemId && loadedItemScope !== scope)} onPress={() => void save()} title={saving ? 'Saving…' : itemId ? 'Save changes' : 'Add to catalog'} />
      </View>
    </Screen>
    </View>
  );
}

function formFromItem(item: CatalogItem): FormState {
  return {
    name: item.name,
    itemType: item.item_type,
    categoryId: item.category_id ?? '',
    shoppingUnitId: item.shopping_unit_code ? `built-in:${item.shopping_unit_code}` : item.custom_shopping_unit_id ? `custom:${item.custom_shopping_unit_id}` : '',
    storeId: item.preferred_store_id ?? '',
    recipeDimension: item.recipe_measurement_dimension ?? '',
    recipeUnitCode: item.recipe_measurement_unit_code ?? '',
  };
}

const styles = StyleSheet.create({
  routeRoot: { flex: 1 },
  content: { gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  label: { fontWeight: '600' },
  types: { flexDirection: 'row', gap: 8 },
  typeButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, minHeight: 48, justifyContent: 'center' },
  moreButton: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16 },
});
