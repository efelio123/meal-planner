import { useAuth } from '@clerk/expo';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type CatalogUnits, type GetToken, type Recipe, type RecipeInput, type RecipeUpdateInput } from '@/lib/api';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { formatRecipeAmount } from './recipe-presentation';
import { useRecipeContext } from './recipe-context';
import { RecipeCover } from './recipe-cover';
import { useMealPlanContext } from '@/features/meal-plan/meal-plan-context';
import { draftFromRecipe, ingredientDraftFromRecipe, ingredientInputFromDraft, isValidRecipeAmount, moveDirectionStep, newCreateRequestId, newRecipeDraft, recipeOptionalFieldsError, type RecipeDirectionDraft, type RecipeDraft, type RecipeIngredientDraft } from './recipe-form-utils';
import { RecipeCoverSheet, RecipeEmojiSheet, RecipeFoodSheet, RecipeIngredientDetailsSheet, type RecipeFoodChoice } from './recipe-native-sheets';

type SavePayload = RecipeInput | RecipeUpdateInput;

function localStep(instruction = ''): RecipeDirectionDraft {
  return { key: `${Date.now()}-${Math.random()}`, instruction };
}

function amountError(value: string) {
  return isValidRecipeAmount(value) ? null : 'Enter a positive number or fraction. Put a range in the note.';
}

function formatIngredientSummary(ingredient: RecipeIngredientDraft) {
  const unit = ingredient.customUnitLabel.trim() || ingredient.unitLabel;
  const amount = formatRecipeAmount(ingredient.amount.trim());
  if (amount && unit) return `${amount} ${unit}`;
  return amount || unit || 'To taste';
}

