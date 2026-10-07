import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, useWindowDimensions, type KeyboardAvoidingViewProps } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { categoryEmojiValidationError } from './catalog-emoji-validation';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';

export const catalogEmojiSheetKeyboardBehavior: KeyboardAvoidingViewProps['behavior'] = 'padding';

type CatalogEmojiInputContentProps = Pick<Props, 'onChangeText' | 'onClear' | 'onCancel' | 'onDone'> & {
  initialValue: string;
};

type Props = {
  visible: boolean;
  value: string;
  error: string | null;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onCancel: () => void;
  onDone: () => void;
};

function CatalogEmojiInputContent({ initialValue, onChangeText, onClear, onCancel, onDone }: CatalogEmojiInputContentProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [value, setValue] = useState(initialValue);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [closed, setClosed] = useState(false);
  const error = categoryEmojiValidationError(value);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const close = (action: 'cancel' | 'done') => {
    if (closed) return;
    setClosed(true);
    Keyboard.dismiss();
    if (action === 'done') onDone();
    else onCancel();
    router.back();
  };

  return <KeyboardAvoidingView testID="catalog-emoji-keyboard-area" behavior={catalogEmojiSheetKeyboardBehavior} style={styles.keyboardArea}>
    <View testID="catalog-emoji-input-sheet" style={[styles.sheet, {
      backgroundColor: theme.elevatedSurface,
      maxHeight: Math.min(320, height * 0.65),
      paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom, 18),
    }]}>
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
        onChangeText={(nextValue) => { setValue(nextValue); onChangeText(nextValue); }}
        onFocus={() => setKeyboardVisible(true)}
        onBlur={() => setKeyboardVisible(false)}
        placeholder="Emoji"
        returnKeyType="done"
        spellCheck={false}
        value={value}
      />
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => { setValue(''); onClear(); }} style={styles.textAction}><ThemedText themeColor="link">Clear</ThemedText></Pressable>
        <Pressable accessibilityRole="button" onPress={() => close('cancel')} style={styles.textAction}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
        <View style={styles.doneButton}><PrimaryButton disabled={Boolean(error)} onPress={() => close('done')} title="Done" /></View>
      </View>
    </View>
  </KeyboardAvoidingView>;
}

export function CatalogEmojiInputSheet(props: Props) {
  const router = useRouter();
  const { present, scope } = useNativeSheetFlow();
  const propsRef = useRef(props);
  const sheetId = useRef<string | null>(null);
  const openedScope = useRef<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    if (sheetId.current && openedScope.current !== scope) {
      sheetId.current = null;
      openedScope.current = null;
      handled.current = true;
      propsRef.current.onCancel();
      return;
    }
    if (!props.visible || sheetId.current) return;
    handled.current = false;
    const id = present(<CatalogEmojiInputContent
      initialValue={propsRef.current.value}
      onChangeText={(value) => propsRef.current.onChangeText(value)}
      onClear={() => propsRef.current.onClear()}
      onCancel={() => propsRef.current.onCancel()}
      onDone={() => propsRef.current.onDone()}
    />, {
      detents: [0.34, 0.64],
      onDismiss: () => {
        sheetId.current = null;
        if (!handled.current) propsRef.current.onCancel();
      },
    });
    sheetId.current = id;
    openedScope.current = scope;
    router.push({ pathname: '/native-sheet/[sheetId]', params: { sheetId: id } } as never);
  }, [present, props.visible, router, scope]);

  return null;
}

const styles = StyleSheet.create({
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  sheet: { flex: 1, gap: 14, paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between', marginTop: 4 },
  textAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  doneButton: { minWidth: 96 },
});
