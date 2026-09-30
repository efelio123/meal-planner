import { useAuth, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { validateDisplayName } from './display-name';

export function DisplayNameCompletionScreen() {
  const { isSignedIn, sessionId, userId } = useAuth();
  const router = useRouter();
  const { user } = useUser();
  const { isSigningOut, refresh } = useHouseholdState();
  const contextKey = JSON.stringify([isSignedIn, userId ?? null, sessionId ?? null, isSigningOut]);
  const contextRef = useRef(contextKey);
  const mountedRef = useRef(true);
  const [displayName, setDisplayName] = useState(user?.firstName ?? '');
  const [busy, setBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (contextRef.current === contextKey) return;
    contextRef.current = contextKey;
    setDisplayName(user?.firstName ?? '');
    setBusy(false);
    setProfileSaved(false);
    setError(null);
  }, [contextKey, user?.firstName]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isCurrent = (expectedContext: string) => (
    mountedRef.current && contextRef.current === expectedContext && isSignedIn && !isSigningOut
  );

  const refreshIntoApp = async (expectedContext: string) => {
    const me = await refresh();
    if (!isCurrent(expectedContext)) return;
    if (!me) {
      setError('Your name was saved, but we couldn’t finish loading your account. Try again.');
      return;
    }
    router.replace('/');
  };

  const submit = async () => {
    if (busy || !isSignedIn || isSigningOut) return;
    const expectedContext = contextRef.current;
    if (profileSaved) {
      setBusy(true);
      setError(null);
      try {
        await refreshIntoApp(expectedContext);
      } finally {
        if (isCurrent(expectedContext)) setBusy(false);
      }
      return;
    }

    const result = validateDisplayName(displayName);
    if (!result.value) {
      setError(result.error);
      return;
    }
    if (!user) {
      setError('We couldn’t load your account. Please try again.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await user.update({ firstName: result.value });
      if (!isCurrent(expectedContext)) return;
      setProfileSaved(true);
      await refreshIntoApp(expectedContext);
    } catch {
      if (isCurrent(expectedContext)) setError('We couldn’t save your display name. Please try again.');
    } finally {
      if (isCurrent(expectedContext)) setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" style={styles.title}>Choose your display name</ThemedText>
        <ThemedText themeColor="textSecondary">
          Household members will see this name. Your email is kept separate.
        </ThemedText>
        <ThemedInput
          accessibilityLabel="Display name"
          autoCapitalize="words"
          editable={!busy && !profileSaved && !isSigningOut}
          maxLength={160}
          onChangeText={setDisplayName}
          placeholder="Display name"
          value={displayName}
        />
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
        <PrimaryButton
          disabled={busy || isSigningOut}
          onPress={() => { void submit(); }}
          title={busy ? profileSaved ? 'Loading account…' : 'Saving…' : profileSaved ? 'Retry loading account' : 'Continue'}
        />
        <SignOutAction />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: 16 }, title: { fontSize: 28, fontWeight: '700', lineHeight: 34 } });
