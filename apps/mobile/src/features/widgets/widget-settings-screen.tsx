import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/themed-controls';
import { visualStyles } from '@/components/visual-roles';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';
import { nativeWidgets } from './native-adapter';
import { useWidgets } from './widget-provider';

export function WidgetSettingsScreen() {
  const theme = useTheme(); const { selectedHousehold } = useHouseholdState();
  const state = useWidgets(); const native = state.native;
  const confirm = (action: () => void) => native.pending > 0
    ? Alert.alert('Leave pending checkoffs?', `${native.pending} pending checkoff${native.pending === 1 ? '' : 's'} will not be sent. You can review these items in Shopping.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: 'destructive', onPress: action }]) : action();
  const description = Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) < 17 ? 'Home-screen widgets require iOS 17 or later. You can keep using Meal Planner on this phone.'
    : !native.available ? 'Install a version of Meal Planner that supports home-screen widgets to continue.'
    : native.needsReconnect ? 'Open a fresh connection to keep your widgets up to date.'
    : native.state === 'backend' ? 'Widgets could not connect. Try again after updating Meal Planner.'
    : native.state === 'offline' ? 'Your last update is available. Pending checkoffs will retry when your phone can connect.'
    : native.state === 'changed' ? 'Some items changed elsewhere. Your widget shows the current list.'
    : state.enabled ? 'Your widgets follow the household selected on this phone.' : 'Keep your household list and weekly meals close at hand.';
  return <Screen layout="tab-stack" contentAlignment="top"><View style={styles.body}>
    <ThemedText style={visualStyles.sectionTitle}>Your household, at a glance</ThemedText>
    <ThemedText themeColor="textSecondary">{description}</ThemedText>
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText style={styles.title}>{selectedHousehold?.name ?? 'Choose a household'}</ThemedText>
      <ThemedText themeColor="textSecondary">Shopping shows how many items you need. Larger widgets let you check items off or switch to your meals for the week.</ThemedText>
      <ThemedText themeColor="textSecondary">Widgets use your Appearance colors and your chosen starting day. Each person connects their own phone with their household access.</ThemedText>
    </View>
    {native.pending > 0 ? <ThemedText accessibilityLiveRegion="polite">{native.pending} checkoff{native.pending === 1 ? '' : 's'} pending</ThemedText> : null}
    {native.lastSync ? <ThemedText themeColor="textSecondary">Last updated {new Date(native.lastSync).toLocaleString()}</ThemedText> : null}
    {state.error ? <ThemedText accessibilityRole="alert" themeColor="error">{state.error}</ThemedText> : null}
    {!state.enabled ? <PrimaryButton title="Enable widgets" disabled={!native.available || state.busy || !state.hydrated} onPress={() => { void state.controller?.setEnabled(true); }} />
      : <><PrimaryButton title={native.needsReconnect ? 'Reconnect widgets' : 'Refresh widgets'} disabled={state.busy || !native.available} onPress={() => { const refresh = () => { void state.controller?.request(native.needsReconnect); }; if (native.needsReconnect) confirm(refresh); else refresh(); }} />
      {Platform.OS === 'android' ? <PrimaryButton title="Add a widget" disabled={state.busy || native.needsReconnect} onPress={() => { if (!nativeWidgets()?.requestPin?.()) Alert.alert('Add a widget', 'Open your Home Screen widget picker and choose Meal Planner.'); }} /> : <ThemedText themeColor="textSecondary">On your Home Screen, open the widget picker and choose Meal Planner.</ThemedText>}
      <Pressable accessibilityRole="button" disabled={state.busy || !native.available} onPress={() => confirm(() => { void state.controller?.setEnabled(false); })} style={styles.disable}><ThemedText themeColor="destructive">Turn off widgets</ThemedText></Pressable></>}
    <ThemedText themeColor="textSecondary">Your phone controls background refresh. Offline checkoffs stay marked Pending until syncing finishes. Open Meal Planner if a family member’s changes haven’t appeared yet.</ThemedText>
  </View></Screen>;
}
const styles = StyleSheet.create({ body: { gap: 18 }, card: { gap: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 }, title: { fontSize: 18, fontWeight: '600' }, disable: { minHeight: 44, justifyContent: 'center', alignItems: 'center' } });
