import { forwardRef, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useTheme, useThemeMode } from '@/hooks/use-theme';

export const ThemedInput = forwardRef<TextInput, ComponentProps<typeof TextInput>>(function ThemedInput(props, ref) {
  const theme = useTheme(); const mode = useThemeMode();
  return <TextInput ref={ref} {...props} keyboardAppearance={Platform.OS === 'ios' ? mode : undefined} placeholderTextColor={theme.inputPlaceholder} selectionColor={theme.primary} cursorColor={theme.primary} style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.inputText }, props.style]} />;
});
export function PrimaryButton({ title, disabled, onPress, accessibilityLabel }: { title: string; disabled?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const theme = useTheme();
  return <Pressable accessibilityLabel={accessibilityLabel ?? title} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: disabled ? theme.disabled : theme.primary, opacity: pressed ? .82 : 1 }]}><Text style={[styles.buttonText, { color: theme.primaryText }]}>{title}</Text></Pressable>;
}
const styles = StyleSheet.create({ input: { borderRadius: 8, borderWidth: 1, fontSize: 16, padding: 12 }, button: { alignItems: 'center', borderRadius: 8, minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }, buttonText: { fontSize: 16, fontWeight: '600' } });
