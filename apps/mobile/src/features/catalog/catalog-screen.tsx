import { Link, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from './use-catalog';

type Filter = 'all' | 'food' | 'household';

export function CatalogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sessionId, userId } = useAuth();
  const { error, householdId, items, loading, refresh, refreshing } = useCatalog();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const stateScope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}`;
  const previousScope = useRef(stateScope);
  useLayoutEffect(() => {
    if (previousScope.current === stateScope) return;
    previousScope.current = stateScope;
    setFilter('all');
    setSearch('');
  }, [stateScope]);
  const visible = useMemo(() => items
    .filter((item) => filter === 'all' || item.item_type === filter)
    .filter((item) => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .slice().sort((left, right) => (left.category_name ?? 'Uncategorized').localeCompare(right.category_name ?? 'Uncategorized') || left.name.localeCompare(right.name)), [filter, items, search]);
  const sections = useMemo(() => (['food', 'household'] as const)
    .filter((itemType) => filter === 'all' || itemType === filter)
    .map((itemType) => {
      const typeItems = visible.filter((item) => item.item_type === itemType);
      return {
        itemType,
        items: typeItems,
      };
    }).filter((section) => section.items.length > 0), [filter, visible]);

  return (
    <Screen contentAlignment="top" nativeTabScreen safeAreaEdges={['top', 'left', 'right']} onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText accessibilityRole="header" style={styles.title}>Catalog</ThemedText>
          <View style={styles.titleActions}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/(tabs)/catalog/manage' as never)} style={styles.manageAction}>
              <ThemedText themeColor="link" style={styles.manageText}>Manage</ThemedText>
            </Pressable>
            <Pressable accessibilityLabel="Add catalog item" accessibilityRole="button" onPress={() => router.push('/(app)/(tabs)/catalog/add')} style={[styles.add, { backgroundColor: theme.primary }]}>
              <ThemedText style={{ color: theme.primaryText, fontSize: 24 }}>＋</ThemedText>
            </Pressable>
          </View>
        </View>
        <ThemedInput accessibilityLabel="Search household items" onChangeText={setSearch} placeholder="Search household items" value={search} />
        <View style={styles.filters}>
          {(['all', 'food', 'household'] as const).map((value) => (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, { backgroundColor: filter === value ? theme.primary : theme.surfaceSelected }]}>
              <ThemedText style={{ color: filter === value ? theme.primaryText : theme.text }}>{value === 'all' ? 'All' : value === 'food' ? 'Food' : 'Household'}</ThemedText>
            </Pressable>
          ))}
        </View>
        {loading && items.length === 0 ? <ActivityIndicator accessibilityLabel="Loading catalog" color={theme.activity} /> : null}
        {error ? (
          <View style={styles.message}>
            <ThemedText accessibilityRole="alert" themeColor="error">{items.length ? `Catalog may be out of date. ${error}` : error}</ThemedText>
            <PrimaryButton onPress={() => void refresh()} title="Try again" />
          </View>
        ) : null}
        {!loading && !error && visible.length === 0 ? <ThemedText themeColor="textSecondary">{search.trim() ? 'No items match your search.' : filter === 'food' && items.some((item) => item.item_type === 'household') ? 'Your household has no Food items yet.' : filter === 'household' && items.some((item) => item.item_type === 'food') ? 'Your household has no Household items yet.' : 'Your catalog is empty. Add items your household uses.'}</ThemedText> : null}
        {sections.map((section) => (
          <View key={section.itemType} style={styles.typeSection}>
            {filter === 'all' ? (
              <View style={styles.groupHeading}>
                <ThemedText accessibilityRole="header" style={styles.groupTitle}>{section.itemType === 'food' ? 'Food' : 'Household'}</ThemedText>
              </View>
            ) : null}
            <View style={[styles.card, { borderColor: theme.surfaceSelected, backgroundColor: theme.surface }]}>
                  {section.items.map((item, index) => (
                    <Link key={item.id} href={`/(app)/(tabs)/catalog/item/${item.id}` as never} asChild>
                      <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }])}>
                        <View style={styles.rowContent}>
                          <ThemedText style={styles.itemName}>{item.name}</ThemedText>
                          <ThemedText themeColor="textSecondary">{item.category_name ?? 'Uncategorized'}{item.shopping_unit_label ? ` · ${item.shopping_unit_label}` : ''}</ThemedText>
                        </View>
                        <ThemedText accessibilityElementsHidden importantForAccessibility="no" themeColor="textSecondary">›</ThemedText>
                      </Pressable>
                    </Link>
                  ))}
            </View>
          </View>
        ))}
        {refreshing ? <ThemedText themeColor="textSecondary">Refreshing…</ThemedText> : null}
        {Platform.OS === 'web' ? <PrimaryButton onPress={() => void refresh()} title="Refresh" /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 30, fontWeight: '700', lineHeight: 36 },
  titleActions: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  manageAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  manageText: { fontSize: 16, fontWeight: '600' },
  add: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  message: { gap: 8 },
  typeSection: { gap: 16 },
  groupHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  groupTitle: { fontSize: 18, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 70, paddingHorizontal: 18, paddingVertical: 12 },
  rowContent: { flex: 1, gap: 2 },
  itemName: { fontWeight: '700' },
});
