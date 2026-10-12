import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { DisclosureChevron } from '@/components/visual-roles';
import { useTheme } from '@/hooks/use-theme';

type ProfileNavigationRowProps = {
  accessibilityLabel?: string;
  icon?: SymbolViewProps['name'];
  onPress: () => void;
  subtitle?: string;
  title: string;
  variant?: 'card' | 'plain';
};

export function ProfileNavigationRow({ accessibilityLabel, icon, onPress, subtitle, title, variant = 'card' }: ProfileNavigationRowProps) {
  const theme = useTheme();
  const isPlain = variant === 'plain';
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isPlain && styles.plainRow,
        { backgroundColor: pressed ? theme.surfaceSelected : isPlain ? 'transparent' : theme.surface, borderColor: theme.border },
      ]}
    >
      {icon ? (
        <SymbolView
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={icon}
          size={22}
          testID={`profile-row-icon-${title.toLowerCase().replace(/\s+/gu, '-')}`}
          tintColor={theme.textSecondary}
        />
      ) : null}
      <View style={styles.copy}>
        <ThemedText numberOfLines={isPlain ? 1 : undefined} style={styles.title}>{title}</ThemedText>
        {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
      </View>
      <DisclosureChevron testID={`profile-row-chevron-${title.toLowerCase().replace(/\s+/gu, '-')}`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: 16, paddingVertical: 12 },
  plainRow: { borderRadius: 8, borderWidth: 0, gap: 14, minHeight: 56, paddingHorizontal: 0, paddingVertical: 8 },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 17, fontWeight: '600' },
});
