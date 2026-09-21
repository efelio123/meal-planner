import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, api } from '@/lib/api';
import { Screen } from '@/components/screen';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function JoinHousehold() {
  const { getToken } = useAuth();
  const { refresh } = useHouseholdState();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    if (!code.trim()) { setError('Paste the invitation code.'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.acceptInvitation(getToken, code.trim());
      setCode('');
      await refresh();
      router.replace('/');
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 410) setError('This invitation has expired.');
      else if (reason instanceof ApiError && reason.status === 403) setError('This invitation was created for a different verified email address.');
      else setError('That invitation code was not accepted. Check it and try again.');
    } finally {
      setBusy(false);
    }
  };

  return <Screen><View style={styles.content}>
    <Text style={styles.title}>Join a household</Text>
    <Text style={styles.body}>Paste the development invitation code shared by a household owner.</Text>
    <TextInput accessibilityLabel="Invitation code" autoCapitalize="none" autoCorrect={false} onChangeText={setCode} placeholder="Invitation code" style={styles.input} value={code} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Button disabled={busy} onPress={() => void join()} title={busy ? 'Joining…' : 'Join household'} />
  </View></Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  input: { borderColor: '#9ca3af', borderRadius: 8, borderWidth: 1, fontSize: 16, padding: 12 },
  error: { color: '#b42318' },
});
