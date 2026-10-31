import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { clerkPublishableKey } from '@/auth-config';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { HouseholdStateProvider, useHouseholdState, type AppDestination } from '@/hooks/use-household-state';
import { startupRouteForDestination } from '@/features/navigation/startup-route';
import { useTheme, useThemeMode } from '@/hooks/use-theme';
import { getStartupDiagnostics } from '@/lib/startup-diagnostics';
import { NativeSheetProvider, useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { nativeSheetRouteOptions } from '@/features/native-sheets/native-sheet-route-options';
import { ShoppingListProvider } from '@/features/shopping-list/shopping-list-provider';
import { ShoppingProvider } from '@/features/shopping-list/shopping-context';

SplashScreen.preventAutoHideAsync();

function RootStack({ destination, isSignedIn }: { destination: AppDestination; isSignedIn: boolean | undefined }) {
  const theme = useTheme();
  const { get } = useNativeSheetFlow();
  const redirectTo = startupRouteForDestination(isSignedIn ? destination : 'signed-out');
  return <Stack>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Protected guard={!isSignedIn} redirectTo={redirectTo}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack.Protected>
    <Stack.Protected guard={!!isSignedIn && destination === 'app'} redirectTo={redirectTo}>
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack.Protected>
    <Stack.Protected guard={!!isSignedIn && (destination === 'create-or-join' || destination === 'select-household' || destination === 'complete-profile')} redirectTo={redirectTo}>
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
    </Stack.Protected>
    <Stack.Protected guard={!!isSignedIn && destination === 'api-error'} redirectTo={redirectTo}>
      <Stack.Screen name="(api-error)" options={{ headerShown: false }} />
    </Stack.Protected>
    <Stack.Protected guard={!!isSignedIn && ['app', 'create-or-join', 'select-household', 'complete-profile'].includes(destination)} redirectTo={redirectTo}>
      <Stack.Screen name="native-sheet/[sheetId]" options={({ route }) => {
        const sheetId = (route.params as { sheetId?: string } | undefined)?.sheetId;
        return nativeSheetRouteOptions(sheetId ? get(sheetId) : null, theme.elevatedSurface, Platform.OS);
      }} />
    </Stack.Protected>
  </Stack>;
}

function RootNavigator() {
  const theme = useTheme();
  const { isLoaded, isSignedIn, sessionId, userId } = useAuth();
  const { destination, selectedHousehold } = useHouseholdState();
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
    <NativeSheetProvider scope={`${isSignedIn ? 'signed-in' : 'signed-out'}:${userId ?? ''}:${sessionId ?? ''}:${selectedHousehold?.id ?? ''}`}>
      <ShoppingProvider>
      <ShoppingListProvider>
        <RootStack destination={destination} isSignedIn={isSignedIn} />
      </ShoppingListProvider>
      </ShoppingProvider>
    </NativeSheetProvider>
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
