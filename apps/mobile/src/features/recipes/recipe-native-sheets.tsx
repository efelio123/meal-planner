import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';

import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { ChoicePicker, type ChoiceOption } from '@/features/catalog/choice-picker';
import { categoryEmojiValidationError } from '@/features/catalog/catalog-emoji-validation';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type CatalogItem, type CatalogUnits, type GetToken } from '@/lib/api';
import { RecipeCover } from './recipe-cover';
import { RecipeKeyboardSafeSheet } from './recipe-keyboard-safe-sheet';
import { isValidRecipeAmount, type RecipeIngredientDraft, type RecipeDraft } from './recipe-form-utils';

export type RecipeFoodChoice = { id: string; name: string; categoryEmoji: string | null };

function ingredientAmountError(value: string) {
  return isValidRecipeAmount(value) ? null : 'Enter a positive number or fraction. Put a range in the note.';
}

export function RecipeFoodSheet({ householdId, expectedFlowScope, getToken, isCurrent, onSelect, onCreate }: {
  householdId: string;
  expectedFlowScope: string;
  getToken: GetToken;
  isCurrent: () => boolean;
  onSelect: (food: RecipeFoodChoice, units: CatalogUnits) => void;
  onCreate: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const flow = useNativeSheetFlow();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [units, setUnits] = useState<CatalogUnits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const filtered = useMemo(() => items.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [items, query]);

  useEffect(() => {
    let active = true;
    void Promise.all([api.catalogItems(getToken, householdId), api.catalogUnits(getToken, householdId)])
      .then(([catalog, catalogUnits]) => {
        if (!active || !isCurrent() || flow.scope !== expectedFlowScope) return;
        setItems(catalog.items.filter((item) => item.item_type === 'food'));
        setUnits(catalogUnits);
      })
      .catch((reason: unknown) => {
        if (active && isCurrent() && flow.scope === expectedFlowScope) setError(reason instanceof ApiError ? reason.message : 'We couldn’t load Food Catalog items. Try again.');
      })
      .finally(() => {
        if (active && isCurrent() && flow.scope === expectedFlowScope) setLoading(false);
      });
    return () => { active = false; };
  }, [expectedFlowScope, flow.scope, getToken, householdId, isCurrent, requestVersion]);

  const retry = () => {
    setLoading(true);
    setError(null);
    setRequestVersion((current) => current + 1);
  };

  return <ScrollView testID="recipe-ingredient-search-sheet" contentContainerStyle={styles.nativeContent} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={[styles.nativeScroll, { backgroundColor: theme.elevatedSurface }]}>
      <View style={styles.header}><ThemedText accessibilityRole="header" style={styles.title}>Add ingredient</ThemedText><Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); router.back(); }}><ThemedText themeColor="link">Done</ThemedText></Pressable></View>
      <ThemedInput accessibilityLabel="Search Food Catalog" onChangeText={setQuery} placeholder="Search Food Catalog" returnKeyType="search" value={query} />
      {loading ? <ActivityIndicator accessibilityLabel="Loading Food Catalog" color={theme.activity} /> : null}
      {error ? <View style={styles.errorBlock}><ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText><PrimaryButton disabled={loading} onPress={retry} title="Retry" /></View> : null}
      {!error ? <View testID="recipe-food-results">
        <View style={[styles.foodList, { backgroundColor: theme.screen }]}>
          {filtered.map((food, index) => <Pressable key={food.id} accessibilityRole="button" onPress={() => { if (units) onSelect({ id: food.id, name: food.name, categoryEmoji: null }, units); }} style={[styles.foodRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText style={styles.foodName}>{food.name}</ThemedText><ThemedText themeColor="textSecondary">{food.category_name ?? 'Uncategorized'}</ThemedText>
          </Pressable>)}
          {!loading && filtered.length === 0 ? <ThemedText themeColor="textSecondary" style={styles.emptyFood}>{query.trim() ? 'No Food items match your search.' : 'No Food items in this household yet.'}</ThemedText> : null}
        </View>
      </View> : null}
      <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); router.back(); requestAnimationFrame(onCreate); }} style={[styles.createAction, { borderTopColor: theme.border }]}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }} size={24} tintColor={theme.link} /><ThemedText themeColor="link">Create Food item in Catalog</ThemedText><ThemedText themeColor="link">›</ThemedText></Pressable>
  </ScrollView>;
}

