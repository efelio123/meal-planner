import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareSheet } from '@/components/keyboard-aware-sheet';
import { PrimaryButton } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { visualStyles } from '@/components/visual-roles';
import { ShoppingItemDetailsSheet } from '@/features/shopping-list/shopping-sheets';
import { useShoppingList } from '@/features/shopping-list/use-shopping-list';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type ShoppingListItem } from '@/lib/api';

// Resolve the exact matched Shopping row before initializing the shared draft.
// Retained/nested screens must not reinitialize that draft on every reveal.
export function ReviewShoppingItemSheet({ itemId }: { itemId: string }) {
  const { getToken, selectedHousehold } = useHouseholdState();
  const { userId, sessionId } = useAuth();
  const { remove } = useShoppingList();
  const router = useRouter();
  const theme = useTheme();
  const householdId = selectedHousehold?.id;
  const scope = JSON.stringify([userId, sessionId, householdId, itemId]);
  const [initialScope] = useState(scope);
  const scopeRef = useRef(scope);
  const token = useRef(getToken);
  const loaded = useRef(false);
  const [item, setItem] = useState<ShoppingListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => { scopeRef.current = scope; token.current = getToken; }, [getToken, scope]);
  useEffect(() => {
    if (loaded.current || !householdId || scope !== initialScope) return;
    let active = true;
    setError(null);
    void api.shoppingListItem(() => token.current(), householdId, itemId).then((result) => {
      if (!active || scopeRef.current !== scope) return;
      if (!result.item.catalog_item_id) { setError('This Shopping item has no Catalog link and cannot be edited here.'); return; }
      loaded.current = true; setItem(result.item);
    }).catch((reason) => {
      if (active && scopeRef.current === scope) setError(reason instanceof ApiError && reason.status === 404 ? 'This item is no longer on Shopping. Close this editor to refresh your review.' : 'We couldn’t load this Shopping item. Please retry.');
    });
    return () => { active = false; };
  }, [attempt, householdId, initialScope, itemId, scope]);
  if (scope === initialScope && item?.catalog_item_id) return <ShoppingItemDetailsSheet routeBase="plan" existingItem={item} catalogItem={{
    id: item.catalog_item_id, item_type: item.catalog_item_type ?? 'food', name: item.name,
    category_name: item.category_name ?? null, shopping_unit_code: item.catalog_preferred_shopping_unit_code ?? null,
    custom_shopping_unit_id: item.catalog_preferred_custom_shopping_unit_id ?? null,
    preferred_store_id: item.catalog_preferred_store_id ?? null, archived: item.catalog_item_archived ?? false,
  }} onChanged={() => undefined} onRemove={remove} />;
  return <KeyboardAwareSheet style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <View style={styles.header}><ThemedText style={visualStyles.sheetTitle} accessibilityRole="header">Edit item</ThemedText><Pressable accessibilityRole="button" accessibilityLabel="Cancel Shopping edit" onPress={() => router.back()} style={visualStyles.sheetAction}><ThemedText themeColor="link">Cancel</ThemedText></Pressable></View>
    <View style={styles.message}>
      {scope !== initialScope ? <ThemedText accessibilityRole="alert">Your household or sign-in changed. Close this editor.</ThemedText> : error ? <><ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText><PrimaryButton title="Retry loading Shopping item" onPress={() => setAttempt((value) => value + 1)} /></> : <ActivityIndicator accessibilityLabel="Loading Shopping item" color={theme.activity} />}
    </View>
  </KeyboardAwareSheet>;
}
const styles = StyleSheet.create({ sheet: { flex: 1 }, header: { padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, message: { padding: 24, gap: 16 } });
