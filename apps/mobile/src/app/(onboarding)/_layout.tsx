import { Stack } from 'expo-router';

import { useHouseholdState } from '@/hooks/use-household-state';

export default function OnboardingLayout() {
  const { destination } = useHouseholdState();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={destination === 'create-or-join'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="create-household" />
        <Stack.Screen name="join-household" />
      </Stack.Protected>
      <Stack.Protected guard={destination === 'select-household'}>
        <Stack.Screen name="select-household" />
      </Stack.Protected>
    </Stack>
  );
}
