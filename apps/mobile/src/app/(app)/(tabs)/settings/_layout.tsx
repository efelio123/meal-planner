import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function SettingsStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text },
        contentStyle: { backgroundColor: theme.screen },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="invite-household" options={{ title: 'Invite a household member' }} />
    </Stack>
  );
}
