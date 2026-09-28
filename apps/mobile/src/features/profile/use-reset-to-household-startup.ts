import { router, useNavigation } from 'expo-router';
import { CommonActions } from 'expo-router/react-navigation';

import { signedInStartupRoute } from '@/features/navigation/startup-route';

export function useResetToHouseholdStartup() {
  const appNavigation = useNavigation('/(app)');
  return () => {
    // The SDK 57 router test proves this app-stack reset reconstructs the tab
    // navigator (and drops its retained Profile stack) before startup routing.
    appNavigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: '(tabs)' }] }));
    router.replace(signedInStartupRoute);
  };
}