export function RecipeIngredientDetailsSheet({ food, initialDraft, existingIndex, returnToSearch, householdId, expectedFlowScope, getToken, isCurrent, initialUnits, unitSheetRoute, onSave }: {
  food: RecipeFoodChoice;
  initialDraft: RecipeIngredientDraft;
  existingIndex: number | null;
  returnToSearch: boolean;
  householdId: string;
  expectedFlowScope: string;
  getToken: GetToken;
  isCurrent: () => boolean;
  initialUnits: CatalogUnits | null;
  unitSheetRoute: string;
  onSave: (draft: RecipeIngredientDraft, index: number | null) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const flow = useNativeSheetFlow();
  const [draft, setDraft] = useState(initialDraft);
  const [units, setUnits] = useState<CatalogUnits | null>(initialUnits);
  const [loadingUnits, setLoadingUnits] = useState(!initialUnits);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [retryUnits, setRetryUnits] = useState(0);
  const amountError = ingredientAmountError(draft.amount);
  const unitChoices: ChoiceOption[] = (units?.recipe_measurement_units ?? []).map((unit) => ({ id: unit.code, label: unit.label, group: `${unit.dimension[0].toUpperCase()}${unit.dimension.slice(1)}` }));

  useEffect(() => {
    if (initialUnits) return;
    let active = true;
    void api.catalogUnits(getToken, householdId).then((nextUnits) => {
      if (active && isCurrent() && flow.scope === expectedFlowScope) setUnits(nextUnits);
    }).catch((reason: unknown) => {
      if (active && isCurrent() && flow.scope === expectedFlowScope) setUnitError(reason instanceof ApiError ? reason.message : 'We couldn’t load recipe units. Try again.');
    }).finally(() => {
      if (active && isCurrent() && flow.scope === expectedFlowScope) setLoadingUnits(false);
    });
    return () => { active = false; };
  }, [expectedFlowScope, flow.scope, getToken, householdId, initialUnits, isCurrent, retryUnits]);

  const dismissCount = returnToSearch ? 2 : 1;
  const retryUnitLoad = () => {
    setLoadingUnits(true);
    setUnitError(null);
    setRetryUnits((current) => current + 1);
  };
  const save = () => {
    if (amountError || loadingUnits || unitError) return;
    onSave(draft, existingIndex);
    router.dismiss(dismissCount);
  };
  const cancel = () => { Keyboard.dismiss(); router.dismiss(dismissCount); };

  return <ScrollView testID="recipe-ingredient-details-scroll" contentContainerStyle={styles.nativeContent} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={[styles.nativeScroll, { backgroundColor: theme.elevatedSurface }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={returnToSearch ? 'Back to Food Catalog' : 'Back to recipe'} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); router.back(); }} style={styles.backAction}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={24} tintColor={theme.link} /></Pressable>
        <ThemedText accessibilityRole="header" style={styles.title}>Ingredient details</ThemedText>
        <Pressable accessibilityRole="button" onPress={cancel}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
      </View>
        <View style={[styles.selectedFoodCard, { backgroundColor: theme.screen }]}><View style={[styles.foodInitial, { backgroundColor: theme.surfaceSelected }]}><ThemedText>{food.name.slice(0, 1).toUpperCase()}</ThemedText></View><View style={styles.foodSummary}><ThemedText style={styles.foodName}>{food.name}</ThemedText><ThemedText themeColor="textSecondary">Food Catalog item</ThemedText></View></View>
        <View style={styles.splitFields}>
          <View style={styles.field}><ThemedText themeColor="textSecondary">Amount</ThemedText><ThemedInput accessibilityLabel="Ingredient amount" keyboardType="decimal-pad" onChangeText={(amount) => setDraft((current) => ({ ...current, amount }))} placeholder="e.g. 2 or 1/2" value={draft.amount} /></View>
          <View style={styles.field}><ChoicePicker label="Unit" choices={unitChoices} searchable selectedId={draft.customUnitLabel ? '__custom__' : draft.unitCode || ''} value={draft.customUnitLabel || draft.unitLabel || 'No unit'} emptyChoiceLabel="No unit" disabled={loadingUnits || Boolean(unitError)} onOpen={Keyboard.dismiss} onSelect={(unitCode) => { const choice = units?.recipe_measurement_units.find((unit) => unit.code === unitCode); setDraft((current) => ({ ...current, unitCode, unitLabel: choice?.label ?? '', customUnitLabel: '' })); }} onCustomSelect={(customUnitLabel) => setDraft((current) => ({ ...current, customUnitLabel, unitCode: '', unitLabel: '' }))} sheetRoute={unitSheetRoute} /></View>
        </View>
        {loadingUnits ? <ActivityIndicator accessibilityLabel="Loading recipe units" color={theme.activity} /> : null}
        {unitError ? <View style={styles.errorBlock}><ThemedText accessibilityRole="alert" themeColor="error">{unitError}</ThemedText><PrimaryButton disabled={loadingUnits} onPress={retryUnitLoad} title="Retry units" /></View> : null}
        <View style={styles.field}><ThemedText themeColor="textSecondary">Note (optional)</ThemedText><ThemedInput accessibilityLabel="Ingredient note" onChangeText={(note) => setDraft((current) => ({ ...current, note }))} placeholder="e.g. finely chopped, to taste" value={draft.note} /></View>
        {amountError ? <ThemedText accessibilityRole="alert" themeColor="error">{amountError}</ThemedText> : null}
        <PrimaryButton disabled={Boolean(amountError) || loadingUnits || Boolean(unitError)} onPress={save} title={existingIndex === null ? 'Add ingredient' : 'Save ingredient'} />
  </ScrollView>;
}

