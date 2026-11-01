import { AppBackButton } from '@/components/app-back-button';
import { Stack, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { recipeSheetOptions } from '@/features/native-sheets/recipe-sheet-options';
import { nativeSheetRouteOptions } from '@/features/native-sheets/native-sheet-route-options';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useTheme } from '@/hooks/use-theme';

export default function PlanStackLayout() {
  const theme = useTheme();
  const router = useRouter();
  const shoppingModalOptions = { presentation: 'fullScreenModal' as const, headerLeft: () => <AppBackButton accessibilityLabel="Back" onPress={() => router.back()} /> };
  const { get } = useNativeSheetFlow();
  return <Stack screenOptions={{
    headerStyle: { backgroundColor: theme.surface },
    headerTintColor: theme.text,
    headerTitleStyle: { color: theme.text },
    contentStyle: { backgroundColor: theme.screen },
    headerBackButtonDisplayMode: 'minimal',
  }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="shopping-review" options={{ title: 'Shopping needs' }} />
    <Stack.Screen name="sheet/shopping-item" options={{ ...recipeSheetOptions([0.68, 0.94], theme.elevatedSurface, Platform.OS), sheetInitialDetentIndex: 'last' }} />
    <Stack.Screen name="sheet/shopping-choice" options={({ route }) => {
      const sheetId = (route.params as { sheetId?: string } | undefined)?.sheetId;
      return nativeSheetRouteOptions(sheetId ? get(sheetId) : null, theme.elevatedSurface, Platform.OS);
    }} />
    <Stack.Screen name="catalog-item/[itemId]" options={{ ...shoppingModalOptions, title: 'Edit Catalog item' }} />
    <Stack.Screen name="shopping-choices/[kind]/index" options={{ ...shoppingModalOptions, title: 'Catalog choices' }} />
    <Stack.Screen name="shopping-choices/[kind]/create" options={{ ...shoppingModalOptions, title: 'Create choice' }} />
    <Stack.Screen name="shopping-choices/[kind]/[choiceId]" options={{ ...shoppingModalOptions, title: 'Edit choice' }} />
    <Stack.Screen name="recipe-create" options={{ title: 'New recipe' }} />
    <Stack.Screen name="catalog-food" options={{ title: 'Create Food item' }} />
    <Stack.Screen name="sheet/add" options={{ ...recipeSheetOptions([0.62, 0.96], theme.elevatedSurface, Platform.OS), sheetInitialDetentIndex: 'last' }} />
    <Stack.Screen name="sheet/edit" options={{ ...recipeSheetOptions([0.62, 0.96], theme.elevatedSurface, Platform.OS), sheetInitialDetentIndex: 'last' }} />
    <Stack.Screen name="sheet/date" options={recipeSheetOptions([0.7, 0.96], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/day" options={recipeSheetOptions([0.45, 0.8], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/food" options={recipeSheetOptions([0.58, 0.94], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/details" options={({ route }) => {
      const sheetId = (route.params as { sheetId?: string } | undefined)?.sheetId;
      return nativeSheetRouteOptions(sheetId ? get(sheetId) : null, theme.elevatedSurface, Platform.OS);
    }} />
    <Stack.Screen name="sheet/sections" options={({ route }) => {
      const sheetId = (route.params as { sheetId?: string } | undefined)?.sheetId;
      return nativeSheetRouteOptions(sheetId ? get(sheetId) : null, theme.elevatedSurface, Platform.OS);
    }} />
    <Stack.Screen name="sheet/cover" options={recipeSheetOptions([0.48, 0.76], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/emoji" options={recipeSheetOptions([0.46, 0.78], theme.elevatedSurface, Platform.OS)} />
    <Stack.Screen name="sheet/unit" options={({ route }) => {
      const sheetId = (route.params as { sheetId?: string } | undefined)?.sheetId;
      return nativeSheetRouteOptions(sheetId ? get(sheetId) : null, theme.elevatedSurface, Platform.OS);
    }} />
    <Stack.Screen name="sheet/shopping-amount" options={recipeSheetOptions([0.52, 0.92], theme.elevatedSurface, Platform.OS)} />
  </Stack>;
}
