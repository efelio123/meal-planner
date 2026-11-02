import { useAuth } from '@clerk/expo';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/themed-controls';
import { visualStyles } from '@/components/visual-roles';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { ApiError, api } from '@/lib/api';
import { permissionActions, permissionSection, permissionSections, sectionChecked, togglePermissionSection, type MemberPermissions, type PermissionAction } from '@/lib/household-permissions';
import { markHouseholdMembersChanged } from '@/features/household-management/household-members-revision';
import { useHouseholdAccess } from './use-household-access';

const fingerprint = (keys: readonly string[]) => JSON.stringify([...keys].sort());
export function MemberPermissionsScreen() {
  const { householdId, membershipId } = useLocalSearchParams<{ householdId: string; membershipId: string }>();
  const { userId, sessionId } = useAuth(); const { getToken, refreshAccess } = useHouseholdState();
  const { household } = useHouseholdAccess(householdId); const owner = household?.role === 'owner';
  const scope = JSON.stringify([userId, sessionId, householdId, membershipId]);
  const scopeRef = useRef(scope); const generation = useRef(0); const mounted = useRef(true);
  const latestToken = useRef(getToken); const ownerRef = useRef(owner);
  const [snapshot, setSnapshot] = useState<MemberPermissions | null>(null);
  const [grants, setGrants] = useState<PermissionAction[]>([]); const [name, setName] = useState('');
  const [loadedScope, setLoadedScope] = useState(''); const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false); const pending = useRef(false);
  const [unknown, setUnknown] = useState(false); const [conflict, setConflict] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const loaded = loadedScope === scope && snapshot !== null;
  const dirty = loaded && fingerprint(snapshot.permissions) !== fingerprint(grants);
  const guard = useUnsavedChangesGuard({ scope, enabled: Boolean(dirty || saving || unknown), saving, saveUnknown: unknown, subject: 'permissions' });
  useLayoutEffect(() => { latestToken.current = getToken; ownerRef.current = owner; }, [getToken, owner]);
  useLayoutEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope; generation.current += 1; pending.current = false;
    setSnapshot(null); setGrants([]); setLoadedScope(''); setError(''); setNotice(''); setSaving(false); setUnknown(false); setConflict(false);
  }, [scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  const current = useCallback((epoch: number) => mounted.current && scopeRef.current === scope && generation.current === epoch && ownerRef.current, [scope]);
  const load = useCallback(async () => {
    if (!ownerRef.current || !householdId || !membershipId) return;
    const epoch = ++generation.current; setLoading(true); setError('');
    try {
      const [result, person] = await Promise.all([api.memberPermissions(() => latestToken.current(), householdId, membershipId), api.householdMember(() => latestToken.current(), householdId, membershipId)]);
      if (!current(epoch)) return;
      if (result.membership_id !== membershipId || result.actions.some((action) => !permissionActions.includes(action.key))) throw new Error('Update the app to edit these permissions.');
      setSnapshot(result); setGrants(result.permissions); setName(person.member.display_name); setLoadedScope(scope); setUnknown(false); setConflict(false);
    } catch (reason) { if (current(epoch)) setError(reason instanceof Error ? reason.message : 'Could not load permissions.'); }
    finally { if (current(epoch)) setLoading(false); }
  }, [current, householdId, membershipId, scope]);
  useEffect(() => { if (!owner || loadedScope === scope) return; const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load, loadedScope, owner, scope]);
  const save = async () => {
    if (!loaded || !ownerRef.current || snapshot.role === 'owner' || pending.current || conflict) return;
    pending.current = true; setSaving(true); setError(''); setNotice(''); const epoch = generation.current;
    try {
      const result = unknown ? await api.memberPermissions(() => latestToken.current(), householdId, membershipId)
        : await api.setMemberPermissions(() => latestToken.current(), householdId, membershipId, grants, snapshot.permissions_revision);
      if (!current(epoch)) return;
      if (result.role !== 'member' || fingerprint(result.permissions) !== fingerprint(grants)) {
        setUnknown(false);
        if (result.permissions_revision !== snapshot.permissions_revision) setConflict(true);
        setError('The saved permissions differ from this draft. Reload the latest permissions before changing them.');
        return;
      }
      setSnapshot(result); setGrants(result.permissions); setUnknown(false); setConflict(false); setNotice('Permissions saved.');
      markHouseholdMembersChanged({ householdId, sessionId: sessionId ?? null, userId: userId ?? null }); void refreshAccess?.(householdId);
    } catch (reason) {
      if (!current(epoch)) return;
      const uncertain = !(reason instanceof ApiError) || reason.status >= 500;
      setUnknown(uncertain); setConflict(reason instanceof ApiError && reason.code === 'MEMBER_PERMISSIONS_CONFLICT');
      setError(uncertain ? 'We could not confirm the save. Check the saved permissions before trying again.' : reason instanceof Error ? reason.message : 'Could not save permissions.');
    } finally { if (mounted.current && scopeRef.current === scope && generation.current === epoch) { pending.current = false; setSaving(false); } }
  };
  const editable = loaded && owner && snapshot.role !== 'owner' && !saving && !unknown && !conflict;
  return <><Screen layout="tab-stack" contentAlignment="top">
    <View style={styles.content}>
      <ThemedText accessibilityRole="header" style={visualStyles.sectionTitle}>{name || 'Member permissions'}</ThemedText>
      <ThemedText themeColor="textSecondary">{household?.name}</ThemedText>
      {!owner ? <ThemedText accessibilityRole="alert">Only owners can manage household permissions.</ThemedText> : null}
      {loading && owner ? <ActivityIndicator accessibilityLabel="Loading member permissions" /> : null}
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      {notice ? <ThemedText accessibilityLiveRegion="polite" themeColor="link">{notice}</ThemedText> : null}
      {owner && error && !unknown ? <PrimaryButton title="Reload latest permissions" disabled={saving} onPress={() => { void load(); }} /> : null}
      {loaded && owner ? <>
        {snapshot.role === 'owner' ? <ThemedText>Owners have full access.</ThemedText> : null}
        {permissionSections.map((section) => {
          const actions = snapshot.actions.filter((action) => permissionSection(action) === section);
          const keys = actions.map((action) => action.key);
          return <View key={section} style={styles.section}>
            <PermissionCheckbox label={`All ${section} actions`} text={section} checked={sectionChecked(keys, grants)} disabled={!editable} heading onPress={() => setGrants((currentGrants) => togglePermissionSection(keys, currentGrants))} />
            {actions.map((action, index) => <View key={action.key}>
              {section === 'Catalog' && (index === 0 || actions[index - 1].group !== action.group) ? <ThemedText style={styles.subheading}>{action.group}</ThemedText> : null}
              <PermissionCheckbox label={action.label} checked={grants.includes(action.key)} disabled={!editable} onPress={() => setGrants((currentGrants) => currentGrants.includes(action.key) ? currentGrants.filter((key) => key !== action.key) : [...currentGrants, action.key])} />
              {action.key === 'catalog.categories.archive' ? <ThemedText themeColor="textSecondary">Removing a category used by items also requires Edit items.</ThemedText> : null}
            </View>)}
          </View>;
        })}
        <ThemedText themeColor="textSecondary">Only owners manage household settings, invitations, people and permissions.</ThemedText>
        {snapshot.role !== 'owner' ? <PrimaryButton title={saving ? 'Saving…' : unknown ? 'Check saved permissions' : 'Save'} disabled={saving || conflict || !owner || (!dirty && !unknown)} onPress={() => void save()} /> : null}
      </> : null}
    </View>
  </Screen>{guard.confirmation}</>;
}
function PermissionCheckbox({ label, text, checked, disabled, heading, onPress }: { label: string; text?: string; checked: boolean | 'mixed'; disabled: boolean; heading?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} style={styles.row}>
    <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: checked === 'mixed' ? 'minus.square.fill' : checked ? 'checkmark.square.fill' : 'square', android: checked === 'mixed' ? 'indeterminate_check_box' : checked ? 'check_box' : 'check_box_outline_blank', web: checked === 'mixed' ? 'indeterminate_check_box' : checked ? 'check_box' : 'check_box_outline_blank' }} size={24} tintColor={checked ? theme.link : theme.textSecondary} />
    <ThemedText style={[styles.label, heading && visualStyles.sectionTitle]}>{text ?? label}</ThemedText>
  </Pressable>;
}
const styles = StyleSheet.create({ content: { gap: 16 }, section: { gap: 4 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8 }, label: { flex: 1 }, subheading: { fontWeight: '700', marginTop: 12 } });
