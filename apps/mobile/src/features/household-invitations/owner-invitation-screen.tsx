import { useAuth } from '@clerk/expo';
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type CreatedInvitation } from '@/lib/api';

type InvitationSnapshot = {
  submittedEmail: string;
  invitationId: CreatedInvitation['id'];
  code: CreatedInvitation['code'];
  expiresAt: CreatedInvitation['expires_at'];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const householdsPath = '/(app)/(tabs)/profile/my-households' as Href;

function invitationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'An active invitation already exists for that email. Use the code you previously shared or wait for it to expire.';
  }
  if (error instanceof ApiError && error.status === 422) {
    return 'Enter a valid email address for the person you want to invite.';
  }
  return 'We couldn’t create the invitation. Please try again.';
}

function formatExpiration(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Expiration time unavailable.';
  return date.toLocaleString();
}

export function OwnerInvitationScreen({ householdId: routeHouseholdId }: { householdId?: string }) {
  const { isLoaded, isSignedIn, sessionId, userId } = useAuth();
  const { getToken, households, isSigningOut } = useHouseholdState();
  const targetHousehold = households.find((item) => item.id === routeHouseholdId) ?? null;
  const householdId = targetHousehold?.id ?? null;
  const isOwner = targetHousehold?.role === 'owner';
  const canUseScreen = Boolean(isLoaded && isSignedIn && sessionId && userId && !isSigningOut && householdId && isOwner);
  const contextKey = JSON.stringify([
    householdId,
    userId,
    sessionId,
    isSignedIn,
    isSigningOut,
    targetHousehold?.role ?? null,
  ]);

  const mountedRef = useRef(true);
  const contextRef = useRef({ key: contextKey, generation: 0 });
  const createSequenceRef = useRef(0);
  const createInFlightRef = useRef<number | null>(null);
  const copySequenceRef = useRef(0);
  const copyInFlightRef = useRef<number | null>(null);
  const snapshotContextKeyRef = useRef<string | null>(null);
  const snapshotRef = useRef<InvitationSnapshot | null>(null);

  const [email, setEmail] = useState('');
  const [snapshot, setSnapshot] = useState<InvitationSnapshot | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<'success' | 'failure' | null>(null);

  useLayoutEffect(() => {
    if (contextRef.current.key !== contextKey) {
      contextRef.current = { key: contextKey, generation: contextRef.current.generation + 1 };
      createSequenceRef.current += 1;
      createInFlightRef.current = null;
      copySequenceRef.current += 1;
      copyInFlightRef.current = null;
      snapshotContextKeyRef.current = null;
      snapshotRef.current = null;
      setEmail('');
      setSnapshot(null);
      setIsCreating(false);
      setIsCopying(false);
      setError(null);
      setCopyFeedback(null);
    }

    if (!canUseScreen) router.replace(householdsPath);
  }, [canUseScreen, contextKey]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      contextRef.current.generation += 1;
      createSequenceRef.current += 1;
      createInFlightRef.current = null;
      copySequenceRef.current += 1;
      copyInFlightRef.current = null;
      snapshotContextKeyRef.current = null;
      snapshotRef.current = null;
    };
  }, []);

  const isCurrentContext = (contextKeyAtStart: string, generationAtStart: number) => (
    mountedRef.current
    && canUseScreen
    && contextRef.current.key === contextKeyAtStart
    && contextRef.current.generation === generationAtStart
  );

  const createInvitation = async () => {
    if (!canUseScreen || !householdId || createInFlightRef.current !== null) return;

    const submittedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(submittedEmail)) {
      setError('Enter a valid email address for the person you want to invite.');
      return;
    }

    const contextKeyAtStart = contextRef.current.key;
    const generationAtStart = contextRef.current.generation;
    const operation = ++createSequenceRef.current;
    createInFlightRef.current = operation;
    setIsCreating(true);
    setError(null);

    try {
      const response = await api.createInvitation(getToken, householdId, submittedEmail);
      if (!isCurrentContext(contextKeyAtStart, generationAtStart) || createInFlightRef.current !== operation) return;

      const nextSnapshot = {
        submittedEmail,
        invitationId: response.invitation.id,
        code: response.invitation.code,
        expiresAt: response.invitation.expires_at,
      };
      snapshotContextKeyRef.current = contextKeyAtStart;
      snapshotRef.current = nextSnapshot;
      copySequenceRef.current += 1;
      copyInFlightRef.current = null;
      setSnapshot(nextSnapshot);
      setError(null);
      setIsCopying(false);
      setCopyFeedback(null);
    } catch (reason) {
      if (isCurrentContext(contextKeyAtStart, generationAtStart) && createInFlightRef.current === operation) {
        setError(invitationError(reason));
      }
    } finally {
      if (isCurrentContext(contextKeyAtStart, generationAtStart) && createInFlightRef.current === operation) {
        createInFlightRef.current = null;
        setIsCreating(false);
      }
    }
  };

  const copyInvitationCode = async () => {
    if (
      !snapshot
      || snapshotRef.current !== snapshot
      || !canUseScreen
      || snapshotContextKeyRef.current !== contextRef.current.key
      || copyInFlightRef.current !== null
    ) return;

    const contextKeyAtStart = contextRef.current.key;
    const generationAtStart = contextRef.current.generation;
    const snapshotAtStart = snapshot;
    const operation = ++copySequenceRef.current;
    copyInFlightRef.current = operation;
    setIsCopying(true);
    setCopyFeedback(null);

    try {
      const copied = await Clipboard.setStringAsync(snapshot.code);
      if (
        !isCurrentContext(contextKeyAtStart, generationAtStart)
        || snapshotRef.current !== snapshotAtStart
        || copyInFlightRef.current !== operation
      ) return;
      setCopyFeedback(copied ? 'success' : 'failure');
    } catch {
      if (
        isCurrentContext(contextKeyAtStart, generationAtStart)
        && snapshotRef.current === snapshotAtStart
        && copyInFlightRef.current === operation
      ) {
        setCopyFeedback('failure');
      }
    } finally {
      if (
        isCurrentContext(contextKeyAtStart, generationAtStart)
        && snapshotRef.current === snapshotAtStart
        && copyInFlightRef.current === operation
      ) {
        copyInFlightRef.current = null;
        setIsCopying(false);
      }
    }
  };

  if (!canUseScreen) return null;

  return (
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={{ gap: 16 }}>
        <ThemedText accessibilityRole="header" type="subtitle">Invite a member to {targetHousehold?.name}</ThemedText>
        <ThemedText themeColor="textSecondary">
          Your recipient must sign up or sign in with the invited email address, then enter the code in Join a household.
        </ThemedText>

        <ThemedInput
          accessibilityLabel="Recipient email"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isCreating}
          keyboardType="email-address"
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          placeholder="name@example.com"
          textContentType="emailAddress"
          value={email}
        />
        <PrimaryButton
          disabled={isCreating}
          onPress={() => { void createInvitation(); }}
          title={isCreating ? 'Creating invitation…' : 'Create invitation'}
        />

        {error ? <ThemedText accessibilityRole="alert" testID="invitation-error" themeColor="error">{error}</ThemedText> : null}

        {snapshot ? (
          <View accessibilityLabel="Created invitation" style={{ gap: 12 }} testID="invitation-snapshot">
            <ThemedText>
              Invitation for {snapshot.submittedEmail}. They must use this verified email when joining.
            </ThemedText>
            <ThemedText accessibilityLabel="Invitation code" selectable type="code">{snapshot.code}</ThemedText>
            <ThemedText themeColor="textSecondary">Expires {formatExpiration(snapshot.expiresAt)}</ThemedText>
            <PrimaryButton
              disabled={isCopying}
              onPress={() => { void copyInvitationCode(); }}
              title={isCopying ? 'Copying…' : 'Copy invitation code'}
            />
            {copyFeedback === 'success' ? <ThemedText accessibilityLiveRegion="polite">Invitation code copied.</ThemedText> : null}
            {copyFeedback === 'failure' ? <ThemedText accessibilityRole="alert" themeColor="error">Couldn’t copy the code. Please try again.</ThemedText> : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
