import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  safeAreaEdges?: Edge[];
  contentAlignment?: 'center' | 'top';
  /** Marks tab-root content whose iOS inset adjustment is owned by NativeTabs. */
  nativeTabScreen?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  /** Optional content anchored beneath the scrollable page body. */
  footer?: ReactNode;
  testID?: string;
}>;

const defaultSafeAreaEdges: Edge[] = ['top', 'right', 'bottom', 'left'];

export function Screen({ children, contentAlignment = 'center', safeAreaEdges = defaultSafeAreaEdges, nativeTabScreen = false, refreshing = false, onRefresh, footer, testID = 'screen' }: ScreenProps) {
  const theme = useTheme();
  const nativeIosInsets = nativeTabScreen && Platform.OS === 'ios';
  return (
    <SafeAreaView edges={nativeIosInsets ? [] : safeAreaEdges} style={[styles.safeArea, { backgroundColor: theme.screen }]}>
      <ScrollView
        style={[footer ? styles.scrollWithFooter : undefined, { backgroundColor: theme.screen }]}
        contentContainerStyle={[styles.content, contentAlignment === 'top' && styles.contentTop]}
        contentInsetAdjustmentBehavior={nativeIosInsets ? 'automatic' : 'never'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh && Platform.OS !== 'web' ? (
          <RefreshControl
            colors={[theme.primary]}
            onRefresh={() => { void onRefresh(); }}
            progressBackgroundColor={theme.surface}
            refreshing={refreshing}
            tintColor={theme.primary}
          />
        ) : undefined}
        testID={testID}
      >
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollWithFooter: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 16, justifyContent: 'center' },
  contentTop: { justifyContent: 'flex-start' },
});
