import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type HouseholdMember } from '@/lib/api';
import { markHouseholdMembersChanged } from './household-members-revision';

function joinedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Join date unavailable' : date.toLocaleDateString();
}

export function MemberDetailScreen() {
  const { householdId, membershipId } = useLocalSearchParams<{ householdId: string; membershipId: string }>();
  const { isSignedIn, sessionId, userId } = useAuth();
  const { getToken, households, isSigningOut, refresh, selectedHousehold } = useHouseholdState();
  const target = households.find((item) => item.id === householdId) ?? null;
  const targetId = target?.id ?? null;
  const isOwner = target?.role === 'owner';
  const contextKey = JSON.stringify([householdId, membershipId, sessionId ?? null, userId ?? null, isSignedIn, isSigningOut, target?.role ?? null, selectedHousehold?.id ?? null]);
  const contextRef = useRef(contextKey);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const latestGetToken = useRef(getToken);
  const [member, setMember] = useState<HouseholdMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (contextRef.current !== contextKey) {
      contextRef.current = contextKey;
      generationRef.current += 1;
      setMember(null);
      setError(null);
    }
  }, [contextKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);

  const load = useCallback(async () => {
    if (!targetId || !membershipId || contextRef.current !== contextKey) return;
    const context = contextRef.current;
    const generation = generationRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api.householdMember(() => latestGetToken.current(), targetId, membershipId);
      if (mountedRef.current && contextRef.current === context && generationRef.current === generation) setMember(response.member);
    } catch {
      if (mountedRef.current && contextRef.current === context && generationRef.current === generation) setError('We couldn’t load this household member. Please try again.');
    } finally {
      if (mountedRef.current && contextRef.current === context && generationRef.current === generation) setLoading(false);
    }
  }, [contextKey, membershipId, targetId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  if (!target || !isSignedIn || isSigningOut) return null;

  const changeRole = async (role: HouseholdMember['role']) => {
    if (!isOwner || !member || busy) return;
    const context = contextRef.current;
    const generation = generationRef.current;
    setBusy(true);
    setError(null);
    try {
      await api.setHouseholdMemberRole(getToken, target.id, member.membership_id, role);
      markHouseholdMembersChanged({ householdId: target.id, sessionId, userId });
      if (contextRef.current !== context || generationRef.current !== generation) return;
      await refresh();
      if (contextRef.current === context && generationRef.current === generation) await load();
    } catch (reason) {
      if (contextRef.current === context && generationRef.current === generation) setError(reason instanceof ApiError && reason.code === 'LAST_OWNER' ? 'At least one active owner must remain.' : 'We couldn’t update this member’s role. Please try again.');
    } finally {
      if (contextRef.current === context && generationRef.current === generation) setBusy(false);
    }
  };

  const remove = () => {
    if (!isOwner || !member || member.is_self) return;
    Alert.alert('Remove member', `Remove ${member.display_name} from ${target.name}? Shared household content will remain.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove member', style: 'destructive', onPress: () => { void removeConfirmed(); } },
    ]);
  };

  const removeConfirmed = async () => {
    if (!member || busy) return;
    const context = contextRef.current;
    const generation = generationRef.current;
    const revisionScope = { householdId: target.id, sessionId, userId };
    setBusy(true);
    setError(null);
    try {
      await api.removeHouseholdMember(getToken, target.id, member.membership_id);
      // The server has confirmed the removal. Publish it even if this route
      // closed while the request was pending so the household People screen
      // can reconcile when it regains focus. The revision is scoped to the
      // household and Clerk identity captured when the action began.
      markHouseholdMembersChanged(revisionScope);
      if (contextRef.current !== context || generationRef.current !== generation) return;
      await refresh();
      if (contextRef.current === context && generationRef.current === generation) router.back();
    } catch (reason) {
      if (contextRef.current === context && generationRef.current === generation) setError(reason instanceof ApiError && reason.code === 'LAST_OWNER' ? 'At least one active owner must remain. Promote another member first.' : 'We couldn’t remove this member. Please try again.');
    } finally {
      if (contextRef.current === context && generationRef.current === generation) setBusy(false);
    }
  };

  return (
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={styles.content}>
        {loading ? <ThemedText themeColor="textSecondary">Loading member…</ThemedText> : null}
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
        {error ? <PrimaryButton onPress={() => { void load(); }} title="Retry" /> : null}
        {member ? <>
          {member.avatar_url ? <Image accessibilityLabel={`${member.display_name} profile photo`} source={{ uri: member.avatar_url }} style={styles.avatar} /> : <View accessibilityLabel={`${member.display_name} initials`} style={styles.avatarFallback}><ThemedText style={styles.initials}>{member.display_name.slice(0, 1).toUpperCase()}</ThemedText></View>}
          <ThemedText accessibilityRole="header" type="subtitle">{member.display_name}</ThemedText>
          <ThemedText>{member.role === 'owner' ? 'Owner' : 'Member'}</ThemedText>
          <ThemedText themeColor="textSecondary">Joined {joinedLabel(member.joined_at)}</ThemedText>
          {isOwner && member.email ? <ThemedText>{member.email}</ThemedText> : null}
          {isOwner && !member.is_self ? <PrimaryButton disabled={busy} onPress={() => { void changeRole(member.role === 'owner' ? 'member' : 'owner'); }} title={member.role === 'owner' ? 'Make member' : 'Make owner'} /> : null}
          {isOwner && !member.is_self ? <PrimaryButton disabled={busy} onPress={remove} title="Remove member" /> : null}
        </> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { alignItems: 'flex-start', gap: 16 }, avatar: { borderRadius: 40, height: 80, width: 80 }, avatarFallback: { alignItems: 'center', borderRadius: 40, height: 80, justifyContent: 'center', width: 80, backgroundColor: '#d0d5dd' }, initials: { fontSize: 28, fontWeight: '700' } });
