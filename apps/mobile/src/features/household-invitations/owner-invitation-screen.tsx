import { useAuth } from '@clerk/expo';
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type CreatedInvitation, type PendingInvitation } from '@/lib/api';

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
    if (error.code === 'HOUSEHOLD_MEMBER_ALREADY_EXISTS') return 'This person is already a member of this household.';
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
  const latestGetToken = useRef(getToken);
  const createSequenceRef = useRef(0);
  const createInFlightRef = useRef<number | null>(null);
  const copySequenceRef = useRef(0);
  const copyInFlightRef = useRef<number | null>(null);
  const listSequenceRef = useRef(0);
  const listInFlightRef = useRef<number | null>(null);
  const invitationActionRef = useRef<string | null>(null);
  const snapshotContextKeyRef = useRef<string | null>(null);
  const snapshotRef = useRef<InvitationSnapshot | null>(null);

  const [email, setEmail] = useState('');
  const [snapshot, setSnapshot] = useState<InvitationSnapshot | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<'success' | 'failure' | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [invitationListError, setInvitationListError] = useState<string | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (contextRef.current.key !== contextKey) {
      contextRef.current = { key: contextKey, generation: contextRef.current.generation + 1 };
      createSequenceRef.current += 1;
      createInFlightRef.current = null;
      copySequenceRef.current += 1;
      copyInFlightRef.current = null;
      listSequenceRef.current += 1;
      listInFlightRef.current = null;
      invitationActionRef.current = null;
      snapshotContextKeyRef.current = null;
      snapshotRef.current = null;
      setEmail('');
      setSnapshot(null);
      setIsCreating(false);
      setIsCopying(false);
      setError(null);
      setCopyFeedback(null);
      setPendingInvitations([]);
      setIsLoadingInvitations(false);
      setInvitationListError(null);
      setInvitationActionId(null);
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
      listSequenceRef.current += 1;
      listInFlightRef.current = null;
      invitationActionRef.current = null;
      snapshotContextKeyRef.current = null;
      snapshotRef.current = null;
    };
  }, []);

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);

  const isCurrentContext = useCallback((contextKeyAtStart: string, generationAtStart: number) => (
    mountedRef.current
    && canUseScreen
    && contextRef.current.key === contextKeyAtStart
    && contextRef.current.generation === generationAtStart
  ), [canUseScreen]);

  const loadPendingInvitations = useCallback(async () => {
    if (!canUseScreen || !householdId) return;
    const contextKeyAtStart = contextRef.current.key;
    const generationAtStart = contextRef.current.generation;
    const operation = ++listSequenceRef.current;
    listInFlightRef.current = operation;
    setIsLoadingInvitations(true);
    setInvitationListError(null);
    try {
      const response = await api.householdInvitations(() => latestGetToken.current(), householdId);
      if (!isCurrentContext(contextKeyAtStart, generationAtStart) || listInFlightRef.current !== operation) return;
      setPendingInvitations(response.invitations);
    } catch {
      if (isCurrentContext(contextKeyAtStart, generationAtStart) && listInFlightRef.current === operation) {
        setInvitationListError('We couldn’t load invitations. Please try again.');
      }
    } finally {
      if (isCurrentContext(contextKeyAtStart, generationAtStart) && listInFlightRef.current === operation) {
        listInFlightRef.current = null;
        setIsLoadingInvitations(false);
      }
    }
  }, [canUseScreen, householdId, isCurrentContext]);

  useEffect(() => {
    if (canUseScreen) void Promise.resolve().then(() => loadPendingInvitations());
  }, [canUseScreen, contextKey, loadPendingInvitations]);

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
      void loadPendingInvitations();
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

  const revokeInvitation = async (invitation: PendingInvitation) => {
    if (!householdId || invitationActionRef.current) return;
    const contextKeyAtStart = contextRef.current.key;
    const generationAtStart = contextRef.current.generation;
    invitationActionRef.current = invitation.id;
    listSequenceRef.current += 1;
    listInFlightRef.current = null;
    setIsLoadingInvitations(false);
    setInvitationActionId(invitation.id);
    setError(null);
    if (snapshotRef.current?.invitationId === invitation.id) {
      snapshotRef.current = null;
      snapshotContextKeyRef.current = null;
      copySequenceRef.current += 1;
      copyInFlightRef.current = null;
      setSnapshot(null);
      setCopyFeedback(null);
      setIsCopying(false);
    }
    try {
      await api.revokeInvitation(getToken, householdId, invitation.id);
      if (!isCurrentContext(contextKeyAtStart, generationAtStart) || invitationActionRef.current !== invitation.id) return;
      setPendingInvitations((current) => current.filter((item) => item.id !== invitation.id));
    } catch {
      if (isCurrentContext(contextKeyAtStart, generationAtStart) && invitationActionRef.current === invitation.id) setError('We couldn’t revoke this invitation. Please try again.');
    } finally {
      if (isCurrentContext(contextKeyAtStart, generationAtStart) && invitationActionRef.current === invitation.id) {
        invitationActionRef.current = null;
        setInvitationActionId(null);
      }
    }
  };

  const reissueInvitation = async (invitation: PendingInvitation) => {
    if (!householdId || invitationActionRef.current) return;
    const contextKeyAtStart = contextRef.current.key;
    const generationAtStart = contextRef.current.generation;
    invitationActionRef.current = invitation.id;
    listSequenceRef.current += 1;
    listInFlightRef.current = null;
    setIsLoadingInvitations(false);
    setInvitationActionId(invitation.id);
    setError(null);
    // The server may commit replacement and lose its response. Never display
    // the old one-time code once replacement has started.
    snapshotRef.current = null;
    snapshotContextKeyRef.current = null;
    copySequenceRef.current += 1;
    copyInFlightRef.current = null;
    setSnapshot(null);
    setCopyFeedback(null);
    setIsCopying(false);
    try {
      const response = await api.reissueInvitation(getToken, householdId, invitation.id);
      if (!isCurrentContext(contextKeyAtStart, generationAtStart) || invitationActionRef.current !== invitation.id) return;
      const nextSnapshot: InvitationSnapshot = {
        submittedEmail: invitation.normalized_email,
        invitationId: response.invitation.id,
        code: response.invitation.code,
        expiresAt: response.invitation.expires_at,
      };
      snapshotRef.current = nextSnapshot;
      snapshotContextKeyRef.current = contextKeyAtStart;
      setSnapshot(nextSnapshot);
      setPendingInvitations((current) => current.filter((item) => item.id !== invitation.id).concat({
        id: response.invitation.id,
        normalized_email: invitation.normalized_email,
        expires_at: response.invitation.expires_at,
      }));
    } catch (reason) {
      if (isCurrentContext(contextKeyAtStart, generationAtStart) && invitationActionRef.current === invitation.id) {
        setError(invitationError(reason));
        // Refresh metadata after an ambiguous failure, but never reconstruct
        // or present a code from the old one-time snapshot.
        void loadPendingInvitations();
      }
    } finally {
      if (isCurrentContext(contextKeyAtStart, generationAtStart) && invitationActionRef.current === invitation.id) {
        invitationActionRef.current = null;
        setInvitationActionId(null);
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

        <View style={{ gap: 12 }}>
          <ThemedText accessibilityRole="header" type="smallBold">Pending invitations</ThemedText>
          {isLoadingInvitations ? <ThemedText themeColor="textSecondary">Loading invitations…</ThemedText> : null}
          {invitationListError ? <ThemedText accessibilityRole="alert" themeColor="error">{invitationListError}</ThemedText> : null}
          {invitationListError ? <PrimaryButton onPress={() => { void loadPendingInvitations(); }} title="Retry invitations" /> : null}
          {!isLoadingInvitations && !invitationListError && pendingInvitations.length === 0 ? <ThemedText themeColor="textSecondary">No active invitations.</ThemedText> : null}
          {pendingInvitations.map((invitation) => (
            <View key={invitation.id} style={{ gap: 8 }} testID={`pending-invitation-${invitation.id}`}>
              <ThemedText>{invitation.normalized_email}</ThemedText>
              <ThemedText themeColor="textSecondary">Expires {formatExpiration(invitation.expires_at)}</ThemedText>
              <PrimaryButton disabled={invitationActionId !== null} onPress={() => { void reissueInvitation(invitation); }} title={invitationActionId === invitation.id ? 'Generating replacement…' : 'Generate replacement code'} />
              <PrimaryButton disabled={invitationActionId !== null} onPress={() => { void revokeInvitation(invitation); }} title={invitationActionId === invitation.id ? 'Updating invitation…' : 'Revoke invitation'} />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}
