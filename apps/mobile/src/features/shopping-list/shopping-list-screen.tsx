import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useShoppingList } from '@/features/shopping-list/use-shopping-list';
import { useTheme } from '@/hooks/use-theme';
import { useMealPlanContextOptional } from '@/features/meal-plan/meal-plan-context';

export default function HouseholdHome() {
  const theme = useTheme();
  const mealPlanContext = useMealPlanContextOptional();
  const { add, error, householdId, items, loading, pendingItemIds, refresh, remove, toggle } = useShoppingList();
  const shoppingRevision = householdId ? mealPlanContext?.shoppingRevisionForHousehold(householdId) ?? 0 : 0;
  const previousShoppingRevision = useRef({ householdId, revision: shoppingRevision });
  const [formState, setFormState] = useState({
    householdId: null as string | null,
    name: '',
    actionError: null as string | null,
  });
  const form = formState.householdId === householdId
    ? formState
    : { householdId, name: '', actionError: null };
  const actionVersion = useRef(0);

  useLayoutEffect(() => {
    actionVersion.current += 1;
  }, [householdId]);

  useEffect(() => {
    const previous = previousShoppingRevision.current;
    previousShoppingRevision.current = { householdId, revision: shoppingRevision };
    // A household change already triggers useShoppingList's authoritative
    // initial load. Do not duplicate it because revisions are household-local.
    if (previous.householdId !== householdId || previous.revision === shoppingRevision) return;
    void refresh();
  }, [householdId, refresh, shoppingRevision]);

  const updateForm = (updates: Partial<typeof formState>) => {
    setFormState((current) => ({
      ...(current.householdId === householdId ? current : { householdId, name: '', actionError: null }),
      ...updates,
    }));
  };

  const finishSuccessfulAdd = (startedHouseholdId: string, submittedName: string) => {
    setFormState((current) => current.householdId === startedHouseholdId
      ? { ...current, name: current.name === submittedName ? '' : current.name, actionError: null }
      : current);
  };

  const isCurrentAction = (startedHouseholdId: string | null, startedVersion: number) =>
    startedHouseholdId === householdId && startedVersion === actionVersion.current;

  const addItem = async () => {
    const startedHouseholdId = householdId;
    const startedVersion = actionVersion.current;
    if (!startedHouseholdId) return;
    const submittedName = form.name;
    if (!submittedName.trim()) {
      updateForm({ actionError: 'Enter an item to add.' });
      return;
    }

    try {
      await add(submittedName);
      if (isCurrentAction(startedHouseholdId, startedVersion)) {
        finishSuccessfulAdd(startedHouseholdId, submittedName);
      }
    } catch {
      if (isCurrentAction(startedHouseholdId, startedVersion)) {
        updateForm({ actionError: 'We couldn’t add that item. Please try again.' });
      }
    }
  };

  const toggleItem = async (item: (typeof items)[number]) => {
    const startedHouseholdId = householdId;
    const startedVersion = actionVersion.current;
    try {
      await toggle(item);
      if (isCurrentAction(startedHouseholdId, startedVersion)) updateForm({ actionError: null });
    } catch (reason) {
      if (isCurrentAction(startedHouseholdId, startedVersion)) {
        updateForm({ actionError: reason instanceof Error ? reason.message : 'We couldn’t update that item.' });
      }
    }
  };

  const removeItem = async (item: (typeof items)[number]) => {
    const startedHouseholdId = householdId;
    const startedVersion = actionVersion.current;
    try {
      await remove(item);
      if (isCurrentAction(startedHouseholdId, startedVersion)) updateForm({ actionError: null });
    } catch {
      if (isCurrentAction(startedHouseholdId, startedVersion)) {
        updateForm({ actionError: 'We couldn’t remove that item. Please try again.' });
      }
    }
  };

  return (
    <Screen contentAlignment="top" nativeTabScreen safeAreaEdges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" style={styles.title}>Shopping list</ThemedText>
        <ThemedInput
          accessibilityLabel="Shopping-list item"
          onChangeText={(value) => updateForm({ name: value })}
          placeholder="Add an item"
          value={form.name}
        />
        <PrimaryButton onPress={() => void addItem()} title="Add item" />
        {form.actionError ? (
          <ThemedText accessibilityRole="alert" themeColor="error">{form.actionError}</ThemedText>
        ) : null}
        {loading ? <ActivityIndicator accessibilityLabel="Loading shopping list" color={theme.activity} /> : null}
        {error ? (
          <View style={styles.message}>
            <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText>
            <PrimaryButton onPress={() => void refresh()} title="Try again" />
          </View>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <ThemedText themeColor="textSecondary">Your shopping list is empty.</ThemedText>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <View style={styles.items}>
            {items.map((item) => {
              const isPending = pendingItemIds.has(item.id);
              return (
                <View key={item.id} style={[styles.item, { borderColor: theme.border }]}>
                  <Pressable
                    accessibilityLabel={`Mark ${item.name} ${item.is_checked ? 'not purchased' : 'purchased'}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.is_checked, disabled: isPending }}
                    disabled={isPending}
                    onPress={() => void toggleItem(item)}
                    style={styles.itemName}
                  >
                    <ThemedText accessible={false} style={[styles.indicator, { color: theme.primary }]}>
                      {item.is_checked ? '✓' : '○'}
                    </ThemedText>
                    <View style={styles.nameAndAmount}>
                      <ThemedText style={item.is_checked ? styles.checked : undefined}>{item.name}</ThemedText>
                      {item.meal_plan_source ? <ThemedText themeColor="textSecondary" style={styles.amount}>{item.amount ? `${item.amount}${item.recipe_unit_label || item.custom_unit_label ? ` ${item.recipe_unit_label ?? item.custom_unit_label}` : ''}` : 'Amount not specified'}</ThemedText> : null}
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Remove ${item.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isPending }}
                    disabled={isPending}
                    onPress={() => void removeItem(item)}
                  >
                    <ThemedText themeColor="error">Remove</ThemedText>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
        <PrimaryButton onPress={() => void refresh()} title="Refresh" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700', lineHeight: 34 },
  message: { gap: 8 },
  items: { gap: 8 },
  item: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  itemName: { alignItems: 'center', flex: 1, flexDirection: 'row' },
  nameAndAmount: { flex: 1, gap: 2 },
  amount: { fontSize: 13 },
  indicator: { fontSize: 20, fontWeight: '700', marginRight: 8 },
  checked: { textDecorationLine: 'line-through' },
});
