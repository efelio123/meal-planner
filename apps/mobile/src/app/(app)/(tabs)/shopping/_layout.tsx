import { Stack, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { AppBackButton } from '@/components/app-back-button';
import { recipeSheetOptions } from '@/features/native-sheets/recipe-sheet-options';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { nativeSheetRouteOptions } from '@/features/native-sheets/native-sheet-route-options';
import { useTheme } from '@/hooks/use-theme';

export default function ShoppingStackLayout() {
  const theme = useTheme();
  const router = useRouter();
  const { get } = useNativeSheetFlow();
  return <Stack screenOptions={{
    headerStyle: { backgroundColor: theme.surface },
    headerTintColor: theme.text,
    headerTitleStyle: { color: theme.text },
    contentStyle: { backgroundColor: theme.screen },
    headerBackButtonDisplayMode: 'minimal',
  }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="catalog-item" options={{ title: 'Create Catalog item' }} />
    <Stack.Screen name="catalog-item/[itemId]" options={{
      title: 'Edit Catalog item',
      presentation: 'fullScreenModal',
      headerLeft: () => <AppBackButton accessibilityLabel="Back to Shopping item" onPress={() => router.back()} />,
    }} />
    <Stack.Screen name="choices/[kind]/index" options={{ title: 'Catalog choices', presentation: 'fullScreenModal' }} />
    <Stack.Screen name="choices/[kind]/create" options={{ title: 'Create choice', presentation: 'fullScreenModal' }} />
    <Stack.Screen name="choices/[kind]/[choiceId]" options={{ title: 'Edit choice', presentation: 'fullScreenModal' }} />
    <Stack.Screen name="sheet/picker" options={{ ...recipeSheetOptions([0.65, 0.94], theme.elevatedSurface, Platform.OS), sheetInitialDetentIndex: 'last' }} />
    <Stack.Screen name="sheet/details" options={{ ...recipeSheetOptions([0.68, 0.94], theme.elevatedSurface, Platform.OS), sheetInitialDetentIndex: 'last' }} />
    <Stack.Screen name="sheet/choice" options={({ route }) => {
      const sheetId = (route.params as { sheetId?: string } | undefined)?.sheetId;
      return nativeSheetRouteOptions(sheetId ? get(sheetId) : null, theme.elevatedSurface, Platform.OS);
    }} />
  </Stack>;
}
