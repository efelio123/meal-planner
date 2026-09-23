import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, api } from '@/lib/api';
import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { useHouseholdState } from '@/hooks/use-household-state';

function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export default function CreateHousehold() {
  const { getToken } = useAuth();
  const { refresh } = useHouseholdState();
  const router = useRouter();
  const [name, setName] = useState('');
  const [timeZone, setTimeZone] = useState(deviceTimeZone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || !timeZone.trim()) {
      setError('Enter a household name and IANA time zone.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createHousehold(getToken, name, timeZone);
      await refresh();
      router.replace('/');
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 400 ? 'Use a valid IANA time-zone name, such as America/Phoenix.' : 'We could not create the household. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <Screen><View style={styles.content}>
    <Text style={styles.title}>Create household</Text>
    <TextInput accessibilityLabel="Household name" autoCapitalize="words" onChangeText={setName} placeholder="Household name" style={styles.input} value={name} />
    <TextInput accessibilityLabel="IANA time zone" autoCapitalize="none" onChangeText={setTimeZone} placeholder="America/Phoenix" style={styles.input} value={timeZone} />
    <Text style={styles.hint}>Your device time zone is suggested. You can change it.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Button disabled={busy} onPress={() => void create()} title={busy ? 'Creating…' : 'Create household'} />
    <SignOutAction />
  </View></Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  input: { borderColor: '#9ca3af', borderRadius: 8, borderWidth: 1, fontSize: 16, padding: 12 },
  hint: { fontSize: 14 },
  error: { color: '#b42318' },
});
