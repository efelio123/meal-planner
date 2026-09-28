import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ProfileNavigationRow } from '@/features/profile/profile-navigation-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';

export default function MyHouseholdsRoute() {
  const { households, selectedHousehold } = useHouseholdState();
  return (
    <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" type="subtitle">My households</ThemedText>
        {households.map((household) => (
          <ProfileNavigationRow
            key={household.id}
            accessibilityLabel={`${household.name}${selectedHousehold?.id === household.id ? ', active household' : ''}`}
            onPress={() => router.push(`/(app)/(tabs)/profile/my-households/${household.id}` as Href)}
            subtitle={`${household.role}${selectedHousehold?.id === household.id ? ' · Active' : ''}`}
            title={household.name}
          />
        ))}
        {households.length === 0 ? <ThemedText themeColor="textSecondary">No households are available.</ThemedText> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: 16 } });
