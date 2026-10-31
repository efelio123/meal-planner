import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { MealPlanEntry } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';
import { RecipeCover } from '@/features/recipes/recipe-cover';
import { mealType } from './meal-entry';

type CoverEntry = Pick<MealPlanEntry, 'entry_type' | 'recipe_name' | 'cover_kind' | 'cover_emoji'>;
export function MealEntryCover({ entry }: { entry: CoverEntry }) {
  const theme = useTheme();
  const kind = mealType(entry);
  if (kind === 'recipe') return <RecipeCover recipe={{ name: entry.recipe_name ?? 'Recipe', cover_kind: entry.cover_kind ?? 'initials', cover_emoji: entry.cover_emoji ?? null }} size="row" />;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.cover, { backgroundColor: theme.surfaceSelected }]}>
    <SymbolView name={kind === 'leftovers' ? { ios: 'arrow.clockwise', android: 'replay', web: 'replay' } : { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }} size={26} tintColor={theme.primary} />
  </View>;
}
const styles = StyleSheet.create({ cover: { width: 58, height: 58, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
