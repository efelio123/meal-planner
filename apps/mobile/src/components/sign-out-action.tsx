import { Button, StyleSheet, View } from 'react-native';

import { useHouseholdState } from '@/hooks/use-household-state';
import { ThemedText as Text } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function SignOutAction() {
  const theme = useTheme();
  const { isSigningOut, signOut, signOutError } = useHouseholdState();

  return <View style={styles.content}>
    {signOutError ? <Text accessibilityRole="alert" style={{ color: theme.error }}>{signOutError}</Text> : null}
    <Button disabled={isSigningOut} onPress={() => void signOut()} title={isSigningOut ? 'Signing out…' : 'Sign out'} />
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 8 },
});
