import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { Recipe } from '@/lib/api';
import { recipeCoverLabel } from './recipe-presentation';

export function RecipeCover({ recipe, size = 'card' }: { recipe: Pick<Recipe, 'name' | 'cover_kind' | 'cover_emoji'>; size?: 'card' | 'row' | 'hero' }) {
  const theme = useTheme();
  const label = recipeCoverLabel(recipe);
  const isEmoji = recipe.cover_kind === 'emoji' && Boolean(recipe.cover_emoji);
  return (
    <View style={[
      styles.cover,
      size === 'card' && styles.card,
      size === 'row' && styles.row,
      size === 'hero' && styles.hero,
      { backgroundColor: theme.surfaceSelected },
    ]}>
      <ThemedText accessibilityLabel={isEmoji ? `Recipe cover ${label}` : `Recipe initials ${label}`} adjustsFontSizeToFit minimumFontScale={0.75} style={[
        styles.label,
        size === 'card' && styles.cardLabel,
        size === 'row' && styles.rowLabel,
        size === 'hero' && styles.heroLabel,
        isEmoji && size === 'card' && styles.cardEmoji,
        isEmoji && size === 'row' && styles.rowEmoji,
        isEmoji && size === 'hero' && styles.heroEmoji,
        { color: theme.primary },
      ]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  card: { aspectRatio: 1.2, borderTopLeftRadius: 15, borderTopRightRadius: 15, width: '100%' },
  row: { borderRadius: 13, height: 58, width: 58 },
  hero: { borderRadius: 28, height: 144, width: 144 },
  label: { fontWeight: '600', textAlign: 'center' },
  cardLabel: { fontSize: 34, letterSpacing: 4, lineHeight: 44 },
  rowLabel: { fontSize: 18, letterSpacing: 1, lineHeight: 24 },
  heroLabel: { fontSize: 48, letterSpacing: 6, lineHeight: 60 },
  cardEmoji: { fontSize: 48, letterSpacing: 0, lineHeight: 58 },
  rowEmoji: { fontSize: 28, letterSpacing: 0, lineHeight: 34 },
  heroEmoji: { fontSize: 72, letterSpacing: 0, lineHeight: 84 },
});
