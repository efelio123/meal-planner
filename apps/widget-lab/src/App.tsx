import { useEffect, useState } from 'react';
import { Button, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { addUserInteractionListener } from 'expo-widgets';
import WidgetLab, { publishSample } from './WidgetLab';

export default function App() {
  const [observed, setObserved] = useState(0); const [status, setStatus] = useState('Sample not published yet.');
  useEffect(() => {
    const subscription = addUserInteractionListener(() => setObserved((count) => count + 1));
    void Linking.getInitialURL().then((url) => { if (url) setStatus('Opened through the lab deep link.'); });
    const link = Linking.addEventListener('url', () => setStatus('Lab deep link received. No consumer-app navigation occurred.'));
    return () => { subscription.remove(); link.remove(); };
  }, []);
  function publish() { publishSample(); setStatus('Published a fresh fictional sample. Add Widget Lab through the home-screen widget gallery.'); }
  async function inspect() {
    try { const entries = await WidgetLab.getTimeline(); setStatus(`Native timeline read returned ${entries.length} entries. This does not confirm an API write.`); }
    catch { setStatus('Timeline readback is not supported on this platform/package. No API write was attempted.'); }
  }
  // Standalone lab frame: one safe-area owner and one scrolling body; no tab bar.
  return <SafeAreaProvider><SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Widget Lab</Text>
    <Text>Disposable feasibility prototype. Uses fictional items and meals only.</Text>
    <Text>There is no sign-in, API endpoint, household token or database access in this app.</Text>
    <View style={styles.actions}><Button title="Publish / reset sample" onPress={publish} /><Button title="Inspect native timeline" onPress={() => { void inspect(); }} /></View>
    <Text accessibilityLiveRegion="polite">{status}</Text>
    <Text>Interaction events observed while this app is alive: {observed}</Text>
    <Text>Widget checkmarks are pending display changes only. They never claim the family shopping list was updated.</Text>
    <Text>Reset deliberately replaces the sample snapshot, including local pending marks. This is a storage-race demonstration, not a production outbox.</Text>
    <Text>Device checklist: small/medium/large; Shopping/Plan switches; seven days; pending marks with the app closed; relaunch; inspect timeline; reset sample; deep link. Native behavior remains unverified until those steps run on a device.</Text>
  </ScrollView></SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#F5E8DA' }, content: { padding: 24, gap: 20 }, title: { fontSize: 28, fontWeight: '700' }, actions: { gap: 12 } });
