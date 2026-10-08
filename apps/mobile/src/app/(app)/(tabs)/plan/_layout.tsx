import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { recipeSheetOptions } from '@/features/native-sheets/recipe-sheet-options';
import { useTheme } from '@/hooks/use-theme';

export default function PlanStackLayout() {
  const theme = useTheme();
  return <Stack screenOptions={{
    headerStyle: { backgroundColor: theme.surface },
    headerTintColor: theme.text,
    headerTitleStyle: { color: theme.text },
    contentStyle: { backgroundColor: theme.screen },
    headerBackButtonDisplayMode: 'minimal',
  }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="shopping-review" options={{ title: 'Shopping needs' }} />
    <Stack.Screen name="recipe-create" options={{ title: 'New recipe' }} />
    <Stack.Screen name="catalog-food" options={{ title: 'Create Food item' }} />
    <Stack.Screen name="sheet/add" options={{ ...recipeSheetOptions([0.62, 0.96], theme.elevatedSurface, Platform.OS), sheetInitialDetentIndex: 'last' }} />
    <Stack.Screen name="sheet/edit" options={{ ...recipeSheetOptions([0.62, 0.96], theme.elevatedSurface, Platform.OS), sheetInitialDetentIndex: 'last' }} />
    <Stack.Screen name="sheet/day" options={recipeSheetOptions([0.45, 0.8], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/food" options={recipeSheetOptions([0.58, 0.94], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/details" options={recipeSheetOptions([0.52, 0.92], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/cover" options={recipeSheetOptions([0.48, 0.76], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/emoji" options={recipeSheetOptions([0.46, 0.78], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/unit" options={recipeSheetOptions([0.58, 0.94], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/shopping-amount" options={recipeSheetOptions([0.52, 0.92], theme.elevatedSurface, Platform.OS)} />
  </Stack>;
}
