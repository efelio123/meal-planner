import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { recipeSheetOptions } from '@/features/native-sheets/recipe-sheet-options';
import { useTheme } from '@/hooks/use-theme';

export default function RecipesStackLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.surface },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      contentStyle: { backgroundColor: theme.screen },
      headerBackButtonDisplayMode: 'minimal',
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="create" options={{ title: 'New recipe' }} />
      <Stack.Screen name="sheet/food" options={recipeSheetOptions([0.58, 0.94], theme.elevatedSurface, Platform.OS)} />
      <Stack.Screen name="sheet/details" options={recipeSheetOptions([0.52, 0.92], theme.elevatedSurface, Platform.OS)} />
      <Stack.Screen name="sheet/unit" options={recipeSheetOptions([0.58, 0.94], theme.elevatedSurface, Platform.OS)} />
      <Stack.Screen name="sheet/cover" options={recipeSheetOptions([0.48, 0.76], theme.elevatedSurface, Platform.OS)} />
      <Stack.Screen name="sheet/emoji" options={recipeSheetOptions([0.46, 0.78], theme.elevatedSurface, Platform.OS)} />
      <Stack.Screen name="catalog-food" options={{ title: 'Create Food item' }} />
      <Stack.Screen name="catalog-choices/[kind]/index" options={{ title: 'Catalog choices' }} />
      <Stack.Screen name="catalog-choices/[kind]/create" options={{ title: 'Create choice' }} />
      <Stack.Screen name="catalog-choices/[kind]/[choiceId]" options={{ title: 'Edit choice' }} />
      <Stack.Screen name="[recipeId]/index" options={{ title: 'Recipe' }} />
      <Stack.Screen name="[recipeId]/edit" options={{ title: 'Edit recipe' }} />
    </Stack>
  );
}
