import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { CatalogChoiceKind } from './catalog-context';

type ManagementRow = {
  kind: CatalogChoiceKind;
  title: string;
  subtitle: string;
  icon: SymbolViewProps['name'];
};

const rows: ManagementRow[] = [
  { kind: 'category', title: 'Categories', subtitle: 'Food and Household', icon: { ios: 'tag', android: 'sell', web: 'sell' } },
  { kind: 'store', title: 'Stores', subtitle: 'Preferred shopping stores', icon: { ios: 'storefront', android: 'storefront', web: 'storefront' } },
  { kind: 'shopping-unit', title: 'Shopping units', subtitle: 'Your custom units', icon: { ios: 'scalemass', android: 'scale', web: 'scale' } },
];

export function CatalogManagementHome() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={styles.content}>
        <View style={styles.options}>
          {rows.map((row) => (
            <View key={row.kind} testID={`catalog-management-card-${row.kind}`} style={[styles.card, { backgroundColor: theme.surface }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/(app)/(tabs)/catalog/choices/${row.kind}` as never)}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: theme.surfaceSelected },
              ]}
            >
              <View style={[styles.iconSurface, { backgroundColor: theme.surfaceSelected }]}>
                <SymbolView
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  name={row.icon}
                  size={24}
                  tintColor={theme.link}
                />
              </View>
              <View style={styles.copy}>
                <ThemedText style={styles.rowTitle}>{row.title}</ThemedText>
                <ThemedText themeColor="textSecondary">{row.subtitle}</ThemedText>
              </View>
              <SymbolView
                accessibilityElementsHidden
                importantForAccessibility="no"
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={20}
                tintColor={theme.textSecondary}
              />
            </Pressable>
            </View>
          ))}
        </View>
        <ThemedText themeColor="textSecondary" style={styles.footer}>Shared with everyone in this household</ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20 },
  options: { gap: 18 },
  card: { borderRadius: 18, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 16, minHeight: 96, paddingHorizontal: 16, paddingVertical: 16 },
  iconSurface: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  copy: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 18, fontWeight: '700' },
  footer: { paddingHorizontal: 12 },
});
