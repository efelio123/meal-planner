import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { Screen } from '@/components/screen';
import { startupRouteForDestination } from '@/features/navigation/startup-route';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function Index() {
  const { destination } = useHouseholdState();

  if (destination === 'loading') return <Screen layout="standalone"><ActivityIndicator /></Screen>;
  return <Redirect href={startupRouteForDestination(destination)} />;
}
