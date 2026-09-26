import { useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { ThemedText } from '@/components/themed-text';
import { useShoppingList } from '@/hooks/use-shopping-list';
import { useTheme } from '@/hooks/use-theme';

export default function HouseholdHome() {
  const theme = useTheme();
  const { add, error, householdId, items, loading, pendingItemIds, refresh, remove, toggle } = useShoppingList();
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
    <Screen>
      <View style={styles.content}>
        <ThemedText style={styles.title}>Shopping list</ThemedText>
        <ThemedInput
          accessibilityLabel="Shopping-list item"
          onChangeText={(value) => updateForm({ name: value })}
          placeholder="Add an item"
          value={form.name}
        />
        <PrimaryButton onPress={() => void addItem()} title="Add item" />
        {form.actionError ? (
          <ThemedText accessibilityRole="alert" themeColor="error">
            {form.actionError}
          </ThemedText>
        ) : null}
        {loading ? <ActivityIndicator accessibilityLabel="Loading shopping list" color={theme.activity} /> : null}
        {error ? (
          <View style={styles.message}>
            <ThemedText accessibilityRole="alert" themeColor="error">
              {error}
            </ThemedText>
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
                  <ThemedText style={item.is_checked ? styles.checked : undefined}>{item.name}</ThemedText>
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
        <SignOutAction />
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
  indicator: { fontSize: 20, fontWeight: '700', marginRight: 8 },
  checked: { textDecorationLine: 'line-through' },
});