export function RecipeEditorScreen({ routeBase = 'recipes' }: { routeBase?: 'recipes' | 'plan' }) {
  const { recipeId } = useLocalSearchParams<{ recipeId?: string }>();
  const editing = typeof recipeId === 'string' && recipeId.length > 0;
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { sessionId, userId } = useAuth();
  const sheetFlow = useNativeSheetFlow();
  const { createdFood, markChanged: markRecipeChanged, setCreatedFood } = useRecipeContext();
  const mealPlanContext = useMealPlanContext();
  const householdId = selectedHousehold?.id ?? null;
  const editorRouteBase = `/(app)/(tabs)/${routeBase}` as const;
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${recipeId ?? 'new'}`;
  const latestGetToken = useRef<GetToken>(getToken);
  const scopeRef = useRef(scope);
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const originalRevision = useRef<number | null>(null);
  const createRequestId = useRef(newCreateRequestId());
  const pendingSave = useRef<SavePayload | null>(null);
  const pendingUpdateBase = useRef<number | null>(null);
  const [draft, setDraft] = useState<RecipeDraft>(newRecipeDraft);
  const [ingredients, setIngredients] = useState<RecipeIngredientDraft[]>([]);
  const [steps, setSteps] = useState<RecipeDirectionDraft[]>([]);
  const [ingredientsDirty, setIngredientsDirty] = useState(false);
  const [stepsDirty, setStepsDirty] = useState(false);
  const [loadedScope, setLoadedScope] = useState<string | null>(editing ? null : scope);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [saveUnknown, setSaveUnknown] = useState(false);
  const [conflictNeedsReload, setConflictNeedsReload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreDetails, setMoreDetails] = useState(false);


  const editorLoaded = loadedScope === scope;
  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestGeneration.current += 1; };
  }, []);
  const loadExistingRecipe = useCallback(async () => {
    if (!editing || !householdId) return;
    const requestScope = scope;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    const isCurrent = () => mounted.current && requestGeneration.current === generation && scopeRef.current === requestScope;
    try {
      const result = await api.recipe(() => latestGetToken.current(), householdId, recipeId!);
      if (!isCurrent()) return;
      const recipe = result.recipe;
      originalRevision.current = recipe.edit_revision;
      setDraft(draftFromRecipe(recipe));
      setIngredients((recipe.ingredients ?? []).map(ingredientDraftFromRecipe));
      setSteps((recipe.steps ?? []).map((step) => localStep(step.instruction)));
      setIngredientsDirty(false);
      setStepsDirty(false);
      setLoadedScope(requestScope);
      setSaveUnknown(false);
      setConflictNeedsReload(false);
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof ApiError ? reason.message : 'We couldn’t load this recipe. Please try again.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [editing, householdId, recipeId, scope]);

  useLayoutEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    requestGeneration.current += 1;
    originalRevision.current = null;
    createRequestId.current = newCreateRequestId();
    pendingSave.current = null;
    pendingUpdateBase.current = null;
    setDraft(newRecipeDraft());
    setIngredients([]);
    setSteps([]);
    setIngredientsDirty(false);
    setStepsDirty(false);
    setLoadedScope(editing ? null : scope);
    setLoading(editing);
    setSaving(false);
    setSaveUnknown(false);
    setConflictNeedsReload(false);
    setError(null);
    setMoreDetails(false);
  }, [editing, scope]);

  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => { void loadExistingRecipe(); }, 0);
    return () => { clearTimeout(timer); requestGeneration.current += 1; };
  }, [editing, loadExistingRecipe, scope]);

  const cleanSteps = useMemo(() => steps.map((step) => step.instruction.trim()).filter(Boolean), [steps]);
  const optionalFieldsError = recipeOptionalFieldsError(draft);
  const canSave = Boolean(draft.name.trim()) && ingredients.length > 0 && ingredients.every((ingredient) => !amountError(ingredient.amount)) && !optionalFieldsError;

  const buildCreatePayload = (): RecipeInput => ({
    create_request_id: createRequestId.current,
    name: draft.name.trim(),
    cover_kind: draft.coverKind,
    cover_emoji: draft.coverKind === 'emoji' ? draft.coverEmoji.trim() : null,
    servings: draft.servings.trim() ? Number(draft.servings) : null,
    prep_hours: Number(draft.prepHours || 0),
    prep_minutes: Number(draft.prepMinutes || 0),
    cook_hours: Number(draft.cookHours || 0),
    cook_minutes: Number(draft.cookMinutes || 0),
    notes: draft.notes.trim() || null,
    source_url: draft.sourceUrl.trim() || null,
    ingredients: ingredients.map(ingredientInputFromDraft),
    steps: cleanSteps,
  });

  const buildUpdatePayload = (): RecipeUpdateInput => {
    const payload: RecipeUpdateInput = {
      expected_revision: originalRevision.current ?? 0,
      name: draft.name.trim(),
      cover_kind: draft.coverKind,
      cover_emoji: draft.coverKind === 'emoji' ? draft.coverEmoji.trim() : null,
      servings: draft.servings.trim() ? Number(draft.servings) : null,
      prep_hours: Number(draft.prepHours || 0),
      prep_minutes: Number(draft.prepMinutes || 0),
      cook_hours: Number(draft.cookHours || 0),
      cook_minutes: Number(draft.cookMinutes || 0),
      notes: draft.notes.trim() || null,
      source_url: draft.sourceUrl.trim() || null,
    };
    if (ingredientsDirty) payload.ingredients = ingredients.map(ingredientInputFromDraft);
    if (stepsDirty) payload.steps = cleanSteps;
    return payload;
  };

  const isRecipeSaved = (saved: Recipe, payload: SavePayload): boolean => {
    if (saved.name !== payload.name) return false;
    if ('cover_kind' in payload && saved.cover_kind !== payload.cover_kind) return false;
    if ('cover_emoji' in payload && saved.cover_emoji !== (payload.cover_emoji ?? null)) return false;
    if ('servings' in payload && saved.servings !== (payload.servings ?? null)) return false;
    const prep = (payload.prep_hours ?? 0) * 60 + (payload.prep_minutes ?? 0);
    const cook = (payload.cook_hours ?? 0) * 60 + (payload.cook_minutes ?? 0);
    if ('prep_hours' in payload && saved.prep_minutes !== prep) return false;
    if ('cook_hours' in payload && saved.cook_minutes !== cook) return false;
    if ('notes' in payload && saved.notes !== (payload.notes ?? null)) return false;
    if ('source_url' in payload && saved.source_url !== (payload.source_url ?? null)) return false;
    if (payload.ingredients) {
      const submitted = payload.ingredients;
      const current = saved.ingredients ?? [];
      if (submitted.length !== current.length) return false;
      for (let index = 0; index < submitted.length; index += 1) {
        const left = submitted[index]; const right = current[index];
        if (left.catalog_item_id !== right.catalog_item_id
          || Number(left.amount ?? 0) !== Number(right.amount ?? 0)
          || (left.unit_code ?? null) !== (right.unit_code ?? null)
          || (left.custom_unit_label ?? null) !== (right.custom_unit_label ?? null)
          || (left.note ?? null) !== (right.note ?? null)) return false;
      }
    }
    if (payload.steps && JSON.stringify(payload.steps) !== JSON.stringify((saved.steps ?? []).map((step) => step.instruction))) return false;
    return true;
  };

  const finishSaved = (saved: Recipe, requestScope: string) => {
    if (!mounted.current || scopeRef.current !== requestScope) return;
    if (householdId) markRecipeChanged(householdId);
    setSaveUnknown(false);
    setSaving(false);
    setError(null);
    if (editing) router.back();
    else {
      const returnIntent = mealPlanContext.completeRecipeCreate(saved);
      if (returnIntent) {
        router.back();
      } else router.replace(`/(app)/(tabs)/recipes/${saved.id}` as never);
    }
  };

  const checkUnknownSave = async () => {
    if (!householdId || !pendingSave.current) return;
    const requestScope = scopeRef.current;
    const generation = requestGeneration.current;
    setSaving(true);
    setError(null);
    try {
      if (!editing) {
        const result = await api.createRecipe(() => latestGetToken.current(), householdId, pendingSave.current as RecipeInput);
        if (!mounted.current || scopeRef.current !== requestScope || requestGeneration.current !== generation) return;
        finishSaved(result.recipe, requestScope);
        return;
      }
      const result = await api.recipe(() => latestGetToken.current(), householdId, recipeId!);
      if (!mounted.current || scopeRef.current !== requestScope || requestGeneration.current !== generation) return;
      const payload = pendingSave.current;
      if (isRecipeSaved(result.recipe, payload)) {
        finishSaved(result.recipe, requestScope);
      } else if (result.recipe.edit_revision === pendingUpdateBase.current) {
        setSaveUnknown(false);
        setError('The latest recipe is unchanged. You can safely try saving again.');
      } else {
        setConflictNeedsReload(true);
        setError('This recipe changed on another device. Reload the latest version before saving your draft.');
      }
    } catch (reason) {
      if (mounted.current && scopeRef.current === requestScope && requestGeneration.current === generation) {
        setError(reason instanceof ApiError ? reason.message : 'We couldn’t check the saved recipe. Please try again.');
      }
    } finally {
      if (mounted.current && scopeRef.current === requestScope && requestGeneration.current === generation) setSaving(false);
    }
  };

  const save = async () => {
    if (saveUnknown) { await checkUnknownSave(); return; }
    if (!householdId || !editorLoaded || !canSave || saving) {
      if (!draft.name.trim()) setError('Enter a recipe name.');
      else if (ingredients.length === 0) setError('Add at least one Food Catalog ingredient.');
      else if (ingredients.some((ingredient) => amountError(ingredient.amount))) setError('Check the ingredient amounts.');
      else if (optionalFieldsError) setError(optionalFieldsError);
      return;
    }
    const requestScope = scopeRef.current;
    const generation = requestGeneration.current;
    const payload: SavePayload = editing ? buildUpdatePayload() : buildCreatePayload();
    pendingSave.current = payload;
    pendingUpdateBase.current = editing ? originalRevision.current : null;
    setSaving(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const result = editing
        ? await api.updateRecipe(() => latestGetToken.current(), householdId, recipeId!, payload as RecipeUpdateInput)
        : await api.createRecipe(() => latestGetToken.current(), householdId, payload as RecipeInput);
      if (!mounted.current || scopeRef.current !== requestScope || requestGeneration.current !== generation) return;
      finishSaved(result.recipe, requestScope);
    } catch (reason) {
      if (mounted.current && scopeRef.current === requestScope && requestGeneration.current === generation) {
        if (reason instanceof ApiError && reason.code === 'RECIPE_REVISION_CONFLICT') {
          setSaveUnknown(false);
          setConflictNeedsReload(true);
          setError(reason.message);
        } else if (reason instanceof ApiError && reason.status < 500) {
          setSaveUnknown(false);
          setError(reason.message);
        } else {
          setSaveUnknown(true);
          setError('We couldn’t confirm whether this recipe saved. Check its latest version before trying again.');
        }
      }
    } finally {
      if (mounted.current && scopeRef.current === requestScope && requestGeneration.current === generation) setSaving(false);
    }
  };

  const getCurrentToken = useCallback(() => latestGetToken.current(), []);
  const isCurrentEditorScope = useCallback(() => mounted.current && scopeRef.current === scope, [scope]);
  const pushNativeSheet = useCallback((kind: 'food' | 'details' | 'cover' | 'emoji', content: React.ReactNode, detents: number[]) => {
    const sheetId = sheetFlow.present(content, { detents });
    router.push({ pathname: `${editorRouteBase}/sheet/${kind}`, params: { sheetId } } as never);
  }, [editorRouteBase, router, sheetFlow]);

  const saveIngredient = useCallback((ingredient: RecipeIngredientDraft, index: number | null) => {
    if (index === null) setIngredients((current) => [...current, ingredient]);
    else setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? ingredient : item));
    setIngredientsDirty(true);
  }, []);

  const openIngredientDetails = useCallback((food: RecipeFoodChoice, existing: RecipeIngredientDraft | undefined, index: number | null, returnToSearch: boolean, units: CatalogUnits | null = null) => {
    Keyboard.dismiss();
    const initialDraft = existing ?? {
      catalogItemId: food.id,
      catalogItemName: food.name,
      categoryEmoji: food.categoryEmoji,
      amount: '',
      unitCode: '',
      unitLabel: '',
      customUnitLabel: '',
      note: '',
    };
    pushNativeSheet(
      'details',
      <RecipeIngredientDetailsSheet
        food={food}
        initialDraft={initialDraft}
        existingIndex={index}
        returnToSearch={returnToSearch}
        householdId={householdId!}
        expectedFlowScope={sheetFlow.scope}
        getToken={getCurrentToken}
        isCurrent={isCurrentEditorScope}
        initialUnits={units}
        unitSheetRoute={`${editorRouteBase}/sheet/unit`}
        onSave={saveIngredient}
      />,
      [0.52, 0.92],
    );
  }, [editorRouteBase, getCurrentToken, householdId, isCurrentEditorScope, pushNativeSheet, saveIngredient, sheetFlow.scope]);

  const startIngredient = useCallback((food: RecipeFoodChoice, existing?: RecipeIngredientDraft, index?: number) => {
    if (!householdId) return;
    openIngredientDetails(food, existing, index ?? null, false);
  }, [householdId, openIngredientDetails]);

  const openFoodCreate = useCallback(() => {
    if (!householdId || !isCurrentEditorScope()) return;
    router.push(`${editorRouteBase}/catalog-food?originScope=${encodeURIComponent(`${scope}:${createRequestId.current}`)}` as never);
  }, [editorRouteBase, householdId, isCurrentEditorScope, router, scope]);

  const openIngredientSearch = () => {
    if (!householdId || !editorLoaded || saving) return;
    Keyboard.dismiss();
    pushNativeSheet(
      'food',
      <RecipeFoodSheet
        householdId={householdId}
        expectedFlowScope={sheetFlow.scope}
        getToken={getCurrentToken}
        isCurrent={isCurrentEditorScope}
        onSelect={(food, units) => openIngredientDetails(food, undefined, null, true, units)}
        onCreate={openFoodCreate}
      />,
      [0.58, 0.94],
    );
  };

  const openRecipeEmojiEntry = () => {
    pushNativeSheet(
      'emoji',
      <RecipeEmojiSheet
        value={draft.coverEmoji}
        onUse={(emoji) => setDraft((current) => ({ ...current, coverKind: 'emoji', coverEmoji: emoji }))}
        onClear={() => setDraft((current) => ({ ...current, coverKind: 'initials', coverEmoji: '' }))}
      />,
      [0.46, 0.78],
    );
  };

  const openRecipeCover = () => pushNativeSheet(
    'cover',
    <RecipeCoverSheet
      draft={draft}
      onChooseInitials={() => setDraft((current) => ({ ...current, coverKind: 'initials', coverEmoji: '' }))}
      onChooseEmoji={openRecipeEmojiEntry}
    />,
    [0.48, 0.76],
  );

  useFocusEffect(useCallback(() => {
    if (!createdFood) return;
    setCreatedFood(null);
    if (createdFood.originScope !== `${scope}:${createRequestId.current}` || createdFood.item.household_id !== householdId) return;
    startIngredient({ id: createdFood.item.id, name: createdFood.item.name, categoryEmoji: null });
  }, [createdFood, householdId, scope, setCreatedFood, startIngredient]));
  const saveLabel = saveUnknown ? (editing ? 'Check saved version' : 'Retry save') : saving ? 'Saving…' : 'Save';
  const saveDisabled = !editorLoaded || saving;
  const saveAction = () => <Pressable accessibilityLabel={saveLabel} accessibilityRole="button" accessibilityState={{ disabled: saveDisabled }} disabled={saveDisabled} hitSlop={10} onPress={() => void save()} style={styles.headerAction}>
    <ThemedText themeColor={saveDisabled ? 'textSecondary' : 'link'} style={styles.headerActionText}>{saveLabel}</ThemedText>
  </Pressable>;
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') navigation.setOptions({ title: editing ? 'Edit recipe' : 'New recipe', headerRight: saveAction });
  });

  const editable = editorLoaded && !saving && !saveUnknown;

  return (
    <>
      <Stack.Screen options={{ title: editing ? 'Edit recipe' : 'New recipe', headerRight: Platform.OS === 'ios' ? undefined : saveAction }} />
      {Platform.OS === 'ios' ? <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button accessibilityLabel={saveLabel} disabled={saveDisabled} hidesSharedBackground onPress={() => void save()} tintColor={saveDisabled ? theme.textSecondary : theme.link} variant="plain">{saveLabel}</Stack.Toolbar.Button>
      </Stack.Toolbar> : null}
      <Screen contentAlignment="top" safeAreaEdges={['left', 'right']} testID="recipe-editor-screen">
        <View style={styles.content}>
          {editing && loading ? <ActivityIndicator accessibilityLabel="Loading recipe for editing" color={theme.activity} /> : null}
          {editing && error && !editorLoaded ? <View style={styles.errorBlock}>
            <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText>
            <PrimaryButton disabled={loading} onPress={() => void loadExistingRecipe()} title="Retry loading recipe" />
          </View> : null}
          {editorLoaded ? <>
            <View style={styles.coverHeader}>
              <RecipeCover recipe={{ name: draft.name || 'Recipe', cover_kind: draft.coverKind, cover_emoji: draft.coverEmoji || null }} size="hero" />
              <Pressable accessibilityRole="button" disabled={!editable} onPress={openRecipeCover} style={styles.coverAction}>
                <ThemedText themeColor="link">Change cover</ThemedText>
              </Pressable>
            </View>

            <View style={styles.field}>
              <ThemedText style={styles.fieldLabel}>Recipe name <ThemedText themeColor="error">*</ThemedText></ThemedText>
              <ThemedInput accessibilityLabel="Recipe name" editable={editable} onChangeText={(name) => { setDraft((current) => ({ ...current, name })); if (name.trim()) setError((current) => current === 'Enter a recipe name.' ? null : current); }} placeholder="Recipe name" returnKeyType="next" value={draft.name} />
              {!draft.name.trim() ? <ThemedText themeColor="textSecondary">Recipe name is required.</ThemedText> : null}
              {error === 'Enter a recipe name.' ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
            </View>

            <View style={styles.section}>
              <ThemedText accessibilityRole="header" style={styles.sectionTitle}>Ingredients <ThemedText themeColor="error">*</ThemedText></ThemedText>
              {ingredients.length > 0 ? <View style={[styles.ingredientList, { backgroundColor: theme.surface }]}>
                {ingredients.map((ingredient, index) => <View key={`${ingredient.catalogItemId}-${index}`} style={[styles.ingredientRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={styles.ingredientSummary}>
                    <ThemedText numberOfLines={3} style={styles.ingredientName}>{ingredient.catalogItemName}</ThemedText>
                    <ThemedText themeColor="textSecondary">{formatIngredientSummary(ingredient)}</ThemedText>
                    {ingredient.note ? <ThemedText themeColor="textSecondary">Note: {ingredient.note}</ThemedText> : null}
                  </View>
                  <View style={styles.ingredientActions}>
                    <Pressable accessibilityLabel={`Edit ${ingredient.catalogItemName}`} accessibilityRole="button" disabled={!editable} onPress={() => startIngredient({ id: ingredient.catalogItemId, name: ingredient.catalogItemName, categoryEmoji: ingredient.categoryEmoji }, ingredient, index)} style={styles.ingredientAction}>
                      <ThemedText themeColor="link">Edit</ThemedText>
                    </Pressable>
                    <Pressable accessibilityLabel={`Remove ${ingredient.catalogItemName} from recipe`} accessibilityRole="button" disabled={!editable} onPress={() => { setIngredients((current) => current.filter((_item, itemIndex) => itemIndex !== index)); setIngredientsDirty(true); }} style={styles.ingredientAction}>
                      <ThemedText themeColor="error">Remove</ThemedText>
                    </Pressable>
                  </View>
                </View>)}
              </View> : <ThemedText themeColor="textSecondary">Add at least one Food Catalog item to save this recipe.</ThemedText>}
              {error === 'Add at least one Food Catalog ingredient.' ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
              <Pressable accessibilityRole="button" disabled={!editable} onPress={() => void openIngredientSearch()} style={styles.inlineAction}>
                <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'plus', android: 'add', web: 'add' }} size={21} tintColor={theme.link} />
                <ThemedText themeColor="link">Add ingredient</ThemedText>
              </Pressable>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}><ThemedText accessibilityRole="header" style={styles.sectionTitle}>Directions</ThemedText><ThemedText themeColor="textSecondary">Optional</ThemedText></View>
              {steps.map((step, index) => <View key={step.key} style={[styles.stepCard, { backgroundColor: theme.surface }]}>
                <View style={styles.stepHeader}>
                  <View style={[styles.stepNumber, { backgroundColor: theme.surfaceSelected }]}><ThemedText themeColor="link" style={styles.stepNumberText}>{index + 1}</ThemedText></View>
                  <ThemedText themeColor="textSecondary">Step {index + 1}</ThemedText>
                </View>
                <ThemedInput accessibilityLabel={`Direction step ${index + 1}`} editable={editable} multiline onChangeText={(instruction) => { setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, instruction } : item)); setStepsDirty(true); }} placeholder="Describe this step" textAlignVertical="top" value={step.instruction} style={styles.stepInput} />
                <View style={styles.stepActions}>
                  <Pressable accessibilityLabel={`Move step ${index + 1} up`} accessibilityState={{ disabled: index === 0 || !editable }} disabled={index === 0 || !editable} onPress={() => { setSteps((current) => moveDirectionStep(current, index, -1)); setStepsDirty(true); }} style={styles.stepAction}><ThemedText themeColor={index === 0 ? 'textSecondary' : 'link'}>↑ Up</ThemedText></Pressable>
                  <Pressable accessibilityLabel={`Move step ${index + 1} down`} accessibilityState={{ disabled: index === steps.length - 1 || !editable }} disabled={index === steps.length - 1 || !editable} onPress={() => { setSteps((current) => moveDirectionStep(current, index, 1)); setStepsDirty(true); }} style={styles.stepAction}><ThemedText themeColor={index === steps.length - 1 ? 'textSecondary' : 'link'}>↓ Down</ThemedText></Pressable>
                  <Pressable accessibilityLabel={`Remove step ${index + 1}`} accessibilityRole="button" disabled={!editable} onPress={() => { setSteps((current) => current.filter((_item, itemIndex) => itemIndex !== index)); setStepsDirty(true); }} style={styles.stepAction}><ThemedText themeColor="error">Remove</ThemedText></Pressable>
                </View>
              </View>)}
              <Pressable accessibilityRole="button" disabled={!editable} onPress={() => { setSteps((current) => [...current, localStep()]); setStepsDirty(true); }} style={styles.inlineAction}>
                <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'plus', android: 'add', web: 'add' }} size={21} tintColor={theme.link} />
                <ThemedText themeColor="link">Add a step</ThemedText>
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreDetails }} disabled={!editable} onPress={() => setMoreDetails((current) => !current)} style={[styles.moreDetails, { borderColor: theme.border }]}>
              <ThemedText style={styles.moreTitle}>More details (optional)</ThemedText>
              <ThemedText themeColor="textSecondary">{moreDetails ? '⌃' : '⌄'}</ThemedText>
            </Pressable>
            {moreDetails ? <View style={styles.optionalFields}>
              <View style={styles.field}><ThemedText style={styles.fieldLabel}>Servings</ThemedText><ThemedInput accessibilityLabel="Servings" editable={editable} keyboardType="number-pad" onChangeText={(servings) => setDraft((current) => ({ ...current, servings: servings.replace(/[^0-9]/gu, '') }))} placeholder="Optional" value={draft.servings} /></View>
              <TimeFields label="Prep time" hours={draft.prepHours} minutes={draft.prepMinutes} editable={editable} onHours={(prepHours) => setDraft((current) => ({ ...current, prepHours: prepHours.replace(/[^0-9]/gu, '') }))} onMinutes={(prepMinutes) => setDraft((current) => ({ ...current, prepMinutes: prepMinutes.replace(/[^0-9]/gu, '').slice(0, 2) }))} />
              <TimeFields label="Cook time" hours={draft.cookHours} minutes={draft.cookMinutes} editable={editable} onHours={(cookHours) => setDraft((current) => ({ ...current, cookHours: cookHours.replace(/[^0-9]/gu, '') }))} onMinutes={(cookMinutes) => setDraft((current) => ({ ...current, cookMinutes: cookMinutes.replace(/[^0-9]/gu, '').slice(0, 2) }))} />
              <View style={styles.field}><ThemedText style={styles.fieldLabel}>Notes</ThemedText><ThemedInput accessibilityLabel="Recipe notes" editable={editable} multiline onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))} placeholder="Tips or substitutions" textAlignVertical="top" value={draft.notes} style={styles.notesInput} /></View>
              <View style={styles.field}><ThemedText style={styles.fieldLabel}>Source link</ThemedText><ThemedInput accessibilityLabel="Recipe source link" autoCapitalize="none" editable={editable} keyboardType="url" onChangeText={(sourceUrl) => setDraft((current) => ({ ...current, sourceUrl }))} placeholder="https://" value={draft.sourceUrl} /></View>
            </View> : null}
          </> : null}

          {error && editorLoaded && error !== 'Enter a recipe name.' && error !== 'Add at least one Food Catalog ingredient.' ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
          {optionalFieldsError && editorLoaded ? <ThemedText accessibilityRole="alert" themeColor="error">{optionalFieldsError}</ThemedText> : null}
          {saveUnknown && editorLoaded ? <PrimaryButton disabled={saving} onPress={() => void checkUnknownSave()} title={editing ? 'Check saved version' : 'Retry save safely'} /> : null}
          {conflictNeedsReload && editing ? <PrimaryButton disabled={saving} onPress={() => void loadExistingRecipe()} title="Reload latest recipe" /> : null}
        </View>
      </Screen>

    </>
  );
}

function TimeFields({ label, hours, minutes, editable, onHours, onMinutes }: { label: string; hours: string; minutes: string; editable: boolean; onHours: (value: string) => void; onMinutes: (value: string) => void }) {
  return <View style={styles.timeFields}>
    <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
    <View style={styles.splitFields}>
      <View style={[styles.field, styles.splitField]}><ThemedText themeColor="textSecondary">Hours</ThemedText><ThemedInput accessibilityLabel={`${label} hours`} editable={editable} keyboardType="number-pad" onFocus={() => { if (hours === '0') onHours(''); }} onChangeText={onHours} value={hours} /></View>
      <View style={[styles.field, styles.splitField]}><ThemedText themeColor="textSecondary">Minutes</ThemedText><ThemedInput accessibilityLabel={`${label} minutes`} editable={editable} keyboardType="number-pad" onFocus={() => { if (minutes === '0') onMinutes(''); }} onChangeText={onMinutes} value={minutes} /></View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingBottom: 32 },
  headerAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 56 },
  headerActionText: { fontSize: 16, fontWeight: '600' },
  coverHeader: { alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 4 },
  coverAction: { alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  field: { gap: 8 },
  fieldLabel: { fontWeight: '600' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '700' },
  sectionTitleRow: { alignItems: 'baseline', flexDirection: 'row', gap: 8 },
  ingredientList: { borderRadius: 16, overflow: 'hidden' },
  ingredientRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, minHeight: 72, paddingHorizontal: 14, paddingVertical: 12 },
  ingredientSummary: { flex: 1, gap: 3, minWidth: 0 },
  ingredientName: { fontWeight: '700', flexShrink: 1 },
  ingredientActions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  ingredientAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 48, paddingHorizontal: 5 },
  inlineAction: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 10, minHeight: 44, paddingHorizontal: 4 },
  stepCard: { borderRadius: 16, gap: 12, padding: 14 },
  stepHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stepNumber: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  stepNumberText: { fontWeight: '700' },
  stepInput: { minHeight: 88, lineHeight: 24 },
  stepActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', gap: 14 },
  stepAction: { alignItems: 'center', justifyContent: 'center', minHeight: 42, paddingHorizontal: 4 },
  moreDetails: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 56 },
  moreTitle: { fontWeight: '700' },
  optionalFields: { gap: 20 },
  timeFields: { gap: 8 },
  splitFields: { flexDirection: 'row', gap: 12 },
  splitField: { flex: 1 },
  notesInput: { minHeight: 90 },
  errorBlock: { gap: 8 },
});
