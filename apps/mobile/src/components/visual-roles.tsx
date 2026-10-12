import type { ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** Shared visual roles; feature screens still own their behavior and content. */
export const visualStyles = StyleSheet.create({
  tabTitle: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  sectionTitle: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  sheetTitle: { flexShrink: 1, fontSize: 20, fontWeight: '700', lineHeight: 26 },
  sheetActionText: { fontSize: 16 },
  sheetAction: { justifyContent: 'center', minHeight: 44, minWidth: 44 },
  groupedSurface: { borderRadius: 16, overflow: 'hidden' },
  groupedDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  groupedRow: { minHeight: 44, paddingHorizontal: 16 },
});

export function TabPageHeader({ title, actions, subtitle }: { title: string; actions?: ReactNode; subtitle?: ReactNode }) {
  return <View style={styles.header}>
    <View style={styles.headerRow}>
      <ThemedText accessibilityRole="header" style={[visualStyles.tabTitle, styles.headerTitle]}>{title}</ThemedText>
      {actions ? <View style={styles.headerActions}>{actions}</View> : null}
    </View>
    {subtitle}
  </View>;
}

export function CircularAddButton({ accessibilityLabel, disabled, onPress }: { accessibilityLabel: string; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable
    accessibilityLabel={accessibilityLabel}
    accessibilityRole="button"
    accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.addButton, { backgroundColor: theme.primary, opacity: disabled ? 0.5 : pressed ? 0.82 : 1 }]}
  >
    <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'plus', android: 'add', web: 'add' }} size={24} testID="circular-add-symbol" tintColor={theme.primaryText} />
  </Pressable>;
}

export function DisclosureChevron({ variant = 'ordinary', testID }: { variant?: 'ordinary' | 'action'; testID?: string }) {
  const theme = useTheme();
  return <SymbolView
    accessibilityElementsHidden
    importantForAccessibility="no"
    name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
    size={17}
    testID={testID}
    tintColor={variant === 'action' ? theme.link : theme.textSecondary}
  />;
}

const styles = StyleSheet.create({
  header: { gap: 3 },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 48 },
  headerTitle: { flexShrink: 1 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  addButton: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
});
