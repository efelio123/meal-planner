import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const trialFoods = ['Milk', 'Chicken', 'Rice'];

/** Temporary dev-only entry for verifying stacked native form sheets on a phone. */
export function RecipeSheetPrototypeFood() {
  const router = useRouter();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const visibleFoods = trialFoods.filter((food) => food.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      style={[styles.screen, { backgroundColor: theme.elevatedSurface }]}
      testID="recipe-native-food-prototype"
    >
      <View style={styles.header}>
        <ThemedText accessibilityRole="header" style={styles.title}>Food selection</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.headerAction}>
          <ThemedText themeColor="link">Close trial</ThemedText>
        </Pressable>
      </View>
      <ThemedText themeColor="textSecondary">Gesture test only. These sample foods do not change your recipe.</ThemedText>
      <ThemedInput accessibilityLabel="Prototype Food search" onChangeText={setSearch} placeholder="Search Food" value={search} />
      <View style={[styles.list, { backgroundColor: theme.screen }]}>
        {visibleFoods.map((food, index) => (
          <Pressable
            accessibilityLabel={`Open ${food} prototype details`}
            accessibilityRole="button"
            key={food}
            onPress={() => {
              Keyboard.dismiss();
              router.push({ pathname: '/recipes/sheet-prototype/details', params: { food } } as never);
            }}
            style={[styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <ThemedText>{food}</ThemedText>
            <ThemedText themeColor="textSecondary">›</ThemedText>
          </Pressable>
        ))}
        {visibleFoods.length === 0 ? <ThemedText style={styles.empty}>No matching sample foods.</ThemedText> : null}
      </View>
      <ThemedText themeColor="textSecondary">Try pulling the top edge up and down, then choose a food.</ThemedText>
    </ScrollView>
  );
}

export function RecipeSheetPrototypeDetails() {
  const router = useRouter();
  const theme = useTheme();
  const { food } = useLocalSearchParams<{ food?: string }>();
  const foodName = typeof food === 'string' && trialFoods.includes(food) ? food : 'Sample food';
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      style={[styles.screen, { backgroundColor: theme.elevatedSurface }]}
      testID="recipe-native-details-prototype"
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); router.back(); }} style={styles.headerAction}>
          <ThemedText themeColor="link">Back</ThemedText>
        </Pressable>
        <ThemedText accessibilityRole="header" style={styles.title}>Ingredient details</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); router.dismiss(2); }} style={styles.headerAction}>
          <ThemedText themeColor="link">Cancel</ThemedText>
        </Pressable>
      </View>
      <ThemedText themeColor="textSecondary">Gesture test only. Nothing entered here will be saved.</ThemedText>
      <View style={[styles.foodCard, { backgroundColor: theme.screen }]}><ThemedText style={styles.foodName}>{foodName}</ThemedText></View>
      <ThemedText>Amount</ThemedText>
      <ThemedInput accessibilityLabel="Prototype ingredient amount" keyboardType="decimal-pad" onChangeText={setAmount} placeholder="e.g. 2" value={amount} />
      <ThemedText>Note</ThemedText>
      <ThemedInput accessibilityLabel="Prototype ingredient note" onChangeText={setNote} placeholder="Try opening the keyboard" value={note} />
      <ThemedText themeColor="textSecondary">Drag the top edge slowly, flick down to return to Food, and repeat with the keyboard open.</ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 16, paddingBottom: 32, paddingHorizontal: 22, paddingTop: 28 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  title: { fontSize: 22, fontWeight: '700' },
  headerAction: { justifyContent: 'center', minHeight: 44, minWidth: 48 },
  list: { borderRadius: 16, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 16 },
  empty: { padding: 16 },
  foodCard: { borderRadius: 16, padding: 18 },
  foodName: { fontWeight: '700' },
});
