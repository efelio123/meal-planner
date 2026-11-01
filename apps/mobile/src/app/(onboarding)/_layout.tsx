import { Stack } from 'expo-router';

import { useHouseholdState } from '@/hooks/use-household-state';
import { startupRouteForDestination } from '@/features/navigation/startup-route';

export default function OnboardingLayout() {
  const { destination } = useHouseholdState();
  const redirectTo = startupRouteForDestination(destination);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={destination === 'create-or-join'} redirectTo={redirectTo}>
        <Stack.Screen name="index" />
        <Stack.Screen name="create-household" />
        <Stack.Screen name="join-household" />
      </Stack.Protected>
      <Stack.Protected guard={destination === 'select-household'} redirectTo={redirectTo}>
        <Stack.Screen name="select-household" />
      </Stack.Protected>
      <Stack.Protected guard={destination === 'complete-profile'} redirectTo={redirectTo}>
        <Stack.Screen name="complete-profile" />
      </Stack.Protected>
    </Stack>
  );
}
