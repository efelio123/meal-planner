import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type CatalogItem, type GetToken } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';
import { useCatalogContext } from './catalog-context';

export function CatalogItemDetail() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { getToken, selectedHousehold } = useHouseholdState();
  const { sessionId, userId } = useAuth();
  const { changeKind, markChanged, revision } = useCatalogContext();
  const householdId = selectedHousehold?.id ?? null;
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${itemId}`;
  const scopeRef = useRef(scope);
  const appliedRevision = useRef(revision);
  useLayoutEffect(() => { scopeRef.current = scope; }, [scope]);
  const latestGetToken = useRef<GetToken>(getToken);
  const generation = useRef(0);
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [categoryEmoji, setCategoryEmoji] = useState<string | null>(null);
  const [itemScope, setItemScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const editAction = useCallback(() => (
    <Pressable accessibilityRole="button" accessibilityLabel="Edit item" onPress={() => {
      if (item) router.push(`/(app)/(tabs)/catalog/item/${item.id}/edit` as never);
    }} hitSlop={10}>
      <ThemedText themeColor="link" style={styles.headerAction}>Edit</ThemedText>
    </Pressable>
  ), [item, router]);
  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Item details', headerRight: Platform.OS === 'ios' || !item || itemScope !== scope ? undefined : editAction });
  }, [editAction, item, itemScope, navigation, scope]);
  const loadItem = useCallback(async () => {
    if (!householdId) return;
    const requestGeneration = ++generation.current;
    const requestScope = scope;
    setLoading(true);
    setError(null);
    try {
      const { item: next } = await api.catalogItem(() => latestGetToken.current(), householdId, itemId);
      if (generation.current === requestGeneration && scopeRef.current === requestScope) {
        setItem(next);
        setItemScope(requestScope);
        setCategoryEmoji(null);
        if (next.category_id) {
          try {
            const categories = await api.catalogCategories(() => latestGetToken.current(), householdId);
            if (generation.current === requestGeneration && scopeRef.current === requestScope) {
              setCategoryEmoji(categories.categories.find((category) => category.id === next.category_id)?.emoji ?? null);
            }
          } catch {
            // Item details remain usable if only the optional category decoration cannot load.
          }
        }
      }
    } catch (reason) {
      if (generation.current === requestGeneration && scopeRef.current === requestScope) {
        setError(reason instanceof ApiError ? reason.message : 'We couldn’t load this item. Please try again.');
      }
    } finally {
      if (generation.current === requestGeneration && scopeRef.current === requestScope) setLoading(false);
    }
  }, [householdId, itemId, scope]);
  useEffect(() => {
    const timer = setTimeout(() => { void loadItem(); }, 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [loadItem]);
  useEffect(() => {
    if (appliedRevision.current === revision) return;
    appliedRevision.current = revision;
    if (changeKind !== 'items' && changeKind !== 'all') return;
    const timer = setTimeout(() => { void loadItem(); }, 0);
    return () => clearTimeout(timer);
  }, [changeKind, loadItem, revision]);

  const remove = async () => {
    if (!householdId) return;
    const startedScope = scopeRef.current;
    const startedGeneration = generation.current;
    setRemoving(true);
    setError(null);
    try {
      await api.deleteCatalogItem(() => latestGetToken.current(), householdId, itemId);
      if (generation.current !== startedGeneration || scopeRef.current !== startedScope) return;
      markChanged('items');
      setConfirming(false);
      router.back();
    } catch (reason) {
      if (generation.current === startedGeneration && scopeRef.current === startedScope) setError(reason instanceof ApiError ? reason.message : 'We couldn’t remove this item. Please try again.');
    } finally { if (generation.current === startedGeneration && scopeRef.current === startedScope) setRemoving(false); }
  };

  return (
    <>
    <Stack.Screen options={{ title: 'Item details' }} />
    {Platform.OS === 'ios' && itemScope === scope && item ? <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button accessibilityLabel="Edit item" hidesSharedBackground onPress={() => router.push(`/(app)/(tabs)/catalog/item/${item.id}/edit` as never)} tintColor={theme.link} variant="plain">Edit</Stack.Toolbar.Button>
    </Stack.Toolbar> : null}
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={styles.content}>
        {householdId && loading ? <ActivityIndicator accessibilityLabel="Loading catalog item" color={theme.activity} /> : null}
        {householdId && itemScope === scope && item?.household_id === householdId ? <>
          <View style={styles.hero}>
            <View style={[styles.initial, { backgroundColor: theme.surfaceSelected }]}><ThemedText style={styles.initialText}>{item.name.slice(0, 1).toLocaleUpperCase()}</ThemedText></View>
            <ThemedText accessibilityRole="header" style={styles.title}>{item.name}</ThemedText>
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: theme.surfaceSelected }]}><ThemedText>{item.item_type === 'food' ? 'Food' : 'Household'}</ThemedText></View>
              <View style={[styles.badge, { backgroundColor: theme.surfaceSelected }]}><ThemedText>{categoryEmoji ? `${categoryEmoji} ` : ''}{item.category_name ?? 'Uncategorized'}</ThemedText></View>
            </View>
          </View>
          <View style={styles.detailsSection}>
            <ThemedText accessibilityRole="header" style={styles.sectionTitle}>Shopping preferences</ThemedText>
            <View style={[styles.detailCard, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}>
              <DetailRow label="Typical shopping unit" value={item.shopping_unit_label ?? 'Not set'} />
              <DetailRow label="Preferred store" value={item.preferred_store_name ?? 'Not set'} last />
            </View>
          </View>
          {item.item_type === 'food' ? <View style={styles.detailsSection}>
            <ThemedText accessibilityRole="header" style={styles.sectionTitle}>Recipe measurement</ThemedText>
            <View style={[styles.detailCard, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}>
              <DetailRow label="Base unit" value={item.recipe_measurement_unit_label ?? 'Not set'} last />
            </View>
          </View> : null}
          <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={styles.removeAction}>
            <ThemedText themeColor="error" style={styles.removeText}>Remove item</ThemedText>
          </Pressable>
        </> : null}
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
        {error && !loading ? <PrimaryButton onPress={() => void loadItem()} title="Retry loading item" /> : null}
      </View>
      <Modal transparent animationType="fade" onRequestClose={() => setConfirming(false)} visible={confirming}>
        <View style={styles.overlay}>
          <View style={[styles.confirm, { backgroundColor: theme.surface }]}>
            <ThemedText accessibilityRole="header" style={styles.confirmTitle}>Remove item?</ThemedText>
            <ThemedText>This item will no longer appear in your household’s active catalog.</ThemedText>
            {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: removing }} disabled={removing} onPress={() => void remove()} style={[styles.confirmRemove, { backgroundColor: theme.errorSurface, borderColor: theme.error }]}><ThemedText themeColor="error" style={styles.removeText}>{removing ? 'Removing…' : 'Remove item'}</ThemedText></Pressable>
            <Pressable accessibilityRole="button" disabled={removing} onPress={() => setConfirming(false)} style={styles.cancel}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
    </>
  );
}

export function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const theme = useTheme();
  return <View testID="catalog-detail-row" style={[styles.detailRow, !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}><ThemedText themeColor="textSecondary">{label}</ThemedText><ThemedText style={styles.detailValue}>{value}</ThemedText></View>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 34, textAlign: 'center' },
  hero: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  initial: { alignItems: 'center', borderRadius: 25, height: 76, justifyContent: 'center', width: 76 },
  initialText: { fontSize: 30, fontWeight: '700', lineHeight: 38 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  badge: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 },
  detailsSection: { gap: 8 },
  sectionTitle: { fontSize: 19, fontWeight: '700', paddingHorizontal: 2 },
  detailCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between', minHeight: 54, paddingHorizontal: 16, paddingVertical: 12 },
  detailValue: { flexShrink: 1, fontSize: 16, fontWeight: '600', textAlign: 'right' },
  removeAction: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', minHeight: 50, marginTop: 4 },
  removeText: { fontWeight: '600' },
  headerAction: { fontWeight: '600' },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'center', padding: 24 },
  confirm: { borderRadius: 16, gap: 16, maxWidth: 440, padding: 24, width: '100%' },
  confirmTitle: { fontSize: 22, fontWeight: '700' },
  confirmRemove: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 48 },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
