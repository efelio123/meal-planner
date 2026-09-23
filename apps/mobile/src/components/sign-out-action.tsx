import { Button, StyleSheet, Text, View } from 'react-native';

import { useHouseholdState } from '@/hooks/use-household-state';

export function SignOutAction() {
  const { isSigningOut, signOut, signOutError } = useHouseholdState();

  return <View style={styles.content}>
    {signOutError ? <Text accessibilityRole="alert" style={styles.error}>{signOutError}</Text> : null}
    <Button disabled={isSigningOut} onPress={() => void signOut()} title={isSigningOut ? 'Signing out…' : 'Sign out'} />
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 8 },
  error: { color: '#b42318' },
});
