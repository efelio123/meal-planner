import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import { ApiError, api } from '@/lib/api';
import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { TimeZonePicker } from '@/components/time-zone-picker';
import { useHouseholdState } from '@/hooks/use-household-state';
import { deviceTimeZone } from '@/lib/time-zones';
import { useTheme } from '@/hooks/use-theme';
import { ThemedInput } from '@/components/themed-controls';

export default function CreateHousehold() {
  const theme = useTheme();
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
    <Text style={[styles.title, { color: theme.text }]}>Create household</Text>
    <ThemedInput accessibilityLabel="Household name" autoCapitalize="words" onChangeText={setName} placeholder="Household name" value={name} />
    <TimeZonePicker onChange={setTimeZone} value={timeZone} />
    <Text style={[styles.hint, { color: theme.textSecondary }]}>Your device time zone is suggested. You can search and change it.</Text>
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
    <Button disabled={busy} onPress={() => void create()} title={busy ? 'Creating…' : 'Create household'} />
    <SignOutAction />
  </View></Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  hint: { fontSize: 14 },
  error: { color: '#b42318' },
});
