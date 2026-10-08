import { useAuth } from '@clerk/expo';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { RecipeCover } from './recipe-cover';
import { useRecipeContext } from './recipe-context';
import { useRecipes } from './use-recipes';

export function RecipeLibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { sessionId, userId } = useAuth();
  const [isFocused, setIsFocused] = useState(() => navigation.isFocused());
  const { viewMode, setViewMode } = useRecipeContext();
  const { error, householdId, loading, recipes, refresh, refreshing } = useRecipes(false, undefined, undefined, isFocused);
  const [search, setSearch] = useState('');
  const viewScope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}`;
  const previousScope = useRef(viewScope);
  useEffect(() => {
    const focusSubscription = navigation.addListener('focus', () => setIsFocused(true));
    const blurSubscription = navigation.addListener('blur', () => setIsFocused(false));
    return () => { focusSubscription(); blurSubscription(); };
  }, [navigation]);
  useLayoutEffect(() => {
    if (previousScope.current === viewScope) return;
    previousScope.current = viewScope;
    setSearch('');
  }, [viewScope]);

  const filteredRecipes = useMemo(() => recipes.filter((recipe) => recipe.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [recipes, search]);
  const cardWidth = Math.max(132, (width - 60) / 2);

  return (
    <Screen contentAlignment="top" nativeTabScreen manualNativeTabInsets safeAreaEdges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText accessibilityRole="header" style={styles.title}>Recipes</ThemedText>
          <Pressable accessibilityLabel="Create recipe" accessibilityRole="button" onPress={() => router.push('/(app)/(tabs)/recipes/create' as never)} style={[styles.addButton, { backgroundColor: theme.primary }]}>
            <ThemedText style={{ color: theme.primaryText, fontSize: 26, lineHeight: 30 }}>＋</ThemedText>
          </Pressable>
        </View>
        <View style={[styles.searchField, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
          <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={19} testID="recipe-search-icon" tintColor={theme.inputPlaceholder} />
          <ThemedInput accessibilityLabel="Search recipes" onChangeText={setSearch} placeholder="Search recipes" returnKeyType="search" value={search} style={styles.searchInput} />
        </View>
        <View style={styles.libraryMeta}>
          <ThemedText themeColor="textSecondary">{filteredRecipes.length} {filteredRecipes.length === 1 ? 'family recipe' : 'family recipes'}</ThemedText>
          <View style={[styles.viewToggle, { backgroundColor: theme.surfaceSelected }]}>
            <ViewToggle mode="grid" selected={viewMode === 'grid'} onPress={() => setViewMode('grid')} />
            <ViewToggle mode="list" selected={viewMode === 'list'} onPress={() => setViewMode('list')} />
          </View>
        </View>

        {loading && recipes.length === 0 ? <ActivityIndicator accessibilityLabel="Loading recipes" color={theme.activity} /> : null}
        {error ? <View style={styles.message}>
          <ThemedText accessibilityRole="alert" themeColor="error">{recipes.length ? `Recipes may be out of date. ${error}` : error}</ThemedText>
          <PrimaryButton onPress={() => void refresh()} title="Retry loading recipes" />
        </View> : null}
        {!loading && !error && filteredRecipes.length === 0 ? <ThemedText themeColor="textSecondary">{search.trim() ? 'No recipes match your search.' : 'No recipes yet. Add a family favorite to get started.'}</ThemedText> : null}

        {!error && viewMode === 'grid' ? <View style={styles.grid}>
          {filteredRecipes.map((recipe) => (
            <Pressable key={recipe.id} accessibilityRole="button" onPress={() => router.push(`/(app)/(tabs)/recipes/${recipe.id}` as never)} style={[styles.recipeCard, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected, width: cardWidth }]}>
                <RecipeCover recipe={recipe} />
                <View style={styles.cardText}>
                  <ThemedText numberOfLines={1} style={styles.recipeName}>{recipe.name}</ThemedText>
                  <ThemedText themeColor="textSecondary">{recipe.ingredient_count} {recipe.ingredient_count === 1 ? 'ingredient' : 'ingredients'}</ThemedText>
                </View>
            </Pressable>
          ))}
        </View> : null}

        {!error && viewMode === 'list' && filteredRecipes.length > 0 ? <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
          {filteredRecipes.map((recipe, index) => (
            <Pressable key={recipe.id} accessibilityRole="button" onPress={() => router.push(`/(app)/(tabs)/recipes/${recipe.id}` as never)} style={[styles.listRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <RecipeCover recipe={recipe} size="row" />
                <View style={styles.listCopy}>
                  <ThemedText numberOfLines={1} style={styles.recipeName}>{recipe.name}</ThemedText>
                  <ThemedText themeColor="textSecondary">{recipe.ingredient_count} {recipe.ingredient_count === 1 ? 'ingredient' : 'ingredients'}</ThemedText>
                </View>
                <ThemedText accessibilityElementsHidden importantForAccessibility="no" themeColor="textSecondary" style={styles.chevron}>›</ThemedText>
            </Pressable>
          ))}
        </View> : null}
        {refreshing ? <ThemedText themeColor="textSecondary">Refreshing recipes…</ThemedText> : null}
      </View>
    </Screen>
  );
}

function ViewToggle({ mode, selected, onPress }: { mode: 'grid' | 'list'; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const label = mode === 'grid' ? 'Grid view' : 'List view';
  return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.toggleButton, selected && { backgroundColor: theme.surface }]}>
    <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={mode === 'grid'
      ? { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' }
      : { ios: 'list.bullet', android: 'view_list', web: 'view_list' }} size={22} tintColor={selected ? theme.primary : theme.textSecondary} />
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  addButton: { alignItems: 'center', borderRadius: 26, height: 52, justifyContent: 'center', width: 52 },
  searchField: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 52, paddingHorizontal: 14 },
  searchInput: { backgroundColor: 'transparent', borderWidth: 0, flex: 1, minWidth: 0, paddingHorizontal: 0 },
  libraryMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  viewToggle: { borderRadius: 13, flexDirection: 'row', gap: 2, padding: 4 },
  toggleButton: { alignItems: 'center', borderRadius: 10, height: 42, justifyContent: 'center', width: 42 },
  message: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  recipeCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardText: { gap: 2, paddingHorizontal: 14, paddingVertical: 12 },
  recipeName: { fontWeight: '700' },
  listCard: { borderRadius: 16, overflow: 'hidden' },
  listRow: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 86, paddingHorizontal: 16, paddingVertical: 12 },
  listCopy: { flex: 1, gap: 2 },
  chevron: { fontSize: 26 },
});
