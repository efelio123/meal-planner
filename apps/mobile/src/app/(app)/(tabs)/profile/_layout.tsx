import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { profileDetailHeader, profileNativeStackOptions } from '@/features/profile/profile-navigation-options';

export default function ProfileStackLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.surface },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      contentStyle: { backgroundColor: theme.screen },
      ...profileNativeStackOptions,
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="my-account" options={profileDetailHeader('My account')} />
      <Stack.Screen name="my-households/index" options={profileDetailHeader('My households')} />
      <Stack.Screen name="my-households/[householdId]/index" options={profileDetailHeader('Household details')} />
      <Stack.Screen name="my-households/[householdId]/invitations" options={profileDetailHeader('Invitations')} />
    </Stack>
  );
}
