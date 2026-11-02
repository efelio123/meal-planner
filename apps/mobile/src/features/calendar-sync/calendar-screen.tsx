import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/screen';
import { PrimaryButton } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { DisclosureChevron, visualStyles } from '@/components/visual-roles';
import { ChoicePicker } from '@/features/catalog/choice-picker';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { api, type HouseholdMember } from '@/lib/api';
import { useCalendarController } from './calendar-provider';
import type { CalendarController } from './controller';
import type { CalendarSettings, NativeDestination } from './types';
import { displayMealTime } from './meal-time';
import { MealTimeSheet } from './meal-time-sheet';

const defaults: CalendarSettings = { breakfast_time: '08:00', lunch_time: '12:00', dinner_time: '18:00', duration_minutes: 60 };
function confirm(title: string, message: string, action: string, run: () => void, destructive = false) {
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: action, style: destructive ? 'destructive' : 'default', onPress: run }]);
}
export function CalendarSyncScreen() {
  const controller = useCalendarController();
  if (!controller) return <Screen layout="tab-stack"><ThemedText>Select a household to view Calendar sync.</ThemedText></Screen>;
  return <CalendarSettingsPage key={controller.identity} controller={controller} />;
}
function CalendarSettingsPage({ controller }: { controller: CalendarController }) {
  const { status, journal, linkedHere, busy, error } = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const { selectedHousehold, getToken } = useHouseholdState(); const theme = useTheme();
  const [draft, setDraft] = useState<CalendarSettings | null>(null);
  const settings: CalendarSettings = draft ?? status ?? defaults;
  const setSettings = (update: CalendarSettings | ((current: CalendarSettings) => CalendarSettings)) => setDraft((current) => typeof update === 'function' ? update(current ?? status ?? defaults) : update);
  const [preparing, setPreparing] = useState(false);
  const [setup, setSetup] = useState(false); const [choices, setChoices] = useState<NativeDestination[]>([]);
  const [newDestination, setNewDestination] = useState(false);
  const [chosen, setChosen] = useState('create'); const [source, setSource] = useState('');
  const [owners, setOwners] = useState<HouseholdMember[]>([]); const [target, setTarget] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const flow = useNativeSheetFlow(); const router = useRouter(); const available = controller.adapter.available();
  const working = busy || preparing;
  const perform = (action: () => Promise<unknown>) => { setLocalError(null); void action().catch((e: unknown) => setLocalError(e instanceof Error ? e.message : 'Please try again.')); };
  useEffect(() => { void controller.refresh().catch(() => undefined); }, [controller]);
  useEffect(() => {
    let live = true;
    if (selectedHousehold?.role === 'owner') void api.householdMembers(getToken, selectedHousehold.id).then((result) => { if (live) setOwners(result.members.filter((m) => m.role === 'owner')); }).catch(() => undefined);
    return () => { live = false; };
  }, [selectedHousehold?.id, selectedHousehold?.role, getToken]);
  function chooseTime(slot: 'breakfast_time' | 'lunch_time' | 'dinner_time', title: string) {
    if (working) return;
    const id = flow.present(<MealTimeSheet label={title} value={settings[slot]} scope={flow.scope} onSave={(value) => setSettings((current) => ({ ...current, [slot]: value }))} />, { direct: true, detents: [0.45, 0.85] });
    router.push({ pathname: '/native-sheet/[sheetId]', params: { sheetId: id } });
  }
  async function prepare() {
    setPreparing(true);
    try { const items = await controller.destinations(); setChoices(items); setSource(items[0]?.id ?? ''); setChosen(journal?.calendarId ?? 'create'); setSetup(true); }
    finally { setPreparing(false); }
  }
  function enable() {
    const destination = choices.find((item) => item.id === chosen);
    if (chosen !== 'create' && !destination) { setLocalError('Choose a writable calendar.'); return; }
    if (chosen === 'create' && Platform.OS === 'ios' && !source) { setLocalError('Choose a calendar account to create in, or use an existing calendar.'); return; }
    const recovery = Boolean(status?.writer_linked || status?.recovery_required);
    confirm(recovery ? 'Reconnect calendar sync?' : 'Enable calendar sync?',
      `${newDestination ? 'You are starting a separate destination and keeping old calendar copies. Choose a different calendar to avoid duplicates. ' : ''}${recovery ? 'Stop using sync on the previous phone first. Existing matching meal exports in this destination will be recovered; older exports outside the managed dates may need review. ' : ''}Meal Planner will create and maintain meals in ${destination?.title ?? 'a new Meal Planner calendar'} for ${selectedHousehold?.name}. Calendar edits will not change Plan. Only this phone will sync.`,
      'Enable sync', () => perform(async () => {
        await controller.connect(settings, destination ?? { create: true, title: `Meal Planner — ${selectedHousehold?.name ?? 'Household'}`, sourceId: source, color: theme.primary }, recovery, recovery, newDestination);
        setSetup(false); setDraft(null);
      }));
  }
  function disconnect() {
    Alert.alert('Disconnect calendar sync?', 'Stop future updates. Existing personal or shared calendars are never deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Keep calendar events', onPress: () => perform(() => controller.disconnect(false)) },
      { text: 'Remove synced meals', style: 'destructive', onPress: () => confirm('Remove synced meal events?', 'Only verified Meal Planner events in the linked calendar will be removed. Unrelated events stay in place. Any unreachable older exports will need manual review.', 'Remove and disconnect', () => perform(() => controller.disconnect(true)), true) },
    ]);
  }
  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }];
  const button = (title: string, action: () => void, destructive = false) => <Pressable accessibilityRole="button" disabled={working} onPress={action} style={styles.action}><ThemedText themeColor={destructive ? 'destructive' : 'link'}>{title}</ThemedText></Pressable>;
  const editable = status?.is_manager && (setup || linkedHere);
  return <Screen layout="tab-stack" contentAlignment="top" onRefresh={controller.syncNow} refreshing={busy}>
    <View style={styles.content}>
      <ThemedText style={visualStyles.sectionTitle}>Meals in your calendar</ThemedText>
      <ThemedText themeColor="textSecondary">See the plan beside your family’s other events. Use a shared family calendar so everyone can see the meals.</ThemedText>
      <View style={card}>
        <ThemedText style={styles.title}>{selectedHousehold?.name}</ThemedText>
        <ThemedText>Calendar manager: {status?.manager_name ?? 'Loading…'}</ThemedText>
        <ThemedText>{status?.enabled ? linkedHere ? 'Syncing from this phone' : 'Linked phone syncs when Meal Planner is open' : 'Sync is off'}</ThemedText>
        {journal && linkedHere ? <ThemedText>Calendar: {journal.calendarTitle}</ThemedText> : null}
        {status?.writer_label && !linkedHere ? <ThemedText themeColor="textSecondary">Linked device: {status.writer_label}</ThemedText> : null}
        {status?.last_success_at ? <ThemedText themeColor="textSecondary">Last synced {new Date(status.last_success_at).toLocaleString()}</ThemedText> : null}
        {status?.run_pending ? <ThemedText themeColor="textSecondary">Unfinished calendar work is paused. Retry on the linked phone to recover it; replacement stays blocked until it settles.</ThemedText> : null}
        <ThemedText themeColor="textSecondary">Household time zone: {status?.time_zone ?? selectedHousehold?.time_zone}</ThemedText>
      </View>
      {!available ? <View style={card}><ThemedText>Calendar sync needs an installed Meal Planner build. It is unavailable in Expo Go and on the web. The rest of the app works normally.</ThemedText></View> : null}
      {status && !status.is_manager ? <ThemedText themeColor="textSecondary">{status.manager_name ?? 'The household calendar manager'} controls this connection. You can continue planning meals normally. Their linked phone picks up family changes when it next opens or refreshes Meal Planner.</ThemedText> : null}
      {status?.is_manager && available && !linkedHere && !setup ? <PrimaryButton title={status.writer_linked ? 'Reconnect on this phone' : 'Set up calendar sync'} disabled={working || status.run_pending} onPress={() => perform(prepare)} /> : null}
      {setup ? <View style={card}>
        <ThemedText style={styles.title}>Choose a destination</ThemedText>
        {status?.recovery_required && !status.writer_linked ? <ChoicePicker label="Previous exports" value={newDestination ? 'Start a separate destination; keep old copies' : 'Recover existing meal exports'} selectedId={newDestination ? 'new' : 'recover'} choices={[{ id: 'recover', label: 'Recover existing meal exports' }, { id: 'new', label: 'Start a separate destination; keep old copies' }]} onSelect={(value) => setNewDestination(value === 'new')} disabled={working} /> : null}
        <ChoicePicker label="Calendar" value={chosen === 'create' ? 'Create a Meal Planner calendar' : choices.find((c) => c.id === chosen)?.title ?? ''} selectedId={chosen} choices={[{ id: 'create', label: 'Create a Meal Planner calendar' }, ...choices.map((c) => ({ id: c.id, label: `${c.title} · ${c.source}${c.local ? ' · On this phone' : ''}` }))]} onSelect={setChosen} disabled={working} />
        {chosen === 'create' && Platform.OS === 'ios' ? <ChoicePicker label="Create in account" value={choices.find((c) => c.id === source)?.source ?? ''} selectedId={source} choices={choices.map((c) => ({ id: c.id, label: `${c.source} · ${c.title}` }))} onSelect={setSource} disabled={working} /> : null}
        <ThemedText themeColor="textSecondary">{chosen === 'create' && Platform.OS === 'android' ? 'A new calendar is stored only on this Android phone and is not shared. Choose an existing shared calendar for family visibility.' : 'A new calendar is not shared automatically. Existing shared calendars use the sharing already configured with your calendar provider.'}</ThemedText>
      </View> : null}
      {editable ? <View style={card}>
        <ThemedText style={styles.title}>Meal times</ThemedText>
        {(['breakfast_time', 'lunch_time', 'dinner_time'] as const).map((slot, index) => <Pressable key={slot} accessibilityRole="button" accessibilityLabel={`${['Breakfast', 'Lunch', 'Dinner'][index]} time: ${displayMealTime(settings[slot])}`} disabled={working} onPress={() => chooseTime(slot, ['Breakfast', 'Lunch', 'Dinner'][index])} style={styles.timeRow}><ThemedText>{['Breakfast', 'Lunch', 'Dinner'][index]}</ThemedText><View style={styles.value}><ThemedText themeColor="link">{displayMealTime(settings[slot])}</ThemedText><DisclosureChevron /></View></Pressable>)}
        <ChoicePicker label="Event length" value={`${settings.duration_minutes} minutes`} selectedId={String(settings.duration_minutes)} choices={[15, 30, 60, 90, 120].map((n) => ({ id: String(n), label: `${n} minutes` }))} onSelect={(value) => setSettings((current) => ({ ...current, duration_minutes: Number(value) }))} disabled={working} />
        <ThemedText themeColor="textSecondary">Example: Dinner · Chicken tacos at {displayMealTime(settings.dinner_time)}. Times use the household’s time zone.</ThemedText>
      </View> : null}
      {setup ? <><PrimaryButton title="Enable sync" disabled={working} onPress={enable} />{button('Cancel setup', () => { setSetup(false); setDraft(null); })}</> : null}
      {status?.is_manager && linkedHere && available ? <>
        <PrimaryButton title={status.enabled ? 'Save calendar settings' : 'Enable sync'} disabled={working} onPress={() => perform(() => controller.saveSettings(settings).then(() => setDraft(null)))} />
        {button('Sync now / Retry', () => perform(controller.syncNow))}
        {button('Disconnect or change calendar', disconnect, true)}
      </> : null}
      {busy || preparing ? <ThemedText accessibilityLiveRegion="polite">Working on calendar sync…</ThemedText> : null}
      {error || localError ? <View style={card}><ThemedText accessibilityRole="alert" themeColor="error">{localError ?? error}</ThemedText>{available && status?.is_manager ? button('Open phone settings', () => { void Linking.openSettings(); }) : null}{button('Retry status', () => perform(controller.refresh))}</View> : null}
      <ThemedText themeColor="textSecondary">Sync is one-way, while the linked phone is using Meal Planner. Other family members’ changes appear after this phone next opens or refreshes the app. Meals from the past 7 days through the next 90 days are maintained. Older history stays in the calendar.</ThemedText>
      <ThemedText themeColor="textSecondary">Signing out or losing household access stops updates. Exported calendar copies may remain. No calendar password is needed, and unrelated calendar events are never uploaded.</ThemedText>
      {selectedHousehold?.role === 'owner' && status ? <View style={card}>
        <ThemedText style={styles.title}>Calendar manager</ThemedText>
        <ChoicePicker label="Owner" value={owners.find((o) => o.membership_id === target)?.display_name ?? status.manager_name ?? ''} selectedId={target || status.manager_membership_id || undefined} choices={owners.filter((o) => o.membership_id !== status.manager_membership_id).map((o) => ({ id: o.membership_id, label: o.display_name }))} onSelect={setTarget} disabled={working || status.run_pending} />
        <PrimaryButton title="Transfer calendar management" disabled={working || !target || status.run_pending} onPress={() => confirm('Transfer calendar management?', 'This stops sync on the current phone. The new manager must reconnect and confirm a destination. Existing calendar events may remain.', 'Transfer', () => perform(() => controller.transfer(target)))} />
      </View> : null}
    </View>
  </Screen>;
}
const styles = StyleSheet.create({ content: { gap: 20 }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 12 }, title: { fontSize: 19, fontWeight: '600' }, action: { minHeight: 44, justifyContent: 'center' }, timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, gap: 12 }, value: { flexDirection: 'row', alignItems: 'center', gap: 8 } });
