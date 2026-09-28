import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

export function ComingSoonScreen({ title }: { title: string }) {
  return (
    <Screen contentAlignment="top" nativeTabScreen safeAreaEdges={['top', 'left', 'right']}>
      <View accessibilityLabel={`${title}. Coming soon.`} accessibilityRole="summary">
        <ThemedText accessibilityRole="header" style={{ fontSize: 30, fontWeight: '700', lineHeight: 34 }}>
          {title}
        </ThemedText>
        <ThemedText themeColor="textSecondary">Coming soon</ThemedText>
      </View>
    </Screen>
  );
}
