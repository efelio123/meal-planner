import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { SafeAreaView as NativeTabSafeAreaView } from 'react-native-screens/experimental';
import { useTheme } from '@/hooks/use-theme';

/** Choose the chrome actually shown by the route, including modal presentation. */
export type ScreenLayout = 'tab-root' | 'tab-stack' | 'stack-modal' | 'standalone';
export type StackScreenLayout = Extract<ScreenLayout, 'tab-stack' | 'stack-modal'>;

type ScreenProps = PropsWithChildren<{
  layout: ScreenLayout;
  contentAlignment?: 'center' | 'top';
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  onScrollBeginDrag?: ScrollViewProps['onScrollBeginDrag'];
  onScroll?: ScrollViewProps['onScroll'];
  /** Optional content anchored beneath the scrollable page body. */
  footer?: ReactNode;
  testID?: string;
}>;

const standaloneEdges: Edge[] = ['top', 'right', 'bottom', 'left'];
const stackEdges: Edge[] = ['right', 'bottom', 'left'];
const androidTabEdges: Edge[] = ['top', 'right', 'left'];
const androidStackEdges: Edge[] = ['right', 'left'];

export function Screen({ children, layout, contentAlignment = 'center', refreshing = false, onRefresh, onScrollBeginDrag, onScroll, footer, testID = 'screen' }: ScreenProps) {
  const theme = useTheme();
  const tabRoot = layout === 'tab-root';
  const nativeIosInsets = Platform.OS === 'ios' && (tabRoot || layout === 'tab-stack');
  const safeAreaEdges = layout === 'standalone' ? standaloneEdges
    : Platform.OS === 'android' && tabRoot ? androidTabEdges
    : Platform.OS === 'android' && layout === 'tab-stack' ? androidStackEdges
    : tabRoot ? standaloneEdges : stackEdges;
  const body = (
    <>
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.screen }]}
        contentContainerStyle={[styles.content, contentAlignment === 'top' ? styles.contentTop : styles.contentCenter, tabRoot && Platform.OS === 'ios' && styles.contentFill]}
        alwaysBounceVertical={Platform.OS === 'ios'}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        // Native tab screens remain mounted beneath sheets. Letting their
        // ScrollViews follow a sheet's keyboard can leave a stale bottom inset
        // after dismissal, making the page scroll past all of its content.
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' && !tabRoot}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={onScrollBeginDrag}
        onScroll={onScroll}
        scrollEventThrottle={onScroll ? 16 : undefined}
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
  if (nativeIosInsets) return <NativeTabSafeAreaView edges={{ top: tabRoot, right: true, bottom: true, left: true }} style={[styles.safeArea, { backgroundColor: theme.screen }]}>{body}</NativeTabSafeAreaView>;
  return <SafeAreaView edges={safeAreaEdges} style={[styles.safeArea, { backgroundColor: theme.screen }]}>{body}</SafeAreaView>;
}

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  // The viewport must fill the screen so a swipe starting in blank space is
  // still handled by the ScrollView, even when its content is short.
  scroll: { flex: 1 },
  content: { padding: 24, gap: 16 },
  contentCenter: { flexGrow: 1, justifyContent: 'center' },
  contentFill: { flexGrow: 1 },
  // Native chrome is reserved by the frame; growing short stack pages can
  // still create an unnecessary scroll range. Tab roots retain their accepted fill.
  contentTop: { justifyContent: 'flex-start' },
});
