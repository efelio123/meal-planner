import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type GetToken, type Recipe } from '@/lib/api';
import { useRecipeContext } from './recipe-context';
import { RecipeCover } from './recipe-cover';
import { formatDuration, ingredientMeasure } from './recipe-presentation';

export function RecipeDetailScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { sessionId, userId } = useAuth();
  const householdId = selectedHousehold?.id ?? null;
  const { markChanged, revisionForHousehold } = useRecipeContext();
  const revision = householdId ? revisionForHousehold(householdId) : 0;
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${recipeId}`;
  const latestGetToken = useRef<GetToken>(getToken);
  const scopeRef = useRef(scope);
  const generation = useRef(0);
  const appliedRevision = useRef(revision);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [recipeScope, setRecipeScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ scope: string; message: string } | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const load = useCallback(async () => {
    if (!householdId) return;
    const requestScope = scope;
    const requestGeneration = ++generation.current;
    setLoading(true);
    setError(null);
    const isCurrent = () => generation.current === requestGeneration && scopeRef.current === requestScope;
    try {
      const result = await api.recipe(() => latestGetToken.current(), householdId, recipeId);
      if (!isCurrent()) return;
      setRecipe(result.recipe);
      setRecipeScope(requestScope);
    } catch (reason) {
      if (!isCurrent()) return;
      setError({ scope: requestScope, message: reason instanceof ApiError ? reason.message : 'We couldn’t load this recipe. Please try again.' });
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [householdId, recipeId, scope]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [load]);

  useEffect(() => {
    if (appliedRevision.current === revision) return;
    appliedRevision.current = revision;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [load, revision]);

  const openEdit = useCallback(() => {
    if (recipe && recipeScope === scope) router.push(`/(app)/(tabs)/recipes/${recipe.id}/edit` as never);
  }, [recipe, recipeScope, router, scope]);
  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Recipe',
      headerRight: Platform.OS !== 'ios' && recipe && recipeScope === scope ? () => (
        <Pressable accessibilityLabel="Edit recipe" accessibilityRole="button" hitSlop={10} onPress={openEdit}>
          <ThemedText themeColor="link" style={styles.headerAction}>Edit</ThemedText>
        </Pressable>
      ) : undefined,
    });
  }, [navigation, openEdit, recipe, recipeScope, scope]);

  const archive = async () => {
    if (!householdId) return;
    const requestScope = scopeRef.current;
    const requestGeneration = generation.current;
    setArchiving(true);
    setError(null);
    try {
      await api.archiveRecipe(() => latestGetToken.current(), householdId, recipeId);
      if (scopeRef.current !== requestScope || generation.current !== requestGeneration) return;
      setConfirmingArchive(false);
      markChanged(householdId);
      router.back();
    } catch (reason) {
      if (scopeRef.current === requestScope && generation.current === requestGeneration) {
        setError({ scope: requestScope, message: reason instanceof ApiError ? reason.message : 'We couldn’t archive this recipe. Please try again.' });
      }
    } finally {
      if (scopeRef.current === requestScope && generation.current === requestGeneration) setArchiving(false);
    }
  };

  const activeRecipe = recipeScope === scope ? recipe : null;
  return (
    <>
      <Stack.Screen options={{ title: 'Recipe' }} />
      {Platform.OS === 'ios' && recipe && recipeScope === scope ? <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button accessibilityLabel="Edit recipe" hidesSharedBackground onPress={openEdit} tintColor={theme.link} variant="plain">Edit</Stack.Toolbar.Button>
      </Stack.Toolbar> : null}
      <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
        <View style={styles.content}>
          {loading && !activeRecipe ? <ActivityIndicator accessibilityLabel="Loading recipe" color={theme.activity} /> : null}
          {activeRecipe ? <>
            <View style={styles.hero}>
              <RecipeCover recipe={activeRecipe} size="hero" />
              <ThemedText accessibilityRole="header" style={styles.title}>{activeRecipe.name}</ThemedText>
            </View>
            {activeRecipe.servings || activeRecipe.prep_minutes || activeRecipe.cook_minutes ? <View style={[styles.metaRow, { borderColor: theme.border }]}>
              {[
                activeRecipe.servings ? { label: 'Servings', value: String(activeRecipe.servings) } : null,
                formatDuration(activeRecipe.prep_minutes) ? { label: 'Prep', value: formatDuration(activeRecipe.prep_minutes)! } : null,
                formatDuration(activeRecipe.cook_minutes) ? { label: 'Cook', value: formatDuration(activeRecipe.cook_minutes)! } : null,
              ].filter((item): item is { label: string; value: string } => item !== null).map((item, index, items) => (
                <View key={item.label} style={styles.metaItem}>
                  {index > 0 ? <View accessibilityElementsHidden style={[styles.metaDivider, { backgroundColor: theme.border }]} testID="recipe-metric-divider" /> : null}
                  <Meta label={item.label} value={item.value} />
                </View>
              ))}
            </View> : null}

            <View style={styles.section}>
              <ThemedText accessibilityRole="header" style={styles.sectionTitle}>Ingredients</ThemedText>
              <View style={[styles.ingredientCard, { backgroundColor: theme.surface }]}>
                {(activeRecipe.ingredients ?? []).map((ingredient, index) => (
                  <View key={ingredient.id} style={[styles.ingredientRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <ThemedText themeColor="textSecondary" style={styles.measure}>{ingredientMeasure(ingredient)}</ThemedText>
                    <View style={styles.ingredientCopy}>
                      <ThemedText style={styles.ingredientName}>{ingredient.catalog_item_name}</ThemedText>
                      {ingredient.note ? <ThemedText themeColor="textSecondary">Note: {ingredient.note}</ThemedText> : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {(activeRecipe.steps?.length ?? 0) > 0 ? <View style={styles.section}>
              <ThemedText accessibilityRole="header" style={styles.sectionTitle}>Directions</ThemedText>
              {activeRecipe.steps?.map((step, index) => <View key={step.id} style={[styles.stepRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.stepNumber, { backgroundColor: theme.surfaceSelected }]}><ThemedText themeColor="link" style={styles.stepNumberText}>{index + 1}</ThemedText></View>
                <ThemedText style={styles.stepInstruction}>{step.instruction}</ThemedText>
              </View>)}
            </View> : null}

            {activeRecipe.notes ? <View style={styles.section}>
              <ThemedText accessibilityRole="header" style={styles.sectionTitle}>Notes</ThemedText>
              <View style={[styles.notesCard, { backgroundColor: theme.surface }]}><ThemedText>{activeRecipe.notes}</ThemedText></View>
            </View> : null}
            {activeRecipe.source_url ? <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(activeRecipe.source_url!).catch(() => setError({ scope, message: 'We couldn’t open this source link.' })); }} style={[styles.source, { borderTopColor: theme.border }]}>
              <ThemedText themeColor="textSecondary">↗  Source</ThemedText>
              <ThemedText themeColor="link" numberOfLines={2}>{activeRecipe.source_url}</ThemedText>
            </Pressable> : null}
            <Pressable accessibilityRole="button" onPress={() => setConfirmingArchive(true)} style={styles.archiveAction}>
              <ThemedText themeColor="error" style={styles.archiveText}>Archive recipe</ThemedText>
            </Pressable>
          </> : null}

          {error?.scope === scope ? <ThemedText accessibilityRole="alert" themeColor="error">{error.message}</ThemedText> : null}
          {error?.scope === scope && !loading ? <PrimaryButton onPress={() => void load()} title="Retry loading recipe" /> : null}
        </View>
      </Screen>
      <Modal transparent animationType="fade" onRequestClose={() => setConfirmingArchive(false)} visible={confirmingArchive}>
        <View style={styles.overlay}>
          <View style={[styles.confirm, { backgroundColor: theme.surface }]}>
            <ThemedText accessibilityRole="header" style={styles.confirmTitle}>Archive this recipe?</ThemedText>
            <ThemedText>It will leave the active Recipes library. Any household member can restore it from Household details.</ThemedText>
            {error?.scope === scope ? <ThemedText accessibilityRole="alert" themeColor="error">{error.message}</ThemedText> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: archiving }} disabled={archiving} onPress={() => void archive()} style={[styles.confirmArchive, { backgroundColor: theme.errorSurface, borderColor: theme.error }]}>
              <ThemedText themeColor="error" style={styles.archiveText}>{archiving ? 'Archiving…' : 'Archive recipe'}</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={archiving} onPress={() => setConfirmingArchive(false)} style={styles.cancel}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={styles.metaCell}><ThemedText themeColor="textSecondary">{label}</ThemedText><ThemedText style={styles.metaValue}>{value}</ThemedText></View>;
}

const styles = StyleSheet.create({
  content: { gap: 22 },
  hero: { alignItems: 'center', gap: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 36, textAlign: 'center' },
  metaRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14 },
  metaItem: { alignItems: 'center', flex: 1, flexDirection: 'row' },
  metaDivider: { height: 44, width: StyleSheet.hairlineWidth },
  metaCell: { alignItems: 'center', flex: 1, gap: 4 },
  metaValue: { fontSize: 16, fontWeight: '700' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 22, fontWeight: '700' },
  ingredientCard: { borderRadius: 16, overflow: 'hidden' },
  ingredientRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, minHeight: 60, paddingHorizontal: 14, paddingVertical: 14 },
  measure: { width: 56 },
  ingredientCopy: { flex: 1, gap: 2, minWidth: 0 },
  ingredientName: { fontWeight: '700' },
  stepRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingVertical: 14 },
  stepNumber: { alignItems: 'center', borderRadius: 15, height: 30, justifyContent: 'center', width: 30 },
  stepNumberText: { fontWeight: '700' },
  stepInstruction: { flex: 1, paddingTop: 2 },
  notesCard: { borderRadius: 14, padding: 16 },
  source: { borderTopWidth: StyleSheet.hairlineWidth, gap: 6, paddingTop: 18 },
  archiveAction: { alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  archiveText: { fontWeight: '600' },
  headerAction: { fontWeight: '600' },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'center', padding: 24 },
  confirm: { borderRadius: 16, gap: 16, maxWidth: 440, padding: 24, width: '100%' },
  confirmTitle: { fontSize: 22, fontWeight: '700' },
  confirmArchive: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 48 },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
