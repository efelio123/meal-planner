import { Stack } from 'expo-router';
import { CatalogProvider } from '@/features/catalog/catalog-context';
import { profileNativeStackOptions } from '@/features/profile/profile-navigation-options';
import { useTheme } from '@/hooks/use-theme';

export default function CatalogLayout() {
  const theme = useTheme();
  return (
    <CatalogProvider>
      <Stack screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text },
        contentStyle: { backgroundColor: theme.screen },
        ...profileNativeStackOptions,
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="manage/index" options={{ title: 'Manage catalog' }} />
        <Stack.Screen name="add" options={{ title: 'Add item' }} />
        <Stack.Screen name="item/[itemId]/index" options={{ title: 'Catalog item' }} />
        <Stack.Screen name="item/[itemId]/edit" options={{ title: 'Edit item' }} />
        <Stack.Screen name="choices/[kind]/index" options={{ title: 'Catalog choices' }} />
        <Stack.Screen name="choices/[kind]/create" options={{ title: 'Create choice' }} />
        <Stack.Screen name="choices/[kind]/[choiceId]" options={{ title: 'Edit choice' }} />
      </Stack>
    </CatalogProvider>
  );
}
