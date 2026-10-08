import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { tabIcons } from '@/features/navigation/tab-icons';
import { CatalogProvider } from '@/features/catalog/catalog-context';
import { RecipeProvider } from '@/features/recipes/recipe-context';
import { MealPlanProvider } from '@/features/meal-plan/meal-plan-context';
import { useTheme } from '@/hooks/use-theme';

export default function WebTabLayout() {
  const theme = useTheme();

  return (
    <CatalogProvider>
    <RecipeProvider>
    <MealPlanProvider>
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarIcon: ({ color }) => <SymbolView name={tabIcons[route.name as keyof typeof tabIcons]} tintColor={color} />,
      })}
    >
      <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes' }} />
      <Tabs.Screen name="shopping" options={{ title: 'Shopping' }} />
      <Tabs.Screen name="catalog" options={{ title: 'Catalog' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
    </MealPlanProvider>
    </RecipeProvider>
    </CatalogProvider>
  );
}
