import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { clerkPublishableKey } from '@/auth-config';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { HouseholdStateProvider, useHouseholdState } from '@/hooks/use-household-state';
import { useTheme, useThemeMode } from '@/hooks/use-theme';
import { getStartupDiagnostics } from '@/lib/startup-diagnostics';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const theme = useTheme();
  const { isLoaded, isSignedIn } = useAuth();
  const { destination } = useHouseholdState();
  const diagnostics = getStartupDiagnostics();
  const startupStartedAt = useRef<number | null>(null);
  const clerkInitializationLogged = useRef(false);
  const previousDestination = useRef(destination);

  useEffect(() => {
    startupStartedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!isLoaded || clerkInitializationLogged.current) return;
    clerkInitializationLogged.current = true;
    diagnostics?.record('clerk_initialization', Date.now() - (startupStartedAt.current ?? Date.now()));
  }, [diagnostics, isLoaded]);

  useEffect(() => {
    if (previousDestination.current === destination) return;
    previousDestination.current = destination;
    diagnostics?.record('destination_change', Date.now() - (startupStartedAt.current ?? Date.now()));
  }, [destination, diagnostics]);

  if (!isLoaded || destination === 'loading') return <View style={{ alignItems: 'center', backgroundColor: theme.screen, flex: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.activity} /></View>;
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!isSignedIn && destination === 'app'}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!isSignedIn && (destination === 'create-or-join' || destination === 'select-household' || destination === 'complete-profile')}>
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!isSignedIn && destination === 'api-error'}>
        <Stack.Screen name="(api-error)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const mode = useThemeMode();
  const colors = useTheme();
  const navigationTheme = { ...(mode === 'dark' ? DarkTheme : DefaultTheme), colors: { ...(mode === 'dark' ? DarkTheme : DefaultTheme).colors, background: colors.screen, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary, notification: colors.error } };
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.screen);
  }, [colors.screen]);
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <HouseholdStateProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
            <AnimatedSplashOverlay />
            <RootNavigator />
          </ThemeProvider>
        </HouseholdStateProvider>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
