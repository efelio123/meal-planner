import type { Href } from 'expo-router';
import type { AppDestination } from '@/hooks/use-household-state';

// Plan is now usable and is the permanent signed-in startup destination.
export const signedInStartupRoute = '/(app)/(tabs)/plan' as Href;

export function startupRouteForDestination(destination: AppDestination): Href {
  switch (destination) {
    case 'signed-out': return '/(auth)/sign-in' as Href;
    case 'api-error': return '/(api-error)' as Href;
    case 'complete-profile': return '/(onboarding)/complete-profile' as Href;
    case 'select-household': return '/(onboarding)/select-household' as Href;
    case 'app': return signedInStartupRoute;
    case 'loading': return '/' as Href;
    default: return '/(onboarding)' as Href;
  }
}
