import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { SafeAreaView as NativeTabSafeAreaView } from 'react-native-screens/experimental';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  safeAreaEdges?: Edge[];
  contentAlignment?: 'center' | 'top';
  /** Marks tab-root content whose iOS inset adjustment is owned by NativeTabs. */
  nativeTabScreen?: boolean;
  /** Use with a NativeTabs.Trigger that disables automatic content insets. */
  manualNativeTabInsets?: boolean;
  /** For a nested stack page beneath NativeTabs with a fixed footer. */
  nativeTabBottomInset?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  /** Optional content anchored beneath the scrollable page body. */
  footer?: ReactNode;
  testID?: string;
}>;

const defaultSafeAreaEdges: Edge[] = ['top', 'right', 'bottom', 'left'];

export function Screen({ children, contentAlignment = 'center', safeAreaEdges = defaultSafeAreaEdges, nativeTabScreen = false, manualNativeTabInsets = false, nativeTabBottomInset = false, refreshing = false, onRefresh, footer, testID = 'screen' }: ScreenProps) {
  const theme = useTheme();
  const nativeIosInsets = nativeTabScreen && Platform.OS === 'ios';
  const manualIosInsets = nativeIosInsets && manualNativeTabInsets;
  const body = (
    <>
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.screen }]}
        contentContainerStyle={[styles.content, contentAlignment === 'top' ? styles.contentTop : styles.contentCenter, manualIosInsets && styles.contentFill]}
        alwaysBounceVertical={Platform.OS === 'ios'}
        contentInsetAdjustmentBehavior={nativeIosInsets && !manualIosInsets ? 'automatic' : 'never'}
        // Native tab screens remain mounted beneath sheets. Letting their
        // ScrollViews follow a sheet's keyboard can leave a stale bottom inset
        // after dismissal, making the page scroll past all of its content.
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' && !nativeTabScreen}
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
    </>
  );
  if (manualIosInsets) return <NativeTabSafeAreaView edges={{ top: true, right: true, bottom: true, left: true }} style={{ backgroundColor: theme.screen }}>{body}</NativeTabSafeAreaView>;
  if (nativeTabBottomInset && Platform.OS === 'ios') return <NativeTabSafeAreaView edges={{ bottom: true }} style={[styles.safeArea, { backgroundColor: theme.screen }]}>{body}</NativeTabSafeAreaView>;
  return <SafeAreaView edges={nativeIosInsets ? [] : safeAreaEdges} style={[styles.safeArea, { backgroundColor: theme.screen }]}>{body}</SafeAreaView>;
}

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  // The viewport must fill the screen so a swipe starting in blank space is
  // still handled by the ScrollView, even when its content is short.
  scroll: { flex: 1 },
  content: { padding: 24, gap: 16 },
  contentCenter: { flexGrow: 1, justifyContent: 'center' },
  contentFill: { flexGrow: 1 },
  // iOS NativeTabs also adds safe-area insets to its ScrollView. Growing a
  // short top-aligned page to the full viewport creates a false scroll range.
  contentTop: { justifyContent: 'flex-start' },
});
