import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { tabIcons } from '@/features/navigation/tab-icons';
import { useTheme } from '@/hooks/use-theme';

export default function WebTabLayout() {
  const theme = useTheme();

  return (
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
      <Tabs.Screen name="pantry" options={{ title: 'Pantry' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
