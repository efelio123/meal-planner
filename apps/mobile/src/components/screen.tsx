import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

export function Screen({ children }: PropsWithChildren) {
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export const styles = StyleSheet.create({ content: { flexGrow: 1, padding: 24, gap: 16, justifyContent: 'center' } });
