import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function SettingsScreen() {
  const { selectedHousehold } = useHouseholdState();

  return (
    <Screen nativeTabScreen safeAreaEdges={['top', 'left', 'right']}>
      <View>
        <ThemedText accessibilityRole="header" style={{ fontSize: 30, fontWeight: '700', lineHeight: 34 }}>
          Settings
        </ThemedText>
        <ThemedText>Current household</ThemedText>
        <ThemedText>{selectedHousehold?.name ?? 'No household selected'}</ThemedText>
      </View>
      <SignOutAction />
    </Screen>
  );
}
