import { useAuth } from '@clerk/expo';
import { router, type Href, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/themed-controls';
import { ProfileNavigationRow } from '@/features/profile/profile-navigation-row';
import { useResetToHouseholdStartup } from '@/features/profile/use-reset-to-household-startup';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, type HouseholdMember } from '@/lib/api';
import { householdMembersRevision, subscribeToHouseholdMembers } from './household-members-revision';

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Join date unavailable' : `Joined ${date.toLocaleDateString()}`;
}

export default function HouseholdDetailsScreen() {
  const { householdId } = useLocalSearchParams<{ householdId: string }>();
  const { isSignedIn, sessionId, userId } = useAuth();
  const { getToken, households, isSigningOut, isSwitchingHousehold, refresh, select, selectedHousehold } = useHouseholdState();
  const theme = useTheme();
  const target = households.find((item) => item.id === householdId) ?? null;
  const targetId = target?.id ?? null;
  const contextKey = JSON.stringify([householdId, isSignedIn, sessionId ?? null, userId ?? null, isSigningOut, selectedHousehold?.id ?? null]);
  const sessionContextKey = JSON.stringify([isSignedIn, sessionId ?? null, userId ?? null, isSigningOut]);
  const revisionScopeKey = JSON.stringify([userId ?? null, sessionId ?? null, targetId ?? null]);
  const revision = targetId ? householdMembersRevision({ householdId: targetId, sessionId: sessionId ?? null, userId: userId ?? null }) : 0;
  const contextRef = useRef(contextKey);
  const sessionContextRef = useRef(sessionContextKey);
  const roleRef = useRef(target?.role ?? null);
  const generationRef = useRef(0);
  const memberRequestVersion = useRef(0);
  const memberRequestRef = useRef<{ key: string; version: number; promise: Promise<boolean> } | null>(null);
  const refreshPhase = useRef<'idle' | 'household' | 'people'>('idle');
  const reloadPeopleAfterRequest = useRef(false);
  const detailsRefreshVersion = useRef(0);
  const detailsRefreshingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const appliedRevision = useRef(revision);
  const appliedRevisionScope = useRef(revisionScopeKey);
  const mountedRef = useRef(true);
  const latestGetToken = useRef(getToken);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [peopleStale, setPeopleStale] = useState(false);
  const [detailsStale, setDetailsStale] = useState(false);
  const [roleConfirmed, setRoleConfirmed] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const resetToStartup = useResetToHouseholdStartup();
  const canManageHousehold = roleConfirmed && target?.role === 'owner';

  useLayoutEffect(() => {
    sessionContextRef.current = sessionContextKey;
    if (appliedRevisionScope.current !== revisionScopeKey) {
      appliedRevisionScope.current = revisionScopeKey;
      appliedRevision.current = targetId ? householdMembersRevision({ householdId: targetId, sessionId: sessionId ?? null, userId: userId ?? null }) : 0;
    }
    if (contextRef.current !== contextKey) {
      contextRef.current = contextKey;
      generationRef.current += 1;
      memberRequestVersion.current += 1;
      memberRequestRef.current = null;
      detailsRefreshVersion.current += 1;
      detailsRefreshingRef.current = false;
      refreshPhase.current = 'idle';
      reloadPeopleAfterRequest.current = false;
      setMembers([]);
      setError(null);
      setRefreshError(null);
      setRefreshing(false);
      setLoading(Boolean(targetId));
      setPeopleStale(false);
      setDetailsStale(false);
      setRoleConfirmed(true);
      setActionBusy(false);
    }
    roleRef.current = target?.role ?? null;
  }, [contextKey, revisionScopeKey, sessionContextKey, sessionId, target?.role, targetId, userId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);

  const loadMembers = useCallback(async (showLoading = true, force = false): Promise<boolean> => {
    if (!targetId || contextRef.current !== contextKey || isSigningOut || !isSignedIn) return false;
    const role = roleRef.current;
    const requestKey = JSON.stringify([contextRef.current, targetId, role]);
    const existing = memberRequestRef.current;
    if (!force && existing?.key === requestKey) return existing.promise;
    const requestVersion = ++memberRequestVersion.current;
    const generation = generationRef.current;
    const context = contextRef.current;
    if (showLoading) {
      setLoading(true);
      setError(null);
    }
    const request = (async () => {
      try {
        const result = await api.householdMembers(() => latestGetToken.current(), targetId);
        const current = mountedRef.current && contextRef.current === context
          && generationRef.current === generation && memberRequestVersion.current === requestVersion
          && roleRef.current === role && !isSigningOut;
        if (current) {
          setMembers(result.members);
          setPeopleStale(false);
          setError(null);
        }
        return current;
      } catch {
        const current = mountedRef.current && contextRef.current === context
          && generationRef.current === generation && memberRequestVersion.current === requestVersion
          && roleRef.current === role && !isSigningOut;
        if (current) {
          setPeopleStale(true);
          setError('We couldn’t load household members. Please try again.');
        }
        return false;
      } finally {
        if (memberRequestRef.current?.version === requestVersion) memberRequestRef.current = null;
        if (mountedRef.current && contextRef.current === context
          && generationRef.current === generation && memberRequestVersion.current === requestVersion) setLoading(false);
      }
    })();
    memberRequestRef.current = { key: requestKey, version: requestVersion, promise: request };
    return request;
  }, [contextKey, isSignedIn, isSigningOut, targetId]);

  const refreshDetails = useCallback(async () => {
    if (!targetId || !isSignedIn || isSigningOut || !isFocusedRef.current || detailsRefreshingRef.current) return;
    detailsRefreshingRef.current = true;
    refreshPhase.current = 'household';
    reloadPeopleAfterRequest.current = false;
    const context = contextRef.current;
    const generation = generationRef.current;
    const refreshVersion = ++detailsRefreshVersion.current;
    const isCurrent = () => mountedRef.current
      && contextRef.current === context && generationRef.current === generation
      && detailsRefreshVersion.current === refreshVersion && !isSigningOut;
    setRefreshing(true);
    setDetailsStale(true);
    setPeopleStale(true);
    setRoleConfirmed(false);
    setRefreshError(null);
    try {
      const nextMe = await refresh();
      if (!isCurrent()) return;
      if (!nextMe) throw new Error('Household refresh did not return current data.');
      const currentHousehold = nextMe.households.find((item) => item.id === targetId);
      if (!currentHousehold) {
        router.replace('/(app)/(tabs)/profile/my-households' as Href);
        return;
      }
      roleRef.current = currentHousehold.role;
      setRoleConfirmed(true);
      setDetailsStale(false);
      refreshPhase.current = 'people';
      let peopleLoaded = await loadMembers(true, true);
      while (reloadPeopleAfterRequest.current && isCurrent()) {
        reloadPeopleAfterRequest.current = false;
        setPeopleStale(true);
        peopleLoaded = await loadMembers(true, true);
      }
      if (!isCurrent()) return;
      if (!peopleLoaded) {
        setPeopleStale(true);
      } else {
        setPeopleStale(false);
        setRefreshError(null);
      }
    } catch {
      if (isCurrent()) {
        setDetailsStale(true);
        setPeopleStale(true);
        setRoleConfirmed(false);
        setRefreshError('We couldn’t refresh this household. The information shown may be out of date. Try again.');
      }
    } finally {
      if (detailsRefreshVersion.current === refreshVersion) {
        detailsRefreshingRef.current = false;
        refreshPhase.current = 'idle';
        if (mountedRef.current && contextRef.current === context && generationRef.current === generation) setRefreshing(false);
      }
    }
  }, [isSignedIn, isSigningOut, loadMembers, refresh, targetId]);

  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    const scope = { householdId: targetId ?? '', sessionId: sessionId ?? null, userId: userId ?? null };
    const onRevision = () => {
      const nextRevision = householdMembersRevision(scope);
      if (nextRevision <= appliedRevision.current) return;
      appliedRevision.current = nextRevision;
      if (detailsRefreshingRef.current) {
        // A revision before People begins is covered only if /v1/me succeeds;
        // otherwise the stale state and retry action remain visible. If the
        // People request is already in flight, queue a follow-up GET so a
        // pre-mutation response cannot overwrite the confirmed role change.
        if (refreshPhase.current === 'people') reloadPeopleAfterRequest.current = true;
        return;
      }
      void refreshDetails();
    };
    const unsubscribe = targetId ? subscribeToHouseholdMembers(scope, onRevision) : () => undefined;
    onRevision();
    return () => {
      isFocusedRef.current = false;
      unsubscribe();
    };
  }, [refreshDetails, sessionId, targetId, userId]));

  useEffect(() => { void Promise.resolve().then(() => loadMembers(false)); }, [loadMembers]);

  if (!target || isSigningOut || !isSignedIn) return null;

  const destructiveAction = (kind: 'leave' | 'delete') => {
    const title = kind === 'delete' ? 'Delete household' : 'Leave household';
    const message = kind === 'delete'
      ? `Everyone will lose access to ${target.name} and its shared content. This cannot be undone in the app.`
      : `You will lose access to ${target.name} and its shared content.`;
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: kind === 'delete' ? 'Delete household' : 'Leave household', style: 'destructive', onPress: () => runDestructive(kind) },
    ]);
  };

  const switchTarget = async () => {
    const result = await select(target.id);
    if (result.status === 'selected') resetToStartup();
    else if (result.status === 'failed') setError('We couldn’t switch households. Your current household is unchanged. Please try again.');
    else if (result.reason === 'not-a-member' || result.reason === 'stale') setError('Your household access changed. Refresh and try again.');
  };

  const runDestructive = async (kind: 'leave' | 'delete') => {
    if (actionBusy) return;
    const context = contextRef.current;
    const generation = generationRef.current;
    const sessionContext = sessionContextRef.current;
    const actionUserId = userId;
    const wasSelected = selectedHousehold?.id === target.id;
    setActionBusy(true);
    setError(null);
    try {
      if (kind === 'delete') await api.deleteHousehold(getToken, target.id);
      else await api.leaveHousehold(getToken, target.id);
      if (contextRef.current !== context || generationRef.current !== generation) return;
      const refreshed = await refresh();
      if (!mountedRef.current || sessionContextRef.current !== sessionContext
        || (actionUserId !== null && refreshed?.user.id !== actionUserId)) return;
      if (!refreshed || refreshed.households.some((household) => household.id === target.id)) {
        if (contextRef.current === context && generationRef.current === generation) {
          setError('We couldn’t confirm your household access changed. Refresh and try again.');
        }
        return;
      }
      if (wasSelected) resetToStartup();
      else router.replace('/(app)/(tabs)/profile/my-households' as Href);
    } catch (reason) {
      if (mountedRef.current && sessionContextRef.current === sessionContext
        && contextRef.current === context && generationRef.current === generation) {
        setError(reason instanceof ApiError && reason.code === 'LAST_OWNER'
          ? 'At least one active owner must remain. Promote another member before leaving or removing the last owner.'
          : kind === 'delete' ? 'We couldn’t delete this household. Please try again.' : 'We couldn’t leave this household. Please try again.');
      }
    } finally {
      if (mountedRef.current && sessionContextRef.current === sessionContext
        && contextRef.current === context && generationRef.current === generation) setActionBusy(false);
    }
  };

  return (
    <Screen
      contentAlignment="top"
      onRefresh={Platform.OS === 'web' ? undefined : refreshDetails}
      refreshing={refreshing}
      safeAreaEdges={['left', 'right']}
    >
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" type="subtitle">{target.name}</ThemedText>
        <View style={styles.field}><ThemedText themeColor="textSecondary">Time zone</ThemedText><ThemedText>{target.time_zone}</ThemedText></View>
        <View style={styles.field}><ThemedText themeColor="textSecondary">Your role</ThemedText><ThemedText>{target.role}</ThemedText></View>
        {refreshing ? <ThemedText accessibilityLiveRegion="polite" themeColor="textSecondary">Refreshing household…</ThemedText> : null}
        {detailsStale || peopleStale ? <ThemedText themeColor="textSecondary">Showing the last confirmed information.</ThemedText> : null}
        {refreshError ? <ThemedText accessibilityRole="alert" themeColor="error">{refreshError}</ThemedText> : null}
        {Platform.OS === 'web' || refreshError ? (
          <PrimaryButton disabled={refreshing} onPress={() => { void refreshDetails(); }} title={refreshError ? 'Retry refresh' : refreshing ? 'Refreshing…' : 'Refresh household'} />
        ) : null}
        {selectedHousehold?.id !== target.id ? <PrimaryButton disabled={isSwitchingHousehold} onPress={() => { void switchTarget(); }} title={isSwitchingHousehold ? 'Switching…' : 'Switch to this household'} /> : <ThemedText themeColor="textSecondary">This is your active household.</ThemedText>}
        {canManageHousehold ? <PrimaryButton disabled={refreshing || detailsStale} onPress={() => router.push(`/(app)/(tabs)/profile/my-households/${target.id}/edit` as Href)} title="Edit household" /> : null}
        {canManageHousehold ? <ProfileNavigationRow onPress={() => router.push(`/(app)/(tabs)/profile/my-households/${target.id}/invitations` as Href)} title="Invitations" /> : null}
        <ProfileNavigationRow onPress={() => router.push(`/(app)/(tabs)/profile/my-households/${target.id}/archived-recipes` as Href)} title="Archived recipes" />
        <ThemedText accessibilityRole="header" type="smallBold">People</ThemedText>
        {loading ? <ThemedText themeColor="textSecondary">Loading members…</ThemedText> : null}
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
        {error ? <PrimaryButton onPress={() => { void loadMembers(); }} title="Retry" /> : null}
        {members.map((member) => (
          <Pressable
            key={member.membership_id}
            accessibilityLabel={`${member.display_name}, ${member.role}, ${dateLabel(member.joined_at)}`}
            accessibilityRole="button"
            onPress={() => router.push(`/(app)/(tabs)/profile/my-households/${target.id}/members/${member.membership_id}` as Href)}
            style={[styles.memberRow, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            {member.avatar_url ? <Image accessibilityLabel={`${member.display_name} profile photo`} source={{ uri: member.avatar_url }} style={styles.avatar} /> : <View accessibilityLabel={`${member.display_name} initials`} style={[styles.avatar, styles.initials, { backgroundColor: theme.surfaceSelected }]}><ThemedText>{member.display_name.slice(0, 1).toUpperCase()}</ThemedText></View>}
            <View style={styles.memberCopy}><ThemedText style={styles.memberName}>{member.display_name}</ThemedText><ThemedText themeColor="textSecondary">{member.role} · {dateLabel(member.joined_at)}</ThemedText></View>
            <ThemedText themeColor="link" accessibilityElementsHidden importantForAccessibility="no">›</ThemedText>
          </Pressable>
        ))}
        <PrimaryButton disabled={actionBusy} onPress={() => destructiveAction('leave')} title="Leave household" />
        {canManageHousehold ? <PrimaryButton disabled={actionBusy || refreshing || detailsStale} onPress={() => destructiveAction('delete')} title="Delete household" /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  field: { gap: 4 },
  memberRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 72, padding: 12 },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  initials: { alignItems: 'center', justifyContent: 'center' },
  memberCopy: { flex: 1, gap: 3 },
  memberName: { fontSize: 16, fontWeight: '600' },
});
