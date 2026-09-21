import { type Href, Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { Screen } from '@/components/screen';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function Index() {
  const { destination } = useHouseholdState();

  if (destination === 'loading') return <Screen><ActivityIndicator /></Screen>;
  if (destination === 'signed-out') return <Redirect href={'/(auth)/sign-in' as Href} />;
  if (destination === 'api-error') return <Redirect href={'/(api-error)' as Href} />;
  if (destination === 'app') return <Redirect href={'/(app)' as Href} />;
  if (destination === 'select-household') return <Redirect href={'/(onboarding)/select-household' as Href} />;
  return <Redirect href={'/(onboarding)' as Href} />;
}
