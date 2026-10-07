import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

type RecipeKeyboardSafeSheetProps = PropsWithChildren<{
  testID: string;
  /** Use false when the sheet contains its own independently scrolling list. */
  scrollable?: boolean;
}>;

/** Shared keyboard, touch, and small-viewport behavior for recipe sheets. */
export function RecipeKeyboardSafeSheet({ children, scrollable = true, testID }: RecipeKeyboardSafeSheetProps) {
  const { height } = useWindowDimensions();

  return (
    <KeyboardAvoidingView
      testID={testID}
      behavior="padding"
      pointerEvents="box-none"
      style={styles.keyboardArea}
    >
      {scrollable ? (
        <ScrollView
          testID={`${testID}-scroll`}
          alwaysBounceVertical={false}
          bounces={false}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          style={[styles.sheetScroll, { maxHeight: height * 0.9 }]}
        >
          {children}
        </ScrollView>
      ) : children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  // ScrollView grows to fill its parent by default. Keep short sheets content-height
  // so they stay docked to the bottom instead of leaving empty space below them.
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
});
