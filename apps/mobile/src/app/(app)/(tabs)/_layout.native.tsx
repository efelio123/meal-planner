import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { CatalogProvider } from '@/features/catalog/catalog-context';
import { RecipeProvider } from '@/features/recipes/recipe-context';
import { useTheme } from '@/hooks/use-theme';

export default function NativeTabLayout() {
  const theme = useTheme();

  return (
    <CatalogProvider>
    <RecipeProvider>
    <NativeTabs
      backBehavior="history"
      backgroundColor={theme.surface}
      iconColor={{ default: theme.textSecondary, selected: theme.primary }}
      labelStyle={{ color: theme.textSecondary }}
      labelVisibilityMode="labeled"
      rippleColor={theme.surfaceSelected}
      tintColor={theme.primary}
    >
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="recipes">
        <NativeTabs.Trigger.Label>Recipes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="book.closed" md="menu_book" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shopping">
        <NativeTabs.Trigger.Label>Shopping</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="cart" md="shopping_cart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="catalog">
        <NativeTabs.Trigger.Label>Catalog</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="cabinet.fill" md="kitchen" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
    </RecipeProvider>
    </CatalogProvider>
  );
}
