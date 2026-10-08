import { useUser } from '@clerk/expo';
import { router, type Href } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useHouseholdState } from '@/hooks/use-household-state';
import { useTheme } from '@/hooks/use-theme';

import { ProfileNavigationRow } from './profile-navigation-row';

export function profileInitials(value: string): string {
  const parts = value.trim().split(/\s+/u).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}

export function ProfileHubScreen() {
  const { user } = useUser();
  const { me, selectedHousehold } = useHouseholdState();
  const theme = useTheme();
  const email = me?.user.email ?? '';
  const name = me?.user.display_name.trim() || 'Your profile';
  const avatarLabel = name || email;
  const showEmail = Boolean(email && name.trim().toLowerCase() !== email.trim().toLowerCase());

  return (
    <Screen contentAlignment="top" nativeTabScreen manualNativeTabInsets safeAreaEdges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <ThemedText accessibilityRole="header" style={styles.heading}>Profile</ThemedText>
        <View style={[styles.identity, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="profile-user-card">
          {user?.imageUrl ? (
            <Image accessibilityLabel={`${name} profile photo`} source={{ uri: user.imageUrl }} style={styles.avatar} />
          ) : (
            <View accessibilityLabel={`${name} initials`} style={[styles.avatar, styles.initials, { backgroundColor: theme.surfaceSelected }]}>
              <ThemedText style={styles.initialsText}>{profileInitials(avatarLabel)}</ThemedText>
            </View>
          )}
          <View style={styles.identityCopy}>
            <ThemedText style={styles.name}>{name}</ThemedText>
            {showEmail ? <ThemedText themeColor="textSecondary">{email}</ThemedText> : null}
          </View>
        </View>
        <View style={[styles.household, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText themeColor="textSecondary">Current household</ThemedText>
          <ThemedText style={styles.householdName}>{selectedHousehold?.name ?? 'No household selected'}</ThemedText>
          {selectedHousehold ? <ThemedText themeColor="textSecondary">{selectedHousehold.role}</ThemedText> : null}
        </View>
        <View style={styles.navigationSection} testID="profile-navigation-group">
          <ThemedText accessibilityRole="header" style={styles.sectionHeading}>Account Settings</ThemedText>
          <View>
            <ProfileNavigationRow
              icon={{ ios: 'person.crop.circle', android: 'person', web: 'person' }}
              onPress={() => router.push('/(app)/(tabs)/profile/my-account' as Href)}
              title="My account"
              variant="plain"
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} testID="profile-navigation-divider" />
            <ProfileNavigationRow
              icon={{ ios: 'house', android: 'home', web: 'home' }}
              onPress={() => router.push('/(app)/(tabs)/profile/my-households' as Href)}
              title="My households"
              variant="plain"
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20 },
  heading: { fontSize: 30, fontWeight: '700', lineHeight: 34 },
  sectionHeading: { fontSize: 20, fontWeight: '600', lineHeight: 26 },
  identity: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 14, padding: 14 },
  avatar: { borderRadius: 32, height: 64, width: 64 },
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 21, fontWeight: '700' },
  identityCopy: { flex: 1, gap: 4 },
  name: { fontSize: 20, fontWeight: '700' },
  household: { borderRadius: 12, borderWidth: 1, gap: 5, padding: 16 },
  householdName: { fontSize: 18, fontWeight: '600' },
  navigationSection: { gap: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 36, opacity: 0.4 },
});
