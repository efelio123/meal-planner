import { View } from 'react-native';
import { router, type Href } from 'expo-router';

import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { PrimaryButton } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function SettingsScreen() {
  const { isSigningOut, selectedHousehold } = useHouseholdState();

  return (
    <Screen nativeTabScreen safeAreaEdges={['top', 'left', 'right']}>
      <View>
        <ThemedText accessibilityRole="header" style={{ fontSize: 30, fontWeight: '700', lineHeight: 34 }}>
          Settings
        </ThemedText>
        <ThemedText>Current household</ThemedText>
        <ThemedText>{selectedHousehold?.name ?? 'No household selected'}</ThemedText>
        {selectedHousehold?.role === 'owner' ? (
          <PrimaryButton
            disabled={isSigningOut}
            onPress={() => router.push('/(app)/(tabs)/settings/invite-household' as Href)}
            title="Invite a household member"
          />
        ) : null}
      </View>
      <SignOutAction />
    </Screen>
  );
}
