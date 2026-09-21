import { type Href, Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';

export default function OnboardingChoice() {
  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>Set up your household</Text>
        <Text style={styles.body}>Create a household for your family, or join one with a copyable invitation code.</Text>
        <Link href={'/(onboarding)/create-household' as Href} style={styles.link}>Create a household</Link>
        <Link href={'/(onboarding)/join-household' as Href} style={styles.link}>Enter an invitation code</Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  title: { fontSize: 30, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  link: { color: '#155eef', fontSize: 17, fontWeight: '600' },
});
