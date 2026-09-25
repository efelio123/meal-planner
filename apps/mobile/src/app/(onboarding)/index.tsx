import { type Href, Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { SignOutAction } from '@/components/sign-out-action';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export default function OnboardingChoice() {
  const theme = useTheme();

  return (
    <Screen>
      <View style={styles.content}>
        <ThemedText style={styles.title}>Set up your household</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.body}>
          Create a household for your family, or join one with a copyable invitation code.
        </ThemedText>
        <Link href={'/(onboarding)/create-household' as Href} style={[styles.link, { color: theme.link }]}>Create a household</Link>
        <Link href={'/(onboarding)/join-household' as Href} style={[styles.link, { color: theme.link }]}>Enter an invitation code</Link>
        <SignOutAction />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  title: { fontSize: 30, fontWeight: '700', lineHeight: 34 },
  body: { fontSize: 16, lineHeight: 22 },
  link: { fontSize: 17, fontWeight: '600' },
});
