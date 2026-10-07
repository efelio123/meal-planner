import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type GetToken, type Recipe } from '@/lib/api';
import { useRecipeContext } from './recipe-context';
import { RecipeCover } from './recipe-cover';
import { useRecipes } from './use-recipes';

export function ArchivedRecipesScreen() {
  const { householdId } = useLocalSearchParams<{ householdId: string }>();
  const theme = useTheme();
  const { getToken, households } = useHouseholdState();
  const { sessionId, userId } = useAuth();
  const { markChanged } = useRecipeContext();
  const { error, loading, recipes, refresh } = useRecipes(true, undefined, householdId);
  const household = households.find((item) => item.id === householdId);
  const latestGetToken = useRef<GetToken>(getToken);
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId}`;
  const scopeRef = useRef(scope);
  const generation = useRef(0);
  const [restoreError, setRestoreError] = useState<{ scope: string; message: string } | null>(null);
  const [restoring, setRestoring] = useState<{ scope: string; recipeId: string } | null>(null);

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => {
    scopeRef.current = scope;
    generation.current += 1;
  }, [scope]);

  const restore = async (recipe: Recipe) => {
    const requestScope = scopeRef.current;
    const requestGeneration = generation.current;
    setRestoring({ scope: requestScope, recipeId: recipe.id });
    setRestoreError(null);
    try {
      await api.restoreRecipe(() => latestGetToken.current(), householdId, recipe.id);
      if (scopeRef.current !== requestScope || generation.current !== requestGeneration) return;
      markChanged(householdId);
    } catch (reason) {
      if (scopeRef.current === requestScope && generation.current === requestGeneration) {
        setRestoreError({ scope: requestScope, message: reason instanceof ApiError ? reason.message : 'We couldn’t restore this recipe. Please try again.' });
      }
    } finally {
      if (scopeRef.current === requestScope && generation.current === requestGeneration) setRestoring(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Archived recipes' }} />
      <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
        <View style={styles.content}>
          {household ? <>
            <ThemedText themeColor="link" style={styles.household}>⌂  {household.name}</ThemedText>
            <ThemedText themeColor="textSecondary">Recipes removed from this household can be restored here.</ThemedText>
          </> : null}
          <View style={styles.headingRow}>
            <ThemedText accessibilityRole="header" style={styles.heading}>Archived recipes</ThemedText>
            <ThemedText themeColor="textSecondary">{recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}</ThemedText>
          </View>
          {loading && recipes.length === 0 ? <ActivityIndicator accessibilityLabel="Loading archived recipes" color={theme.activity} /> : null}
          {error ? <View style={styles.errorBlock}>
            <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText>
            <PrimaryButton onPress={() => void refresh()} title="Retry loading archived recipes" />
          </View> : null}
          {restoreError?.scope === scope ? <ThemedText accessibilityRole="alert" themeColor="error">{restoreError.message}</ThemedText> : null}
          {!loading && !error && recipes.length === 0 ? <ThemedText themeColor="textSecondary">No archived recipes.</ThemedText> : null}
          {!error && recipes.length > 0 ? <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
            {recipes.map((recipe, index) => <View key={recipe.id} style={[styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <RecipeCover recipe={recipe} size="row" />
              <View style={styles.recipeCopy}>
                <ThemedText style={styles.recipeName}>{recipe.name}</ThemedText>
                <ThemedText themeColor="textSecondary">{recipe.ingredient_count} {recipe.ingredient_count === 1 ? 'ingredient' : 'ingredients'} · Archived {recipe.archived_at ? new Date(recipe.archived_at).toLocaleDateString() : ''}</ThemedText>
              </View>
              <Pressable accessibilityLabel={`Restore ${recipe.name}`} accessibilityRole="button" accessibilityState={{ disabled: restoring?.scope === scope && restoring.recipeId === recipe.id }} disabled={restoring?.scope === scope && restoring.recipeId === recipe.id} onPress={() => void restore(recipe)} style={styles.restoreAction}>
                <ThemedText themeColor="link" style={styles.restoreText}>{restoring?.scope === scope && restoring.recipeId === recipe.id ? 'Restoring…' : 'Restore'}</ThemedText>
              </Pressable>
            </View>)}
          </View> : null}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  household: { fontSize: 16, fontWeight: '600' },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  heading: { fontSize: 22, fontWeight: '700' },
  errorBlock: { gap: 8 },
  listCard: { borderRadius: 16, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 92, padding: 14 },
  recipeCopy: { flex: 1, gap: 3 },
  recipeName: { fontSize: 17, fontWeight: '700' },
  restoreAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 4 },
  restoreText: { fontWeight: '600' },
});