export function RecipeCoverSheet({ draft, onChooseInitials, onChooseEmoji }: {
  draft: RecipeDraft;
  onChooseInitials: () => void;
  onChooseEmoji: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  return <View style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <View style={styles.header}><ThemedText accessibilityRole="header" style={styles.title}>Recipe cover</ThemedText><Pressable accessibilityLabel="Done choosing recipe cover" accessibilityRole="button" onPress={() => router.back()}><ThemedText themeColor="link">Done</ThemedText></Pressable></View>
    <View style={styles.coverPreview}><RecipeCover recipe={{ name: draft.name || 'Recipe', cover_kind: draft.coverKind, cover_emoji: draft.coverEmoji || null }} size="row" /><View style={styles.foodSummary}><ThemedText style={styles.foodName}>{draft.name || 'Recipe name'}</ThemedText><ThemedText themeColor="textSecondary">Cover preview</ThemedText></View></View>
    <View style={[styles.choiceGroup, { backgroundColor: theme.screen }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: draft.coverKind === 'initials' }} onPress={() => { onChooseInitials(); router.back(); }} style={[styles.choiceRow, { borderBottomColor: theme.border }]}><ThemedText themeColor="link" style={styles.choiceIcon}>T</ThemedText><View style={styles.foodSummary}><ThemedText style={styles.foodName}>Use initials</ThemedText><ThemedText themeColor="textSecondary">Default · follows the recipe name</ThemedText></View>{draft.coverKind === 'initials' ? <ThemedText themeColor="link">✓</ThemedText> : null}</Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: draft.coverKind === 'emoji' }} onPress={onChooseEmoji} style={styles.choiceRow}><ThemedText themeColor="link" style={styles.choiceIcon}>☺</ThemedText><View style={styles.foodSummary}><ThemedText style={styles.foodName}>Use emoji</ThemedText><ThemedText themeColor="textSecondary">Type or paste one emoji</ThemedText></View>{draft.coverKind === 'emoji' ? <ThemedText themeColor="link">✓</ThemedText> : null}</Pressable>
    </View>
  </View>;
}

