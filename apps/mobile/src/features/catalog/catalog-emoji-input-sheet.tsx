import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions, type KeyboardAvoidingViewProps } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export const catalogEmojiSheetKeyboardBehavior: KeyboardAvoidingViewProps['behavior'] = 'padding';

export function CatalogEmojiInputSheet({
  visible,
  value,
  error,
  onChangeText,
  onClear,
  onCancel,
  onDone,
}: {
  visible: boolean;
  value: string;
  error: string | null;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View accessibilityViewIsModal style={styles.backdrop}>
        <Pressable accessibilityLabel="Close category emoji editor" accessibilityRole="button" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView testID="catalog-emoji-keyboard-area" behavior={catalogEmojiSheetKeyboardBehavior} style={styles.keyboardArea}>
          <View
            testID="catalog-emoji-input-sheet"
            style={[
              styles.sheet,
              {
                backgroundColor: theme.elevatedSurface,
                borderColor: theme.border,
                maxHeight: Math.min(320, height * 0.65),
                paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom, 18),
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <ThemedText accessibilityRole="header" style={styles.title}>Category emoji</ThemedText>
            <ThemedText themeColor="textSecondary">Enter or paste one emoji, or leave it empty.</ThemedText>
            <ThemedInput
              accessibilityLabel="Category emoji value"
              testID="category-emoji-value-input"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              inputMode="text"
              keyboardType="default"
              onBlur={() => setKeyboardVisible(Keyboard.isVisible())}
              onChangeText={onChangeText}
              onFocus={() => setKeyboardVisible(true)}
              placeholder="Emoji"
              returnKeyType="done"
              spellCheck={false}
              value={value}
            />
            {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={onClear} style={styles.textAction}>
                <ThemedText themeColor="link">Clear</ThemedText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onCancel} style={styles.textAction}>
                <ThemedText themeColor="link">Cancel</ThemedText>
              </Pressable>
              <View style={styles.doneButton}>
                <PrimaryButton onPress={onDone} title="Done" />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.42)', flex: 1, justifyContent: 'flex-end' },
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 14, paddingHorizontal: 20, paddingTop: 12 },
  grabber: { alignSelf: 'center', borderRadius: 2, height: 4, width: 36 },
  title: { fontSize: 20, fontWeight: '700' },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between', marginTop: 4 },
  textAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  doneButton: { minWidth: 96 },
});
