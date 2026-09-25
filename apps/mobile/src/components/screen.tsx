import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children }: PropsWithChildren) {
  const theme = useTheme();
  return <ScrollView testID="screen" style={{ backgroundColor: theme.screen }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export const styles = StyleSheet.create({ content: { flexGrow: 1, padding: 24, gap: 16, justifyContent: 'center' } });
