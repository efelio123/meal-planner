import { Stack } from 'expo-router';
import { HouseholdAccessRefresh } from '@/features/household-permissions/household-access-refresh';

export default function AppLayout() {
  return (
    <><HouseholdAccessRefresh /><Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack></>
  );
}
