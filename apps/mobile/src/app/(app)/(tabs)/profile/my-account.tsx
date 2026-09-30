import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function MyAccountRoute() {
  const { me } = useHouseholdState();
  const name = me?.user.display_name.trim() || 'Unavailable';
  return (
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" type="subtitle">Account information</ThemedText>
        <ThemedText>{name}</ThemedText>
        {me?.user.email ? <ThemedText themeColor="textSecondary">{me.user.email}</ThemedText> : null}
        <SignOutAction />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: 16 } });
