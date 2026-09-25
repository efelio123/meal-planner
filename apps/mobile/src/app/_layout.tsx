import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';

import { clerkPublishableKey } from '@/auth-config';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { HouseholdStateProvider, useHouseholdState } from '@/hooks/use-household-state';
import { useTheme, useThemeMode } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const theme = useTheme();
  const { isLoaded, isSignedIn } = useAuth();
  const { destination } = useHouseholdState();
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
      <Stack.Protected guard={!!isSignedIn && (destination === 'create-or-join' || destination === 'select-household')}>
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
      <HouseholdStateProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <AnimatedSplashOverlay />
          <RootNavigator />
        </ThemeProvider>
      </HouseholdStateProvider>
    </ClerkProvider>
  );
}
