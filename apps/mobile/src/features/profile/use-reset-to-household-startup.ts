import { useNavigation, useRouter, type NavigationState } from 'expo-router';

import { signedInStartupRoute } from '@/features/navigation/startup-route';

// SDK 58 requires complete nested states on RESET. Clear retained tab histories
// while preserving navigator identity and route declarations from the live tree.
export function clearHouseholdTabHistory(state: NavigationState): NavigationState {
  if (state.type === 'stack' && state.routeNames.includes('index')) {
    const root = state.routes.find((route) => route.name === 'index') ?? {
      name: 'index', key: `${state.key}-household-root-${state.routeKeySeq}`,
    };
    return { ...state, index: 0, routes: [root], routeKeySeq: state.routeKeySeq + 1 };
  }
  const routes = state.routes.map((route) => ({
    ...route,
    ...(route.state?.stale === false ? { state: clearHouseholdTabHistory(route.state) } : {}),
  }));
  return { ...state, routes };
}

export function useResetToHouseholdStartup() {
  const router = useRouter();
  const appNavigation = useNavigation('/(app)');
  return () => {
    const state = appNavigation.getState();
    if (!state) return;
    // Apply the history reset before resolving the startup href. Both operations
    // normally queue after commit in SDK 58, so this ordering is deliberate.
    appNavigation.dispatchSync({ type: 'RESET', payload: clearHouseholdTabHistory(state) });
    router.replace(signedInStartupRoute);
  };
}