export function RecipeEmojiSheet({ value, onUse, onClear }: { value: string; onUse: (emoji: string) => void; onClear: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const [emoji, setEmoji] = useState(value);
  const error = emoji ? categoryEmojiValidationError(emoji) : null;
  const clear = () => { onClear(); router.dismiss(2); };
  return <RecipeKeyboardSafeSheet testID="recipe-emoji-keyboard-area">
    <View style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
      <View style={styles.header}><Pressable accessibilityLabel="Back to recipe cover choices" accessibilityRole="button" onPress={() => router.back()}><ThemedText themeColor="link">‹</ThemedText></Pressable><ThemedText accessibilityRole="header" style={styles.title}>Recipe emoji</ThemedText><Pressable accessibilityRole="button" onPress={() => router.back()}><ThemedText themeColor="link">Cancel</ThemedText></Pressable></View>
      <View style={[styles.emojiPreview, { backgroundColor: theme.surfaceSelected }]}><ThemedText style={styles.emojiPreviewText}>{emoji || '🙂'}</ThemedText></View>
      <View style={styles.field}><ThemedText themeColor="textSecondary">Emoji</ThemedText><ThemedInput accessibilityLabel="Recipe emoji" autoCapitalize="none" autoCorrect={false} onChangeText={setEmoji} placeholder="Enter or paste one emoji" value={emoji} /></View>
      <ThemedText themeColor="textSecondary">Enter or paste one emoji.</ThemedText>
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      <View style={styles.actions}><Pressable accessibilityRole="button" onPress={clear}><ThemedText themeColor="link">Clear</ThemedText></Pressable><Pressable accessibilityRole="button" onPress={() => router.back()}><ThemedText themeColor="link">Cancel</ThemedText></Pressable><PrimaryButton disabled={!emoji.trim() || Boolean(error)} onPress={() => { onUse(emoji.trim()); router.dismiss(2); }} title="Use emoji" /></View>
    </View>
  </RecipeKeyboardSafeSheet>;
}

const styles = StyleSheet.create({
  nativeScroll: { flex: 1 },
  nativeContent: { gap: 16, paddingBottom: 32, paddingHorizontal: 22, paddingTop: 28 },
  sheet: { flex: 1, gap: 12, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 12 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  title: { fontSize: 21, fontWeight: '700' },
  foodList: { borderRadius: 16, overflow: 'hidden' },
  foodRow: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 12 },
  foodName: { fontSize: 16, fontWeight: '700' },
  emptyFood: { padding: 16 },
  createAction: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 58, paddingTop: 8 },
  errorBlock: { gap: 8 },
  selectedFoodCard: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 12, padding: 12 },
  foodInitial: { alignItems: 'center', borderRadius: 12, height: 52, justifyContent: 'center', width: 52 },
  foodSummary: { flex: 1, gap: 3 },
  splitFields: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, gap: 8 },
  backAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  coverPreview: { alignItems: 'center', flexDirection: 'row', gap: 14, paddingVertical: 4 },
  choiceGroup: { borderRadius: 16, overflow: 'hidden' },
  choiceRow: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 74, paddingHorizontal: 14 },
  choiceIcon: { fontSize: 26, width: 36 },
  emojiPreview: { alignItems: 'center', alignSelf: 'center', borderRadius: 20, height: 96, justifyContent: 'center', width: 96 },
  emojiPreviewText: { fontSize: 52 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 14, justifyContent: 'space-between', marginTop: 'auto', paddingBottom: 8 },
});
